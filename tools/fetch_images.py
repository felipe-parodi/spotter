#!/usr/bin/env python3
"""Download start/end demo photos for Spotter's exercises from the
public-domain free-exercise-db (github.com/yuhonas/free-exercise-db, Unlicense),
resize to 480px-wide JPEGs (Pillow, or sips on macOS), and regenerate
precache-manifest.js. Also fetches an *alternate* photo pair per exercise
(ALT_MAPPING) that the app's image lightbox pages through.

Run from repo root:  python3 tools/fetch_images.py
Needs internet + the catalog JSON path as optional argv[1].
"""
import json
import os
import subprocess
import sys
import urllib.request

RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
ROOT = os.path.join(os.path.dirname(__file__), '..')
IMG_DIR = os.path.join(ROOT, 'img')

# our exercise id -> exact name in free-exercise-db
MAPPING = {
    'db-bench': 'Dumbbell Bench Press',
    'db-incline': 'Incline Dumbbell Press',
    'pushup': 'Pushups',
    'cable-fly': 'Cable Crossover',
    'db-fly': 'Dumbbell Flyes',
    'bb-bench': 'Barbell Bench Press - Medium Grip',
    'lat-pulldown': 'Wide-Grip Lat Pulldown',
    'cable-row': 'Seated Cable Rows',
    'db-row': 'One-Arm Dumbbell Row',
    'chest-sup-row': 'Dumbbell Incline Row',
    'bb-row': 'Bent Over Barbell Row',
    'pullup': 'Pullups',
    'straight-arm': 'Straight-Arm Pulldown',
    'face-pull': 'Face Pull',
    'deadlift': 'Barbell Deadlift',
    'db-ohp': 'Seated Dumbbell Press',
    'lat-raise': 'Side Lateral Raise',
    'cable-lat-raise': 'Cable Seated Lateral Raise',
    'bb-ohp': 'Standing Military Press',
    'rear-fly': 'Reverse Flyes',
    'arnold-press': 'Arnold Dumbbell Press',
    'db-curl': 'Dumbbell Bicep Curl',
    'hammer-curl': 'Hammer Curls',
    'incline-curl': 'Incline Dumbbell Curl',
    'bb-curl': 'Barbell Curl',
    'pushdown': 'Triceps Pushdown',
    'oh-ext': 'Standing Dumbbell Triceps Extension',
    'skull-crusher': 'Lying Dumbbell Tricep Extension',
    'bench-dip': 'Bench Dips',
    'cable-oh-ext': 'Cable Rope Overhead Triceps Extension',
    'goblet-squat': 'Goblet Squat',
    'rev-lunge': 'Dumbbell Rear Lunge',
    'split-squat': 'One Leg Barbell Squat',
    'bb-squat': 'Barbell Squat',
    'smith-squat': 'Smith Machine Squat',
    'step-up': 'Dumbbell Step Ups',
    'db-rdl': 'Stiff-Legged Dumbbell Deadlift',
    'bb-rdl': 'Romanian Deadlift',
    'kb-swing': 'One-Arm Kettlebell Swings',
    'pull-through': 'Pull Through',
    'hip-thrust': 'Barbell Hip Thrust',
    'bb-hip-thrust': 'Barbell Hip Thrust',
    'glute-bridge': 'Butt Lift (Bridge)',
    'cable-kickback': 'Glute Kickback',
    'sumo-goblet': 'Plie Dumbbell Squat',
    'calf-raise': 'Standing Dumbbell Calf Raise',
    'sl-calf-raise': 'Calf Raise On A Dumbbell',
    'plank': 'Plank',
    'dead-bug': 'Dead Bug',
    'side-plank': 'Side Bridge',
    'russian-twist': 'Russian Twist',
    'cable-crunch': 'Cable Crunch',
    'woodchop': 'Standing Cable Wood Chop',
    'cable-curl': 'Standing Biceps Cable Curl',
    'sl-rdl': 'Kettlebell One-Legged Deadlift',
    # cardio
    'treadmill-run': 'Running, Treadmill',
    'incline-walk': 'Walking, Treadmill',
    'bike-steady': 'Bicycling, Stationary',
    'rower-steady': 'Rowing, Stationary',
    'elliptical-steady': 'Elliptical Trainer',
    'stair-climber': 'Step Mill',
    'jump-rope': 'Rope Jumping',
    # no clean public-domain match: wall-sit, hollow-hold, bird-dog
}

# our exercise id -> a close variant in free-exercise-db whose photos give a
# second look at (roughly) the same movement; shown only in the lightbox
ALT_MAPPING = {
    'db-bench': 'Dumbbell Bench Press with Neutral Grip',
    'pushup': 'Push-Up Wide',
    'cable-fly': 'Flat Bench Cable Flyes',
    'db-fly': 'Incline Dumbbell Flyes',
    'bb-bench': 'Wide-Grip Barbell Bench Press',
    'lat-pulldown': 'Close-Grip Front Lat Pulldown',
    'cable-row': 'Elevated Cable Rows',
    'db-row': 'Bent Over Two-Dumbbell Row',
    'bb-row': 'Bent Over Two-Arm Long Bar Row',
    'pullup': 'Chin-Up',
    'straight-arm': 'Rope Straight-Arm Pulldown',
    'deadlift': 'Sumo Deadlift',
    'db-ohp': 'Standing Palms-In Dumbbell Press',
    'lat-raise': 'Alternating Deltoid Raise',
    'bb-ohp': 'Barbell Shoulder Press',
    'rear-fly': 'Dumbbell Lying Rear Lateral Raise',
    'db-curl': 'Dumbbell Alternate Bicep Curl',
    'hammer-curl': 'Alternate Hammer Curl',
    'incline-curl': 'Alternate Incline Dumbbell Curl',
    'bb-curl': 'EZ-Bar Curl',
    'pushdown': 'Triceps Pushdown - Rope Attachment',
    'oh-ext': 'Dumbbell One-Arm Triceps Extension',
    'skull-crusher': 'Decline Dumbbell Triceps Extension',
    'bench-dip': 'Weighted Bench Dip',
    'cable-oh-ext': 'Triceps Overhead Extension with Rope',
    'goblet-squat': 'Dumbbell Squat',
    'rev-lunge': 'Dumbbell Lunges',
    'split-squat': 'Elevated Back Lunge',
    'bb-squat': 'Barbell Full Squat',
    'step-up': 'Barbell Step Ups',
    'bb-rdl': 'Stiff-Legged Barbell Deadlift',
    'kb-swing': 'Vertical Swing',
    'hip-thrust': 'Barbell Glute Bridge',
    'bb-hip-thrust': 'Barbell Glute Bridge',
    'glute-bridge': 'Single Leg Glute Bridge',
    'cable-kickback': 'One-Legged Cable Kickback',
    'calf-raise': 'Rocking Standing Calf Raise',
    'side-plank': 'Push Up to Side Plank',
    'russian-twist': 'Plate Twist',
    'cable-crunch': 'Rope Crunch',
}

# hand-written steps for exercises with no catalog match
EXTRA_INSTRUCTIONS = {
    'wall-sit': [
        'Stand with your back flat against a wall, feet about two feet out from it, shoulder-width apart.',
        'Slide down the wall until your thighs are parallel to the floor, knees at 90 degrees directly over your ankles.',
        'Keep your back pressed into the wall and hands off your legs.',
        'Hold for the target time, breathing steadily, then push through your heels to stand.',
    ],
    'hollow-hold': [
        'Lie on your back with arms extended overhead and legs straight.',
        'Press your lower back into the floor and brace your abs.',
        'Lift your shoulders, arms, and legs a few inches off the floor so your body forms a shallow curve.',
        'Hold the position without letting your lower back arch. Bend your knees to make it easier.',
    ],
    'bird-dog': [
        'Start on all fours with hands under shoulders and knees under hips.',
        'Extend your right arm forward and left leg back until both are level with your torso.',
        'Pause for a second without letting your hips rotate or your back arch.',
        'Return to the start and repeat with the opposite arm and leg. That is one rep per side.',
    ],
}


def resize(dest):
    """480px-wide JPEG at quality 65 — Pillow if available, else macOS sips."""
    try:
        from PIL import Image
        img = Image.open(dest).convert('RGB')
        if img.width > 480:
            img = img.resize((480, round(img.height * 480 / img.width)), Image.LANCZOS)
        img.save(dest, 'JPEG', quality=65, optimize=True)
    except ImportError:
        subprocess.run(['sips', '--resampleWidth', '480',
                        '-s', 'formatOptions', '65', dest],
                       check=True, capture_output=True)


def fetch_pair(by_name, myid, name, suffix=''):
    """Download both frames for one exercise; returns True on success."""
    e = by_name.get(name)
    if not e or len(e.get('images', [])) < 2:
        print(f'!! {myid}{suffix}: "{name}" not found or missing images')
        return False
    for frame in (0, 1):
        dest = os.path.join(IMG_DIR, f'{myid}{suffix}-{frame}.jpg')
        if not os.path.exists(dest):
            url = RAW + urllib.request.quote(e['images'][frame])
            with urllib.request.urlopen(url) as r, open(dest, 'wb') as f:
                f.write(r.read())
            resize(dest)
    return True


def main():
    catalog_path = sys.argv[1] if len(sys.argv) > 1 else None
    if catalog_path:
        catalog = json.load(open(catalog_path))
    else:
        with urllib.request.urlopen(RAW.replace('/exercises/', '/dist/exercises.json')) as r:
            catalog = json.load(r)
    by_name = {e['name']: e for e in catalog}

    os.makedirs(IMG_DIR, exist_ok=True)
    have, have_alt = [], []
    for myid, name in MAPPING.items():
        if fetch_pair(by_name, myid, name):
            have.append(myid)
            print(f'ok {myid}')
    for myid, name in ALT_MAPPING.items():
        if fetch_pair(by_name, myid, name, suffix='-alt'):
            have_alt.append(myid)
            print(f'ok {myid} (alt)')

    ids = sorted(have)
    alt_ids = sorted(have_alt)
    assets = [f'./img/{i}-{f}.jpg' for i in ids for f in (0, 1)]
    assets += [f'./img/{i}-alt-{f}.jpg' for i in alt_ids for f in (0, 1)]
    with open(os.path.join(ROOT, 'precache-manifest.js'), 'w') as f:
        f.write('// generated by tools/fetch_images.py — do not edit\n')
        f.write('const IMG_IDS = ' + json.dumps(ids) + ';\n')
        f.write('const IMG_ALT_IDS = ' + json.dumps(alt_ids) + ';\n')
        f.write('const IMG_ASSETS = ' + json.dumps(assets) + ';\n')
    print(f'\n{len(ids)} exercises with images, {len(alt_ids)} with alternates; precache-manifest.js written')

    instructions = dict(EXTRA_INSTRUCTIONS)
    for myid, name in MAPPING.items():
        e = by_name.get(name)
        if e and e.get('instructions'):
            instructions[myid] = e['instructions']
    with open(os.path.join(ROOT, 'exercise-info.js'), 'w') as f:
        f.write('// generated by tools/fetch_images.py — step-by-step instructions\n')
        f.write('// from the public-domain free-exercise-db (Unlicense) — do not edit\n')
        f.write("'use strict';\nconst INSTRUCTIONS = " + json.dumps(instructions, ensure_ascii=False, indent=0) + ';\n')
    print(f'{len(instructions)} exercises with instructions; exercise-info.js written')


if __name__ == '__main__':
    main()

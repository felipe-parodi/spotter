#!/usr/bin/env python3
"""Download start/end demo photos for Spotter's exercises from the
public-domain free-exercise-db (github.com/yuhonas/free-exercise-db, Unlicense),
resize to 480px wide JPEGs via sips, and regenerate precache-manifest.js.

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
    # no clean public-domain match: wall-sit, hollow-hold, bird-dog
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


def main():
    catalog_path = sys.argv[1] if len(sys.argv) > 1 else None
    if catalog_path:
        catalog = json.load(open(catalog_path))
    else:
        with urllib.request.urlopen(RAW.replace('/exercises/', '/dist/exercises.json')) as r:
            catalog = json.load(r)
    by_name = {e['name']: e for e in catalog}

    os.makedirs(IMG_DIR, exist_ok=True)
    have = []
    for myid, name in MAPPING.items():
        e = by_name.get(name)
        if not e or len(e.get('images', [])) < 2:
            print(f'!! {myid}: "{name}" not found or missing images')
            continue
        for frame in (0, 1):
            dest = os.path.join(IMG_DIR, f'{myid}-{frame}.jpg')
            if not os.path.exists(dest):
                url = RAW + urllib.request.quote(e['images'][frame])
                with urllib.request.urlopen(url) as r, open(dest, 'wb') as f:
                    f.write(r.read())
                subprocess.run(['sips', '--resampleWidth', '480',
                                '-s', 'formatOptions', '65', dest],
                               check=True, capture_output=True)
        have.append(myid)
        print(f'ok {myid}')

    ids = sorted(have)
    assets = [f'./img/{i}-{f}.jpg' for i in ids for f in (0, 1)]
    with open(os.path.join(ROOT, 'precache-manifest.js'), 'w') as f:
        f.write('// generated by tools/fetch_images.py — do not edit\n')
        f.write('const IMG_IDS = ' + json.dumps(ids) + ';\n')
        f.write('const IMG_ASSETS = ' + json.dumps(assets) + ';\n')
    print(f'\n{len(ids)} exercises with images; precache-manifest.js written')

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

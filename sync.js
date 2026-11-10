'use strict';
/* Optional personal backup. No credentials or data are sent until this device
   is explicitly paired. Pairing lives separately from exported workout data. */
(() => {
  // The archive's address arrives in the pairing link (#health-pair=CODE&server=ORIGIN) and lives only in
  // this device's localStorage, so this public file never names the private host. Tailnet HTTPS only.
  const okServer = s => { try { const u = new URL(s); return u.protocol === 'https:' && u.hostname.endsWith('.ts.net') && u.origin === s; } catch (_) { return false; } };
  const key = 'spotter-health-sync-v1';
  let config = null, timer = null, busy = false, getState, replaceState;
  let message = 'Not connected';
  try { config = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
  const uuid = () => crypto.randomUUID();
  const persist = () => localStorage.setItem(key, JSON.stringify(config));
  const clean = s => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith('_')));
  const serialized = () => JSON.stringify(clean(getState()));
  function status(text) {
    message = text;
    document.querySelectorAll('[data-sync-status]').forEach(el => { el.textContent = text; });
  }
  async function request(path, body, server = config?.server) {
    if (!okServer(server)) { const error = new Error('Reconnect backup'); error.status = 401; throw error; }
    const response = await fetch(server + path, {
      method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
      headers: {'Content-Type': 'application/json', ...(config?.token ? {Authorization: 'Bearer ' + config.token} : {})},
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || 'Sync failed'); error.status = response.status; throw error; }
    return data;
  }
  async function sync() {
    if (!config?.token || busy || !getState?.()?.profile || config.conflict) return;
    const current = serialized();
    if (!config.pending && current === config.ack) { status('Synced · ' + new Date(config.saved).toLocaleString()); return; }
    busy = true;
    try {
      // Persist the exact in-flight mutation before sending; retries after a lost
      // response use the same ID and body, even if the user has kept editing.
      if (!config.pending) {
        const state = JSON.parse(current);
        const ids = new Set(state.history.map(w => w.id));
        config.pending = {state, base:config.revision, mutation:uuid(), bootstrap:!!config.bootstrap,
                          deleted:config.bootstrap ? [] : (config.ids || []).filter(id => !ids.has(id))};
        persist();
      }
      status('Syncing…');
      const result = await request('/api/spotter', config.pending);
      config.ack = JSON.stringify(config.pending.state);
      config.ids = config.pending.state.history.map(w => w.id);
      config.revision = result.revision;
      config.saved = result.saved;
      config.bootstrap = false;
      config.pending = null;
      persist();
      status('Synced · ' + new Date(result.saved).toLocaleString());
    } catch (error) {
      if (error.status === 409) {
        config.conflict = true; persist();
        status('Different server copy · review before syncing');
      } else if (error.status === 401) status('Pairing expired or revoked · reconnect');
      else status('Saved on phone · sync pending');
    } finally {
      busy = false;
      if (config?.token && !config.conflict && serialized() !== config.ack) schedule(30000);
    }
  }
  function schedule(delay=3000) {
    if (!config?.token) return;
    clearTimeout(timer);
    timer = setTimeout(sync,delay);
  }
  async function pair(value) {
    if (busy) { alert('Wait for the current sync to finish.'); return; }
    const params = new URLSearchParams(value.includes('#') ? value.split('#')[1] : value.includes('health-pair=') ? value : '');
    const code = params.get('health-pair'), server = params.get('server');
    if (!code || !okServer(server)) { alert('Paste the whole pairing link from your private Training page.'); return; }
    if (!getState()?.profile) { alert('Set up or import your Spotter profile before connecting backup.'); return; }
    if (!confirm('Connect this Spotter profile to your private health archive? Your phone’s current data will be backed up.')) return;
    try {
      const result = await request('/api/pair/redeem',{code},server);
      config = {...result, server, bootstrap:true, ack:null, pending:null};
      persist();
      rerender();
      await sync();
    } catch (_) { status('Could not connect. Check Tailscale, allow local network access if your browser asks, and use a fresh pairing link.'); alert(message); }
  }
  async function loadServer() {
    if (busy) { alert('Wait for the current sync to finish.'); return; }
    try {
      const result = await request('/api/spotter');
      if (!result.state) return;
      if (!confirm(`Load the server copy (${result.state.history.length} workouts)? A safety copy of this phone will be kept locally first.`)) return;
      localStorage.setItem('spotter-before-server-restore-' + Date.now(), serialized());
      config.pending = null; config.conflict = false; config.bootstrap = false;
      config.revision = result.revision; config.saved = result.saved;
      config.ids = result.state.history.map(w => w.id);
      config.ack = JSON.stringify(result.state);
      persist(); replaceState(result.state); schedule();
    } catch (_) { alert('Could not load server copy. Your phone data is unchanged.'); }
  }
  const rerender = () => { if (typeof render === 'function') render(); };
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.SpotterSync = {
    changed() { if (config?.token) { status(config.conflict ? 'Different server copy · review before syncing' : 'Saved on phone · sync pending'); schedule(); } },
    isSynced() { return !!config?.token && !config.pending && !config.conflict && getState && serialized() === config.ack; },
    panel() {
      // connected: two real buttons, rare/destructive actions as quiet links —
      // four pill buttons in one row ran off a phone screen
      const body = config?.token
        ? `<div class="sync-btns"><button class="btn-primary sm" data-health-sync="sync">Sync now</button><button class="btn-ghost sm" data-health-sync="pair">Reconnect</button></div>
           <p class="sync-links"><button class="linkish" data-health-sync="restore">Load server copy</button> · <button class="linkish danger" data-health-sync="disconnect">Disconnect</button></p>`
        : `<button class="btn-ghost wide" data-health-sync="pair">Connect backup</button>`;
      return `<section class="card sync-card"><h2>Private backup</h2><p class="muted small" data-sync-status>${escape(message)}</p>${body}<p class="fine">Pair from Training in your private Portal. Offline changes wait safely on this phone.</p></section>`;
    },
    init(getter, setter) {
      getState = getter; replaceState = setter;
      status(config?.token && !okServer(config.server) ? 'Backup moved · tap Reconnect with a new pairing link'
        : config?.conflict ? 'Different server copy · review before syncing' : config?.token ? 'Checking backup…' : 'Not connected');
      if (location.hash.startsWith('#health-pair=')) { const link = location.hash; history.replaceState(null,'',location.pathname+location.search); pair(link); }
      schedule(500);
    },
  };
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-health-sync]')?.dataset.healthSync;
    if (action === 'pair') { const value = prompt('Paste the pairing link from your private Training page:'); if (value) pair(value); }
    if (action === 'sync') {
      if (config?.conflict) status('Different server copy · tap “Load server copy” to reconcile');
      else if (busy) status('Syncing…');
      else { status('Syncing…'); sync(); }
    }
    if (action === 'restore') loadServer();
    if (action === 'disconnect' && confirm('Disconnect automatic backup on this device? Phone and server records will be kept.')) {
      config = null; localStorage.removeItem(key); clearTimeout(timer); status('Disconnected'); rerender();
    }
  });
  window.addEventListener('online',()=>schedule(200));
  document.addEventListener('visibilitychange',()=>{ if (!document.hidden) schedule(200); });
  setInterval(()=>{ if (!document.hidden) schedule(200); },60000);
})();

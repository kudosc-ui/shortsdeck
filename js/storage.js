/* storage.js — storage abstraction.
   Today this talks to localStorage. To move to a secure backend, re-implement get/set/col/saveCol
   (e.g. fetch('/api/…')) and keep every caller unchanged.

   RULES
   • Only NON-SENSITIVE UI data is stored here: preferences, drafts, schedules, templates, rules, mock data.
   • Passwords, OAuth client secrets and access/refresh tokens are NEVER stored. Set() throws if a key looks sensitive.
   • Two modes: "demo" (sample data) and "live" (real YouTube data). They use separate collections so they never mix. */
(function (w) {
  'use strict';
  const NS = 'shortsdeck:v1:';
  const mem = {};
  let persistent = true;
  try { localStorage.setItem(NS + '__t', '1'); localStorage.removeItem(NS + '__t'); } catch (e) { persistent = false; }

  const BLOCKED_KEY = /(token|secret|password|passwd|refresh|credential|api_?key)/i;
  const SHARED = { settings: 1, templates: 1, rules: 1, draft: 1, mode: 1, seeded: 1 };

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    timezone: null,
    clientId: '',               // PUBLIC OAuth client ID only. Never a secret.
    defaults: { visibility: 'public', category: '28', tags: 'shorts, coding, webdev', description: 'Subscribe for more Shorts!', appendShorts: true },
    automation: { mode: 'manual', maxPerHour: 8, maxPerUserPerDay: 1 },
    notify: { upload: true, comment: true, error: true, auth: true, schedule: true }
  };

  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!over || typeof over !== 'object') return out;
    Object.keys(over).forEach(k => {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base && typeof base[k] === 'object' && base[k] !== null) out[k] = merge(base[k], over[k]);
      else out[k] = over[k];
    });
    return out;
  }

  const Store = {
    persistent,
    get(k, fb) {
      try {
        let raw = persistent ? localStorage.getItem(NS + k) : null;
        if (raw == null) raw = mem[k];
        return raw == null ? fb : JSON.parse(raw);
      } catch (e) { return fb; }
    },
    set(k, v) {
      if (BLOCKED_KEY.test(k)) throw new Error('Refusing to store a key that looks sensitive: ' + k);
      const raw = JSON.stringify(v);
      mem[k] = raw;
      try { if (persistent) localStorage.setItem(NS + k, raw); return true; } catch (e) { return false; }
    },
    remove(k) { delete mem[k]; try { if (persistent) localStorage.removeItem(NS + k); } catch (e) { /* ignore */ } },
    keys() {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(NS) === 0) out.push(k.slice(NS.length)); } } catch (e) { /* ignore */ }
      return out;
    },
    clear() { Store.keys().forEach(Store.remove); Object.keys(mem).forEach(k => delete mem[k]); },

    /* mode */
    mode() { return Store.get('mode', 'demo') === 'live' ? 'live' : 'demo'; },
    isDemo() { return Store.mode() === 'demo'; },
    setMode(m) { Store.set('mode', m === 'live' ? 'live' : 'demo'); },

    /* settings */
    settings() { return merge(DEFAULT_SETTINGS, Store.get('settings', {})); },
    saveSettings(patch) { Store.set('settings', merge(Store.settings(), patch)); },

    /* collections (mode-aware) */
    key(name) { return SHARED[name] ? name : (Store.mode() === 'live' ? 'live_' : '') + name; },
    col(name) { const v = Store.get(Store.key(name), []); return Array.isArray(v) ? v : []; },
    saveCol(name, arr) { return Store.set(Store.key(name), arr); },

    /* helpers */
    channels() { return Store.col('channels'); },
    channel(id) { return Store.channels().find(c => c.id === id) || null; },
    channelName(id) { const c = Store.channel(id); return c ? c.name : 'Removed channel'; },
    job(id) { return Store.col('jobs').find(j => j.id === id) || null; },
    saveJob(job) { const a = Store.col('jobs'); const i = a.findIndex(j => j.id === job.id); if (i < 0) a.unshift(job); else a[i] = job; Store.saveCol('jobs', a); },
    comment(id) { return Store.col('comments').find(c => c.id === id) || null; },
    saveComment(c) { const a = Store.col('comments'); const i = a.findIndex(x => x.id === c.id); if (i < 0) a.unshift(c); else a[i] = c; Store.saveCol('comments', a); },

    /* demo seed */
    init() {
      if (!Store.get('seeded', false)) Store.reseed();
      if (Store.mode() === 'live' && !Store.get('live_seeded', false)) { Store.set('live_seeded', true); }
    },
    reseed() {
      const D = w.DemoData, now = Date.now(), tz = w.U.tz();
      const wasLive = Store.mode() === 'live';
      Store.setMode('demo');
      Store.saveCol('channels', D.channels(now));
      Store.saveCol('jobs', D.jobs(now, tz));
      Store.saveCol('comments', D.comments(now));
      Store.saveCol('history', D.history(now));
      Store.saveCol('notifications', D.notifications(now));
      Store.saveCol('pending', []);
      Store.saveCol('replyLog', []);
      if (!Store.get('rules', null)) Store.set('rules', D.rules());
      if (!Store.get('templates', null)) Store.set('templates', D.templates());
      Store.set('seeded', true);
      if (wasLive) Store.setMode('live');
    },
    resetDemo() {
      const live = Store.mode() === 'live';
      Store.set('seeded', false);
      Store.reseed();
      Store.set('rules', w.DemoData.rules());
      Store.set('templates', w.DemoData.templates());
      if (live) Store.setMode('live');
    }
  };
  w.Store = Store;
})(window);

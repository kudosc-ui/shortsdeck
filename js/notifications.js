/* notifications.js — notification center + activity history (both are local logs in this frontend).
   In a production setup these would come from your backend (webhooks / Pub/Sub / polling results). */
(function (w) {
  'use strict';
  const U = w.U, Store = w.Store;

  const N_META = { upload: ['check', 'ok'], comment: ['chat', 'info'], error: ['alert', 'err'], auth: ['lock', 'warn'], schedule: ['clock', 'ok'] };

  const Notify = {
    list() { return Store.col('notifications'); },
    save(a) { Store.saveCol('notifications', a); if (w.App && w.App.refreshBadges) w.App.refreshBadges(); },
    unread() { return Notify.list().filter(n => !n.read).length; },
    add(o) {
      const prefs = Store.settings().notify;
      if (prefs[o.type] === false) return null;
      const n = { id: U.uid('n'), at: Date.now(), type: o.type, title: o.title, body: o.body || '', read: false };
      Notify.save([n].concat(Notify.list()).slice(0, 100));
      return n;
    },
    render() {
      const a = Notify.list();
      const un = a.filter(n => !n.read).length;
      let h = '<div class="row between wrap"><p class="lead">' + (un ? U.plural(un, 'unread notification') : 'You\'re all caught up.') + '</p>' +
        '<div class="row"><button type="button" class="btn sm ghost" data-act="n-readall" ' + (un ? '' : 'disabled') + '>' + U.icon('check', 'sm') + 'Mark all as read</button>' +
        '<button type="button" class="btn sm danger" data-act="n-clear" ' + (a.length ? '' : 'disabled') + '>' + U.icon('trash', 'sm') + 'Clear</button></div></div>';
      if (Store.isDemo()) h += '<div class="banner">' + U.icon('info') + '<p><b>Demo mode</b> — these are sample notifications. Real ones appear after you connect YouTube and your backend reports events.</p></div>';
      if (!a.length) return h + U.empty({ icon: 'bell', title: 'No notifications', body: 'Upload results, new comments and authorization alerts will show up here.' });
      h += '<div class="card"><div class="list">' + a.map(n => {
        const m = N_META[n.type] || ['info', 'info'];
        return '<div class="item"><span class="ico ' + m[1] + '">' + U.icon(m[0], 'sm') + '</span><div class="tx"><b>' + U.esc(n.title) + '</b>' +
          (n.body ? '<div class="muted">' + U.esc(n.body) + '</div>' : '') + '<div class="meta">' + U.esc(U.rel(n.at)) + '</div></div>' +
          (n.read ? '' : '<button type="button" class="btn xs soft" data-act="n-read" data-id="' + U.esc(n.id) + '">Mark read</button>') + '</div>';
      }).join('') + '</div></div>';
      return h;
    }
  };

  const A_META = { upload: 'upload', comment: 'chat', schedule: 'clock', auth: 'lock', error: 'alert' };
  const Activity = {
    list() { return Store.col('history'); },
    add(type, tone, text) {
      const e = { id: U.uid('h'), at: Date.now(), type, tone: tone || 'info', text, demo: Store.isDemo() };
      Store.saveCol('history', [e].concat(Activity.list()).slice(0, 300));
      return e;
    },
    icon(e) { return e.tone === 'err' ? 'alert' : e.tone === 'warn' ? 'alert' : (A_META[e.type] || 'info'); },
    item(e, withTime) {
      return '<div class="item"><span class="ico ' + (e.tone === 'info' ? 'info' : e.tone) + '">' + U.icon(Activity.icon(e), 'sm') + '</span><div class="tx">' + U.esc(e.text) +
        (e.demo ? ' <span class="tag demo">demo</span>' : '') + '</div><span class="when">' + U.esc(withTime ? U.time(e.at) : U.rel(e.at)) + '</span></div>';
    },
    filter: 'all',
    render() {
      const L = Activity.list();
      const cnt = f => f === 'all' ? L.length : L.filter(e => Activity.match(e, f)).length;
      const chips = [['all', 'All'], ['upload', 'Uploads'], ['comment', 'Comments'], ['schedule', 'Schedules'], ['auth', 'Authentication'], ['error', 'Errors']];
      return '<p class="lead">A complete log of everything this app has done or tried to do.</p>' +
        '<div class="chips" role="group" aria-label="Filter history">' + chips.map(c => '<button type="button" class="chip" aria-pressed="' + (Activity.filter === c[0]) + '" data-act="h-filter" data-f="' + c[0] + '">' + c[1] + '<span class="n">' + cnt(c[0]) + '</span></button>').join('') + '</div>' +
        '<div id="hist-list" class="stack"></div>';
    },
    match(e, f) { return f === 'all' || (f === 'error' ? e.tone === 'err' : e.type === f); },
    renderList() {
      const box = U.$('#hist-list'); if (!box) return;
      const L = Activity.list().filter(e => Activity.match(e, Activity.filter));
      if (!L.length) { box.innerHTML = U.empty({ icon: 'history', title: 'Nothing here yet', body: 'No activity matches this filter.' }); return; }
      const groups = {}, order = [], tz = U.tz();
      L.forEach(e => { const k = U.dayKey(e.at, tz); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(e); });
      box.innerHTML = order.map(k => '<section class="stack sm"><div class="date-h">' + U.esc(U.date(groups[k][0].at, tz)) + '</div><div class="card"><div class="list">' + groups[k].map(e => Activity.item(e, true)).join('') + '</div></div></section>').join('');
    }
  };

  U.act('n-read', t => { const a = Notify.list(); const n = a.find(x => x.id === t.dataset.id); if (n) { n.read = true; Notify.save(a); w.App.rerender(); } });
  U.act('n-readall', () => { const a = Notify.list(); a.forEach(n => { n.read = true; }); Notify.save(a); w.App.rerender(); U.toast('All notifications marked as read.', 'ok'); });
  U.act('n-clear', async () => {
    if (await U.confirm({ title: 'Clear all notifications?', body: 'This removes every notification from this device. Your activity history is not affected.', confirmText: 'Clear all', danger: true })) { Notify.save([]); w.App.rerender(); U.toast('Notifications cleared.', 'ok'); }
  });
  U.act('h-filter', t => { Activity.filter = t.dataset.f; U.$$('[data-act="h-filter"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); Activity.renderList(); });

  w.Notify = Notify; w.Activity = Activity;
})(window);

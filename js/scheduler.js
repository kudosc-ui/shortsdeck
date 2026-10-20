/* scheduler.js — Scheduler page (page 5).
   IMPORTANT (also shown in the UI): a browser-only site can't run code after the tab is closed.
   • Live mode: YouTube itself publishes at status.publishAt once the video has finished uploading — that keeps working with the browser closed.
   • Demo mode / planned slots: schedules live on this device only. Nothing publishes on its own. */
(function (w) {
  'use strict';
  const U = w.U, Store = w.Store, YT = w.YT;
  const state = { day: null };

  function items() {
    const out = [];
    Store.col('jobs').forEach(j => j.targets.forEach(t => { if (t.status === 'scheduled' && t.scheduledAt) out.push({ job: j, t }); }));
    return out.sort((a, b) => a.t.scheduledAt - b.t.scheduledAt);
  }
  function row(it) {
    const { job, t } = it, ch = Store.channel(t.channelId), tz = U.tz();
    const overdue = t.scheduledAt < Date.now();
    return '<div class="sch"><div class="t"><b>' + U.esc(U.time(t.scheduledAt, tz)) + '</b><small>' + U.esc(U.dateShort(t.scheduledAt, tz)) + '</small></div><div class="bd">' +
      '<h4>' + U.esc(job.title) + '</h4><div class="row wrap" style="gap:6px">' + U.avatar(ch ? ch.name : '?', 'xs') + '<span class="muted" style="font-size:13px;font-weight:600">' + U.esc(ch ? ch.name : 'Removed channel') + '</span>' +
      (overdue ? U.badge('Past due', 'warn', 'alert') : '<span class="dim" style="font-size:12.5px">' + U.esc(U.until(t.scheduledAt)) + '</span>') +
      ((t.demoOnly || t.localOnly || job.noFile) ? '<span class="tag demo">local only</span>' : '') + (job.noFile ? '<span class="tag">no video attached</span>' : '') + '</div>' +
      (overdue && !t.videoId ? '<div class="hint">This app can\'t publish while it\'s closed. Upload it again or reschedule.</div>' : '') +
      '<div class="row"><button type="button" class="btn xs" data-act="sch-edit" data-job="' + U.esc(job.id) + '" data-tid="' + U.esc(t.id) + '">' + U.icon('edit', 'xs') + 'Edit</button>' +
      '<button type="button" class="btn xs danger" data-act="sch-del" data-job="' + U.esc(job.id) + '" data-tid="' + U.esc(t.id) + '">' + U.icon('trash', 'xs') + 'Delete</button></div></div></div>';
  }
  function group(title, list, tone) {
    if (!list.length) return '';
    return '<section class="stack sm"><div class="row between"><div class="date-h">' + U.esc(title) + '</div>' + U.badge(String(list.length), tone || 'mute') + '</div><div class="card"><div class="list">' + list.map(row).join('') + '</div></div></section>';
  }

  const Scheduler = {
    render() {
      const tz = U.tz();
      let h = '<div class="banner info">' + U.icon('server') + '<div><p><b>Heads up:</b> a website can\'t run code after you close it.</p><p>' +
        (Store.isDemo() ? 'In demo mode, schedules are saved on this device only and nothing publishes on its own.' : 'Once a video has finished uploading, YouTube publishes it at the scheduled time by itself. Shorts that are still waiting to upload need this tab open (or a server).') +
        ' For 24/7 reliability use a backend worker — see the README.</p></div></div>';
      h += '<div class="row wrap between"><div class="field grow" style="min-width:180px"><label for="sch-tz">Timezone</label><select class="select" id="sch-tz" data-chg="sch-tz">' + U.tzOptions(tz) + '</select></div>' +
        '<button type="button" class="btn primary" data-act="sch-new" style="align-self:flex-end">' + U.icon('plus', 'sm') + 'New schedule</button></div>';
      h += '<div id="sch-week"></div><div id="sch-lists" class="stack"></div>';
      return h;
    },
    mount() { Scheduler.paint(); },
    paint() {
      const tz = U.tz(), all = items(), now = Date.now();
      const todayK = U.dayKey(now, tz), tmrK = U.dayKey(now + 86400e3, tz);
      const wk = U.$('#sch-week'), box = U.$('#sch-lists'); if (!wk || !box) return;
      let strip = '';
      for (let i = 0; i < 14; i++) {
        const ts = now + i * 86400e3, k = U.dayKey(ts, tz), has = all.some(x => U.dayKey(x.t.scheduledAt, tz) === k);
        strip += '<button type="button" class="day ' + (has ? 'has' : '') + (k === todayK ? ' today' : '') + '" data-act="sch-day" data-k="' + k + '" aria-pressed="' + (state.day === k) + '" aria-label="' + U.esc(U.weekday(ts, tz, 'long') + ' ' + U.dateShort(ts, tz) + (has ? ', has scheduled Shorts' : '')) + '"><small>' + U.esc(U.weekday(ts, tz)) + '</small><b>' + (+k.slice(8)) + '</b><i></i></button>';
      }
      wk.innerHTML = '<div class="week" role="group" aria-label="Next 14 days">' + strip + '</div>';
      if (!all.length) { box.innerHTML = U.empty({ icon: 'calendar', title: 'Nothing scheduled', body: 'Schedule a Short from the Upload page, or plan a slot here.', action: '<button type="button" class="btn primary" data-act="sch-new">' + U.icon('plus', 'sm') + 'New schedule</button>' }); return; }
      if (state.day) {
        const list = all.filter(x => U.dayKey(x.t.scheduledAt, tz) === state.day);
        box.innerHTML = '<div class="row between"><span class="muted">Showing one day</span><button type="button" class="btn xs ghost" data-act="sch-day" data-k="' + state.day + '">' + U.icon('x', 'xs') + 'Clear filter</button></div>' + (list.length ? group(U.date(Date.parse(state.day + 'T12:00:00Z'), 'UTC'), list, 'accent') : U.empty({ icon: 'calendar', title: 'Free day', body: 'No Shorts scheduled for this day.' }));
        return;
      }
      const overdue = all.filter(x => x.t.scheduledAt < now), rest = all.filter(x => x.t.scheduledAt >= now);
      const today = rest.filter(x => U.dayKey(x.t.scheduledAt, tz) === todayK), tmr = rest.filter(x => U.dayKey(x.t.scheduledAt, tz) === tmrK);
      const later = rest.filter(x => { const k = U.dayKey(x.t.scheduledAt, tz); return k !== todayK && k !== tmrK; });
      box.innerHTML = group('Past due', overdue, 'warn') + group('Today', today, 'accent') + group('Tomorrow', tmr, 'info') + group('Upcoming', later, 'mute');
    }
  };

  U.chg('sch-tz', t => { Store.saveSettings({ timezone: t.value }); w.App.rerender(); });
  U.act('sch-day', t => { state.day = state.day === t.dataset.k ? null : t.dataset.k; Scheduler.paint(); });

  U.act('sch-new', () => {
    const chans = Store.channels().filter(c => c.status !== 'expired');
    if (!chans.length) { U.toast('Connect a channel first.', 'warn'); return; }
    const tmr = Date.now() + 86400e3;
    U.modal({
      title: 'New schedule',
      html: '<div class="stack"><p class="hint">Plans a publishing slot. Attach the video on the Upload page — a slot alone can\'t publish anything.</p>' +
        '<div class="field"><label for="sn-title">Short title</label><input class="input" id="sn-title" maxlength="100" placeholder="e.g. 3 VS Code tricks"></div>' +
        '<div class="field"><label>Channels</label><div class="stack sm">' + chans.map((c, i) => '<label class="pick"><input type="checkbox" class="vh" value="' + U.esc(c.id) + '" ' + (i === 0 ? 'checked' : '') + '><span class="pick-in">' + U.avatar(c.name, 'sm') + '<span class="pick-t"><b>' + U.esc(c.name) + '</b><small>' + U.esc(c.handle) + '</small></span><span class="tick">' + U.icon('check', 'sm') + '</span></span></label>').join('') + '</div></div>' +
        U.dtFields('sn', tmr) + '<p class="hint">Timezone: ' + U.esc(U.tz()) + ' (change it at the top of the page).</p></div>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Create schedule', kind: 'primary', onClick: h => {
          const title = U.clean(U.$('#sn-title', h.el).value, 100), at = U.readDt(h.el, 'sn');
          const ids = U.$$('.pick input:checked', h.el).map(i => i.value);
          if (!title) { U.toast('Add a title.', 'err'); return false; }
          if (/[<>]/.test(title)) { U.toast('Titles can\'t contain < or >.', 'err'); return false; }
          if (!ids.length) { U.toast('Select at least one channel.', 'err'); return false; }
          if (isNaN(at) || at < Date.now() + 5 * 60e3) { U.toast('Pick a time at least 5 minutes from now.', 'err'); return false; }
          const s = Store.settings().defaults;
          Store.saveJob({ id: U.uid('j'), title, description: s.description, tags: [], visibility: s.visibility, category: s.category, hue: U.hash(title) % 360, createdAt: Date.now(), demo: Store.isDemo(), noFile: true, file: null,
            targets: ids.map(id => ({ id: U.uid('t'), channelId: id, status: 'scheduled', progress: 0, scheduledAt: at, error: null, localOnly: true })) });
          w.Activity.add('schedule', 'info', 'Planned "' + title + '" for ' + ids.map(Store.channelName).join(', ') + ' — ' + U.date(at) + ', ' + U.time(at));
          U.toast('Schedule created (saved on this device).', 'ok'); w.App.rerender();
        }
      }]
    });
  });

  U.act('sch-edit', t => {
    const job = Store.job(t.dataset.job); const tg = job && job.targets.find(x => x.id === t.dataset.tid); if (!tg) return;
    const locked = !!tg.videoId, chans = Store.channels();
    U.modal({
      title: 'Edit schedule',
      html: '<div class="stack"><div><b>' + U.esc(job.title) + '</b></div>' +
        '<div class="field"><label for="se-ch">Channel</label><select class="select" id="se-ch" ' + (locked ? 'disabled' : '') + '>' + chans.map(c => '<option value="' + U.esc(c.id) + '" ' + (c.id === tg.channelId ? 'selected' : '') + (c.status === 'expired' && c.id !== tg.channelId ? ' disabled' : '') + '>' + U.esc(c.name) + '</option>').join('') + '</select>' + (locked ? '<div class="hint">This video is already uploaded to this channel, so the channel can\'t change.</div>' : '') + '</div>' +
        U.dtFields('se', tg.scheduledAt) + '<p class="hint">Timezone: ' + U.esc(U.tz()) + '</p></div>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: async h => {
          const at = U.readDt(h.el, 'se');
          if (isNaN(at) || at < Date.now() + 5 * 60e3) { U.toast('Pick a time at least 5 minutes from now.', 'err'); return false; }
          const cur = Store.job(job.id), ct = cur.targets.find(x => x.id === tg.id);
          if (ct.videoId && !cur.demo) { const r = await YT.rescheduleVideo(ct.channelId, ct.videoId, at); if (!r.ok) { U.toast(r.message || 'Could not update on YouTube.', 'err'); return false; } }
          ct.scheduledAt = at; ct.channelId = U.$('#se-ch', h.el).value;
          Store.saveJob(cur);
          w.Activity.add('schedule', 'info', 'Rescheduled "' + cur.title + '" → ' + Store.channelName(ct.channelId) + ', ' + U.date(at) + ' ' + U.time(at));
          U.toast('Schedule updated' + (cur.demo ? ' (saved on this device).' : '.'), 'ok'); w.App.rerender();
        }
      }]
    });
  });

  U.act('sch-del', async t => {
    const job = Store.job(t.dataset.job); const tg = job && job.targets.find(x => x.id === t.dataset.tid); if (!tg) return;
    const extra = tg.videoId ? ' The video is already on YouTube as a private scheduled video — delete it in YouTube Studio to remove it completely.' : '';
    if (!await U.confirm({ title: 'Delete this schedule?', body: '"' + job.title + '" on ' + Store.channelName(tg.channelId) + ' will be removed from the schedule.' + extra, confirmText: 'Delete', danger: true })) return;
    const cur = Store.job(job.id); cur.targets = cur.targets.filter(x => x.id !== tg.id);
    if (!cur.targets.length) Store.saveCol('jobs', Store.col('jobs').filter(j => j.id !== cur.id)); else Store.saveJob(cur);
    w.Activity.add('schedule', 'warn', 'Deleted schedule "' + cur.title + '" on ' + Store.channelName(tg.channelId));
    U.toast('Schedule deleted.', 'ok'); w.App.rerender();
  });

  w.Scheduler = Scheduler;
})(window);

/* util.js — small, dependency-free helpers shared by every module.
   Security note: every piece of user-supplied text MUST go through U.esc() before it is placed in HTML. */
(function (w) {
  'use strict';
  const U = {};

  /* ---------- DOM / text ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  U.esc = v => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ESC[c]);
  U.$ = (s, r) => (r || document).querySelector(s);
  U.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  U.uid = p => (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  U.icon = (n, c) => '<svg class="i ' + (c || '') + '" aria-hidden="true" focusable="false"><use href="#i-' + n + '"/></svg>';
  U.clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  U.hash = s => { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  U.debounce = (fn, ms) => { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; };
  U.plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  U.clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max || 10000);

  U.num = n => {
    n = Number(n) || 0;
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  };
  U.bytes = b => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  U.dur = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  U.avatar = (name, size) => '<span class="av ' + (size || '') + '" style="--h:' + (U.hash(name) % 360) + '" aria-hidden="true">' + U.esc(String(name || '?').trim().charAt(0).toUpperCase()) + '</span>';
  U.badge = (label, tone, icon) => '<span class="badge b-' + (tone || 'mute') + '">' + (icon ? U.icon(icon) : '') + U.esc(label) + '</span>';
  U.empty = o => '<div class="empty"><div class="empty-i">' + U.icon(o.icon || 'info', 'lg') + '</div><h3>' + U.esc(o.title) + '</h3>' + (o.body ? '<p>' + U.esc(o.body) + '</p>' : '') + (o.action || '') + '</div>';
  U.errorState = (msg, act) => '<div class="empty"><div class="empty-i" style="color:var(--err);background:var(--err-soft)">' + U.icon('alert', 'lg') + '</div><h3>Something went wrong</h3><p>' + U.esc(msg || 'Please try again.') + '</p>' + (act ? '<button type="button" class="btn sm" data-act="' + act + '">' + U.icon('refresh', 'sm') + 'Try again</button>' : '') + '</div>';
  U.sw = (key, checked, label, extra) => '<label class="switch"><input type="checkbox" data-chg="' + key + '" ' + (extra || '') + ' ' + (checked ? 'checked' : '') + ' aria-label="' + U.esc(label) + '"><span class="trk"></span></label>';
  U.skel = (n, h) => { let s = ''; for (let i = 0; i < (n || 3); i++) s += '<div class="sk" style="height:' + (h || 96) + 'px"></div>'; return '<div class="page" aria-busy="true" aria-label="Loading">' + s + '</div>'; };

  /* ---------- Time (timezone-aware) ---------- */
  U.detectTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } };
  U.tz = () => { const s = w.Store && w.Store.settings(); const z = s && s.timezone; return U.validTz(z) ? z : U.detectTz(); };
  U.validTz = z => { if (!z) return false; try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch (e) { return false; } };
  const cache = {};
  function f(tz, key, opts) { const k = tz + '|' + key; return cache[k] || (cache[k] = new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: tz }, opts))); }
  U.date = (ts, tz) => f(tz || U.tz(), 'd', { day: 'numeric', month: 'short', year: 'numeric' }).format(ts);
  U.dateShort = (ts, tz) => f(tz || U.tz(), 'ds', { day: 'numeric', month: 'short' }).format(ts);
  U.weekday = (ts, tz, style) => f(tz || U.tz(), 'w' + (style || 'short'), { weekday: style || 'short' }).format(ts);
  U.time = (ts, tz) => f(tz || U.tz(), 't', { hour: 'numeric', minute: '2-digit', hour12: true }).format(ts).toUpperCase();
  U.tzAbbr = (tz, ts) => { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz || U.tz(), timeZoneName: 'short' }).formatToParts(new Date(ts || Date.now())); const x = p.find(q => q.type === 'timeZoneName'); return x ? x.value : ''; } catch (e) { return ''; } };
  function parts(ts, tz) {
    const o = {};
    f(tz, 'p', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts)).forEach(p => { o[p.type] = p.value; });
    return o;
  }
  function offset(ts, tz) {
    const p = parts(ts, tz);
    return Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
  }
  U.dayKey = (ts, tz) => { const p = parts(ts, tz || U.tz()); return p.year + '-' + p.month + '-' + p.day; };
  U.zoned = (ts, tz) => { const p = parts(ts, tz || U.tz()); return { date: p.year + '-' + p.month + '-' + p.day, time: String((+p.hour) % 24).padStart(2, '0') + ':' + p.minute }; };
  /* "2026-10-20" + "13:00" in zone tz -> UTC epoch ms */
  U.zonedToUtc = (dateStr, timeStr, tz) => {
    const d = String(dateStr || '').split('-').map(Number), t = String(timeStr || '').split(':').map(Number);
    if (d.length !== 3 || d.some(isNaN) || t.length < 2 || t.some(isNaN)) return NaN;
    const guess = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
    const o1 = offset(guess, tz); let res = guess - o1; const o2 = offset(res, tz);
    if (o2 !== o1) res = guess - o2;
    return res;
  };
  U.rel = ts => {
    const d = Date.now() - ts;
    if (d < 60e3) return 'just now';
    if (d < 3600e3) return Math.floor(d / 60e3) + 'm ago';
    if (d < 86400e3) return Math.floor(d / 3600e3) + 'h ago';
    if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + 'd ago';
    return U.date(ts);
  };
  U.until = ts => {
    const d = ts - Date.now();
    if (d <= 0) return 'now';
    if (d < 3600e3) return 'in ' + Math.max(1, Math.round(d / 60e3)) + 'm';
    if (d < 86400e3) return 'in ' + Math.round(d / 3600e3) + 'h';
    return 'in ' + Math.round(d / 86400e3) + 'd';
  };
  /* Date + time inputs rendered in the selected timezone */
  U.dtFields = (id, ts, label) => {
    const z = U.zoned(ts, U.tz());
    return '<div class="row2"><div class="field"><label for="' + id + '-d">' + (label || 'Date') + '</label><input class="input" type="date" id="' + id + '-d" value="' + z.date + '"></div>' +
      '<div class="field"><label for="' + id + '-t">Time</label><input class="input" type="time" id="' + id + '-t" value="' + z.time + '"></div></div>';
  };
  U.readDt = (root, id) => {
    const d = U.$('#' + id + '-d', root), t = U.$('#' + id + '-t', root);
    if (!d || !t || !d.value || !t.value) return NaN;
    return U.zonedToUtc(d.value, t.value, U.tz());
  };

  const TZ_LIST = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Manila', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Istanbul', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo'];
  U.tzOptions = sel => {
    const list = TZ_LIST.slice(); [sel, U.detectTz()].forEach(z => { if (z && U.validTz(z) && list.indexOf(z) < 0) list.unshift(z); });
    return list.map(z => '<option value="' + U.esc(z) + '" ' + (z === sel ? 'selected' : '') + '>' + U.esc(z.replace(/_/g, ' ')) + ' (' + U.esc(U.tzAbbr(z)) + ')</option>').join('');
  };

  /* ---------- Toasts ---------- */
  U.toast = (msg, type, ms) => {
    const root = U.$('#toast-root'); if (!root) return;
    type = type || 'info';
    const icon = { ok: 'check', err: 'alert', warn: 'info', info: 'info' }[type] || 'info';
    const t = document.createElement('div');
    t.className = 'toast t-' + type;
    t.innerHTML = U.icon(icon) + '<span>' + U.esc(msg) + '</span>';
    root.appendChild(t);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms || (type === 'err' || type === 'warn' ? 5200 : 3200));
  };

  /* ---------- Modal / bottom sheet ---------- */
  U.modal = function (o) {
    const root = U.$('#modal-root');
    const ov = document.createElement('div'); ov.className = 'ov';
    const id = U.uid('dlg');
    const acts = o.actions || [];
    ov.innerHTML = '<div class="dlg ' + (o.cls || '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t"><div class="grab" aria-hidden="true"></div>' +
      '<header class="dlg-h"><h2 id="' + id + '-t">' + U.esc(o.title) + '</h2><button type="button" class="btn icon ghost sm" data-close aria-label="Close">' + U.icon('x') + '</button></header>' +
      '<div class="dlg-b">' + (o.html || '') + '</div>' +
      (acts.length ? '<footer class="dlg-f">' + acts.map((a, i) => '<button type="button" class="btn ' + (a.kind || 'ghost') + '" data-i="' + i + '">' + (a.icon ? U.icon(a.icon, 'sm') : '') + U.esc(a.label) + '</button>').join('') + '</footer>' : '') + '</div>';
    const prev = document.activeElement;
    root.appendChild(ov); document.body.classList.add('lock');
    const dlg = ov.firstElementChild;
    let closed = false, resolveClosed; const done = new Promise(r => { resolveClosed = r; });
    const h = {
      el: dlg, body: U.$('.dlg-b', dlg),
      btn: i => U.$$('.dlg-f .btn', dlg)[i],
      close(val) {
        if (closed) return; closed = true;
        document.removeEventListener('keydown', onKey, true);
        ov.classList.add('out');
        setTimeout(() => { ov.remove(); if (!U.$('.ov', root)) document.body.classList.remove('lock'); try { if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 180);
        resolveClosed(val);
      },
      closed: done
    };
    function onKey(e) {
      if (root.lastElementChild !== ov) return;
      if (e.key === 'Escape') { e.stopPropagation(); if (o.dismissable !== false) h.close(); }
      else if (e.key === 'Tab') {
        const fo = U.$$('button:not([disabled]),a[href],input:not([disabled]):not(.vh),select,textarea,[tabindex]:not([tabindex="-1"])', dlg).filter(x => x.offsetParent !== null);
        if (!fo.length) return;
        const first = fo[0], last = fo[fo.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', e => {
      if (e.target === ov && o.dismissable !== false) return h.close();
      if (e.target.closest('[data-close]')) return h.close();
      const b = e.target.closest('.dlg-f .btn');
      if (b) {
        const a = acts[+b.dataset.i]; if (!a) return;
        let r; try { r = a.onClick ? a.onClick(h, e) : undefined; } catch (err) { console.error(err); r = false; }
        Promise.resolve(r).then(v => { if (v !== false && a.close !== false) h.close(a.value); });
      }
    });
    if (o.onOpen) { try { o.onOpen(h); } catch (err) { console.error(err); } }
    setTimeout(() => { const first = U.$('.dlg-b input:not(.vh):not([type=checkbox]), .dlg-b textarea, .dlg-b select', dlg) || U.$('.dlg-f .btn:last-child', dlg); if (first && !(o.noFocus)) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }, 60);
    return h;
  };
  U.confirm = o => new Promise(res => {
    let result = false;
    const h = U.modal({
      title: o.title, cls: 'sm', html: '<p class="muted">' + U.esc(o.body || '') + '</p>',
      actions: [{ label: o.cancelText || 'Cancel', kind: 'ghost' }, { label: o.confirmText || 'Confirm', kind: o.danger ? 'danger' : 'primary', onClick: () => { result = true; } }]
    });
    h.closed.then(() => res(result));
  });

  /* ---------- Delegated events: data-act (click), data-chg (change), data-inp (input) ---------- */
  const A = {}, C = {}, I = {};
  U.act = (n, fn) => { A[n] = fn; };
  U.chg = (n, fn) => { C[n] = fn; };
  U.inp = (n, fn) => { I[n] = fn; };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled || t.classList.contains('is-busy')) return;
    const fn = A[t.dataset.act];
    if (fn) { try { const r = fn(t, e); if (r && r.catch) r.catch(err => { console.error(err); U.toast('Something went wrong.', 'err'); }); } catch (err) { console.error(err); U.toast('Something went wrong.', 'err'); } }
  });
  document.addEventListener('change', e => { const t = e.target.closest('[data-chg]'); if (t && C[t.dataset.chg]) C[t.dataset.chg](t, e); });
  document.addEventListener('input', e => { const t = e.target.closest('[data-inp]'); if (t && I[t.dataset.inp]) I[t.dataset.inp](t, e); });

  U.busy = (btn, on, label) => {
    if (!btn) return;
    if (on) { btn.dataset.html = btn.innerHTML; btn.classList.add('is-busy'); btn.innerHTML = '<span class="spin"></span>' + (label ? U.esc(label) : ''); }
    else { btn.classList.remove('is-busy'); if (btn.dataset.html != null) btn.innerHTML = btn.dataset.html; }
  };
  U.copy = async text => { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } };

  w.U = U;
})(window);

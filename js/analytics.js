/* analytics.js — dependency-free SVG charts + the Analytics page.
   Demo mode: deterministic sample numbers from DemoData (clearly labelled).
   Live mode: reads the YouTube Analytics API through YT.getAnalytics(). */
(function (w) {
  'use strict';
  const U = w.U, Store = w.Store, YT = w.YT;
  const D = 86400e3;

  /* ------------------------------------------------------------------ charts */
  let seq = 0;
  function nice(max) {
    if (max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max))), n = max / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function draw(s, el) {
    const W = Math.max(220, Math.round(el.clientWidth || 320)), H = s.height || 176;
    const pad = { l: s.pct ? 36 : 38, r: 8, t: 10, b: 24 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, vals = s.values, n = vals.length;
    if (!n) { el.innerHTML = ''; return; }
    const max = s.max || nice(Math.max.apply(null, vals.concat([1])) * 1.04);
    const bar = s.type === 'bar', fmt = s.fmt || U.num, col = s.color || 'var(--accent)';
    const X = i => bar ? pad.l + (i + .5) * iw / n : pad.l + (n > 1 ? i * iw / (n - 1) : iw / 2);
    const Y = v => pad.t + ih - (v / max) * ih;
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = max * k / 4, yy = Y(v); g += '<line class="gl" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + yy + '" y2="' + yy + '"/><text class="ax" x="' + (pad.l - 6) + '" y="' + (yy + 3) + '" text-anchor="end">' + U.esc(fmt(v)) + '</text>'; }
    const lc = Math.min(5, n), idx = [];
    for (let k = 0; k < lc; k++) { const i = Math.round(k * (n - 1) / Math.max(1, lc - 1)); if (idx.indexOf(i) < 0) idx.push(i); }
    idx.forEach((i, k) => { g += '<text class="ax" x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === idx.length - 1 ? 'end' : 'middle') + '">' + U.esc(s.labels[i] || '') + '</text>'; });
    const gid = 'g' + s.id;
    let body = '';
    if (bar) {
      const bw = Math.max(1.5, iw / n * (n > 40 ? .7 : .6));
      vals.forEach((v, i) => { const hh = Math.max(.5, pad.t + ih - Y(v)); body += '<rect x="' + (X(i) - bw / 2) + '" y="' + (pad.t + ih - hh) + '" width="' + bw + '" height="' + hh + '" rx="' + Math.min(3, bw / 2) + '" style="fill:' + col + '" opacity=".88"/>'; });
    } else {
      let d = 'M' + X(0) + ',' + Y(vals[0]);
      for (let i = 1; i < n; i++) { const x0 = X(i - 1), y0 = Y(vals[i - 1]), x1 = X(i), y1 = Y(vals[i]), mx = (x0 + x1) / 2; d += ' C' + mx + ',' + y0 + ' ' + mx + ',' + y1 + ' ' + x1 + ',' + y1; }
      body = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + col + '" stop-opacity=".32"/><stop offset="1" style="stop-color:' + col + '" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="' + d + ' L' + X(n - 1) + ',' + (pad.t + ih) + ' L' + X(0) + ',' + (pad.t + ih) + ' Z" fill="url(#' + gid + ')"/>' +
        '<path d="' + d + '" fill="none" style="stroke:' + col + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + U.esc(s.aria || 'Chart') + '">' + g + body +
      '<line class="guide" x1="0" x2="0" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" style="stroke:var(--text3);opacity:0" stroke-dasharray="3 3"/><circle class="dot" r="4.5" cx="0" cy="0" style="fill:' + col + ';stroke:var(--bg);stroke-width:2;opacity:0"/></svg>';
    const svg = U.$('svg', el), guide = U.$('.guide', el), dot = U.$('.dot', el), ro = s.readout ? document.getElementById(s.readout) : null;
    const show = i => {
      guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.style.opacity = 1;
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(vals[i])); dot.style.opacity = bar ? 0 : 1;
      if (ro) ro.textContent = (s.labels[i] || '') + ' · ' + (s.valueFmt || fmt)(vals[i]);
    };
    const hide = () => { guide.style.opacity = 0; dot.style.opacity = 0; if (ro) ro.textContent = s.readoutDefault || ''; };
    const at = e => { const r = svg.getBoundingClientRect(); if (!r.width) return; const px = (e.clientX - r.left) / r.width * W; let i = bar ? Math.floor((px - pad.l) / (iw / n)) : Math.round((px - pad.l) / (iw / Math.max(1, n - 1))); show(U.clamp(i, 0, n - 1)); };
    svg.addEventListener('pointermove', at); svg.addEventListener('pointerdown', at);
    svg.addEventListener('pointerleave', hide); svg.addEventListener('pointercancel', hide);
  }
  const Charts = {
    q: [], live: [],
    add(spec) { spec.id = 'c' + (++seq); Charts.q.push(spec); return '<div class="chart" id="' + spec.id + '"></div>'; },
    flush() {
      Charts.q.forEach(s => { const el = document.getElementById(s.id); if (el) { draw(s, el); Charts.live.push(s); } });
      Charts.q = []; Charts.live = Charts.live.filter(s => document.getElementById(s.id));
    },
    redraw() { Charts.live.forEach(s => { const el = document.getElementById(s.id); if (el) draw(s, el); }); },
    spark(values, tone) {
      if (!values || values.length < 2) return '';
      const mn = Math.min.apply(null, values), mx = Math.max.apply(null, values), r = (mx - mn) || 1;
      const pts = values.map((v, i) => (i * 100 / (values.length - 1)).toFixed(1) + ',' + (27 - ((v - mn) / r) * 24).toFixed(1));
      return '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts.join(' ') + '" fill="none" style="stroke:' + (tone || 'var(--accent)') + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
    },
    donut(pct, color) {
      const r = 38, c = 2 * Math.PI * r, dash = c * U.clamp(pct, 0, 100) / 100;
      return '<svg viewBox="0 0 96 96" role="img" aria-label="' + Math.round(pct) + ' percent"><circle cx="48" cy="48" r="' + r + '" fill="none" style="stroke:var(--card3)" stroke-width="11"/>' +
        '<circle cx="48" cy="48" r="' + r + '" fill="none" style="stroke:' + (color || 'var(--accent)') + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 48 48)"/>' +
        '<text x="48" y="53" text-anchor="middle" style="fill:var(--text);font:800 19px var(--font)">' + Math.round(pct) + '%</text></svg>';
    }
  };
  w.addEventListener('resize', U.debounce(() => Charts.redraw(), 160));

  /* ------------------------------------------------------------------ data */
  const METRICS = { views: 'Views', likes: 'Likes', comments: 'Comments', subs: 'Subscribers' };
  async function load(state) {
    if (Store.isDemo()) return w.DemoData.analytics(state);
    const chans = Store.channels().filter(c => YT.hasToken(c.id));
    if (!chans.length) return { empty: true, message: 'Connect a YouTube channel (and keep this tab open) to load analytics.' };
    const ch = state.channel !== 'all' && YT.hasToken(state.channel) ? state.channel : chans[0].id;
    const days = state.range === 1 ? 2 : state.range;
    const iso = t => new Date(t).toISOString().slice(0, 10);
    const r = await YT.getAnalytics(ch, { startDate: iso(Date.now() - days * D), endDate: iso(Date.now()) });
    if (!r.ok) return { error: r.message || 'Could not load analytics.' };
    const col = n => r.data.columns.indexOf(n);
    const pick = n => r.data.rows.map(x => +x[col(n)] || 0);
    const labels = r.data.rows.map(x => U.dateShort(Date.parse(x[col('day')])));
    const series = { views: pick('views'), likes: pick('likes'), comments: pick('comments'), subs: pick('subscribersGained') };
    const sum = a => a.reduce((x, y) => x + y, 0);
    const dur = pick('averageViewDuration');
    return { demo: false, range: state.range, labels, series, totals: { views: sum(series.views), likes: sum(series.likes), comments: sum(series.comments), subs: sum(series.subs) }, delta: null,
      retention: null, avgPct: null, avgDur: dur.length ? Math.round(sum(dur) / dur.length) : 0, watchHours: Math.round(sum(pick('estimatedMinutesWatched')) / 60), topVideos: [], uploadsPerWeek: [], channelName: Store.channelName(ch) };
  }
  const deltaHtml = v => v == null ? '' : '<span class="delta ' + (v >= 0 ? 'up' : 'down') + '">' + (v >= 0 ? '▲' : '▼') + ' ' + Math.abs(v).toFixed(1) + '%</span>';

  /* ------------------------------------------------------------------ page */
  const state = { channel: 'all', video: 'all', range: 28 };
  const RANGES = [[1, 'Today'], [7, '7 days'], [28, '28 days'], [90, '90 days']];
  const Analytics = {
    Charts, load, deltaHtml, METRICS,
    render() {
      const chans = Store.channels();
      if (!chans.length) return U.empty({ icon: 'chart', title: 'No data yet', body: 'No YouTube channels connected yet.', action: '<button type="button" class="btn primary" data-act="connect">' + U.icon('plus', 'sm') + 'Connect YouTube</button>' });
      return '<div class="card"><div class="row2"><div class="field"><label for="an-ch">Channel</label><select class="select" id="an-ch" data-chg="an-ch">' +
        '<option value="all">All channels</option>' + chans.map(c => '<option value="' + U.esc(c.id) + '" ' + (state.channel === c.id ? 'selected' : '') + '>' + U.esc(c.name) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="an-vid">Video</label><select class="select" id="an-vid" data-chg="an-vid"></select></div></div>' +
        '<div class="seg" role="group" aria-label="Date range" style="margin-top:14px">' + RANGES.map(r => '<button type="button" data-act="an-range" data-r="' + r[0] + '" aria-pressed="' + (state.range === r[0]) + '">' + r[1] + '</button>').join('') + '</div></div>' +
        '<div id="an-body" class="stack">' + U.skel(3, 110).replace('class="page"', 'class="stack"') + '</div>';
    },
    mount() { Analytics.fillVideos(); Analytics.refresh(); },
    fillVideos() {
      const sel = U.$('#an-vid'); if (!sel) return;
      const vids = Store.isDemo() && state.channel !== 'all' ? (w.DemoData.videos[state.channel] || []) : [];
      sel.innerHTML = '<option value="all">' + (state.channel === 'all' ? 'All videos' : 'All videos on channel') + '</option>' + vids.map(v => '<option value="' + U.esc(v.id) + '" ' + (state.video === v.id ? 'selected' : '') + '>' + U.esc(v.title) + '</option>').join('');
      sel.disabled = state.channel === 'all' || !Store.isDemo();
      if (state.channel === 'all') state.video = 'all';
    },
    async refresh() {
      const box = U.$('#an-body'); if (!box) return;
      const my = ++Analytics._tok;
      const d = await load(state);
      if (my !== Analytics._tok || !U.$('#an-body')) return;
      if (d.empty) { box.innerHTML = U.empty({ icon: 'chart', title: 'Nothing to show yet', body: d.message, action: '<button type="button" class="btn primary" data-act="connect">Connect YouTube</button>' }); return; }
      if (d.error) { box.innerHTML = U.errorState(d.error, 'an-retry'); return; }
      Charts.q = [];
      const s = d.series, t = d.totals, k = (key, label, tone) => '<div class="kpi"><div class="k">' + label + '</div><div class="v">' + U.num(t[key]) + '</div>' + deltaHtml(d.delta && d.delta[key]) + Charts.spark(s[key], tone) + '</div>';
      const per = state.range === 1 ? 'today (hourly)' : 'last ' + state.range + ' days';
      let h = '';
      if (d.demo) h += '<div class="banner">' + U.icon('info') + '<p><b>Demo data</b> — sample numbers for layout only. ' + U.esc(YT.DEMO_HINT) + '</p></div>';
      else h += '<div class="banner info">' + U.icon('info') + '<p>Live data for <b>' + U.esc(d.channelName) + '</b>. The Analytics API reports daily totals, so “Today” shows the last two days.</p></div>';
      h += '<div class="kpis">' + k('views', 'Views', 'var(--accent)') + k('likes', 'Likes', 'var(--info)') + k('comments', 'Comments', 'var(--warn)') + k('subs', 'Subscribers', 'var(--ok)') + '</div>';
      h += '<div class="card"><div class="card-h"><div><h3>Views</h3><div class="sub">' + per + '</div></div><span class="readout" id="ro-v">' + U.num(t.views) + ' total</span></div>' +
        Charts.add({ type: 'area', labels: d.labels, values: s.views, readout: 'ro-v', readoutDefault: U.num(t.views) + ' total', aria: 'Views over time' }) + '</div>';
      h += '<div class="card"><div class="card-h"><div><h3>Engagement</h3><div class="sub">Likes per ' + (state.range === 1 ? 'hour' : 'day') + '</div></div><span class="readout" id="ro-l">' + U.num(t.likes) + ' total</span></div>' +
        Charts.add({ type: 'bar', labels: d.labels, values: s.likes, color: 'var(--info)', readout: 'ro-l', readoutDefault: U.num(t.likes) + ' total', aria: 'Likes over time' }) + '</div>';
      h += '<div class="card"><div class="card-h"><div><h3>Watch performance</h3><div class="sub">How viewers watch your Shorts</div></div></div>';
      if (d.retention) {
        const lab = d.retention.map((_, i) => (i * 5) + '%');
        h += Charts.add({ type: 'area', labels: lab, values: d.retention, max: 100, pct: true, fmt: v => Math.round(v) + '%', color: 'var(--ok)', height: 150, aria: 'Audience retention' });
        h += '<div class="donut-wrap" style="margin-top:14px">' + Charts.donut(d.avgPct, 'var(--ok)') + '<div class="kv"><div><span class="k">Viewed vs swiped away</span><span class="v">' + d.avgPct + '% stayed · ' + d.swiped + '% swiped</span></div><div><span class="k">Retention</span><span class="v">Share of viewers still watching at each point</span></div></div></div>';
      } else h += '<p class="muted">Retention curves need the audienceRetention report, which is only available per video via the API.</p>';
      h += '<div class="mini-stats"><div><b>' + U.dur(d.avgDur) + '</b><small>Avg. view duration</small></div><div><b>' + (d.avgPct != null ? d.avgPct + '%' : '—') + '</b><small>Avg. % viewed</small></div><div><b>' + U.num(d.watchHours) + 'h</b><small>Watch time</small></div></div></div>';
      h += '<div class="card"><div class="card-h"><div><h3>Upload performance</h3><div class="sub">Uploads and top Shorts</div></div></div>';
      if (d.uploadsPerWeek && d.uploadsPerWeek.length) h += Charts.add({ type: 'bar', labels: d.uploadsPerWeek.map(x => x.label), values: d.uploadsPerWeek.map(x => x.count), color: 'var(--accent)', height: 130, fmt: v => String(Math.round(v)), aria: 'Uploads per week' });
      if (d.topVideos && d.topVideos.length) {
        const mx = d.topVideos[0].views || 1;
        h += '<div class="list" style="margin-top:12px">' + d.topVideos.map(v => '<div class="hbar"><div class="row between"><span class="truncate" style="font-weight:650;font-size:14px">' + U.esc(v.title) + '</span><b class="num">' + U.num(v.views) + '</b></div><div class="bar"><i style="width:' + Math.max(3, Math.round(v.views / mx * 100)) + '%"></i></div><small class="dim">' + U.esc(Store.channelName(v.channelId)) + '</small></div>').join('') + '</div>';
      } else if (!d.uploadsPerWeek || !d.uploadsPerWeek.length) h += '<p class="muted">Per-video ranking isn\'t loaded in live mode yet — use getChannelVideos() + a per-video report.</p>';
      h += '</div>';
      box.innerHTML = h;
      Charts.flush();
    },
    _tok: 0
  };

  U.chg('an-ch', t => { state.channel = t.value; state.video = 'all'; Analytics.fillVideos(); Analytics.refresh(); });
  U.chg('an-vid', t => { state.video = t.value; Analytics.refresh(); });
  U.act('an-range', t => { state.range = +t.dataset.r; U.$$('[data-act="an-range"]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); Analytics.refresh(); });
  U.act('an-retry', () => Analytics.refresh());

  w.Analytics = Analytics;
})(window);

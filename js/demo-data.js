/* demo-data.js — PLACEHOLDER / MOCK DATA ONLY.
   Nothing in this file comes from YouTube. It exists so the UI looks complete in demo mode.
   Everything produced here is flagged demo:true and is never presented as real YouTube data. */
(function (w) {
  'use strict';
  const H = 3600e3, D = 86400e3, MIN = 60e3;

  function rng(str) {
    let a = 0; str = String(str);
    for (let i = 0; i < str.length; i++) a = (Math.imul(31, a) + str.charCodeAt(i)) | 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  const VIDEOS = {
    demo_codezing: [
      { id: 'v_cz1', title: '5 AI Websites you can build today' },
      { id: 'v_cz2', title: 'Build a login page in 60 seconds' },
      { id: 'v_cz3', title: 'CSS tricks you didn\'t know' },
      { id: 'v_cz4', title: 'Stop using these JS patterns' }
    ],
    demo_kudosc: [
      { id: 'v_kc1', title: 'Why developers need a social hub' },
      { id: 'v_kc2', title: 'KudosC launch teaser' },
      { id: 'v_kc3', title: 'Ship fast, praise faster' },
      { id: 'v_kc4', title: 'My dev setup tour' }
    ],
    demo_techprojects: [
      { id: 'v_tp1', title: 'Arduino weather station in 60s' },
      { id: 'v_tp2', title: 'Raspberry Pi home server' },
      { id: 'v_tp3', title: '3D printed phone stand' },
      { id: 'v_tp4', title: 'ESP32 LED matrix build' }
    ]
  };
  const SHARE = { demo_codezing: .55, demo_kudosc: .3, demo_techprojects: .15 };

  const DemoData = {
    videos: VIDEOS,

    channels(now) {
      return [
        { id: 'demo_codezing', name: 'CodeZing', handle: '@codezing', subs: 48200, videos: 126, views: 2310000, status: 'connected', automation: true, addedAt: now - 40 * D, demo: true },
        { id: 'demo_kudosc', name: 'KudosC', handle: '@kudosc', subs: 12900, videos: 58, views: 640000, status: 'connected', automation: true, addedAt: now - 28 * D, demo: true },
        { id: 'demo_techprojects', name: 'Tech Projects', handle: '@techprojects', subs: 5400, videos: 31, views: 190000, status: 'expired', automation: false, addedAt: now - 12 * D, demo: true }
      ];
    },

    jobs(now, tz) {
      const U = w.U;
      const dayAt = (offsetDays, hh, mm) => {
        const base = U.zoned(now + offsetDays * D, tz).date;
        return U.zonedToUtc(base, String(hh).padStart(2, '0') + ':' + String(mm || 0).padStart(2, '0'), tz);
      };
      const T = (ch, status, extra) => Object.assign({ id: U.uid('t'), channelId: ch, status, progress: status === 'published' || status === 'processing' ? 100 : 0, scheduledAt: null, error: null }, extra || {});
      return [
        { id: 'j_demo1', title: '5 AI Websites you can build today', description: 'Five AI-powered sites you can build this weekend.', tags: ['ai', 'webdev', 'shorts'], visibility: 'public', category: '28', hue: 350, createdAt: now - 3 * H, demo: true, file: { name: '5-ai-websites.mp4', size: 18400000, type: 'video/mp4', duration: 41 },
          targets: [T('demo_codezing', 'published', { publishedAt: now - 2 * H }), T('demo_kudosc', 'uploading', { progress: 64 }), T('demo_techprojects', 'scheduled', { scheduledAt: dayAt(0, 18, 0) > now ? dayAt(0, 18, 0) : now + 4 * H })] },
        { id: 'j_demo2', title: 'Build a login page in 60 seconds', description: 'HTML + CSS only. No framework.', tags: ['html', 'css', 'tutorial'], visibility: 'public', category: '27', hue: 210, createdAt: now - 1 * D, demo: true, file: { name: 'login-60s.mp4', size: 22100000, type: 'video/mp4', duration: 58 },
          targets: [T('demo_codezing', 'scheduled', { scheduledAt: dayAt(1, 13, 0) }), T('demo_kudosc', 'scheduled', { scheduledAt: dayAt(1, 14, 0) })] },
        { id: 'j_demo3', title: 'CSS tricks you didn\'t know', description: '', tags: ['css'], visibility: 'public', category: '28', hue: 28, createdAt: now - 5 * H, demo: true, file: { name: 'css-tricks.mp4', size: 15200000, type: 'video/mp4', duration: 37 },
          targets: [T('demo_codezing', 'processing', { progress: 100 }), T('demo_techprojects', 'failed', { error: 'quotaExceeded — the daily YouTube API upload quota was reached. (sample error)' })] },
        { id: 'j_demo4', title: 'ESP32 LED matrix build', description: '', tags: ['esp32', 'maker'], visibility: 'unlisted', category: '28', hue: 150, createdAt: now - 2 * D, demo: true, file: null, noFile: true,
          targets: [T('demo_techprojects', 'scheduled', { scheduledAt: dayAt(3, 18, 0), localOnly: true })] },
        { id: 'j_demo5', title: 'My dev setup tour', description: '', tags: ['setup'], visibility: 'public', category: '22', hue: 270, createdAt: now - 4 * D, demo: true, file: { name: 'setup.mp4', size: 30100000, type: 'video/mp4', duration: 55 },
          targets: [T('demo_kudosc', 'published', { publishedAt: now - 4 * D + 2 * H }), T('demo_codezing', 'published', { publishedAt: now - 4 * D + 3 * H })] },
        { id: 'j_demo6', title: 'KudosC launch teaser (old cut)', description: '', tags: [], visibility: 'public', category: '24', hue: 320, createdAt: now - 6 * D, demo: true, file: { name: 'teaser-old.mp4', size: 9100000, type: 'video/mp4', duration: 22 },
          targets: [T('demo_kudosc', 'cancelled')] }
      ];
    },

    comments(now) {
      const C = (i, ch, vid, author, text, mins, likes, status, read, extra) => Object.assign({ id: 'c_demo' + i, channelId: ch, video: vid, author, text, at: now - mins * MIN, likes, status, read, flagged: false, demo: true }, extra || {});
      const cz = VIDEOS.demo_codezing, kc = VIDEOS.demo_kudosc, tp = VIDEOS.demo_techprojects;
      return [
        C(1, 'demo_codezing', cz[0], '@developer123', 'Where can I get the source code?', 6, 4, 'new', false),
        C(2, 'demo_codezing', cz[0], '@pixel_priya', 'Is there a GitHub repo for these 5 sites?', 19, 2, 'new', false),
        C(3, 'demo_codezing', cz[1], '@frontend_fan', 'This is exactly what I needed, thanks!', 44, 11, 'new', false),
        C(4, 'demo_kudosc', kc[0], '@byte_baker', 'Love the idea. Will there be an invite-only beta?', 75, 7, 'new', true),
        C(5, 'demo_codezing', cz[2], '@css_wizard', 'Number 3 blew my mind 🤯', 140, 23, 'replied', true, { replyText: 'Glad you liked it! More CSS tricks coming soon 🎨', repliedAt: now - 120 * MIN }),
        C(6, 'demo_kudosc', kc[2], '@night_coder', 'Can you do a collab with my channel?', 190, 1, 'new', true),
        C(7, 'demo_techprojects', tp[0], '@arduino_alex', 'What sensor did you use for humidity?', 260, 5, 'new', true),
        C(8, 'demo_codezing', cz[3], '@oldschool_js', 'Hard disagree on #2 but good video.', 330, 9, 'ignored', true),
        C(9, 'demo_kudosc', kc[1], '@launch_lisa', 'Where do I sign up? Link please!', 410, 3, 'new', false),
        C(10, 'demo_codezing', cz[1], '@tutorial_tom', 'Thank you so much, subscribed!', 520, 14, 'replied', true, { replyText: 'Thanks for watching! ❤️', repliedAt: now - 500 * MIN }),
        C(11, 'demo_techprojects', tp[2], '@maker_mia', 'Can you share the STL file for the stand?', 700, 6, 'new', true),
        C(12, 'demo_codezing', cz[0], '@vue_vince', 'Why not use React for these?', 900, 0, 'new', true),
        C(13, 'demo_kudosc', kc[3], '@setup_sam', 'Which monitor is that? Awesome setup', 1300, 8, 'new', true),
        C(14, 'demo_codezing', cz[2], '@hello_world_h', 'source code pls', 1700, 2, 'new', true)
      ];
    },

    rules() {
      return [
        { id: 'r_demo1', name: 'Source code requests', keywords: ['source', 'code', 'github', 'repository'], type: 'contains', reply: 'Source code is available in the video description! 🚀', channels: 'all', enabled: true },
        { id: 'r_demo2', name: 'Thanks & praise', keywords: ['thanks', 'thank you', 'awesome'], type: 'contains', reply: 'Thanks for watching! ❤️', channels: 'all', enabled: true },
        { id: 'r_demo3', name: 'Collab inquiries', keywords: ['collab', 'sponsor'], type: 'contains', reply: 'Please email us — the business address is in the channel About tab.', channels: 'all', enabled: false }
      ];
    },

    templates() {
      return [
        { id: 'tp_demo1', name: 'Source Code', text: 'Source code is available in the description! 🔗' },
        { id: 'tp_demo2', name: 'Thank You', text: 'Thanks for watching! ❤️' },
        { id: 'tp_demo3', name: 'Subscribe nudge', text: 'Glad you liked it! New Shorts every week 🎬' },
        { id: 'tp_demo4', name: 'Collab reply', text: 'Thanks for reaching out! Please email us — the address is on our About page.' }
      ];
    },

    history(now) {
      const E = (type, tone, text, mins) => ({ id: w.U.uid('h'), at: now - mins * MIN, type, tone, text, demo: true });
      return [
        E('upload', 'ok', 'Short uploaded to CodeZing — "5 AI Websites you can build today"', 120),
        E('comment', 'ok', 'Reply sent to @tutorial_tom', 500),
        E('schedule', 'info', 'Short scheduled for KudosC — "Build a login page in 60 seconds"', 1 * 1440 + 30),
        E('upload', 'err', 'Upload failed on Tech Projects — quotaExceeded', 1 * 1440 + 190),
        E('comment', 'ok', 'Reply sent to @css_wizard', 1 * 1440 + 400),
        E('auth', 'warn', 'Authorization expired for Tech Projects', 2 * 1440 + 20),
        E('schedule', 'info', 'Short scheduled for Tech Projects — "ESP32 LED matrix build"', 2 * 1440 + 200),
        E('upload', 'ok', 'Short uploaded to KudosC — "My dev setup tour"', 4 * 1440 - 100),
        E('upload', 'ok', 'Short uploaded to CodeZing — "My dev setup tour"', 4 * 1440 - 180),
        E('auth', 'ok', 'Connected channel Tech Projects', 12 * 1440),
        E('auth', 'ok', 'Connected channel KudosC', 28 * 1440)
      ];
    },

    notifications(now) {
      const N = (type, title, body, mins, read) => ({ id: w.U.uid('n'), at: now - mins * MIN, type, title, body, read: !!read });
      return [
        N('comment', 'New comment on CodeZing', '@developer123: "Where can I get the source code?"', 6, false),
        N('upload', 'Upload completed', '"5 AI Websites you can build today" finished uploading to CodeZing.', 120, false),
        N('error', 'Upload failed', '"CSS tricks you didn\'t know" failed on Tech Projects (quotaExceeded).', 300, false),
        N('auth', 'YouTube authorization expired', 'Reconnect Tech Projects to keep uploading and replying.', 1 * 1440 + 20, false),
        N('schedule', 'Scheduled Short published', '"My dev setup tour" went live on KudosC.', 4 * 1440 - 100, true),
        N('comment', '3 new comments', 'KudosC received new comments overnight.', 5 * 1440, true)
      ];
    },

    /* Deterministic, believable analytics. range: 1 (today) | 7 | 28 | 90 */
    analytics(o) {
      o = o || {};
      const range = [1, 7, 28, 90].indexOf(o.range) >= 0 ? o.range : 28;
      const ch = o.channel && o.channel !== 'all' ? o.channel : 'all';
      const vid = o.video && o.video !== 'all' ? o.video : 'all';
      const share = ch === 'all' ? 1 : (SHARE[ch] || .2);
      let vShare = 1;
      if (ch !== 'all' && vid !== 'all') { const idx = (VIDEOS[ch] || []).findIndex(v => v.id === vid); vShare = [.42, .28, .2, .1][idx] || .25; }
      const scale = share * vShare;
      const mk = (tag) => {
        const r = rng([ch, vid, range, tag].join('|'));
        const n = range === 1 ? 24 : range;
        const labels = [], views = [], likes = [], comments = [], subs = [];
        const now = Date.now();
        for (let i = 0; i < n; i++) {
          const wave = range === 1 ? (.35 + .65 * Math.max(0, Math.sin((i - 5) / 24 * Math.PI * 2 - .6) * .5 + .55)) : (.8 + .25 * Math.sin(i / 3.2) + (i / n) * .35);
          const base = (range === 1 ? 900 : 21000) * scale * wave * (.8 + r() * .5);
          const v = Math.round(base);
          views.push(v); likes.push(Math.round(v * (.055 + r() * .02))); comments.push(Math.round(v * (.004 + r() * .002)));
          subs.push(Math.round(v * (.0035 + r() * .0025)));
          const tsAt = range === 1 ? now - (n - 1 - i) * H : now - (n - 1 - i) * D;
          labels.push(range === 1 ? new Date(tsAt).getHours() + ':00' : w.U.dateShort(tsAt));
        }
        return { labels, views, likes, comments, subs };
      };
      const cur = mk('cur'), prev = mk('prev');
      ['views', 'likes', 'comments', 'subs'].forEach(k => { prev[k] = prev[k].map(v => Math.round(v * (k === 'subs' ? .8 : .9))); });
      const sum = a => a.reduce((x, y) => x + y, 0);
      const totals = { views: sum(cur.views), likes: sum(cur.likes), comments: sum(cur.comments), subs: sum(cur.subs) };
      const prevT = { views: sum(prev.views), likes: sum(prev.likes), comments: sum(prev.comments), subs: sum(prev.subs) };
      const delta = {}; Object.keys(totals).forEach(k => { delta[k] = prevT[k] ? ((totals[k] - prevT[k]) / prevT[k]) * 100 : 0; });

      const r2 = rng('ret|' + ch + vid);
      const retention = [];
      for (let i = 0; i <= 20; i++) { const x = i / 20; retention.push(Math.round((100 * (.52 + .48 * Math.exp(-5.2 * x)) + (r2() - .5) * 2.4) * 10) / 10); }
      retention[0] = 100;
      const avgPct = Math.round(70 + r2() * 14);
      const avgDur = Math.round(17 + r2() * 9);
      const watchHours = Math.round(totals.views * avgDur / 3600);

      const vids = [];
      Object.keys(VIDEOS).forEach(c => { if (ch !== 'all' && c !== ch) return; VIDEOS[c].forEach((v, i) => { const rr = rng('top|' + v.id); vids.push({ id: v.id, title: v.title, channelId: c, views: Math.round((60000 - i * 11000) * (SHARE[c] * 1.8) * (.8 + rr() * .4) * (range / 28 + .2)) }); }); });
      vids.sort((a, b) => b.views - a.views);

      const weeks = [], r3 = rng('up|' + ch + range);
      const wn = range === 1 ? 4 : range === 7 ? 4 : range === 28 ? 4 : 12;
      for (let i = 0; i < wn; i++) weeks.push({ label: 'W' + (i + 1), count: Math.max(1, Math.round((3 + r3() * 6) * (ch === 'all' ? 1 : share * 2.2))) });

      return { demo: true, range, labels: cur.labels, series: cur, totals, delta, retention, avgPct, avgDur, watchHours, topVideos: vids.slice(0, 5), uploadsPerWeek: weeks, swiped: 100 - avgPct };
    }
  };
  w.DemoData = DemoData;
})(window);

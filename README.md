# ShortsDeck — YouTube Multi-Channel Shorts Manager

Vanilla HTML + CSS + JavaScript. No frameworks, no build step, no external libraries (charts are hand-drawn SVG).
Designed phone-first (bottom navigation, bottom-sheet dialogs, thumb-sized controls), with a sidebar layout on laptops/desktops.

## File structure

```
index.html          App shell + SVG icon sprite
style.css           Design system (dark default, light theme, responsive)
app.js              Router, Dashboard, Channels, Settings, shell
js/
  theme-boot.js     Applies saved theme before first paint
  util.js           Escaping, dates/timezones, toasts, modals, event delegation
  storage.js        Storage abstraction (localStorage today → backend later)
  demo-data.js      ALL mock data lives here (never mixed with live data)
  youtube.js        The ONLY file that talks to Google (OAuth + YouTube APIs)
  auth.js           "Connect YouTube" flow UI
  uploads.js        Upload page + Upload Queue
  scheduler.js      Scheduler page
  comments.js       Comment Inbox, Automation rules, Reply Templates
  analytics.js      SVG charts + Analytics page
  notifications.js  Notification center + History log
```

## Run it

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8080      # then open http://localhost:8080
```

It starts in **DEMO MODE** (amber badge in the header) with sample channels CodeZing, KudosC and Tech Projects.
Nothing in demo mode is ever sent to YouTube, and nothing is ever labelled as sent.

## Demo mode vs live mode

| | Demo mode | Live mode |
|---|---|---|
| Data | Sample data from `demo-data.js` | Real data from YouTube |
| Upload | Saves a local draft ("not sent") | Real resumable upload to YouTube |
| Schedule | Saved on this device only | Uploaded private + `publishAt` (YouTube publishes it) |
| Reply to comment | Saved as a local draft | Real `comments.insert` |
| Auto-reply | Reply is *prepared* for approval only | Sent within rate limits |

Every YouTube call returns `Demo mode — connect YouTube to enable this feature.` until OAuth is configured.

## YouTube API configuration

1. Go to <https://console.cloud.google.com> → create a project.
2. **APIs & Services → Library**: enable **YouTube Data API v3** and **YouTube Analytics API**.
3. **OAuth consent screen**: add the scopes below, add yourself as a test user.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Add your site's origin (e.g. `http://localhost:8080` or `https://yourname.github.io`) under **Authorized JavaScript origins**.
   (File URLs `file://` are not allowed by Google — serve the folder over http(s).)
5. Copy the **Client ID** (ends with `.apps.googleusercontent.com`) into **Settings → YouTube accounts**, or into `CONFIG.CLIENT_ID` in `js/youtube.js`.
6. Tap **Connect YouTube Channel** and sign in with Google.

Scopes requested:

- `youtube.upload` — upload videos
- `youtube.force-ssl` — read/reply to/moderate comments
- `youtube.readonly` — read channels and videos
- `yt-analytics.readonly` — analytics reports

**Important YouTube rules to know**

- `videos.insert` costs **1,600 quota units**; the default quota is **10,000/day** (~6 uploads). `comments.insert` costs 50. Request more quota via Google's audit form if needed.
- API projects created after July 2020 that have **not passed Google's API compliance audit** have uploaded videos locked to **private**. Until audited, uploads will work but stay private.
- Shorts are normal videos: vertical or square, up to 3 minutes. The app appends `#Shorts` to the description (toggle in Settings).
- A channel's comments can only be replied to by an authorized account that owns/moderates the channel.

## Google OAuth, explained

- You click **Continue with Google**; Google opens **its own** consent window. The app never sees or asks for your password.
- This app uses Google Identity Services' **token model**: Google returns a short-lived **access token** (~1 hour). It is kept **in memory only** — never in localStorage, never in the page source. Reloading the tab ends the session (channels show "Authorization expired" until you reconnect).
- There is **no client secret** in this app. A secret can never be safely used in browser code. Settings rejects anything that looks like one.
- Long-lived access (refresh tokens) requires the **authorization-code flow on a server**, where the secret and refresh tokens stay private.

## What needs a backend (for secure 24/7 automation)

| Need | Why a browser can't do it | What to build |
|---|---|---|
| Staying signed in for days | Access tokens expire in ~1 hour; refresh tokens need the client secret | Server endpoint doing OAuth code exchange; store refresh tokens encrypted server-side |
| Uploading when your device is off | Uploads stream from an open tab | Upload worker + object storage; call `videos.insert` server-side |
| Publishing on time | Browser code stops when the tab closes | Easiest: upload as private with `publishAt` — **YouTube then publishes by itself** (the app already does this once the upload finishes). For "upload later", use a cron/queue worker |
| Auto-replying to comments 24/7 | Needs polling/cron | Worker that polls `commentThreads.list`, applies the same rules (`comments.js` → `matches`/`evaluate`), enforces the same limits |
| Real notifications | No push without a server | Webhook/Pub/Sub or polling worker → web push / email |
| Cross-device data | localStorage is per browser | Replace `storage.js` internals with `fetch('/api/...')` |

Set `CONFIG.BACKEND_URL` in `js/youtube.js` as the single place to point the app at your server.

## Safety features built in

- Never asks for a Google password; no client secret; no hard-coded tokens; tokens never persisted.
- `Store.set()` refuses keys that look sensitive (`token`, `secret`, `password`…).
- All user text is HTML-escaped before display; titles/descriptions containing `<` `>` are rejected (YouTube rejects them too).
- File validation: type (MP4/MOV/WebM), size (512 MB cap here — YouTube allows more), thumbnail JPG/PNG ≤ 2 MB, duration/orientation warnings.
- Automation: manual-approval mode by default; duplicate detection (never replies to the same comment twice); skips replied/ignored comments; hourly cap; per-user daily cap.
- Demo and live data are stored in **separate collections** and clearly labelled.

## Accessibility

Keyboard reachable controls, visible focus rings, ARIA labels on icon buttons, focus-trapped dialogs (Esc closes), `prefers-reduced-motion` respected, ≥44px touch targets, contrast tuned for dark and light themes.

# Stay signed in forever (optional, ~10 minutes, free)

Google only gives browsers 1-hour sign-ins. ShortsDeck already keeps you signed in across reloads and renews with one tap,
but the only way to **never** be asked again is to keep Google's refresh token on a tiny server. `worker/` is that server
(Cloudflare Workers free plan). The browser never sees the refresh token or your client secret.

1. **Google Cloud Console → Credentials → your OAuth client (Web application).** Copy the **Client secret** too.
   (Authorized JavaScript origins must already contain your site, e.g. `https://yourname.github.io`.)
2. Install Wrangler and log in: `npm i -g wrangler && wrangler login`
3. In the `worker/` folder:
   ```
   wrangler kv namespace create LINKS          # copy the id it prints into wrangler.toml
   # edit wrangler.toml → ALLOWED_ORIGIN = your site's origin (no path, no trailing slash)
   wrangler secret put GOOGLE_CLIENT_ID        # paste the client id
   wrangler secret put GOOGLE_CLIENT_SECRET    # paste the client secret
   wrangler deploy
   ```
4. Copy the Worker URL (`https://shortsdeck-auth.<you>.workers.dev`) into **ShortsDeck → Settings → YouTube accounts → Sign-in server**.
5. Tap **Connect channel** once per channel. From now on ShortsDeck renews silently.

If Google says "did not return long-term access": open <https://myaccount.google.com/permissions>, remove ShortsDeck, connect again.
To sign a channel out for good use **Channels → Disconnect** (it also revokes the refresh token).

# Spotify full songs: setup

Without this setup, Spotify links still play, through Spotify's small embedded player: full songs if you're logged in to Spotify in the same browser, otherwise 30-second previews.

With this setup, your browser becomes a Spotify device called **Si's Music Player**. Songs play in full with the player's own controls, volume and lock-screen buttons, and AI picks are found on Spotify.

**You need:**
* **Spotify Premium.** Spotify requires it, both for the app owner and for playback.
* **A desktop browser** (Chrome, Edge, Firefox or Safari on a computer). Spotify's web player doesn't run in most phone browsers. On a phone, Spotify links fall back to the embedded player automatically.
* **About five minutes.**

Each person makes their **own** Spotify app. It's free, and Spotify limits each app to 5 users.

## 1. Open SillyTavern at 127.0.0.1

Spotify no longer accepts `localhost` addresses. If you open SillyTavern at `http://localhost:8000`, open it at **`http://127.0.0.1:8000`** instead (same port, and your chats are all there).

If you reach SillyTavern from another device (e.g. `http://192.168.1.20:8000`), Spotify requires **HTTPS** for that address. Either use it on the computer itself at 127.0.0.1, or set SillyTavern up with HTTPS first.

## 2. Copy your Redirect URI

In SillyTavern: **Extensions → Si's Music Player → Spotify full songs**. Copy the **Redirect URI** with the copy button. It looks like this:

```
http://127.0.0.1:8000/scripts/extensions/third-party/si-s-music-player/spotify-callback.html
```

If a yellow warning appears under it, fix step 1 first.

## 3. Create a Spotify app

1. Go to **[developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)** and log in with your Spotify account (accept the developer terms the first time).
2. Click **Create app**.
3. Fill in:
   * **App name:** anything, e.g. `My Music Player`
   * **App description:** anything, e.g. `Music for SillyTavern`
   * **Redirect URIs:** paste the address from step 2 and click **Add**
   * **Which API/SDKs are you planning to use?** tick **Web API** and **Web Playback SDK**
4. Accept the terms and click **Save**.
5. On the app's page, open **Settings** and copy the **Client ID** (32 letters and numbers). You **don't** need the Client secret: never paste it anywhere.

Check after saving that the redirect URI still says `127.0.0.1`. Some people have seen the dashboard change it to `localhost`; if that happens, delete it, add it again, and save.

## 4. Connect

1. Back in SillyTavern, paste the **Client ID** into the extension's settings.
2. Click **Connect Spotify**. A Spotify window opens: log in and click **Agree**.
3. The window closes and the settings say **✓ Connected as (your name)**.

That's it. Play any Spotify song from a playlist. You can also see and control it from the Spotify app on your phone under "Devices" (Spotify Connect).

## Adding friends (optional)

To let someone else use *your* app, add their name and Spotify email under **User Management** in the app's settings on the dashboard (up to 5 people). It's simpler for each person to make their own app.

## Troubleshooting

| Problem | Fix |
|---|---|
| `INVALID_CLIENT: Invalid redirect URI` | The address in the dashboard must match the one in the extension's settings exactly, including port and `127.0.0.1` vs `localhost`. |
| `INVALID_CLIENT: Insecure redirect URI` | You're using `localhost` or a network address over plain http. See step 1. |
| The login window doesn't open | Allow pop-ups for SillyTavern in your browser. |
| "Full songs need Spotify Premium" | The account isn't Premium. Spotify links will use the embedded player instead. |
| "Spotify's player can't run in this browser" | Usually a phone browser. Links use the embedded player instead. |
| `User not registered in the Developer Dashboard` | You're logging in with a different Spotify account than the app owner's. Add it under User Management, or make an app with that account. |
| It worked, then stopped | Click **Disconnect Spotify**, then **Connect Spotify** again. If the app owner's Premium lapsed, Spotify switches the app off. |

Your login is stored only in this browser (not in SillyTavern's settings file). **Disconnect Spotify** removes it. You can also revoke access at [spotify.com/account/apps](https://www.spotify.com/account/apps/).

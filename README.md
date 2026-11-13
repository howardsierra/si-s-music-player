# Si's Music Player

A floating music player for SillyTavern. Every bot carries its own playlist inside its character card, so the music travels with the bot.

This is a fork of **[Mors's Music Box](https://github.com/Mors1212/mors-music-box)** by Mors, released under the same AGPL-3.0 license. Playlists are stored under the same card key, so cards made with either extension work in both. **Turn off Mors's Music Box while this one is on:** the two share the floating button.

## 🆕 What this fork adds

* **Spotify, YouTube and SoundCloud:** paste a song, album or playlist link and it plays in the player through the official embed.
  * Spotify plays full songs if you're logged in to Spotify in the same browser. Otherwise it plays 30-second previews. This is Spotify's rule, not ours.
  * Some YouTube videos (often official music videos) don't allow playing outside YouTube. They're skipped with a message. "Topic" or lyric uploads usually work.
* **More link converters:** OneDrive (including `1drv.ms`), SharePoint, Box, GitLab, Hugging Face, Internet Archive and more Google Drive link styles, on top of Dropbox, GitHub and Drive. Links that can't play (Apple Music, Deezer, short `spotify.link` links…) are refused when you save, with the reason.
* **Check links:** a button in the playlist editor that test-loads every link and shows its length.
* **Player upgrades:** volume slider, crossfade (0–12 s), song lengths in the list, playlist search, seeking from the lock screen, keyboard shortcuts (Space, ←/→, Esc), and shuffle that plays every song once per round.
* **Mood music:** tag songs with moods (calm, happy, romantic, sad, tense, action, mysterious, epic, playful, dark). The player follows the chat's mood, either from keywords (free and instant) or from the AI reading the scene.
* **AI sidecar** (optional; nothing is added to your chat). It can use your chat model, a different provider and model through a SillyTavern **Connection Profile**, or an API called directly (see [AI model](#-ai-model)):
  * **Discover:** the AI reads the character card and suggests a soundtrack for the bot.
  * **Scene suggestions:** every few replies the AI names the scene and its mood and suggests a song for that moment. It can pop up as a notification.
  * **Our Story:** a relationship playlist for you and the bot. The AI reads the chat from the start and picks songs for each chapter, along with your relationship stage ("wary allies", "slow-burn friends"…). It is saved per chat. Tap *Update* as the story moves on.
  * **Tag moods with AI:** fills in mood tags for a whole playlist.
  * AI picks play as 30-second previews (from iTunes) unless you add a YouTube Data API key in settings, which finds full-length versions. Tap **+** on any pick to keep it in the card's playlist.

<img src="preview/09-themes.jpg" width="720">


## ✨ Features

* **Floating Button:** A small ♪ button that sits over your chat. Drag it anywhere; it turns into a little equalizer while music is playing. Built for phones first, works on desktop too.

<img src="preview/01-button.jpg" width="260">

* **Playlist per Bot:** Songs are saved inside the character card itself. They come along when you export the card as a PNG, and they are never sent to the AI, so they don't cost any tokens.

<img src="preview/02-playlist.jpg" width="260">

* **Vinyl Player:** The bot's avatar becomes the record label. Shuffle, previous, play/pause, next and repeat (all / one / off) sit in one row. You can also control playback from your phone's lock screen.

<img src="preview/03-player.jpg" width="260">

* **Themes:** Three built-in themes (**Rose**, **Elegant**, **Midnight**). Tap the palette button to switch, or press and hold it to pick from the list. You can also make your own (see [Themes](#-themes)).

<img src="preview/04-theme-menu.jpg" width="260">

* **Playlist Editor:** Add songs one by one, paste many at once, reorder them, and import or export the list as JSON. Each card can also set its own label, handwritten line and theme.

<img src="preview/05-edit-playlist.jpg" width="260"> <img src="preview/06-card-settings.jpg" width="260">

* **Smooth Track Changes:** Once the current song has finished downloading, the next one loads in the background, so it starts right away. On slow connections or Data Saver, this is skipped so it never competes with the song you're listening to.

## 📦 Installation

1. Open SillyTavern.
2. Go to **Extensions → Install extension**.
3. Paste this link and click **Install**:
   ```
   https://github.com/howardsierra/si-s-music-player
   ```
4. Reload the page. The ♪ button appears in the bottom-right corner.

To update later: **Extensions → Manage extensions → Update** next to Si's Music Player.

## 🎵 Adding Songs

1. Open a chat with a bot (one-on-one chats only; group chats aren't supported).
2. Tap the ♪ button, then the ✎ pencil in the top-right corner.
3. Add songs:
   * **One at a time:** tap **+ เพิ่มเพลง** (Add song) and fill in the title, artist (optional) and link.
   * **Many at once:** open **วางหลายเพลงทีเดียว** (Paste many songs) and add one song per line:
     ```
     Waltz in A minor | https://files.catbox.moe/aaaa.mp3
     Richmond Nocturne | https://files.catbox.moe/bbbb.mp3
     ```
4. *(Optional)* Under **ตั้งค่าการ์ด** (Card settings), set the label shown after "NOW PLAYING", the handwritten line under the controls, and a theme for this card.
5. Tap **Save to Card**.



### Which links work?

| Works | Converted for you | Doesn't work |
|---|---|---|
| Direct audio files (mp3, ogg, m4a, wav) · Catbox · GitHub raw · jsDelivr · OpenDrive | Dropbox · GitHub, GitLab and Hugging Face `/blob/` links · Google Drive · OneDrive / `1drv.ms` · SharePoint · Box `/s/` · Internet Archive `/details/` | Apple Music · Deezer · Tidal · Bandcamp pages · MediaFire · short `spotify.link` / `on.soundcloud.com` links · any web page that isn't the file |
| **Spotify** songs, albums, playlists, podcasts · **YouTube** and YouTube Music videos · **SoundCloud** tracks and sets | | |

Tap **Check links** in the editor to test them all before saving.

Tip: smaller files (for example 128 kbps MP3) start faster on mobile data.

## 🎨 Themes

Pick a theme in the extension panel or with the palette button in the player.

You can create your own theme without leaving SillyTavern: tap **+** in the panel and fill in a JSON template. Every setting is listed with a blank value, so you only fill in what you want to change. Themes can change:

* every colour (screen, frame, text, buttons, divider lines, the "now playing" bar…)
* fonts (any Google Font)
* a background picture, with an option to dim it so text stays readable
* the record (use your own picture, hide the grooves or the avatar)
* the tone arm (remove it or replace it with your own picture)

Full reference with a labelled diagram: **[THEME-GUIDE.md](THEME-GUIDE.md)**

Ready-made examples to import: **[theme-samples/](theme-samples)**


If you choose an imported theme as a card's theme, the theme is saved into the card too, so anyone who loads the card sees it.

## ⚙️ Settings

Find these under **Extensions → Si's Music Player**.

<img src="preview/07-settings-panel.jpg" width="260"> <img src="preview/08-theme-editor.jpg" width="260">

| Setting | What it does |
|---|---|
| **Enable Music Box** | Shows or hides the floating button. |
| **Use the character's theme** | When a card has its own theme, use it. Turn off to always use your own pick. |
| **Autoplay when opening a chat** | Starts the bot's playlist when you open its chat. Browsers may block this until you tap the screen once. |
| **Theme** | Your default theme. |
| ➕ | Create a new theme. |
| ✏️ | Edit the selected theme. |
| 📥 / 📤 | Import a theme file / export the selected theme. |
| 💀 | Delete the selected theme. |
| **Reset Position** | Moves the floating button back to the corner. |
| **Crossfade** | Fades between two audio files. Streaming songs start after the previous one ends. |
| **Mood music → Follow the story** | Off, Keywords (free), or AI reads the scene. |
| **Change song as soon as the mood changes** | Off = the mood is used at the next song change. |
| **Let the AI suggest music** | Turns on the AI sidecar (Discover, Our Story, scene suggestions). |
| **AI model** | Same as the chat, a Connection Profile, or a direct API. See below. |
| **Test the AI model** | Sends one tiny request and shows the answer, or why it failed. |
| **Read the scene every N replies** | How often the AI reads the scene. Each read is one extra request to your model. |
| **Pop up a song idea when the scene changes** | Shows the suggestion as a notification. Tap it to open Discover. |
| **Play AI picks as 30-second previews** | Uses iTunes previews when no full version is found. |
| **YouTube API key** | Optional. Lets AI picks play as full songs from YouTube. |

The built-in themes can't be edited or deleted. Tap ➕ to make your own version instead.

## 🤖 AI model

The AI sidecar doesn't have to use the model you chat with. Under **Extensions → Si's Music Player → AI model**:

| Option | How it works |
|---|---|
| **Same as the chat** | Uses whatever is connected for chatting. |
| **A Connection Profile** *(recommended)* | Any provider and model SillyTavern supports, e.g. a cheap fast model for music while you chat with a big one. Make a profile with SillyTavern's Connection Manager (plug icon: choose the API and model, then save a profile), then pick it here. Requests go through SillyTavern, so your API key stays in its secret store. Needs SillyTavern 1.12.6 or newer. |
| **Direct API** | The browser calls the API itself. Presets for OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, Ollama and LM Studio, or any other OpenAI-compatible address. The list button loads the provider's models. The key is saved in plain text in your SillyTavern settings, and some APIs refuse calls from web pages. For Ollama, start it with `OLLAMA_ORIGINS=*`; for LM Studio, turn on CORS. |

Small, fast models are fine for this. The sidecar only needs a short list of songs as JSON.

## ❓ Troubleshooting

* **A song won't play:** the link probably isn't a direct file link. Open it in your browser; it should start playing or downloading the audio, not show a web page.
* **Spotify only plays 30 seconds:** log in at open.spotify.com in the same browser. Some phone browsers block that login inside embeds, so you may get previews there anyway.
* **A YouTube song is skipped:** its owner doesn't allow playing outside YouTube. Try a "Topic" or lyric upload of the same song.
* **The AI says it couldn't use the answer:** small models sometimes don't reply with a proper list. Try again, or use a stronger model.
* **Autoplay doesn't start:** browsers block sound until you interact with the page. Tap ▶ once.
* **The floating button is missing:** make sure **Enable Music Box** is on, then tap **Reset Position**.
* **The pencil button is hidden:** the playlist editor only works in a one-on-one chat with a bot.



## 🧪 Development

No build step: SillyTavern loads `index.js` (an ES module) and the files in `src/` directly.

* `src/sources.js`: link detection and share-link conversion
* `src/mood.js`: mood tags and the keyword mood reader
* `src/ai.js`: AI prompts and reading the AI's JSON answers
* `src/providers.js`: which AI model the sidecar calls (Connection Profile or direct API)
* `src/resolve.js`: turning AI picks into playable links
* `src/engines.js`: Spotify, YouTube and SoundCloud players behind one interface

Run the unit tests with Node 18+:

```bash
npm test
```

## 📜 License and credits

AGPL-3.0, the same as the original. Based on [Mors's Music Box](https://github.com/Mors1212/mors-music-box) by [Mors](https://bio.site/deMors). Its player design, themes, theme guide and playlist editor come from that project.

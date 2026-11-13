/* Link handling: work out what kind of link a track is, and turn share links into direct-play links.
 * Pure functions, no DOM, so they can be unit tested in Node (see test/sources.test.mjs).
 *
 * kinds:
 *   audio       a direct audio file, played by an <audio> element
 *   spotify     played through the Spotify embed (full songs if the listener is logged in to Spotify, else 30 s previews)
 *   youtube     played through the YouTube embed
 *   soundcloud  played through the SoundCloud widget
 *   unsupported a page we know can't be played (the result says why)
 */

const SPOTIFY_TYPES = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];

/** Hosts that serve web pages, not files, and that we can't embed. */
const PAGE_HOSTS = [
  [/(^|\.)music\.apple\.com$/, 'Apple Music links are web pages. Use a Spotify or YouTube link for the song instead.'],
  [/(^|\.)deezer\.com$/, 'Deezer links are web pages. Use a Spotify or YouTube link for the song instead.'],
  [/(^|\.)bandcamp\.com$/, 'Bandcamp pages are not audio files. Use the SoundCloud, YouTube or direct file link instead.'],
  [/(^|\.)tidal\.com$/, 'Tidal links are web pages. Use a Spotify or YouTube link for the song instead.'],
  [/^spotify\.link$/, 'Short spotify.link links can\'t be read. Open it, then copy the open.spotify.com link instead.'],
  [/^on\.soundcloud\.com$/, 'Short on.soundcloud.com links can\'t be read. Open it, then copy the soundcloud.com link instead.'],
  [/(^|\.)mediafire\.com$/, 'MediaFire links open a download page, not the file.'],
];

function safeUrl(raw) {
  try { return new URL(String(raw || '').trim()); } catch (e) { return null; }
}

/** base64url, needed for the OneDrive "shares" API. Works in browsers and Node. */
function b64url(str) {
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(str)))
    : Buffer.from(str, 'utf8').toString('base64');
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Parse "1m30s", "90", "90s" into seconds. */
function parseStart(v) {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = String(v).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function spotifyFrom(raw, u) {
  const uri = String(raw).trim().match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]+)$/);
  if (uri) return { type: uri[1], id: uri[2] };
  if (!u || u.hostname !== 'open.spotify.com') return null;
  // /track/ID, /intl-de/track/ID, /embed/track/ID, /user/x/playlist/ID (old style)
  const parts = u.pathname.split('/').filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (SPOTIFY_TYPES.indexOf(parts[i]) > -1 && /^[A-Za-z0-9]+$/.test(parts[i + 1])) return { type: parts[i], id: parts[i + 1] };
  }
  return null;
}

function youtubeFrom(u) {
  if (!u) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return { id, start: parseStart(u.searchParams.get('t') || u.searchParams.get('start')) };
}

function soundcloudFrom(u) {
  if (!u) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'w.soundcloud.com') {
    const inner = safeUrl(u.searchParams.get('url'));
    return inner ? soundcloudFrom(inner) || { url: inner.toString() } : null;
  }
  if (host === 'api.soundcloud.com' && /^\/tracks\/\d+/.test(u.pathname)) return { url: `https://api.soundcloud.com${u.pathname}` };
  if (host !== 'soundcloud.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null; // a profile page, not a track or set
  return { url: `https://soundcloud.com/${parts.join('/')}` };
}

/** Turn common share links into direct file links. Leaves anything else alone. */
export function normalizeUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  const u = safeUrl(url);
  if (!u) return url;
  const host = u.hostname;

  // Dropbox: www.dropbox.com/s/… and /scl/fi/… share links
  if (/(^|\.)dropbox\.com$/.test(host) && host !== 'dl.dropboxusercontent.com') {
    u.searchParams.delete('dl');
    u.searchParams.set('raw', '1');
    return u.toString();
  }
  // GitHub: /blob/ page -> raw file
  if (host === 'github.com' && u.pathname.indexOf('/blob/') > -1) {
    return `https://raw.githubusercontent.com${u.pathname.replace('/blob/', '/')}`;
  }
  // GitLab: /-/blob/ -> /-/raw/
  if (host === 'gitlab.com' && u.pathname.indexOf('/-/blob/') > -1) {
    return `https://gitlab.com${u.pathname.replace('/-/blob/', '/-/raw/')}`;
  }
  // Hugging Face: /blob/ -> /resolve/
  if (host === 'huggingface.co' && u.pathname.indexOf('/blob/') > -1) {
    return `https://huggingface.co${u.pathname.replace('/blob/', '/resolve/')}`;
  }
  // Google Drive: /file/d/ID/view, /open?id=ID, /uc?id=ID
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    const id = m ? m[1] : u.searchParams.get('id');
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  // OneDrive personal and SharePoint share links (incl. 1drv.ms short links) -> the public "shares" API
  if (host === '1drv.ms' || host === 'onedrive.live.com' || /\.sharepoint\.com$/.test(host)) {
    if (host === 'onedrive.live.com' && u.pathname.indexOf('/download') === 0) return url;
    return `https://api.onedrive.com/v1.0/shares/u!${b64url(url)}/root/content`;
  }
  // Box: /s/ID share page -> static file
  if (/(^|\.)box\.com$/.test(host)) {
    const m = u.pathname.match(/^\/s\/([A-Za-z0-9]+)/);
    if (m) return `https://${host}/shared/static/${m[1]}`;
  }
  // Internet Archive: /details/ITEM/FILE -> /download/ITEM/FILE
  if (host === 'archive.org' && /^\/details\/[^/]+\/.+/.test(u.pathname)) {
    return `https://archive.org${u.pathname.replace(/^\/details\//, '/download/')}`;
  }
  return url;
}

/**
 * Work out how a track link should be played.
 * @returns {{kind: string, url: string, key: string, id?: string, uri?: string, type?: string, start?: number, reason?: string}}
 *   `key` is stable for the same song, whatever form the link was pasted in.
 */
export function detectSource(raw) {
  const url = String(raw || '').trim();
  if (!url) return { kind: 'unsupported', url: '', key: '', reason: 'empty link' };
  const u = safeUrl(url);

  const sp = spotifyFrom(url, u);
  if (sp) {
    const uri = `spotify:${sp.type}:${sp.id}`;
    return { kind: 'spotify', type: sp.type, id: sp.id, uri, url: `https://open.spotify.com/${sp.type}/${sp.id}`, key: uri };
  }
  const yt = youtubeFrom(u);
  if (yt) return { kind: 'youtube', id: yt.id, start: yt.start, url: `https://www.youtube.com/watch?v=${yt.id}`, key: `youtube:${yt.id}` };

  const sc = soundcloudFrom(u);
  if (sc) return { kind: 'soundcloud', url: sc.url, key: `soundcloud:${sc.url.toLowerCase()}` };

  if (u) {
    if (u.hostname === 'open.spotify.com') return { kind: 'unsupported', url, key: url, reason: 'This Spotify link isn\'t a song, album, playlist or podcast.' };
    if (/(^|\.)soundcloud\.com$/.test(u.hostname)) return { kind: 'unsupported', url, key: url, reason: 'This SoundCloud link is a profile, not a track or playlist.' };
    for (const [re, reason] of PAGE_HOSTS) if (re.test(u.hostname)) return { kind: 'unsupported', url, key: url, reason };
    if (!/^https?:$/.test(u.protocol)) return { kind: 'unsupported', url, key: url, reason: 'Links must start with http:// or https://' };
  } else if (!/^(\/|\.\/)/.test(url)) {
    return { kind: 'unsupported', url, key: url, reason: 'Links must start with http:// or https://' };
  }
  const direct = normalizeUrl(url);
  return { kind: 'audio', url: direct, key: direct };
}

/** Short label for the list ("SPOTIFY", "YOUTUBE"…); empty for plain files. */
export function sourceLabel(kind) {
  return { spotify: 'Spotify', youtube: 'YouTube', soundcloud: 'SoundCloud' }[kind] || '';
}

/** Can this link be accepted in the playlist editor? */
export function isAcceptableLink(raw) {
  return detectSource(raw).kind !== 'unsupported';
}

export function titleFromUrl(url) {
  const src = detectSource(url);
  if (src.kind === 'spotify') return `Spotify ${src.type}`;
  if (src.kind === 'youtube') return 'YouTube video';
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const last = decodeURIComponent(new URL(url, base).pathname.split('/').filter(Boolean).pop() || '');
    return last.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';
  } catch (e) { return 'Untitled'; }
}

/** Search pages people can open to find a full-length link for an AI suggestion. */
export function searchLinks(title, artist) {
  const q = encodeURIComponent([title, artist].filter(Boolean).join(' '));
  return {
    spotify: `https://open.spotify.com/search/${q}`,
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    soundcloud: `https://soundcloud.com/search/sounds?q=${q}`,
  };
}

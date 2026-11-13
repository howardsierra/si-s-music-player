/* Turn an AI song idea ("title — artist") into something playable.
 * 0. the full song on Spotify, if the user connected Spotify
 * 1. YouTube full song, if the user saved a YouTube Data API key
 * 2. a 30-second preview from the iTunes Search API (free, no key)
 * Otherwise the suggestion stays as an idea with search links.
 */

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0E00-\u0E7F]+/g, ' ').trim();

/** How well a search result matches what we asked for (0..2). */
export function matchScore(want, got) {
  const wt = norm(want.title), wa = norm(want.artist);
  const gt = norm(got.title), ga = norm(got.artist);
  let s = 0;
  if (wt && gt && (gt === wt || gt.indexOf(wt) === 0 || wt.indexOf(gt) === 0)) s += 1;
  if (!wa || (ga && (ga.indexOf(wa) > -1 || wa.indexOf(ga) > -1))) s += 1;
  return s;
}

let jsonpN = 0;
/** iTunes doesn't send CORS headers, so use JSONP. */
function jsonp(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const cb = `__siMusicJsonp${Date.now()}${jsonpN += 1}`;
    const script = document.createElement('script');
    const done = (err, data) => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      if (err) reject(err); else resolve(data);
    };
    const timer = setTimeout(() => done(new Error('timeout')), timeout);
    window[cb] = (data) => done(null, data);
    script.onerror = () => done(new Error('network'));
    script.src = `${url}${url.indexOf('?') > -1 ? '&' : '?'}callback=${cb}`;
    document.head.appendChild(script);
  });
}

async function fromItunes(want) {
  const term = encodeURIComponent([want.title, want.artist].filter(Boolean).join(' '));
  const data = await jsonp(`https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5`);
  const results = (data && data.results) || [];
  let best = null, bestScore = -1;
  results.forEach((r) => {
    if (!r.previewUrl) return;
    const sc = matchScore(want, { title: r.trackName, artist: r.artistName });
    if (sc > bestScore) { best = r; bestScore = sc; }
  });
  if (!best || bestScore < 1) return null;
  return {
    url: best.previewUrl,
    preview: true,
    art: best.artworkUrl100 ? best.artworkUrl100.replace('100x100', '300x300') : undefined,
    duration: best.trackTimeMillis ? 30 : undefined,
    title: best.trackName,
    artist: best.artistName,
  };
}

async function fromYouTube(want, key) {
  const q = encodeURIComponent(`${[want.title, want.artist].filter(Boolean).join(' ')} audio`);
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoCategoryId=10&maxResults=3&q=${q}&key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);
  const data = await res.json();
  const item = (data.items || []).find((it) => it && it.id && it.id.videoId);
  if (!item) return null;
  return { url: `https://www.youtube.com/watch?v=${item.id.videoId}`, preview: false };
}

async function fromSpotify(want, search) {
  const items = await search(want.title, want.artist);
  let best = null, bestScore = -1;
  (items || []).forEach((t) => {
    const sc = matchScore(want, { title: t.name, artist: (t.artists || []).map((a) => a.name).join(' ') });
    if (sc > bestScore) { best = t; bestScore = sc; }
  });
  if (!best || bestScore < 2) return null;
  const imgs = (best.album && best.album.images) || [];
  return { url: `https://open.spotify.com/track/${best.id}`, preview: false, art: imgs[0] && imgs[0].url };
}

/** @returns {Promise<object|null>} fields to merge into the suggestion, or null if nothing found */
export async function resolveSong(want, opts = {}) {
  if (opts.spotifySearch) {
    try { const r = await fromSpotify(want, opts.spotifySearch); if (r) return r; } catch (e) { console.warn('[si-music] Spotify search', e); }
  }
  if (opts.youtubeKey) {
    try { const r = await fromYouTube(want, opts.youtubeKey); if (r) return r; } catch (e) { console.warn('[si-music] YouTube search', e); }
  }
  if (opts.previews !== false) {
    try { const r = await fromItunes(want); if (r) return Object.assign(r, { title: want.title, artist: want.artist || r.artist }); } catch (e) { console.warn('[si-music] iTunes search', e); }
  }
  return null;
}

/** Resolve a list a few at a time; calls onEach(i, result) as each finishes. */
export async function resolveAll(list, opts, onEach, concurrency = 3) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next;
      next += 1;
      if (list[i].url) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await resolveSong(list[i], opts);
      onEach(i, r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
}

/* Streaming engines. Each one wraps an official embed behind the same small interface, so the player
 * can treat a Spotify song, a YouTube video and a SoundCloud track like an <audio> element:
 *
 *   engine.load(src, { autoplay })   src comes from detectSource()
 *   engine.play() / pause() / seek(seconds) / stop() / setVolume(0..1)
 *   engine.paused, engine.time, engine.duration (seconds), engine.loadedKey, engine.canVolume
 *
 * hooks: { onPlay, onPause, onEnded, onTime, onError(message) }
 */

const scripts = {};
function loadScript(src) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { delete scripts[src]; reject(new Error(`Couldn't load ${src}`)); };
      document.head.appendChild(s);
    });
  }
  return scripts[src];
}

/* ---------- Spotify (Embed iFrame API) ---------- */

let spotifyApi = null;
function getSpotifyApi() {
  if (!spotifyApi) {
    spotifyApi = new Promise((resolve, reject) => {
      const prev = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = (api) => { if (typeof prev === 'function') try { prev(api); } catch (e) { /* not ours */ } resolve(api); };
      loadScript('https://open.spotify.com/embed/iframe-api/v1').catch((e) => { spotifyApi = null; reject(e); });
      setTimeout(() => reject(new Error('Spotify embed did not load')), 15000);
    });
  }
  return spotifyApi;
}

export function createSpotifyEngine(host, hooks) {
  let ctl = null;
  let creating = null;
  let ended = false;
  const st = { paused: true, pos: 0, dur: 0 };
  const eng = {
    kind: 'spotify', canVolume: false, loadedKey: null, wantPlay: false,
    get paused() { return st.paused; },
    get time() { return st.pos; },
    get duration() { return st.dur; },
  };

  const onUpdate = (e) => {
    const d = (e && e.data) || {};
    const wasPaused = st.paused;
    const lastPos = st.pos;
    st.dur = (d.duration || 0) / 1000;
    st.pos = (d.position || 0) / 1000;
    st.paused = !!d.isPaused;
    if (!st.paused && st.pos > 0.2) ended = false;
    if (wasPaused && !st.paused) hooks.onPlay();
    if (!wasPaused && st.paused) {
      // the embed reports the end of a song as a pause at (or just reset from) the last position
      const atEnd = st.dur > 0 && (lastPos >= st.dur - 1.5 || st.pos >= st.dur - 0.5);
      if (atEnd && !ended) { ended = true; hooks.onEnded(); } else hooks.onPause();
    }
    hooks.onTime();
  };

  const ensure = (uri) => {
    if (ctl) return Promise.resolve(ctl);
    if (!creating) {
      creating = getSpotifyApi().then((api) => new Promise((resolve) => {
        const el = document.createElement('div');
        host.innerHTML = '';
        host.appendChild(el);
        api.createController(el, { uri, width: '100%', height: 80 }, (c) => {
          ctl = c;
          c.addListener('playback_update', onUpdate);
          c.addListener('ready', () => { if (eng.wantPlay) c.play(); });
          resolve(c);
        });
      })).catch((err) => { creating = null; hooks.onError(err.message); throw err; });
    }
    return creating;
  };

  eng.load = async (src, opts = {}) => {
    eng.wantPlay = !!opts.autoplay;
    ended = false;
    st.pos = 0; st.dur = 0; st.paused = true;
    const fresh = !ctl;
    const c = await ensure(src.uri);
    if (!fresh && eng.loadedKey !== src.key) c.loadUri(src.uri);
    eng.loadedKey = src.key;
    if (opts.autoplay) setTimeout(() => { if (eng.wantPlay) c.play(); }, fresh ? 0 : 350);
  };
  eng.play = () => {
    eng.wantPlay = true;
    if (!ctl) return;
    if (ended || st.pos < 0.5) { ended = false; ctl.play(); } // play() starts from the top
    else ctl.resume();
  };
  eng.pause = () => { eng.wantPlay = false; if (ctl) ctl.pause(); };
  eng.seek = (sec) => { if (ctl) ctl.seek(Math.max(0, sec)); };
  eng.stop = () => { eng.wantPlay = false; if (ctl && !st.paused) ctl.pause(); eng.loadedKey = null; st.pos = 0; };
  eng.setVolume = () => {};
  return eng;
}

/* ---------- YouTube (IFrame Player API) ---------- */

let ytApi = null;
function getYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!ytApi) {
    ytApi = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') try { prev(); } catch (e) { /* not ours */ } resolve(window.YT); };
      loadScript('https://www.youtube.com/iframe_api').catch((e) => { ytApi = null; reject(e); });
      setTimeout(() => reject(new Error('YouTube player did not load')), 15000);
    });
  }
  return ytApi;
}

const YT_ERRORS = {
  2: 'Bad YouTube link.',
  5: "This video can't play in an embedded player.",
  100: 'The video was removed or is private.',
  101: "The owner doesn't allow this video to play outside YouTube. Try a 'Topic' or lyric upload of the song.",
  150: "The owner doesn't allow this video to play outside YouTube. Try a 'Topic' or lyric upload of the song.",
};

export function createYouTubeEngine(host, hooks) {
  let player = null;
  let creating = null;
  let ticker = null;
  let volume = 1;
  let state = -1;
  const eng = {
    kind: 'youtube', canVolume: true, loadedKey: null,
    get paused() { return state !== 1 && state !== 3; },
    get time() { try { return player ? player.getCurrentTime() || 0 : 0; } catch (e) { return 0; } },
    get duration() { try { return player ? player.getDuration() || 0 : 0; } catch (e) { return 0; } },
  };
  const tick = (on) => {
    clearInterval(ticker);
    if (on) ticker = setInterval(hooks.onTime, 500);
  };

  const ensure = (src, autoplay) => {
    if (player) return Promise.resolve({ player, fresh: false });
    if (!creating) {
      creating = getYouTubeApi().then((YT) => new Promise((resolve) => {
        const el = document.createElement('div');
        host.innerHTML = '';
        host.appendChild(el);
        const p = new YT.Player(el, {
          width: '100%', height: '100%', videoId: src.id,
          playerVars: { playsinline: 1, rel: 0, autoplay: autoplay ? 1 : 0, start: src.start || 0 },
          events: {
            onReady: () => { player = p; p.setVolume(Math.round(volume * 100)); resolve({ player: p, fresh: true }); },
            onStateChange: (e) => {
              const prev = state;
              state = e.data;
              if (state === 1) { tick(true); if (prev !== 1 && prev !== 3) hooks.onPlay(); }
              else if (state === 2) { tick(false); hooks.onPause(); }
              else if (state === 0) { tick(false); hooks.onEnded(); }
              hooks.onTime();
            },
            onError: (e) => { tick(false); hooks.onError(YT_ERRORS[e.data] || `YouTube error ${e.data}`); },
          },
        });
      })).catch((err) => { creating = null; hooks.onError(err.message); throw err; });
    }
    return creating;
  };

  eng.load = async (src, opts = {}) => {
    const { player: p, fresh } = await ensure(src, opts.autoplay);
    if (!fresh || eng.loadedKey !== src.key) {
      const args = { videoId: src.id, startSeconds: src.start || 0 };
      if (opts.autoplay) p.loadVideoById(args); else p.cueVideoById(args);
    } else if (opts.autoplay && state !== 1) p.playVideo();
    eng.loadedKey = src.key;
  };
  eng.play = () => { if (player) player.playVideo(); };
  eng.pause = () => { if (player) player.pauseVideo(); };
  eng.seek = (sec) => { if (player) player.seekTo(Math.max(0, sec), true); };
  eng.stop = () => { tick(false); if (player) { try { player.stopVideo(); } catch (e) { /* ignore */ } } state = -1; eng.loadedKey = null; };
  eng.setVolume = (v) => { volume = v; if (player) player.setVolume(Math.round(v * 100)); };
  return eng;
}

/* ---------- SoundCloud (Widget API) ---------- */

export function createSoundCloudEngine(host, hooks) {
  let widget = null;
  let creating = null;
  let volume = 1;
  const st = { paused: true, pos: 0, dur: 0 };
  const eng = {
    kind: 'soundcloud', canVolume: true, loadedKey: null,
    get paused() { return st.paused; },
    get time() { return st.pos; },
    get duration() { return st.dur; },
  };
  const widgetUrl = (url, autoplay) => `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=${autoplay ? 'true' : 'false'}&visual=false&show_comments=false&hide_related=true&show_teaser=false`;
  const readDuration = () => { if (widget) widget.getDuration((ms) => { st.dur = (ms || 0) / 1000; hooks.onTime(); }); };

  const ensure = (src, autoplay) => {
    if (widget) return Promise.resolve({ fresh: false });
    if (!creating) {
      creating = loadScript('https://w.soundcloud.com/player/api.js').then(() => new Promise((resolve) => {
        const SC = window.SC;
        const iframe = document.createElement('iframe');
        iframe.allow = 'autoplay; encrypted-media';
        iframe.title = 'SoundCloud';
        iframe.src = widgetUrl(src.url, autoplay);
        host.innerHTML = '';
        host.appendChild(iframe);
        const w = SC.Widget(iframe);
        const E = SC.Widget.Events;
        w.bind(E.READY, () => { widget = w; w.setVolume(Math.round(volume * 100)); readDuration(); resolve({ fresh: true }); });
        w.bind(E.PLAY, () => { const was = st.paused; st.paused = false; readDuration(); if (was) hooks.onPlay(); });
        w.bind(E.PAUSE, () => { st.paused = true; hooks.onPause(); });
        w.bind(E.FINISH, () => { st.paused = true; hooks.onEnded(); });
        w.bind(E.PLAY_PROGRESS, (e) => { st.pos = ((e && e.currentPosition) || 0) / 1000; hooks.onTime(); });
        w.bind(E.ERROR, () => hooks.onError("SoundCloud couldn't play this track."));
      })).catch((err) => { creating = null; hooks.onError(err.message); throw err; });
    }
    return creating;
  };

  eng.load = async (src, opts = {}) => {
    const { fresh } = await ensure(src, opts.autoplay);
    st.pos = 0;
    if (!fresh && eng.loadedKey !== src.key) {
      st.dur = 0;
      widget.load(src.url, { auto_play: !!opts.autoplay, visual: false, show_comments: false, hide_related: true, callback: () => { widget.setVolume(Math.round(volume * 100)); readDuration(); } });
    } else if (!fresh && opts.autoplay) widget.play();
    eng.loadedKey = src.key;
  };
  eng.play = () => { if (widget) widget.play(); };
  eng.pause = () => { if (widget) widget.pause(); };
  eng.seek = (sec) => { if (widget) widget.seekTo(Math.max(0, sec) * 1000); };
  eng.stop = () => { if (widget && !st.paused) widget.pause(); st.pos = 0; eng.loadedKey = null; };
  eng.setVolume = (v) => { volume = v; if (widget) widget.setVolume(Math.round(v * 100)); };
  return eng;
}

/* ---------- Spotify full songs (Web Playback SDK, Premium + login) ---------- */

let sdkReady = null;
function getSpotifySdk() {
  if (window.Spotify && window.Spotify.Player) return Promise.resolve(window.Spotify);
  if (!sdkReady) {
    sdkReady = new Promise((resolve, reject) => {
      const prev = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => { if (typeof prev === 'function') try { prev(); } catch (e) { /* not ours */ } resolve(window.Spotify); };
      loadScript('https://sdk.scdn.co/spotify-player.js').catch((e) => { sdkReady = null; reject(e); });
      setTimeout(() => reject(new Error('Spotify player did not load')), 15000);
    });
  }
  return sdkReady;
}

/**
 * The browser itself becomes a Spotify device ("Si's Music Player" in Spotify Connect).
 * auth: { getToken(): Promise<string>, api(path, init): Promise<json> }
 * hooks also gets onUnavailable(reason): the SDK can't run here (e.g. most phone browsers), use the embed.
 */
export function createSpotifySdkEngine(host, hooks, auth) {
  let player = null;
  let creating = null;
  let deviceId = null;
  let volume = 1;
  let ticker = null;
  let ended = false;
  let currentUri = null;
  const st = { paused: true, pos: 0, dur: 0, at: 0 };
  const eng = {
    kind: 'spotify', sdk: true, canVolume: true, loadedKey: null,
    get paused() { return st.paused; },
    get time() { return st.paused ? st.pos : Math.min(st.dur || Infinity, st.pos + (Date.now() - st.at) / 1000); },
    get duration() { return st.dur; },
  };
  const tick = (on) => { clearInterval(ticker); if (on) ticker = setInterval(hooks.onTime, 500); };

  const onState = (s) => {
    if (!s) return;
    const wasPaused = st.paused;
    const lastPos = eng.time;
    st.paused = !!s.paused;
    st.pos = (s.position || 0) / 1000;
    st.dur = (s.duration || 0) / 1000;
    st.at = Date.now();
    if (!st.paused && st.pos > 0.5) ended = false;
    if (wasPaused && !st.paused) { tick(true); hooks.onPlay(); }
    if (!wasPaused && st.paused) {
      tick(false);
      const prevTracks = (s.track_window && s.track_window.previous_tracks) || [];
      const finished = (st.dur && lastPos >= st.dur - 2) || (s.position === 0 && prevTracks.some((t) => t && t.uri === currentUri));
      if (finished && !ended) { ended = true; hooks.onEnded(); } else hooks.onPause();
    }
    hooks.onTime();
  };

  const ensure = () => {
    if (player && deviceId) return Promise.resolve();
    if (!creating) {
      creating = getSpotifySdk().then((Spotify) => new Promise((resolve, reject) => {
        const p = new Spotify.Player({
          name: "Si's Music Player",
          volume,
          getOAuthToken: (cb) => { auth.getToken().then(cb).catch((e) => hooks.onError(e.message)); },
        });
        const fail = (msg, unavailable) => { creating = null; player = null; if (unavailable && hooks.onUnavailable) hooks.onUnavailable(msg); reject(new Error(msg)); };
        p.addListener('ready', ({ device_id: id }) => { deviceId = id; player = p; resolve(); });
        p.addListener('not_ready', () => { deviceId = null; });
        p.addListener('player_state_changed', onState);
        p.addListener('initialization_error', ({ message }) => fail(`Spotify's player can't run in this browser (${message}).`, true));
        p.addListener('authentication_error', ({ message }) => fail(`Spotify login problem: ${message}. Reconnect Spotify in the settings.`));
        p.addListener('account_error', () => fail('Full songs need Spotify Premium.', true));
        p.addListener('playback_error', ({ message }) => hooks.onError(`Spotify couldn't play this (${message}).`));
        p.connect().then((ok) => { if (!ok) fail("Couldn't connect to Spotify.", true); });
        setTimeout(() => { if (!deviceId) fail('Spotify took too long to get ready.', false); }, 20000);
      })).catch((e) => { creating = null; throw e; });
    }
    return creating;
  };

  const startOnDevice = async (src) => {
    const body = src.type === 'track' || src.type === 'episode'
      ? { uris: [src.uri], position_ms: 0 }
      : { context_uri: src.uri };
    try {
      await auth.api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify(body) });
    } catch (e) {
      if (e.status === 404) { // the device went away: reconnect once
        deviceId = null; player = null; creating = null;
        await ensure();
        await auth.api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify(body) });
      } else if (e.status === 403) throw new Error('Spotify refused to play (Premium is needed for full songs).');
      else throw e;
    }
  };

  eng.load = async (src) => {
    ended = false;
    currentUri = src.type === 'track' || src.type === 'episode' ? src.uri : null;
    st.pos = 0; st.dur = 0; st.at = Date.now();
    eng.loadedKey = src.key;
    try {
      await ensure();
      if (player.activateElement) { try { await player.activateElement(); } catch (e) { /* not needed on desktop */ } }
      await startOnDevice(src);
    } catch (e) {
      eng.loadedKey = null;
      hooks.onError(e.message);
    }
  };
  eng.lastSrc = null;
  eng.play = () => {
    if (!player) return;
    if (ended && eng.lastSrc) { eng.load(eng.lastSrc); return; }
    player.resume();
  };
  eng.pause = () => { if (player) player.pause(); };
  eng.seek = (sec) => { if (player) { player.seek(Math.max(0, sec) * 1000); st.pos = Math.max(0, sec); st.at = Date.now(); } };
  eng.stop = () => { tick(false); if (player && !st.paused) player.pause(); eng.loadedKey = null; st.pos = 0; };
  eng.setVolume = (v) => { volume = v; if (player) player.setVolume(Math.max(0.001, v)); };
  eng.destroy = () => { tick(false); if (player) player.disconnect(); player = null; deviceId = null; creating = null; };
  const origLoad = eng.load;
  eng.load = (src, opts) => { eng.lastSrc = src; return origLoad(src, opts); };
  return eng;
}

export const ENGINE_FACTORIES = {
  spotify: createSpotifyEngine,
  youtube: createYouTubeEngine,
  soundcloud: createSoundCloudEngine,
};

/* Spotify login for full-song playback (Web Playback SDK).
 *
 * Each person makes their own free Spotify app (developer.spotify.com) and pastes its Client ID.
 * Login uses Spotify's "Authorization Code with PKCE" flow, which needs no client secret, so it can
 * run entirely in the browser. Tokens are kept in this browser's localStorage only.
 */

export const SCOPES = ['streaming', 'user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state'];
const STORE = 'si-music:spotify';
const MSG = 'si-music-spotify-callback';

/** Where Spotify sends people back to: spotify-callback.html next to this extension. */
export function redirectUri() {
  return new URL('../spotify-callback.html', import.meta.url).href;
}

/** Spotify only allows https, or http on 127.0.0.1 / [::1]. Returns a problem to show, or ''. */
export function redirectProblem(uri) {
  let u;
  try { u = new URL(uri); } catch (e) { return 'The callback address is not valid.'; }
  if (u.hostname === 'localhost') return 'Spotify no longer accepts "localhost". Open SillyTavern at http://127.0.0.1 instead (same port), then come back here.';
  if (u.protocol === 'https:') return '';
  if (u.hostname === '127.0.0.1' || u.hostname === '[::1]') return '';
  return 'Spotify needs HTTPS for addresses other than 127.0.0.1. Use SillyTavern on the same computer at http://127.0.0.1, or serve SillyTavern over HTTPS.';
}

export function base64url(bytes) {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function randomString(len = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function authorizeUrl({ clientId, redirect, challenge, state }) {
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES.join(' '),
    state,
  });
  return `https://accounts.spotify.com/authorize?${p.toString()}`;
}

/* ---------- token storage ---------- */

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch (e) { return null; }
}
function writeStore(v) {
  try { if (v) localStorage.setItem(STORE, JSON.stringify(v)); else localStorage.removeItem(STORE); } catch (e) { /* private mode */ }
}

export function isConnected(clientId) {
  const s = readStore();
  return !!(s && s.refresh_token && (!clientId || s.clientId === clientId));
}

export function disconnect() { writeStore(null); }

async function tokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Spotify login failed (${res.status})`);
  return json;
}

function keep(clientId, json, prev) {
  const v = {
    clientId,
    access_token: json.access_token,
    refresh_token: json.refresh_token || (prev && prev.refresh_token),
    expires_at: Date.now() + ((json.expires_in || 3600) - 60) * 1000,
  };
  writeStore(v);
  return v;
}

let refreshing = null;
/** A valid access token, refreshed when needed. Throws if not connected. */
export async function getToken(clientId) {
  const s = readStore();
  if (!s || !s.refresh_token || (clientId && s.clientId !== clientId)) throw new Error('Not connected to Spotify');
  if (s.access_token && Date.now() < s.expires_at) return s.access_token;
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: s.clientId })
      .then((json) => keep(s.clientId, json, s).access_token)
      .catch((e) => { if (/invalid_grant|revoked/i.test(e.message)) disconnect(); throw e; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

/**
 * Open Spotify's login in a popup and finish the PKCE exchange.
 * spotify-callback.html posts the result back (or leaves it in localStorage if the popup lost its opener).
 */
export async function connect(clientId) {
  clientId = String(clientId || '').trim();
  if (!/^[0-9a-f]{32}$/i.test(clientId)) throw new Error('That doesn\'t look like a Spotify Client ID (32 letters and numbers).');
  const redirect = redirectUri();
  const problem = redirectProblem(redirect);
  if (problem) throw new Error(problem);

  const verifier = randomString(64);
  const state = randomString(16);
  const url = authorizeUrl({ clientId, redirect, challenge: await codeChallenge(verifier), state });
  const popup = window.open(url, 'si-music-spotify', 'width=480,height=720');
  if (!popup) throw new Error('The login window was blocked. Allow pop-ups for SillyTavern and try again.');

  const result = await new Promise((resolve, reject) => {
    const finish = (data) => {
      cleanup();
      if (data.error) reject(new Error(data.error === 'access_denied' ? 'Login was cancelled.' : `Spotify said: ${data.error}`));
      else if (data.state !== state) reject(new Error('Login answer did not match. Please try again.'));
      else resolve(data);
    };
    const onMsg = (e) => { if (e.origin === location.origin && e.data && e.data.type === MSG) finish(e.data); };
    const onStorage = (e) => {
      if (e.key !== MSG || !e.newValue) return;
      try { finish(JSON.parse(e.newValue)); } catch (err) { /* ignore */ }
    };
    const timer = setInterval(() => {
      if (popup.closed) {
        let left = null;
        try { left = JSON.parse(localStorage.getItem(MSG)); } catch (err) { /* ignore */ }
        if (left && left.state === state) finish(left);
        else { cleanup(); reject(new Error('The login window was closed.')); }
      }
    }, 700);
    const cleanup = () => {
      clearInterval(timer);
      window.removeEventListener('message', onMsg);
      window.removeEventListener('storage', onStorage);
      try { localStorage.removeItem(MSG); } catch (err) { /* ignore */ }
    };
    window.addEventListener('message', onMsg);
    window.addEventListener('storage', onStorage);
  });

  const json = await tokenRequest({ grant_type: 'authorization_code', code: result.code, redirect_uri: redirect, client_id: clientId, code_verifier: verifier });
  keep(clientId, json, null);
  return true;
}

/** Call the Spotify Web API with the user's token. */
export async function api(clientId, path, init = {}) {
  const token = await getToken(clientId);
  const res = await fetch(`https://api.spotify.com/v1${path}`, Object.assign({}, init, {
    headers: Object.assign({ authorization: `Bearer ${token}` }, init.body ? { 'content-type': 'application/json' } : {}, init.headers || {}),
  }));
  if (res.status === 204 || res.status === 202) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((json && json.error && json.error.message) || `Spotify error ${res.status}`);
    err.status = res.status;
    err.reason = json && json.error && json.error.reason;
    throw err;
  }
  return json;
}

/** Find a Spotify track for an AI pick. */
export async function searchTrack(clientId, title, artist) {
  const q = artist ? `track:${title} artist:${artist}` : title;
  const json = await api(clientId, `/search?type=track&limit=5&q=${encodeURIComponent(q)}`);
  const items = (json && json.tracks && json.tracks.items) || [];
  return items;
}

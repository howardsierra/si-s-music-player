import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeChallenge, authorizeUrl, redirectProblem, redirectUri, SCOPES } from '../src/spotify-auth.js';
import { resolveSong } from '../src/resolve.js';

test('PKCE challenge matches the RFC 7636 example', async () => {
  assert.equal(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('authorize URL has everything Spotify needs', () => {
  const u = new URL(authorizeUrl({ clientId: 'abc', redirect: 'http://127.0.0.1:8000/cb.html', challenge: 'CH', state: 'ST' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:8000/cb.html');
  assert.equal(u.searchParams.get('scope'), SCOPES.join(' '));
  assert.ok(SCOPES.includes('streaming'));
});

test('redirect rules: https or 127.0.0.1, never localhost', () => {
  assert.equal(redirectProblem('http://127.0.0.1:8000/x'), '');
  assert.equal(redirectProblem('https://st.example.com/x'), '');
  assert.match(redirectProblem('http://localhost:8000/x'), /127\.0\.0\.1/);
  assert.match(redirectProblem('http://192.168.1.5:8000/x'), /HTTPS/);
});

test('callback page sits next to the extension', () => {
  assert.match(redirectUri(), /\/spotify-callback\.html$/);
  assert.doesNotMatch(redirectUri(), /\/src\//);
});

test('AI picks resolve to Spotify first when connected', async () => {
  const search = async () => [
    { id: 'wrong', name: 'Clair de Lune (Remix)', artists: [{ name: 'Someone' }], album: { images: [] } },
    { id: 'right', name: 'Clair de Lune', artists: [{ name: 'Claude Debussy' }], album: { images: [{ url: 'https://i.scdn.co/x' }] } },
  ];
  const r = await resolveSong({ title: 'Clair de Lune', artist: 'Debussy' }, { spotifySearch: search, previews: false });
  assert.deepEqual(r, { url: 'https://open.spotify.com/track/right', preview: false, art: 'https://i.scdn.co/x' });
  // a poor match is not used
  const none = await resolveSong({ title: 'Something Else', artist: 'Nobody' }, { spotifySearch: search, previews: false });
  assert.equal(none, null);
});

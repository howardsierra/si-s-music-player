import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSource, normalizeUrl, titleFromUrl, isAcceptableLink } from '../src/sources.js';

test('spotify links and URIs', () => {
  const a = detectSource('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc');
  assert.equal(a.kind, 'spotify');
  assert.equal(a.uri, 'spotify:track:4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(detectSource('https://open.spotify.com/intl-de/album/1ATL5GLyefJaxhQzSPVrLX').uri, 'spotify:album:1ATL5GLyefJaxhQzSPVrLX');
  assert.equal(detectSource('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M').type, 'playlist');
  assert.equal(detectSource('https://open.spotify.com/embed/episode/abc123').uri, 'spotify:episode:abc123');
  // same song, different forms -> same key
  assert.equal(detectSource('spotify:track:4uLU6hMCjMI75M1A2tKUQC').key, a.key);
  assert.equal(detectSource('https://open.spotify.com/').kind, 'unsupported');
  assert.equal(detectSource('https://spotify.link/xyz').kind, 'unsupported');
});

test('youtube links', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://m.youtube.com/watch?v=${id}&list=x`,
    `https://music.youtube.com/watch?v=${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`]) {
    const s = detectSource(u);
    assert.equal(s.kind, 'youtube', u);
    assert.equal(s.id, id, u);
  }
  assert.equal(detectSource(`https://youtu.be/${id}?t=1m30s`).start, 90);
  assert.equal(detectSource(`https://www.youtube.com/watch?v=${id}&t=42`).start, 42);
  assert.equal(detectSource('https://www.youtube.com/@somechannel').kind, 'audio'); // not recognised as a video
});

test('soundcloud links', () => {
  const s = detectSource('https://soundcloud.com/artist-name/track-name?si=1');
  assert.equal(s.kind, 'soundcloud');
  assert.equal(s.url, 'https://soundcloud.com/artist-name/track-name');
  assert.equal(detectSource('https://soundcloud.com/artist/sets/my-set').kind, 'soundcloud');
  assert.equal(detectSource('https://soundcloud.com/artist-name').kind, 'unsupported');
  const w = detectSource('https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/123456');
  assert.equal(w.kind, 'soundcloud');
});

test('share links become direct file links', () => {
  assert.equal(normalizeUrl('https://www.dropbox.com/s/abc/song.mp3?dl=0'), 'https://www.dropbox.com/s/abc/song.mp3?raw=1');
  assert.equal(normalizeUrl('https://github.com/u/r/blob/main/a.mp3'), 'https://raw.githubusercontent.com/u/r/main/a.mp3');
  assert.equal(normalizeUrl('https://gitlab.com/u/r/-/blob/main/a.mp3'), 'https://gitlab.com/u/r/-/raw/main/a.mp3');
  assert.equal(normalizeUrl('https://huggingface.co/datasets/u/r/blob/main/a.mp3'), 'https://huggingface.co/datasets/u/r/resolve/main/a.mp3');
  assert.equal(normalizeUrl('https://drive.google.com/file/d/FILEID/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=FILEID');
  assert.equal(normalizeUrl('https://drive.google.com/open?id=FILEID'), 'https://drive.google.com/uc?export=download&id=FILEID');
  assert.equal(normalizeUrl('https://archive.org/details/item/track.mp3'), 'https://archive.org/download/item/track.mp3');
  assert.equal(normalizeUrl('https://app.box.com/s/abc123'), 'https://app.box.com/shared/static/abc123');
  const od = normalizeUrl('https://1drv.ms/u/s!AbCdEf');
  assert.match(od, /^https:\/\/api\.onedrive\.com\/v1\.0\/shares\/u![A-Za-z0-9_-]+\/root\/content$/);
  assert.equal(normalizeUrl('https://files.catbox.moe/abc.mp3'), 'https://files.catbox.moe/abc.mp3');
});

test('pages that are not playable are refused with a reason', () => {
  const a = detectSource('https://music.apple.com/us/album/x/123');
  assert.equal(a.kind, 'unsupported');
  assert.ok(a.reason.length > 10);
  assert.equal(isAcceptableLink('ftp://example.com/a.mp3'), false);
  assert.equal(isAcceptableLink('not a link'), false);
  assert.equal(isAcceptableLink('/user/files/a.mp3'), true);
  assert.equal(isAcceptableLink(''), false);
});

test('titles from links', () => {
  assert.equal(titleFromUrl('https://files.catbox.moe/Waltz_in_A-minor.mp3'), 'Waltz in A minor');
  assert.equal(titleFromUrl('https://youtu.be/dQw4w9WgXcQ'), 'YouTube video');
});

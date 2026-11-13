import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as AI from '../src/ai.js';

test('thinking blocks are ignored, even with braces inside', () => {
  const r = '<think>The user wants {json}. Maybe [1,2]? Let me pick.</think>\n{"tracks":[{"title":"Holocene","artist":"Bon Iver"}]}';
  assert.equal(AI.parseSoundtrack(r)[0].title, 'Holocene');
  // only the closing tag made it through (some providers drop the opening one)
  assert.equal(AI.parseSoundtrack('pondering {x} ...</think>{"tracks":[{"title":"A","artist":"B"}]}')[0].title, 'A');
});

test('a cut-off answer keeps its complete songs', () => {
  const cut = '{"tracks":[{"title":"One","artist":"A","mood":"calm"},{"title":"Two","artist":"B"},{"title":"Thr';
  assert.deepEqual(AI.parseSoundtrack(cut).map((t) => t.title), ['One', 'Two']);
  const story = AI.parseStory('```json\n{"stage":"friends","summary":"x","tracks":[{"title":"S1","artist":"A","chapter":"c"},{"title":"S2","art');
  assert.equal(story.stage, 'friends');
  assert.equal(story.tracks.length, 1);
});

test('curly quotes and other key names', () => {
  assert.equal(AI.parseSoundtrack('{“songs”:[{“title”:“X”,“artist”:“Y”}]}')[0].title, 'X');
  assert.equal(AI.parseSoundtrack('{"playlist":[{"song":"Z","by":"W"}]}')[0].artist, 'W');
});

test('plain numbered lists are understood', () => {
  const r = `Here's a soundtrack for Karl:
1. "Clair de Lune" by Claude Debussy (calm) – soft and moonlit
2. **Misty Mountains** - Howard Shore: old songs of home
3. Holocene — Bon Iver
- The Last of the Mohicans by Trevor Jones
Hope you like it!`;
  const out = AI.parseSoundtrack(r);
  assert.deepEqual(out.map((t) => [t.title, t.artist]), [
    ['Clair de Lune', 'Claude Debussy'], ['Misty Mountains', 'Howard Shore'], ['Holocene', 'Bon Iver'], ['The Last of the Mohicans', 'Trevor Jones'],
  ]);
  assert.deepEqual(out[0].moods, ['calm']);
  assert.equal(out[1].why, 'old songs of home');
  assert.equal(AI.parseStory('1. "A" by B\n2. "C" by D').tracks.length, 2);
});

const fake = (...replies) => {
  const calls = [];
  return { calls, c: { generateRaw: async ({ prompt, responseLength } = {}) => { calls.push({ prompt, responseLength }); return replies.shift(); } } };
};
const parseList = (r) => { const x = AI.parseSoundtrack(r); return x.length ? x : null; };

test('askJson: readable first answer needs one call', async () => {
  const f = fake('{"tracks":[{"title":"A","artist":"B"}]}');
  const { result } = await AI.askJson(f.c, { system: 's', prompt: 'p', shape: AI.SHAPES.soundtrack, responseLength: 100 }, {}, parseList);
  assert.equal(result[0].title, 'A');
  assert.equal(f.calls.length, 1);
});

test('askJson: unreadable answer is handed back to be rewritten as JSON', async () => {
  const f = fake('I would suggest something moody and slow, maybe Debussy.', '{"tracks":[{"title":"Clair de Lune","artist":"Debussy"}]}');
  const { result } = await AI.askJson(f.c, { system: 's', prompt: 'p', shape: AI.SHAPES.soundtrack, responseLength: 100 }, {}, parseList);
  assert.equal(result[0].title, 'Clair de Lune');
  assert.match(f.calls[1].prompt, /Rewrite the text below as JSON/);
  assert.match(f.calls[1].prompt, /maybe Debussy/);
});

test('askJson: empty answer (spent on thinking) is retried with more room', async () => {
  const f = fake('<think>lots of thinking</think>', '{"tracks":[{"title":"A","artist":"B"}]}');
  await AI.askJson(f.c, { system: 's', prompt: 'p', shape: AI.SHAPES.soundtrack, responseLength: 500 }, {}, parseList);
  assert.equal(f.calls[1].responseLength, 1000);
  assert.match(f.calls[1].prompt, /Do not think out loud/);
});

test('askJson: the error shows what the model said', async () => {
  const f = fake('As Karl, I draw my sword!', '*Karl sheathes his sword*');
  await assert.rejects(AI.askJson(f.c, { system: 's', prompt: 'p', responseLength: 100 }, {}, parseList), /It said: \*Karl sheathes his sword\*/);
});

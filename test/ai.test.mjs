import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as AI from '../src/ai.js';

test('extractJson copes with fences, chatter and trailing commas', () => {
  assert.deepEqual(AI.extractJson('Sure!\n```json\n{"a":1,}\n```\nEnjoy'), { a: 1 });
  assert.deepEqual(AI.extractJson('Here you go: {"tracks":[{"title":"x {y}"}]} hope that helps'), { tracks: [{ title: 'x {y}' }] });
  assert.deepEqual(AI.extractJson('<think>maybe {not json</think> [1,2,3]'), [1, 2, 3]);
  assert.equal(AI.extractJson('no json here'), null);
});

test('parseSoundtrack cleans and dedupes', () => {
  const reply = '{"tracks":[{"title":"Clair de Lune","artist":"Debussy","mood":"peaceful","why":"soft"},{"title":"clair de lune","artist":"debussy"},{"artist":"no title"},{"song":"Moonlight Sonata","by":"Beethoven","mood":"melancholy"}]}';
  const out = AI.parseSoundtrack(reply);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { title: 'Clair de Lune', artist: 'Debussy', why: 'soft', moods: ['calm'] });
  assert.equal(out[1].title, 'Moonlight Sonata');
  assert.deepEqual(out[1].moods, ['sad']);
});

test('parseScene validates the pick and the mood', () => {
  const r = AI.parseScene('{"scene":"rooftop standoff","mood":"suspense","changed":true,"pick":2,"song":{"title":"Time","artist":"Hans Zimmer"}}', 3);
  assert.equal(r.mood, 'tense');
  assert.equal(r.pick, 2);
  assert.equal(r.song.title, 'Time');
  assert.equal(AI.parseScene('{"scene":"x","mood":"calm","pick":9}', 3).pick, null);
  assert.equal(AI.parseScene('nonsense'), null);
});

test('parseStory needs tracks', () => {
  const s = AI.parseStory('{"stage":"slow-burn friends","summary":"They trust each other now.","tracks":[{"title":"A","artist":"B","chapter":"First meeting","mood":"mystery"}]}');
  assert.equal(s.stage, 'slow-burn friends');
  assert.equal(s.tracks[0].chapter, 'First meeting');
  assert.deepEqual(s.tracks[0].moods, ['mysterious']);
  assert.equal(AI.parseStory('{"stage":"x","tracks":[]}'), null);
});

test('parseMoodTags keeps only valid indices and moods', () => {
  assert.deepEqual(AI.parseMoodTags('{"moods":{"0":["calm","chill"],"1":["battle"],"7":["sad"],"x":["sad"]}}', 2), { 0: ['calm'], 1: ['action'] });
});

test('cardDigest and recentChat', () => {
  const char = { name: 'Karl', data: { description: '{{char}} loves {{user}}.', tags: ['knight'], first_mes: 'Hello <USER>' } };
  const d = AI.cardDigest(char, 'Ann');
  assert.match(d, /Karl loves Ann\./);
  assert.match(d, /Tags: knight/);
  assert.match(d, /Hello Ann/);
  const chat = [{ name: 'Ann', is_user: true, mes: 'hi' }, { name: 'sys', is_system: true, mes: 'x' }, { name: 'Karl', mes: '<b>hey</b>' }];
  assert.equal(AI.recentChat(chat, 5), 'Ann: hi\n\nKarl: hey');
  const long = Array.from({ length: 40 }, (_, i) => ({ name: 'n', mes: `m${i}` }));
  const arc = AI.chatArc(long);
  assert.match(arc, /n: m0\b/);
  assert.match(arc, /n: m39\b/);
});

test('callLLM uses the object form on new ST and positional on old ST', async () => {
  let got;
  await AI.callLLM({ generateRaw: async ({ prompt, systemPrompt } = {}) => { got = { prompt, systemPrompt }; return 'ok'; } }, { system: 'S', prompt: 'P' });
  assert.deepEqual(got, { prompt: 'P', systemPrompt: 'S' });
  // eslint-disable-next-line no-unused-vars
  await AI.callLLM({ generateRaw: async (prompt, api, io, qtl, sys, len) => { got = { prompt, sys, len }; return 'ok'; } }, { system: 'S', prompt: 'P', responseLength: 5 });
  assert.deepEqual(got, { prompt: 'P', sys: 'S', len: 5 });
  await assert.rejects(AI.callLLM({}, { system: '', prompt: '' }));
});

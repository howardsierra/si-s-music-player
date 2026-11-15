import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as AI from '../src/ai.js';
import { buildDirectRequest, parseDirectResponse, directMeta, wantsReasoningParams } from '../src/providers.js';

const GOOD = '{"tracks":[{"title":"Holocene","artist":"Bon Iver"}]}';

test('thinking formats are stripped', () => {
  assert.equal(AI.stripThinking('<think>hmm {"a":1}</think>answer'), 'answer');
  assert.equal(AI.stripThinking('<think>cut off while still thinking {"tracks":['), '');
  assert.equal(AI.stripThinking('<|begin_of_thought|>plan<|end_of_thought|><|begin_of_solution|>answer<|end_of_solution|>'), 'answer');
  assert.equal(AI.stripThinking('<|channel|>analysis<|message|>thinking…<|end|><|start|>assistant<|channel|>final<|message|>answer<|return|>'), 'answer');
  assert.equal(AI.stripThinking('<|channel|>analysis<|message|>only thinking'), '');
  assert.equal(AI.stripThinking('◁think▷plan◁/think▷answer'), 'answer');
});

test('example JSON written while reasoning is not mistaken for the answer', () => {
  const reply = `Let me think. The format is {"tracks":[{"title":"","artist":"","mood":"one of: calm","why":""}]}.
A first idea: {"title":"Wrong Draft","artist":"Nobody"} but that's a single object.
Final answer:
${GOOD}`;
  assert.deepEqual(AI.parseSoundtrack(reply).map((t) => t.title), ['Holocene']);
  const scene = AI.parseScene('I could say {"note":"maybe tense?"}. Answer: {"scene":"rooftop","mood":"tense","changed":true,"song":{"title":"Time","artist":"Hans Zimmer"}}', 0);
  assert.equal(scene.scene, 'rooftop');
  assert.equal(scene.song.title, 'Time');
  const tags = AI.parseMoodTags('Shape is {"moods":{}}. Result: {"moods":{"0":["calm"]}}', 1);
  assert.deepEqual(tags, { 0: ['calm'] });
});

test('reasoning parts in a direct reply are dropped', () => {
  // Mistral-style content parts
  const mistral = { choices: [{ message: { content: [{ type: 'thinking', thinking: [{ type: 'text', text: 'hmm' }] }, { type: 'text', text: GOOD }] } }] };
  assert.equal(parseDirectResponse('openai', mistral), GOOD);
  assert.equal(directMeta('openai', mistral).reasoned, true);
  // DeepSeek / OpenRouter style: reasoning in its own field, empty content, cut off
  const spent = { choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'long thoughts' } }] };
  assert.equal(parseDirectResponse('openai', spent), '');
  assert.deepEqual(directMeta('openai', spent), { truncated: true, reasoned: true });
  const gem = { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }], usageMetadata: { thoughtsTokenCount: 790 } };
  assert.deepEqual(directMeta('gemini', gem), { truncated: true, reasoned: true });
  assert.deepEqual(directMeta('anthropic', { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'y' }] }), { truncated: false, reasoned: true });
});

test('request shapes for reasoning models', () => {
  const cfg = { format: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'o-model' };
  const normal = JSON.parse(buildDirectRequest(cfg, { system: 's', prompt: 'p', maxTokens: 100 }).init.body);
  assert.equal(normal.max_tokens, 100);
  const r = JSON.parse(buildDirectRequest(cfg, { system: 's', prompt: 'p', maxTokens: 100, variant: 'reasoning' }).init.body);
  assert.equal(r.max_completion_tokens, 100);
  assert.equal(r.max_tokens, undefined);
  assert.equal(r.temperature, undefined);
  assert.ok(wantsReasoningParams(400, "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."));
  assert.ok(!wantsReasoningParams(401, 'bad key'));
  // Gemini gets room for its thinking up front
  const g = JSON.parse(buildDirectRequest({ format: 'gemini', baseUrl: 'https://g', apiKey: 'k', model: 'gemini-2.5-flash' }, { system: 's', prompt: 'p', maxTokens: 800 }).init.body);
  assert.ok(g.generationConfig.maxOutputTokens >= 4096);
});

const withFetch = async (handler, fn) => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); calls.push(body); return handler(body, calls.length); };
  try { return await fn(calls); } finally { globalThis.fetch = real; }
};
const reply = (status, json) => ({ ok: status < 400, status, statusText: '', json: async () => json });
const direct = { provider: 'direct', direct: { format: 'openai', baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' } };

test('direct: a model that rejects max_tokens is asked again its way', async () => {
  await withFetch((body) => (body.max_tokens
    ? reply(400, { error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } })
    : reply(200, { choices: [{ message: { content: GOOD } }] })), async (calls) => {
    assert.equal(await AI.callLLM({}, { system: 's', prompt: 'p', responseLength: 500 }, direct), GOOD);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].max_completion_tokens, 500);
  });
});

test('direct: budget spent on reasoning is retried with much more room', async () => {
  await withFetch((body, n) => (n === 1
    ? reply(200, { choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'thinking a lot' } }] })
    : reply(200, { choices: [{ message: { content: GOOD } }] })), async (calls) => {
    assert.equal(await AI.callLLM({}, { system: 's', prompt: 'p', responseLength: 800 }, direct), GOOD);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].max_tokens >= 4096);
  });
});

test('direct: a normal answer is one request', async () => {
  await withFetch(() => reply(200, { choices: [{ finish_reason: 'stop', message: { content: GOOD } }] }), async (calls) => {
    await AI.callLLM({}, { system: 's', prompt: 'p' }, direct);
    assert.equal(calls.length, 1);
  });
});

test('profile: reasoning comes back separately and is ignored; empty content is retried', async () => {
  const seen = [];
  const answers = [{ content: '', reasoning: 'all thinking' }, { content: GOOD, reasoning: 'some thinking' }];
  const c = { ConnectionManagerRequestService: { sendRequest: async (id, m, max) => { seen.push(max); return answers.shift(); } } };
  const { result } = await AI.askJson(c, { system: 's', prompt: 'p', responseLength: 800 }, { provider: 'profile', profileId: 'p' }, (r) => { const x = AI.parseSoundtrack(r); return x.length ? x : null; });
  assert.equal(result[0].title, 'Holocene');
  assert.deepEqual(seen, [800, 3000]);
});

test('nothing but reasoning, twice: the error says so plainly', async () => {
  const c = { generateRaw: async () => '<think>still thinking' };
  await assert.rejects(AI.askJson(c, { system: 's', prompt: 'p' }, {}, (r) => { const x = AI.parseSoundtrack(r); return x.length ? x : null; }), /only reasoning/);
});

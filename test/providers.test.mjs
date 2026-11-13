import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectRequest, parseDirectResponse, buildModelsRequest, parseModels, explainFetchError, DIRECT_PRESETS } from '../src/providers.js';
import { callLLM } from '../src/ai.js';

const req = { system: 'SYS', prompt: 'HI', maxTokens: 50 };

test('OpenAI-compatible request', () => {
  const { url, init } = buildDirectRequest({ format: 'openai', baseUrl: 'https://openrouter.ai/api/v1/', apiKey: 'k', model: 'm' }, req);
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(init.headers.authorization, 'Bearer k');
  const body = JSON.parse(init.body);
  assert.deepEqual(body.messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'HI' }]);
  assert.equal(body.max_tokens, 50);
  // local servers need no key
  assert.equal(buildDirectRequest({ format: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'x' }, req).init.headers.authorization, undefined);
});

test('Anthropic and Gemini requests', () => {
  const a = buildDirectRequest({ format: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'k', model: 'c' }, req);
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(a.init.headers['x-api-key'], 'k');
  assert.equal(a.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(JSON.parse(a.init.body).system, 'SYS');
  const g = buildDirectRequest({ format: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'k', model: 'gemini-2.5-flash' }, req);
  assert.equal(g.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(JSON.parse(g.init.body).systemInstruction.parts[0].text, 'SYS');
});

test('missing address or model is a clear error', () => {
  assert.throws(() => buildDirectRequest({ format: 'openai', baseUrl: '', model: 'm' }, req), /address/);
  assert.throws(() => buildDirectRequest({ format: 'openai', baseUrl: 'https://x', model: '' }, req), /model/);
});

test('parse replies', () => {
  assert.equal(parseDirectResponse('openai', { choices: [{ message: { content: 'yo' } }] }), 'yo');
  assert.equal(parseDirectResponse('anthropic', { content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'ab');
  assert.equal(parseDirectResponse('gemini', { candidates: [{ content: { parts: [{ text: 'hm', thought: true }, { text: 'ok' }] } }] }), 'ok');
  assert.throws(() => parseDirectResponse('openai', { error: { message: 'bad key' } }), /bad key/);
});

test('model lists', () => {
  assert.deepEqual(parseModels('openai', { data: [{ id: 'a' }, { id: 'b' }] }), ['a', 'b']);
  assert.deepEqual(parseModels('gemini', { models: [{ name: 'models/g1', supportedGenerationMethods: ['generateContent'] }, { name: 'models/emb', supportedGenerationMethods: ['embedContent'] }] }), ['g1']);
  assert.equal(buildModelsRequest({ format: 'openai', baseUrl: 'https://x/v1', apiKey: '' }).url, 'https://x/v1/models');
});

test('CORS failures get a useful explanation', () => {
  assert.match(explainFetchError(new TypeError('Failed to fetch'), { baseUrl: 'http://localhost:11434/v1' }), /OLLAMA_ORIGINS/);
  assert.match(explainFetchError(new TypeError('Failed to fetch'), { baseUrl: 'https://api.x.com' }), /Connection Profile/);
  assert.ok(Object.values(DIRECT_PRESETS).every((p) => ['openai', 'anthropic', 'gemini'].includes(p.format)));
});

test('callLLM routes to a Connection Profile', async () => {
  let got;
  const c = { ConnectionManagerRequestService: { sendRequest: async (id, messages, max) => { got = { id, messages, max }; return { content: 'from profile', reasoning: '' }; } } };
  const out = await callLLM(c, { system: 'S', prompt: 'P', responseLength: 9 }, { provider: 'profile', profileId: 'p1' });
  assert.equal(out, 'from profile');
  assert.equal(got.id, 'p1');
  assert.equal(got.max, 9);
  assert.equal(got.messages[0].role, 'system');
  await assert.rejects(callLLM(c, { system: '', prompt: '' }, { provider: 'profile' }), /Pick a Connection Profile/);
  await assert.rejects(callLLM({}, { system: '', prompt: '' }, { provider: 'profile', profileId: 'x' }), /Connection Manager/);
});

test('callLLM direct uses fetch', async () => {
  const realFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ choices: [{ message: { content: 'direct!' } }] }) }; };
  try {
    const out = await callLLM({}, { system: 'S', prompt: 'P' }, { provider: 'direct', direct: { format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', model: 'm' } });
    assert.equal(out, 'direct!');
    assert.equal(seen.url, 'https://api.groq.com/openai/v1/chat/completions');
    globalThis.fetch = async () => ({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ error: { message: 'Invalid API key' } }) });
    await assert.rejects(callLLM({}, { system: 'S', prompt: 'P' }, { provider: 'direct', direct: { format: 'openai', baseUrl: 'https://x', model: 'm' } }), /401 Invalid API key/);
  } finally { globalThis.fetch = realFetch; }
});

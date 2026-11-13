/* Which model the AI sidecar talks to.
 *
 *   st       the model connected for chatting in SillyTavern (default)
 *   profile  a SillyTavern Connection Profile: any provider and model ST supports. The request goes
 *            through the ST server, so the API key stays in ST's secret store. Recommended.
 *   direct   the browser calls an API itself: any OpenAI-compatible API (OpenAI, OpenRouter, Groq,
 *            DeepSeek, Mistral, Ollama, LM Studio, KoboldCpp…), Anthropic, or Google Gemini.
 *
 * Building requests and reading replies is pure (see test/providers.test.mjs).
 */

export const DIRECT_PRESETS = {
  openrouter: { label: 'OpenRouter', format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  openai: { label: 'OpenAI', format: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { label: 'Anthropic', format: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5' },
  gemini: { label: 'Google Gemini', format: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  groq: { label: 'Groq', format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  deepseek: { label: 'DeepSeek', format: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  mistral: { label: 'Mistral', format: 'openai', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  ollama: { label: 'Ollama (local)', format: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  lmstudio: { label: 'LM Studio (local)', format: 'openai', baseUrl: 'http://localhost:1234/v1', model: '' },
  custom: { label: 'Other (OpenAI-compatible)', format: 'openai', baseUrl: '', model: '' },
};

const trimSlash = (s) => String(s || '').trim().replace(/\/+$/, '');

/** The fetch() arguments for one direct request. */
export function buildDirectRequest(cfg, { system, prompt, maxTokens = 700 }) {
  const base = trimSlash(cfg.baseUrl);
  const key = String(cfg.apiKey || '').trim();
  const model = String(cfg.model || '').trim();
  if (!base) throw new Error('Set the API address for the AI sidecar first.');
  if (!model) throw new Error('Set a model name for the AI sidecar first.');

  if (cfg.format === 'anthropic') {
    return {
      url: `${base}/messages`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true', // required for calls made from a browser
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
      },
    };
  }
  if (cfg.format === 'gemini') {
    return {
      url: `${base}/models/${encodeURIComponent(model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
        }),
      },
    };
  }
  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  if (/openrouter\.ai/.test(base)) { headers['X-Title'] = "Si's Music Player"; }
  return {
    url: `${base}/chat/completions`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.8,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }),
    },
  };
}

/** The text of a direct reply. */
export function parseDirectResponse(format, json) {
  if (!json || typeof json !== 'object') return '';
  if (json.error) throw new Error(typeof json.error === 'string' ? json.error : json.error.message || 'API error');
  if (format === 'anthropic') {
    return (json.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  }
  if (format === 'gemini') {
    const parts = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
    return parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
  }
  const msg = json.choices && json.choices[0] && (json.choices[0].message || json.choices[0]);
  const content = msg && (msg.content != null ? msg.content : msg.text);
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : p.text || '')).join('');
  return String(content || '');
}

/** Request + parse the list of model names a direct API offers. */
export function buildModelsRequest(cfg) {
  const base = trimSlash(cfg.baseUrl);
  const key = String(cfg.apiKey || '').trim();
  if (cfg.format === 'anthropic') {
    return { url: `${base}/models?limit=100`, init: { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } } };
  }
  if (cfg.format === 'gemini') return { url: `${base}/models?pageSize=200`, init: { headers: { 'x-goog-api-key': key } } };
  return { url: `${base}/models`, init: { headers: key ? { authorization: `Bearer ${key}` } : {} } };
}

export function parseModels(format, json) {
  if (!json || typeof json !== 'object') return [];
  if (format === 'gemini') {
    return (json.models || [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.indexOf('generateContent') > -1)
      .map((m) => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
  }
  return (json.data || json.models || []).map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
}

/** A readable reason for a failed direct call (the usual one from a browser is CORS). */
export function explainFetchError(err, cfg) {
  const msg = (err && err.message) || String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    const local = /localhost|127\.0\.0\.1/.test(cfg.baseUrl || '');
    return local
      ? "Couldn't reach the local server. Is it running, and does it allow requests from this page? (Ollama: set OLLAMA_ORIGINS=*. LM Studio: turn on CORS.)"
      : "The browser couldn't reach this API (it may not allow calls from web pages). Use a SillyTavern Connection Profile instead.";
  }
  return msg;
}

/* The AI sidecar: asks the user's own connected model (through SillyTavern) for song ideas.
 * - soundtrack: songs that fit the character card
 * - scene:      reads the last few messages, names the scene + mood, suggests a song
 * - story:      a "relationship playlist" for {{user}} and {{char}}, following the chat so far
 *
 * The prompt builders and the JSON reader are pure (see test/ai.test.mjs); callLLM needs SillyTavern.
 */

import { MOODS, normalizeMoods } from './mood.js';
import { buildDirectRequest, parseDirectResponse, explainFetchError } from './providers.js';

const clip = (s, n) => {
  const str = String(s == null ? '' : s).replace(/\s+\n/g, '\n').trim();
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
};

/** Fill in {{char}} / {{user}} so the model sees real names. */
export function fillNames(text, charName, userName) {
  return String(text || '')
    .replace(/\{\{char\}\}|<BOT>/gi, charName || 'the character')
    .replace(/\{\{user\}\}|<USER>/gi, userName || 'the user');
}

/** The parts of a character card that say who they are, trimmed to fit a small prompt. */
export function cardDigest(char, userName, maxChars = 3500) {
  if (!char) return '';
  const d = char.data || {};
  const name = char.name || d.name || 'the character';
  const pick = (k) => d[k] || char[k] || '';
  const tags = Array.isArray(d.tags) ? d.tags : (Array.isArray(char.tags) ? char.tags : []);
  const parts = [
    `Name: ${name}`,
    tags.length ? `Tags: ${tags.slice(0, 12).join(', ')}` : '',
    pick('description') ? `Description: ${clip(pick('description'), 1600)}` : '',
    pick('personality') ? `Personality: ${clip(pick('personality'), 600)}` : '',
    pick('scenario') ? `Scenario: ${clip(pick('scenario'), 600)}` : '',
    pick('first_mes') ? `Opening message: ${clip(pick('first_mes'), 600)}` : '',
    d.creator_notes ? `Creator notes: ${clip(d.creator_notes, 300)}` : '',
  ].filter(Boolean);
  return clip(fillNames(parts.join('\n'), name, userName), maxChars);
}

/** The last `n` real messages of the chat as "Name: text". */
export function recentChat(chat, n = 6, perMessage = 700) {
  return (chat || [])
    .filter((m) => m && !m.is_system && typeof m.mes === 'string' && m.mes.trim())
    .slice(-n)
    .map((m) => `${m.name || (m.is_user ? 'User' : 'Character')}: ${clip(m.mes.replace(/<[^>]+>/g, ''), perMessage)}`)
    .join('\n\n');
}

/** A spread of the whole chat: the start, a few points in the middle, and the latest messages. */
export function chatArc(chat, perMessage = 350) {
  const msgs = (chat || []).filter((m) => m && !m.is_system && typeof m.mes === 'string' && m.mes.trim());
  if (msgs.length <= 14) return recentChat(msgs, 14, perMessage);
  const pickIdx = new Set([0, 1, 2]);
  for (let k = 1; k <= 4; k += 1) pickIdx.add(Math.floor((msgs.length * k) / 6));
  for (let i = msgs.length - 6; i < msgs.length; i += 1) pickIdx.add(i);
  const chosen = [...pickIdx].sort((a, b) => a - b).map((i) => msgs[i]);
  return recentChat(chosen, chosen.length, perMessage);
}

const SYSTEM = 'You are a music supervisor for interactive fiction. You pick real, existing, well-known songs or score pieces that match characters and scenes. You reply with JSON only, no commentary.';
const MOOD_LIST = MOODS.join(', ');

/** The JSON each task asks for (also used to ask a model to fix an unreadable answer). */
export const SHAPES = {
  soundtrack: `{"tracks":[{"title":"","artist":"","mood":"one of: ${MOOD_LIST}","why":"one short sentence"}]}`,
  scene: (withPick) => `{"scene":"a few words","mood":"one of: ${MOOD_LIST}","changed":true,${withPick ? '"pick":null,' : ''}"song":{"title":"","artist":"","why":"one short sentence"}}`,
  story: `{"stage":"","summary":"","tracks":[{"title":"","artist":"","chapter":"","mood":"one of: ${MOOD_LIST}","why":"one short sentence"}]}`,
  moods: '{"moods":{"0":["calm"],"1":["action","epic"]}}',
};

export function soundtrackPrompt(digest, count = 10, existing = []) {
  return {
    system: SYSTEM,
    prompt: `Here is a character:\n\n${digest}\n\n` +
      (existing.length ? `Their playlist already has: ${existing.slice(0, 30).join('; ')}. Don't repeat these.\n\n` : '') +
      `Pick ${count} real songs that fit this character: their personality, their world, and the feeling of their story. ` +
      'Mix the obvious with the surprising. Only songs that really exist, with the correct artist.\n\n' +
      `Reply with JSON only, in this shape:\n${SHAPES.soundtrack}`,
    shape: SHAPES.soundtrack,
  };
}

export function scenePrompt(charName, recent, playlist = [], lastScene = '') {
  const list = playlist.length
    ? `The current playlist (index: title — artist [moods]):\n${playlist.map((t, i) => `${i}: ${t.title}${t.artist ? ` — ${t.artist}` : ''}${t.moods && t.moods.length ? ` [${t.moods.join(', ')}]` : ''}`).join('\n')}\n\n`
    : '';
  return {
    system: SYSTEM,
    prompt: `Latest messages of a roleplay with ${charName}:\n\n${recent}\n\n` +
      (lastScene ? `The scene before was: "${lastScene}".\n\n` : '') +
      list +
      'Describe the current scene in a few words, decide its mood, and say whether the scene has clearly changed from before. ' +
      (playlist.length ? 'If a playlist song fits the scene well, give its index as "pick" (else null). ' : '') +
      'Also suggest one real song that would fit this exact moment.\n\n' +
      `Reply with JSON only:\n${SHAPES.scene(playlist.length)}`,
    shape: SHAPES.scene(playlist.length),
  };
}

export function storyPrompt(charName, userName, digest, arc, count = 8) {
  return {
    system: SYSTEM,
    prompt: `Character card:\n${digest}\n\nMoments from the chat between ${userName} and ${charName}, from the start to now:\n\n${arc}\n\n` +
      `Write a relationship playlist for ${userName} and ${charName}: ${count} real songs that tell the story of their relationship so far, in order, ` +
      'from how they met to where they are now. Name the relationship stage in two to four words (e.g. "wary strangers", "slow-burn friends", "rivals with a spark", "newly together"), ' +
      'and give a one-sentence summary of where they stand. Each song gets a short chapter title.\n\n' +
      `Reply with JSON only:\n${SHAPES.story}`,
    shape: SHAPES.story,
  };
}

export function moodTagPrompt(tracks) {
  return {
    system: SYSTEM,
    prompt: `Tag each song with one to three moods from this list only: ${MOOD_LIST}.\n\n` +
      `${tracks.map((t, i) => `${i}: ${t.title}${t.artist ? ` — ${t.artist}` : ''}`).join('\n')}\n\n` +
      `Reply with JSON only, one entry per index:\n${SHAPES.moods}`,
    shape: SHAPES.moods,
  };
}

/** Remove a reasoning model's thinking (<think>…</think>, also when the closing tag is missing at the start). */
export function stripThinking(text) {
  let s = String(text || '');
  s = s.replace(/<(think|thinking|reasoning|thought)>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/^[\s\S]*?<\/(think|thinking|reasoning|thought)>/i, ''); // only the closing tag survived
  return s.trim();
}

/** Close a JSON answer that was cut off (the model ran out of tokens): keep every complete item. */
export function repairTruncated(text) {
  const s = String(text || '');
  const start = s.search(/[{[]/);
  if (start < 0) return null;
  const body = s.slice(start);
  // walk back from the end to each '}' or ']' and try closing whatever is still open there
  for (let end = body.length; end > 0; end -= 1) {
    const ch = body[end - 1];
    if (ch !== '}' && ch !== ']') continue;
    const head = body.slice(0, end);
    const stack = [];
    let inStr = false, escNext = false, bad = false;
    for (let i = 0; i < head.length; i += 1) {
      const c = head[i];
      if (inStr) { if (escNext) escNext = false; else if (c === '\\') escNext = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
      else if (c === '}' || c === ']') { if (stack.pop() !== c) { bad = true; break; } }
    }
    if (bad || inStr) continue;
    try { return JSON.parse(head + stack.reverse().join('')); } catch (e) { /* keep walking back */ }
  }
  return null;
}

/** Pull the first JSON object/array out of a model reply (thinking, code fences, chatter, trailing commas
 *  and curly quotes are tolerated; a cut-off answer keeps its complete items). */
export function extractJson(text) {
  const raw = String(text || '');
  const s = stripThinking(raw) || raw;
  const tryParse = (str) => {
    try { return JSON.parse(str); } catch (e) { /* try again without trailing commas */ }
    const fixed = str.replace(/,\s*([}\]])/g, '$1').replace(/[\u201C\u201D]/g, '"');
    try { return JSON.parse(fixed); } catch (e) { return undefined; }
  };
  const fences = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const f of fences) { const v = tryParse(f.trim()); if (v !== undefined) return v; }

  for (let start = 0; start < s.length; start += 1) {
    const open = s[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, escNext = false, closed = false;
    for (let i = start; i < s.length; i += 1) {
      const ch = s[i];
      if (inStr) {
        if (escNext) escNext = false;
        else if (ch === '\\') escNext = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          closed = true;
          const v = tryParse(s.slice(start, i + 1));
          if (v !== undefined) return v;
          break;
        }
      }
    }
    if (!closed) {
      // this bracket never closes: the answer was cut off. Rescue the complete part of it
      // rather than returning one of the items inside it.
      const v = repairTruncated(s.slice(start));
      if (v != null) return v;
    }
  }
  return null;
}

/** Songs from a plain list, for models that ignore "JSON only":
 *  1. "Clair de Lune" by Claude Debussy (calm) – why…   /   - Holocene — Bon Iver: why…   /   **Title** - Artist */
export function parseLooseSongs(text) {
  const out = [];
  stripThinking(text).split(/\n+/).forEach((line) => {
    let l = line.replace(/\*\*|__|`/g, '').trim();
    if (!/^(\d+[.)]|[-*•])\s+/.test(l)) return; // only list items
    l = l.replace(/^(\d+[.)]|[-*•])\s+/, '');
    let mood = '';
    let why = '';
    const q = l.match(/^["“'‘]([^"”'’]{1,120})["”'’]\s*(?:by|[-–—:])\s*([^()\[\]:–—]+?)\s*(?:[([]([^)\]]{1,30})[)\]])?\s*(?:[:–—-]\s*(.*))?$/i);
    let title, artist;
    if (q) { [, title, artist, mood = '', why = ''] = q; } else {
      const m = l.match(/^(.{1,120}?)\s+(?:by|[–—-])\s+([^()\[\]:–—]{1,80}?)\s*(?:[([]([^)\]]{1,30})[)\]])?\s*(?:[:–—]\s*(.*))?$/i);
      if (!m) return;
      [, title, artist, mood = '', why = ''] = m;
    }
    title = String(title || '').trim().replace(/^["“]|["”]$/g, '');
    artist = String(artist || '').trim();
    if (title) out.push({ title, artist, mood, why });
  });
  return out;
}

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

/** Clean a list of suggested songs: needs a title; mood is mapped onto our list. */
export function cleanSuggestions(list, max = 20) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  list.forEach((t) => {
    if (!t || typeof t !== 'object') return;
    const title = str(t.title || t.song || t.name, 120);
    if (!title) return;
    const artist = str(t.artist || t.by, 120);
    const key = `${title}|${artist}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const moods = normalizeMoods(Array.isArray(t.moods) ? t.moods : [t.mood]);
    const item = { title, artist, why: str(t.why || t.reason, 200), moods };
    if (t.chapter) item.chapter = str(t.chapter, 60);
    out.push(item);
  });
  return out.slice(0, max);
}

export function parseSoundtrack(text) {
  const j = extractJson(text);
  const list = cleanSuggestions(Array.isArray(j) ? j : j && (j.tracks || j.songs || j.playlist));
  return list.length ? list : cleanSuggestions(parseLooseSongs(text));
}

export function parseScene(text, playlistLength = 0) {
  const j = extractJson(text);
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const mood = normalizeMoods([j.mood])[0] || null;
  const pick = Number.isInteger(j.pick) && j.pick >= 0 && j.pick < playlistLength ? j.pick : null;
  const song = cleanSuggestions([j.song])[0] || null;
  return { scene: str(j.scene, 80), mood, changed: j.changed !== false, pick, song };
}

export function parseStory(text) {
  const j = extractJson(text);
  let tracks = j && typeof j === 'object' ? cleanSuggestions(Array.isArray(j) ? j : (j.tracks || j.songs || j.playlist)) : [];
  if (!tracks.length) tracks = cleanSuggestions(parseLooseSongs(text));
  if (!tracks.length) return null;
  const o = j && !Array.isArray(j) && typeof j === 'object' ? j : {};
  return { stage: str(o.stage, 40), summary: str(o.summary, 240), tracks };
}

export function parseMoodTags(text, count) {
  const j = extractJson(text);
  const src = j && (j.moods || j);
  const out = {};
  if (!src || typeof src !== 'object') return out;
  Object.keys(src).forEach((k) => {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 0 && i < count) {
      const m = normalizeMoods(src[k]).slice(0, 3);
      if (m.length) out[i] = m;
    }
  });
  return out;
}

/** A short, single-line excerpt of a reply for error messages. */
export function snippet(text, n = 160) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '(empty reply)';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Ask, read the answer with `parse`, and if that fails ask once more:
 * an empty answer (usually a reasoning model that spent its budget thinking) is retried with more room;
 * an unreadable answer is handed back to the model to rewrite as JSON.
 * @returns {Promise<{ result: any, reply: string }>}
 */
export async function askJson(c, req, provider, parse) {
  const reply = await callLLM(c, req, provider);
  let result = parse(reply);
  if (result) return { result, reply };
  console.warn('[si-music-player] AI answer could not be read, asking again. Answer was:', reply);
  const retry = stripThinking(reply)
    ? {
      system: 'You turn text into JSON. Reply with JSON only: no thinking, no explanation, no code fences.',
      prompt: `Rewrite the text below as JSON, exactly in this shape:\n${req.shape || '{}'}\n\nText:\n${stripThinking(reply).slice(0, 6000)}`,
      responseLength: req.responseLength,
    }
    : Object.assign({}, req, {
      prompt: `${req.prompt}\n\nAnswer straight away with the JSON. Do not think out loud.`,
      responseLength: Math.min(4000, (req.responseLength || 700) * 2),
    });
  const reply2 = await callLLM(c, retry, provider);
  result = parse(reply2);
  if (result) return { result, reply: reply2 };
  console.warn('[si-music-player] Second AI answer could not be read either:', reply2);
  const err = new Error(`it did not reply with a song list. It said: ${snippet(reply2 || reply)}`);
  err.reply = reply2 || reply;
  throw err;
}

/** Reply text from whatever a SillyTavern request returned (string, or { content, reasoning }). */
function replyText(r) {
  if (r == null) return '';
  if (typeof r === 'string') return r;
  if (typeof r.content === 'string') return r.content;
  return String(r);
}

/**
 * Ask the AI. Nothing is added to the chat.
 * provider = settings.ai: { provider: 'st' | 'profile' | 'direct', profileId, direct: {...} }
 */
export async function callLLM(c, req, provider = {}) {
  const { system, prompt, responseLength = 700 } = req;
  const kind = provider.provider || 'st';

  if (kind === 'profile') {
    const svc = c && c.ConnectionManagerRequestService;
    if (!svc || typeof svc.sendRequest !== 'function') throw new Error('Connection Profiles need SillyTavern 1.12.6 or newer with the Connection Manager extension on.');
    if (!provider.profileId) throw new Error('Pick a Connection Profile for the AI sidecar first.');
    const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    const r = await svc.sendRequest(provider.profileId, messages, responseLength, { stream: false, extractData: true, includePreset: false, includeInstruct: true });
    return replyText(r);
  }

  if (kind === 'direct') {
    const cfg = provider.direct || {};
    const { url, init } = buildDirectRequest(cfg, { system, prompt, maxTokens: responseLength });
    let res;
    try { res = await fetch(url, init); } catch (e) { throw new Error(explainFetchError(e, cfg)); }
    let json = null;
    try { json = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) {
      const why = json && json.error ? (json.error.message || json.error) : res.statusText;
      throw new Error(`${res.status} ${why}`.trim());
    }
    return parseDirectResponse(cfg.format, json);
  }

  // the model connected for chatting.
  // Newer ST takes one options object; older ST took positional arguments
  // (an options-object function has .length 0 because of its destructured default).
  if (!c || typeof c.generateRaw !== 'function') throw new Error('This SillyTavern version has no generateRaw. Please update ST.');
  if (c.generateRaw.length === 0) {
    return replyText(await c.generateRaw({ prompt, systemPrompt: system, responseLength }));
  }
  return replyText(await c.generateRaw(prompt, null, false, false, system, responseLength));
}

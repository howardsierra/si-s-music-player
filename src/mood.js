/* Mood music: tags on tracks, and a free keyword reader that guesses the mood of a chat message.
 * Pure functions, no DOM (see test/mood.test.mjs).
 */

export const MOODS = ['calm', 'happy', 'romantic', 'sad', 'tense', 'action', 'mysterious', 'epic', 'playful', 'dark'];

export const MOOD_EMOJI = {
  calm: '🌙', happy: '☀️', romantic: '💗', sad: '🌧️', tense: '⚡', action: '⚔️', mysterious: '🔮', epic: '🏔️', playful: '🎈', dark: '🖤',
};

/** Words people (and AIs) use for a mood, mapped onto our ten. */
const SYNONYMS = {
  chill: 'calm', peaceful: 'calm', relaxed: 'calm', relaxing: 'calm', cozy: 'calm', cosy: 'calm', soft: 'calm', gentle: 'calm', serene: 'calm', ambient: 'calm', lofi: 'calm', 'lo-fi': 'calm',
  joyful: 'happy', upbeat: 'happy', cheerful: 'happy', bright: 'happy', hopeful: 'happy', warm: 'happy', uplifting: 'happy', fun: 'playful',
  love: 'romantic', romance: 'romantic', tender: 'romantic', intimate: 'romantic', longing: 'romantic', yearning: 'romantic', flirty: 'playful',
  melancholy: 'sad', melancholic: 'sad', sorrow: 'sad', grief: 'sad', lonely: 'sad', heartbreak: 'sad', bittersweet: 'sad', nostalgic: 'sad', somber: 'sad', sombre: 'sad',
  suspense: 'tense', suspenseful: 'tense', anxious: 'tense', nervous: 'tense', uneasy: 'tense', thriller: 'tense',
  battle: 'action', fight: 'action', combat: 'action', chase: 'action', energetic: 'action', intense: 'action', aggressive: 'action',
  mystery: 'mysterious', eerie: 'mysterious', ethereal: 'mysterious', dreamy: 'mysterious', magical: 'mysterious', curious: 'mysterious',
  heroic: 'epic', triumphant: 'epic', grand: 'epic', cinematic: 'epic', majestic: 'epic', adventure: 'epic',
  silly: 'playful', funny: 'playful', comedic: 'playful', whimsical: 'playful', cute: 'playful', teasing: 'playful',
  horror: 'dark', scary: 'dark', sinister: 'dark', menacing: 'dark', gothic: 'dark', grim: 'dark', creepy: 'dark', villain: 'dark',
};

/** Turn "Chill, love; Battle" or ['calm', 'x'] into ['calm', 'romantic', 'action']. Unknown words are dropped. */
export function normalizeMoods(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[,;/|]+/);
  const out = [];
  list.forEach((w) => {
    const k = String(w || '').trim().toLowerCase();
    const m = MOODS.indexOf(k) > -1 ? k : SYNONYMS[k];
    if (m && out.indexOf(m) < 0) out.push(m);
  });
  return out;
}

/* Words that hint at each mood in roleplay text. Stems are matched at the start of a word
 * ("whisper" also matches "whispered"). A few Thai words are included because the UI is bilingual. */
const LEXICON = {
  calm: ['calm', 'quiet', 'peace', 'gentle', 'soft', 'rest', 'sleep', 'breeze', 'tea', 'sigh', 'relax', 'still', 'cozy', 'blanket', 'rain on', 'sunset', 'meadow', 'stars', 'สงบ', 'เงียบ', 'ผ่อนคลาย'],
  happy: ['laugh', 'smile', 'grin', 'joy', 'cheer', 'celebrat', 'delight', 'excite', 'festival', 'party', 'sunshine', 'yay', 'hooray', 'happy', 'glad', 'ดีใจ', 'มีความสุข', 'หัวเราะ'],
  romantic: ['kiss', 'blush', 'love', 'heart', 'embrace', 'hug', 'caress', 'cheek', 'lips', 'hand in', 'darling', 'sweetheart', 'tender', 'flutter', 'gaze', 'adore', 'confess', 'date', 'รัก', 'จูบ', 'กอด', 'เขิน'],
  sad: ['tear', 'cry', 'cried', 'sob', 'grief', 'mourn', 'funeral', 'lonely', 'alone', 'loss', 'lost', 'goodbye', 'farewell', 'regret', 'sorrow', 'ache', 'broken', 'miss you', 'ร้องไห้', 'เศร้า', 'เสียใจ'],
  tense: ['tense', 'nervous', 'anxious', 'careful', 'footstep', 'listen', 'hide', 'hiding', 'trap', 'threat', 'warn', 'suspici', 'interrogat', 'glare', 'standoff', 'hold your breath', 'heartbeat', 'ตึงเครียด', 'ระวัง', 'กลัว'],
  action: ['fight', 'punch', 'kick', 'sword', 'blade', 'slash', 'strike', 'dodge', 'attack', 'battle', 'run', 'chase', 'explo', 'gun', 'shot', 'charge', 'clash', 'block', 'parry', 'ต่อสู้', 'วิ่ง', 'โจมตี'],
  mysterious: ['myster', 'strange', 'whisper', 'secret', 'riddle', 'rune', 'ancient', 'fog', 'mist', 'shadow', 'glow', 'magic', 'spell', 'curious', 'unknown', 'hidden', 'ลึกลับ', 'ความลับ', 'เวทมนตร์'],
  epic: ['legend', 'destiny', 'kingdom', 'army', 'throne', 'dragon', 'victory', 'triumph', 'hero', 'quest', 'oath', 'war', 'empire', 'mountain', 'rally', 'ตำนาน', 'ชัยชนะ', 'ราชา'],
  playful: ['tease', 'wink', 'giggle', 'smirk', 'pout', 'silly', 'joke', 'prank', 'poke', 'snicker', 'cheeky', 'playful', 'bet you', 'hehe', 'lol', 'แกล้ง', 'ขำ', 'หยอก'],
  dark: ['blood', 'corpse', 'dead', 'death', 'kill', 'scream', 'horror', 'monster', 'demon', 'curse', 'rot', 'grave', 'nightmare', 'terror', 'sinister', 'dread', 'เลือด', 'ศพ', 'ผี', 'ฆ่า'],
};

const isThai = (s) => /[\u0E00-\u0E7F]/.test(s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = {};
MOODS.forEach((m) => {
  PATTERNS[m] = LEXICON[m].map((w) => (isThai(w) ? new RegExp(escapeRe(w), 'g') : new RegExp(`\\b${escapeRe(w)}`, 'gi')));
});

/** Score every mood for a piece of text. Returns [{ mood, score }] best first (only moods that scored). */
export function scoreText(text) {
  const s = String(text || '');
  if (!s) return [];
  return MOODS.map((mood) => {
    let score = 0;
    PATTERNS[mood].forEach((re) => { const m = s.match(re); if (m) score += m.length; });
    return { mood, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * Guess the mood of a message, or null if nothing stands out.
 * A mood needs at least `minScore` hits and a clear lead over the runner-up, so one stray word doesn't flip the music.
 */
export function detectMood(text, opts = {}) {
  const minScore = opts.minScore || 2;
  const lead = opts.lead == null ? 1 : opts.lead;
  const scores = scoreText(text);
  if (!scores.length || scores[0].score < minScore) return null;
  if (scores[1] && scores[0].score - scores[1].score < lead) return null;
  return scores[0].mood;
}

/** Indices of tracks tagged with this mood. */
export function tracksWithMood(tracks, mood) {
  const out = [];
  (tracks || []).forEach((t, i) => { if (t && Array.isArray(t.moods) && t.moods.indexOf(mood) > -1) out.push(i); });
  return out;
}

/**
 * Pick a track for a mood. Prefers a track other than `current`.
 * @param {Function} [rand] for tests
 * @returns {number} index, or -1 if no track has that mood
 */
export function pickTrackForMood(tracks, mood, current, rand = Math.random) {
  const pool = tracksWithMood(tracks, mood);
  if (!pool.length) return -1;
  const others = pool.filter((i) => i !== current);
  const from = others.length ? others : pool;
  return from[Math.floor(rand() * from.length)];
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMoods, detectMood, scoreText, pickTrackForMood, tracksWithMood } from '../src/mood.js';

test('normalizeMoods maps synonyms and drops unknowns', () => {
  assert.deepEqual(normalizeMoods('Chill, love; Battle / banana'), ['calm', 'romantic', 'action']);
  assert.deepEqual(normalizeMoods(['sad', 'melancholy', 'SAD']), ['sad']);
  assert.deepEqual(normalizeMoods(undefined), []);
});

test('detectMood reads roleplay text', () => {
  assert.equal(detectMood('She drew her sword. Steel clashed as he dodged the next strike and charged.'), 'action');
  assert.equal(detectMood('He leaned in and kissed her cheek; she blushed, heart fluttering.'), 'romantic');
  assert.equal(detectMood('Tears ran down her face. She cried alone at the funeral.'), 'sad');
  assert.equal(detectMood('เธอร้องไห้ เสียใจมาก'), 'sad');
});

test('detectMood stays quiet when nothing stands out', () => {
  assert.equal(detectMood('He walked to the store and bought bread.'), null);
  assert.equal(detectMood('a kiss'), null); // one hit is not enough
  // a tie between two moods is not a clear signal
  assert.equal(detectMood('kiss blush. sword strike.'), null);
});

test('scoreText ranks best first', () => {
  const s = scoreText('blood and death, a scream in the dark nightmare');
  assert.equal(s[0].mood, 'dark');
});

test('pickTrackForMood prefers another song with the mood', () => {
  const tracks = [{ moods: ['calm'] }, { moods: ['action'] }, { moods: ['action', 'epic'] }, {}];
  assert.deepEqual(tracksWithMood(tracks, 'action'), [1, 2]);
  assert.equal(pickTrackForMood(tracks, 'action', 1, () => 0), 2);
  assert.equal(pickTrackForMood(tracks, 'calm', 0, () => 0), 0); // the only one
  assert.equal(pickTrackForMood(tracks, 'sad', 0), -1);
});

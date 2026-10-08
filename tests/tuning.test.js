import test from 'node:test';
import assert from 'node:assert/strict';
import { PitchDetector } from 'pitchy';
import { STRINGS, frequencyFor, centsBetween, matchString, tuningState } from '../src/tuning.js';

test('all six strings detect accurately, flat and sharp at multiple sample rates', () => {
 for (const sampleRate of [44100, 48000]) {
  const detector = PitchDetector.forFloat32Array(8192);
  for (const string of STRINGS) {
   for (const offset of [-30, 0, 30]) {
    const frequency = frequencyFor(string) * 2 ** (offset / 1200);
    const input = Float32Array.from({ length: 8192 }, (_, i) => {
     const phase = 2 * Math.PI * frequency * i / sampleRate;
     return .2 * Math.sin(phase) + .08 * Math.sin(phase * 2) + .03 * Math.sin(phase * 3);
    });
    const [pitch, clarity] = detector.findPitch(input, sampleRate);
    assert.ok(clarity > .9);
    assert.equal(matchString(pitch).number, string.number);
    const cents = centsBetween(pitch, frequencyFor(string));
    assert.ok(Math.abs(cents - offset) < 1, `${string.note}${string.octave}: ${cents}`);
    assert.equal(tuningState(cents), offset === 0 ? 'accurate' : offset < 0 ? 'low' : 'high');
   }
  }
 }
});
test('manual string comparison preserves octave and calibration', () => {
 assert.ok(Math.abs(centsBetween(frequencyFor(STRINGS[5]), frequencyFor(STRINGS[0])) - 2400) < .001);
 assert.equal(frequencyFor(STRINGS[1]), 110);
 assert.equal(frequencyFor(STRINGS[1], 432), 108);
 assert.equal(matchString(frequencyFor(STRINGS[1], 432), 432).number, 5);
 assert.equal(matchString(0), null);
 assert.equal(matchString(NaN), null);
 assert.equal(tuningState(-5), 'accurate');
 assert.equal(tuningState(5), 'accurate');
 assert.equal(tuningState(-5.01), 'low');
 assert.equal(tuningState(5.01), 'high');
});
test('silence does not produce a valid pitch', () => {
 const [pitch, clarity] = PitchDetector.forFloat32Array(8192).findPitch(new Float32Array(8192), 48000);
 assert.ok(pitch === 0 || clarity < .9);
});

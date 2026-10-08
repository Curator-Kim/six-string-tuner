export const STRINGS = [
  { number: 6, note: 'E', octave: 2, midi: 40 },
  { number: 5, note: 'A', octave: 2, midi: 45 },
  { number: 4, note: 'D', octave: 3, midi: 50 },
  { number: 3, note: 'G', octave: 3, midi: 55 },
  { number: 2, note: 'B', octave: 3, midi: 59 },
  { number: 1, note: 'E', octave: 4, midi: 64 },
];
export const frequencyFor = (string, reference = 440) => reference * 2 ** ((string.midi - 69) / 12);
export const centsBetween = (frequency, target) => 1200 * Math.log2(frequency / target);
export function matchString(frequency, reference = 440) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  return STRINGS.reduce((best, string) => Math.abs(centsBetween(frequency, frequencyFor(string, reference))) < Math.abs(centsBetween(frequency, frequencyFor(best, reference))) ? string : best);
}
export const tuningState = cents => Math.abs(cents) <= 5 ? 'accurate' : cents < 0 ? 'low' : 'high';

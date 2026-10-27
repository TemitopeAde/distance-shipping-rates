import { at, type Grid } from "../kit/time";

// Silent placeholder grid: 120 BPM, a beat is 0.5 s and a bar 2 s.
// When the licensed track arrives, measure it and replace this grid; every cue follows.
export const grid: Grid = { bpm: 120, firstBeat: 0, pickupBeats: 0, beatsPerBar: 4 };
export const b = (bar: number, beat = 1, fraction = 0) => at(grid, bar, beat, fraction);

export const scene = {
  open: [b(1), b(3)],
  punchDistance: [b(3), b(4)],
  map: [b(4), b(6)],
  punchRules: [b(6), b(7)],
  rules: [b(7), b(10)],
  punchZones: [b(10), b(11)],
  zones: [b(11), b(13)],
  punchPreview: [b(13), b(14)],
  simulator: [b(14), b(16)],
  checkout: [b(16), b(18)],
  end: [b(18), b(20)],
} as const;

export const DURATION = b(20);
export const FPS = 60;

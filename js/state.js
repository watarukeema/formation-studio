/** Application state (single source of truth). */
export const state = {
  mediaKind: null,
  mediaUrl: null,
  offsetSec: 0,
  dancerCount: 8,
  gridCols: 10,
  gridRows: 10,
  /** @type {string[]} */
  dancerNames: [],
  /** @type {{ id: number, timeSec: number, positions: { x: number, y: number }[], morphToNext: boolean }[]} */
  keyframes: [],
  selectedKeyframeId: null,
  editMode: false,
  selectedDancer: 0,
  dragging: { active: false, index: -1, keyframeId: null },
  playing: false,
  rafId: null,
};

/** Monotonic id for new keyframes (import resets). */
export const keyframeIdSeq = { next: 1 };

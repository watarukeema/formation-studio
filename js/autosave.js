import { clampGridAxis } from "./grid.js";
import { padPositions } from "./interpolate.js";

const STORAGE_KEY = "formationStudio.autosave.v1";

/**
 * @param {object} state
 * @param {{ next: number }} keyframeIdSeq
 */
export function persistAutosave(state, keyframeIdSeq) {
  try {
    const payload = {
      version: 2,
      offsetSec: state.offsetSec,
      dancerCount: state.dancerCount,
      gridCols: state.gridCols,
      gridRows: state.gridRows,
      dancerNames: state.dancerNames.slice(),
      selectedKeyframeId: state.selectedKeyframeId,
      keyframeIdSeq: keyframeIdSeq.next,
      keyframes: state.keyframes.map((k) => ({
        id: k.id,
        timeSec: k.timeSec,
        morphToNext: k.morphToNext,
        positions: k.positions.map((p) => ({ x: p.x, y: p.y })),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("Autosave failed (storage full or disabled?)", e);
  }
}

/**
 * @returns {boolean} true if data was restored
 */
export function loadAutosavedProject(state, keyframeIdSeq) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== 2 || !Array.isArray(data.keyframes)) return false;
    applyAutosavePayload(state, keyframeIdSeq, data);
    return true;
  } catch {
    return false;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} state
 * @param {{ next: number }} keyframeIdSeq
 * @param {object} data
 */
export function applyAutosavePayload(state, keyframeIdSeq, data) {
  state.offsetSec = Number(data.offsetSec) || 0;
  state.dancerCount = Math.max(1, Math.min(24, Math.floor(Number(data.dancerCount) || 8)));
  state.gridCols = clampGridAxis(data.gridCols ?? 10);
  state.gridRows = clampGridAxis(data.gridRows ?? 10);
  state.dancerNames = Array.isArray(data.dancerNames) ? data.dancerNames.map((s) => String(s)) : [];

  let maxId = 0;
  state.keyframes = data.keyframes.map((row) => {
    const id = Math.floor(Number(row.id)) || 0;
    maxId = Math.max(maxId, id);
    return {
      id,
      timeSec: Math.round(Number(row.timeSec) * 100) / 100,
      morphToNext: !!row.morphToNext,
      positions: padPositions(Array.isArray(row.positions) ? row.positions : [], state.dancerCount),
    };
  });
  state.keyframes.sort((a, b) => a.timeSec - b.timeSec);

  const savedNext = Math.floor(Number(data.keyframeIdSeq));
  keyframeIdSeq.next = Math.max(Number.isFinite(savedNext) ? savedNext : 1, maxId + 1);

  const sel = data.selectedKeyframeId;
  state.selectedKeyframeId =
    sel != null && state.keyframes.some((k) => k.id === sel) ? sel : null;
}

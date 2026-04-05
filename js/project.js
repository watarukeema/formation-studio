import { clampGridAxis } from "./grid.js";
import { padPositions } from "./interpolate.js";

export function gridDimsFromState(state) {
  return { cols: clampGridAxis(state.gridCols), rows: clampGridAxis(state.gridRows) };
}

export function buildExportObject(state) {
  const { cols, rows } = gridDimsFromState(state);
  return {
    version: 2,
    offsetSec: state.offsetSec,
    dancerCount: state.dancerCount,
    gridCols: cols,
    gridRows: rows,
    dancerNames: state.dancerNames.slice(),
    keyframes: state.keyframes.map((k) => ({
      timeSec: k.timeSec,
      morphToNext: k.morphToNext,
      positions: k.positions.map((p) => ({ x: p.x, y: p.y })),
    })),
  };
}

/**
 * Parse imported JSON. Throws if invalid.
 * Caller applies fields to `state`, updates inputs, and re-renders.
 */
export function parseProjectData(text) {
  const trimmed = String(text).replace(/^\uFEFF/, "").trim();
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch (e) {
    const msg = e instanceof SyntaxError ? e.message : String(e);
    throw new Error(`Invalid JSON (${msg})`);
  }
  if (!data || typeof data !== "object") throw new Error("File is not a JSON object");
  if (!Array.isArray(data.keyframes)) throw new Error('Missing "keyframes" array');
  return data;
}

export function applyParsedProject(state, keyframeIdSeq, data) {
  state.offsetSec = Number(data.offsetSec) || 0;
  state.dancerCount = Math.max(1, Math.min(24, Math.floor(Number(data.dancerCount) || 8)));
  const legacyG = clampGridAxis(data.gridDivisions ?? 10);
  state.gridCols = data.gridCols != null ? clampGridAxis(data.gridCols) : legacyG;
  state.gridRows = data.gridRows != null ? clampGridAxis(data.gridRows) : legacyG;
  if (Array.isArray(data.dancerNames) && data.dancerNames.length) {
    state.dancerNames = data.dancerNames.map((s) => String(s));
  } else {
    state.dancerNames = [];
  }
  keyframeIdSeq.next = 1;
  state.keyframes = data.keyframes.map((row, idx) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Keyframe #${idx + 1} is not an object`);
    }
    const rawPos = Array.isArray(row.positions) ? row.positions : [];
    return {
      id: keyframeIdSeq.next++,
      timeSec: Math.round(Number(row.timeSec) * 100) / 100,
      morphToNext: !!row.morphToNext,
      positions: padPositions(rawPos, state.dancerCount),
    };
  });
  state.keyframes.sort((a, b) => a.timeSec - b.timeSec);
  state.selectedKeyframeId = null;
}

/** Column/row counts are clamped to 3–10. */
export function clampGridAxis(n) {
  return Math.max(3, Math.min(10, Math.floor(Number(n)) || 10));
}

/** Symmetric column label: 5 columns → 2,1,0,1,2 (0 at centre). */
export function symAxisLabel(cellIndex, cellCount) {
  const c = Math.max(1, cellCount);
  const i = Math.max(0, Math.min(c - 1, cellIndex));
  return Math.round(Math.abs(i - (c - 1) / 2));
}

/** Top “phantom” row band + vertical span used for row lines and dancer y%. */
export function formationRowVertical(origin, stage, gr) {
  const g = Math.max(1, gr);
  const topMargin = stage / (g + 1);
  const rowTop = origin.y + topMargin;
  const rowSpan = stage - topMargin;
  return { rowTop, rowSpan };
}

/** Dot radius scales with column count (fewer columns → larger). */
export function dancerCircleRadius(stagePx, cols) {
  const c = clampGridAxis(cols);
  const spare = (11 - c) / 8;
  const factor = 0.036 + spare * 0.048;
  return Math.max(10, Math.min(stagePx * 0.12, stagePx * factor));
}

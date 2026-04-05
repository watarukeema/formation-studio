export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function defaultPositions(count) {
  const y = 50;
  const xMin = 25;
  const xMax = 75;
  const mid = (count - 1) / 2;
  return new Array(count).fill(0).map((_, i) => {
    const t = mid === 0 ? 0 : (i - mid) / mid;
    const x = 50 + t * ((xMax - xMin) / 2);
    return { x, y };
  });
}

export function padPositions(positions, count) {
  const base = positions && positions.length ? positions : defaultPositions(count);
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = base[i] || base[base.length - 1] || { x: 50, y: 50 };
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * Between keyframe i and i+1:
 * - morphToNext === false → hold formation i until the next keyframe time
 * - morphToNext === true → interpolate from i to i+1 over that interval
 */
export function getInterpolatedPositions(tForm, keyframes, dancerCount) {
  const n = dancerCount;
  const sorted = keyframes.slice().sort((a, b) => a.timeSec - b.timeSec);
  if (!sorted.length) return defaultPositions(n);

  if (tForm <= sorted[0].timeSec) return padPositions(sorted[0].positions, n);
  if (tForm >= sorted[sorted.length - 1].timeSec) {
    return padPositions(sorted[sorted.length - 1].positions, n);
  }

  let i = 0;
  for (let k = 0; k < sorted.length - 1; k++) {
    if (sorted[k].timeSec <= tForm && tForm < sorted[k + 1].timeSec) {
      i = k;
      break;
    }
  }

  const k0 = sorted[i];
  const k1 = sorted[i + 1];
  const span = k1.timeSec - k0.timeSec;
  if (span <= 0) return padPositions(k0.positions, n);

  if (!k0.morphToNext) return padPositions(k0.positions, n);

  const alpha = (tForm - k0.timeSec) / span;
  const p0 = padPositions(k0.positions, n);
  const p1 = padPositions(k1.positions, n);
  const out = [];
  for (let j = 0; j < n; j++) {
    out.push({
      x: lerp(p0[j].x, p1[j].x, alpha),
      y: lerp(p0[j].y, p1[j].y, alpha),
    });
  }
  return out;
}

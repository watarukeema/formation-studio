import {
  clampGridAxis,
  symAxisLabel,
  formationRowVertical,
  dancerCircleRadius,
} from "./grid.js";
import { getInterpolatedPositions } from "./interpolate.js";

function gridDims(st) {
  return { cols: clampGridAxis(st.gridCols), rows: clampGridAxis(st.gridRows) };
}

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {() => object} options.getState
 * @param {() => number} options.getFormationTime
 * @param {() => void} options.ensureDancerNames
 * @param {(s: number) => string} options.formatSec
 */
export function createStageRenderer({ canvas, getState, getFormationTime, ensureDancerNames, formatSec }) {
  const ctx = canvas.getContext("2d");
  let stageGeom = null;

  function dancerNameCharCap(radiusPx) {
    const fs = Math.max(9, radiusPx * 0.55);
    ctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`;
    const w = Math.max(ctx.measureText("M").width, ctx.measureText("i").width);
    const maxInside = 2 * radiusPx * 0.88;
    return Math.max(2, Math.min(32, Math.floor(maxInside / w)));
  }

  function getDancerLabelText(st, i, maxChars) {
    ensureDancerNames();
    const cap = Math.max(2, maxChars);
    const raw = (st.dancerNames[i] || "").trim();
    if (!raw) return String(i + 1).slice(0, cap);
    return raw.slice(0, Math.min(cap, raw.length));
  }

  function colorForIndex(i) {
    const hue = (i * 38) % 360;
    return `hsl(${hue} 85% 62%)`;
  }

  function drawGridLabels(origin, stage, positions, st) {
    const { cols: gc, rows: gr } = gridDims(st);
    const gLabel = Math.min(gc, gr);
    const fontSize = Math.max(9, stage * (0.028 + 0.002 * (8 - Math.min(gLabel, 12))));
    ctx.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const hasSelected = st.editMode && st.selectedDancer >= 0 && st.selectedDancer < positions.length;
    const pSel = hasSelected ? positions[st.selectedDancer] : null;

    const selectedCol = hasSelected ? Math.max(0, Math.min(gc - 1, Math.floor((pSel.x / 100) * gc))) : null;
    const selectedRowFromTop = hasSelected
      ? Math.max(0, Math.min(gr - 1, Math.floor((pSel.y / 100) * gr)))
      : null;

    const { rowTop, rowSpan } = formationRowVertical(origin, stage, gr);

    const yBottom = origin.y + stage - 10;
    for (let col = 0; col < gc; col++) {
      const x = origin.x + stage * ((col + 0.5) / gc);
      const active = selectedCol === col;
      ctx.fillStyle = active ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.46)";
      ctx.fillText(String(symAxisLabel(col, gc)), x, yBottom);
    }

    const xRight = origin.x + stage - 8;
    ctx.textAlign = "right";
    for (let t = 0; t <= gr; t++) {
      const y = rowTop + (rowSpan * t) / gr;
      const lineLabel = gr - t;
      const active =
        hasSelected &&
        selectedRowFromTop != null &&
        (t === selectedRowFromTop || t === selectedRowFromTop + 1);
      ctx.fillStyle = active ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.46)";
      ctx.fillText(String(lineLabel), xRight, y);
    }
  }

  function ensureCanvasPixelSize() {
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    const cssW = canvas.getBoundingClientRect().width || canvas.width;
    const cssH = canvas.getBoundingClientRect().height || canvas.height;
    const size = Math.floor(Math.min(cssW, cssH));
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { size, dpr };
  }

  function drawCircle(x, y, r, fillStyle) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.stroke();
  }

  function renderFormation() {
    const st = getState();
    const { size } = ensureCanvasPixelSize();
    ctx.clearRect(0, 0, size, size);

    const pad = 28;
    const stage = size - pad * 2;
    const origin = { x: pad, y: pad };
    const { cols: gc, rows: gr } = gridDims(st);
    const r = dancerCircleRadius(stage, gc);
    const { rowTop, rowSpan } = formationRowVertical(origin, stage, gr);
    stageGeom = { size, pad, stage, origin, r, rowTop, rowSpan };

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(origin.x, origin.y, stage, stage);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let col = 0; col < gc; col++) {
      const x = origin.x + stage * ((col + 0.5) / gc);
      ctx.beginPath();
      ctx.moveTo(x, origin.y);
      ctx.lineTo(x, origin.y + stage);
      ctx.stroke();
    }
    for (let t = 0; t <= gr; t++) {
      const y = rowTop + (rowSpan * t) / gr;
      ctx.beginPath();
      ctx.moveTo(origin.x, y);
      ctx.lineTo(origin.x + stage, y);
      ctx.stroke();
    }

    const tForm = getFormationTime();
    const positions = getInterpolatedPositions(tForm, st.keyframes, st.dancerCount);

    drawGridLabels(origin, stage, positions, st);

    const nameCap = dancerNameCharCap(r);
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const x = origin.x + (p.x / 100) * stage;
      const y = rowTop + (p.y / 100) * rowSpan;
      drawCircle(x, y, r, colorForIndex(i));
      if (st.editMode && i === st.selectedDancer) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.65)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(10,12,18,0.92)";
      ctx.font = `700 ${Math.max(9, r * 0.55)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(getDancerLabelText(st, i, nameCap), x, y + 0.5);
    }

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `700 ${Math.max(12, size * 0.032)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const kfc = st.keyframes.length;
    ctx.fillText(`${formatSec(tForm)}s · ${kfc} kf · ${gc}×${gr} grid`, origin.x + 12, origin.y + 10);
  }

  function getStageGeom() {
    return stageGeom;
  }

  return { renderFormation, getStageGeom };
}

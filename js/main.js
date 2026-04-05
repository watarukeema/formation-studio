import { state, keyframeIdSeq } from "./state.js";
import { clampGridAxis } from "./grid.js";
import { padPositions, getInterpolatedPositions } from "./interpolate.js";
import { buildExportObject, parseProjectData, applyParsedProject } from "./project.js";
import { createStageRenderer } from "./stage.js";
import { persistAutosave, loadAutosavedProject } from "./autosave.js";

const el = (id) => document.getElementById(id);

const layoutStudio = el("layoutStudio");
const sidebarToggle = el("sidebarToggle");

const mediaFile = el("mediaFile");
const videoPlayer = el("videoPlayer");
const audioPlayer = el("audioPlayer");

const playBtn = el("playBtn");
const pauseBtn = el("pauseBtn");
const restartBtn = el("restartBtn");

const timeSlider = el("timeSlider");
const timelineSecLabel = el("timelineSecLabel");
const timeLabel = el("timeLabel");
const status = el("status");

const stepBackBtn = el("stepBackBtn");
const stepFwdBtn = el("stepFwdBtn");
const stepBack4Btn = el("stepBack4Btn");
const stepFwd4Btn = el("stepFwd4Btn");

const dancersInput = el("dancersInput");
const gridColsInput = el("gridColsInput");
const gridRowsInput = el("gridRowsInput");
const dancerNamesContainer = el("dancerNamesContainer");
const offsetInput = el("offsetInput");
const setOffsetNowBtn = el("setOffsetNowBtn");
const editModeInput = el("editModeInput");
const saveKeyframeBtn = el("saveKeyframeBtn");
const clearAllBtn = el("clearAllBtn");
const exportBtn = el("exportBtn");
const importFile = el("importFile");
const keyframeListEl = el("keyframeList");

const canvas = el("stage");

const stage = createStageRenderer({
  canvas,
  getState: () => state,
  getFormationTime,
  ensureDancerNames,
  formatSec,
});

const { renderFormation, getStageGeom } = stage;

const DRAG_UNDO_MAX = 50;
/** @type {{ keyframeId: number, positions: { x: number, y: number }[] }[]} */
const dragUndoStack = [];

let autosaveTimer = null;

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    persistAutosave(state, keyframeIdSeq);
  }, 450);
}

function flushAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = null;
  persistAutosave(state, keyframeIdSeq);
}

function cloneKeyframePositions(positions) {
  return padPositions(positions, state.dancerCount).map((p) => ({ x: p.x, y: p.y }));
}

function pushDragUndo(keyframeId, positionsSnapshot) {
  dragUndoStack.push({ keyframeId, positions: positionsSnapshot });
  while (dragUndoStack.length > DRAG_UNDO_MAX) dragUndoStack.shift();
}

function undoLastDrag() {
  const item = dragUndoStack.pop();
  if (!item) return false;
  const kf = findKeyframeById(item.keyframeId);
  if (!kf) return false;
  kf.positions = padPositions(item.positions, state.dancerCount);
  return true;
}

function nudgeSelectedDancer(dx, dy) {
  if (!state.editMode || state.playing || state.dragging.active) return;
  const tForm = getFormationTime();
  const kf = ensureKeyframeAtFormationTime(tForm);
  kf.positions = padPositions(kf.positions, state.dancerCount);
  const idx = state.selectedDancer;
  if (idx < 0 || idx >= state.dancerCount) return;
  pushDragUndo(kf.id, cloneKeyframePositions(kf.positions));
  const p = kf.positions[idx];
  kf.positions[idx] = {
    x: Math.max(0, Math.min(100, p.x + dx)),
    y: Math.max(0, Math.min(100, p.y + dy)),
  };
  renderKeyframeList();
  renderFormation();
  scheduleAutosave();
}

function setStatus(text, kind) {
  status.textContent = text || "";
  status.classList.remove("statusOk", "statusErr");
  if (kind === "ok") status.classList.add("statusOk");
  if (kind === "err") status.classList.add("statusErr");
}

function formatSec(s) {
  if (!Number.isFinite(s)) return "0.00";
  return s.toFixed(2);
}

function getPlayer() {
  if (state.mediaKind === "video") return videoPlayer;
  if (state.mediaKind === "audio") return audioPlayer;
  return null;
}

function getCurrentMediaTime() {
  const player = getPlayer();
  return player ? player.currentTime || 0 : 0;
}

function getFormationTime() {
  return Math.max(0, getCurrentMediaTime() - state.offsetSec);
}

function ensureDancerNames() {
  const n = state.dancerCount;
  while (state.dancerNames.length < n) {
    state.dancerNames.push(String(state.dancerNames.length + 1));
  }
  state.dancerNames.length = n;
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function updateLabels() {
  const mediaT = getCurrentMediaTime();
  const formT = getFormationTime();
  timelineSecLabel.textContent = `Formation time ${formatSec(formT)}s`;
  timeLabel.textContent = `Media ${formatSec(mediaT)}s`;
}

function computeSliderMax() {
  const player = getPlayer();
  if (!player) return 60;
  const dur = player.duration;
  if (!Number.isFinite(dur) || dur <= 0) return 60;
  return Math.max(0, dur - state.offsetSec);
}

function seekToFormationTime(formSec) {
  const player = getPlayer();
  if (!player) return;
  const t = formSec + state.offsetSec;
  const dur = player.duration;
  const clamped = Math.max(0, Math.min(dur && Number.isFinite(dur) ? dur - 0.01 : t, t));
  player.currentTime = clamped;
  updateLabels();
  renderFormation();
}

function updateTimeSliderMax() {
  const max = computeSliderMax();
  timeSlider.max = String(max);
  const formT = getFormationTime();
  timeSlider.value = String(Math.max(0, Math.min(max, formT)));
}

function sortKeyframes() {
  state.keyframes.sort((a, b) => a.timeSec - b.timeSec);
}

function getSortedKeyframes() {
  return state.keyframes.slice().sort((a, b) => a.timeSec - b.timeSec);
}

function findKeyframeById(id) {
  return state.keyframes.find((k) => k.id === id) || null;
}

function findKeyframeNearTime(t, eps = 0.05) {
  return state.keyframes.find((k) => Math.abs(k.timeSec - t) < eps) || null;
}

function ensureKeyframeAtFormationTime(tForm) {
  const existing = findKeyframeNearTime(tForm, 0.05);
  if (existing) return existing;
  const seeded = getInterpolatedPositions(tForm, state.keyframes, state.dancerCount);
  const kf = {
    id: keyframeIdSeq.next++,
    timeSec: Math.round(tForm * 100) / 100,
    positions: padPositions(seeded, state.dancerCount),
    morphToNext: false,
  };
  state.keyframes.push(kf);
  sortKeyframes();
  state.selectedKeyframeId = kf.id;
  return kf;
}

function saveKeyframeAtCurrentTime() {
  const t = getFormationTime();
  const kf = ensureKeyframeAtFormationTime(t);
  const snap = getInterpolatedPositions(t, state.keyframes, state.dancerCount);
  kf.positions = padPositions(snap, state.dancerCount);
  sortKeyframes();
  renderKeyframeList();
  setStatus(`Keyframe #${kf.id} saved at formation ${formatSec(kf.timeSec)}s`, "ok");
  renderFormation();
  scheduleAutosave();
}

function deleteKeyframe(id) {
  state.keyframes = state.keyframes.filter((k) => k.id !== id);
  if (state.selectedKeyframeId === id) state.selectedKeyframeId = null;
  renderKeyframeList();
  renderFormation();
  setStatus("Keyframe removed.", "ok");
  scheduleAutosave();
}

function jumpToKeyframe(id) {
  const kf = findKeyframeById(id);
  if (!kf) return;
  state.selectedKeyframeId = id;
  seekToFormationTime(kf.timeSec);
  renderKeyframeList();
  setStatus(`Jumped to keyframe #${id} (${formatSec(kf.timeSec)}s).`, "ok");
  scheduleAutosave();
}

function setKeyframeTime(id, newTime) {
  const kf = findKeyframeById(id);
  if (!kf) return;
  let t = Number(newTime);
  if (!Number.isFinite(t) || t < 0) t = 0;
  kf.timeSec = Math.round(t * 100) / 100;
  sortKeyframes();
  renderKeyframeList();
  renderFormation();
  scheduleAutosave();
}

function setMorphToNext(id, checked) {
  const kf = findKeyframeById(id);
  if (!kf) return;
  kf.morphToNext = !!checked;
  renderKeyframeList();
  renderFormation();
  scheduleAutosave();
}

function renderKeyframeList() {
  if (!keyframeListEl) return;
  const sorted = getSortedKeyframes();
  if (!sorted.length) {
    keyframeListEl.innerHTML =
      '<div class="kfEmpty">No keyframes yet. Enable edit, place dancers, then <b>Save keyframe</b> at each time.</div>';
    return;
  }

  const rows = sorted.map((kf, idx) => {
    const isLast = idx === sorted.length - 1;
    const morphDisabled = isLast ? "disabled" : "";
    const selected = kf.id === state.selectedKeyframeId ? " kfRow--selected" : "";
    return `
        <div class="kfRow${selected}" data-kid="${kf.id}">
          <span class="kfCell kfId">#${kf.id}</span>
          <label class="kfCell kfTime">
            <span class="sr-only">Time sec</span>
            <input type="number" class="kfTimeInput" data-kid="${kf.id}" step="0.01" min="0" value="${kf.timeSec}" />
          </label>
          <label class="kfCell kfMorph" title="Morph (interpolate) toward the next keyframe">
            <input type="checkbox" class="kfMorphInput" data-kid="${kf.id}" ${kf.morphToNext ? "checked" : ""} ${morphDisabled} />
            <span class="kfMorphLabel">→ next</span>
          </label>
          <div class="kfCell kfActions">
            <button type="button" class="kfJump" data-kid="${kf.id}" title="Jump to this time">↗</button>
            <button type="button" class="kfDel btnDangerText" data-kid="${kf.id}" title="Delete keyframe">×</button>
          </div>
        </div>`;
  });

  keyframeListEl.innerHTML = `
      <div class="kfHeader">
        <span>#</span><span>Time</span><span>Morph</span><span class="kfHeaderAct"> </span>
      </div>
      ${rows.join("")}
    `;

  keyframeListEl.querySelectorAll(".kfTimeInput").forEach((inp) => {
    inp.addEventListener("change", () => setKeyframeTime(Number(inp.dataset.kid), inp.value));
  });

  keyframeListEl.querySelectorAll(".kfMorphInput").forEach((cb) => {
    cb.addEventListener("change", () => setMorphToNext(Number(cb.dataset.kid), cb.checked));
  });

  keyframeListEl.querySelectorAll(".kfJump").forEach((btn) => {
    btn.addEventListener("click", () => jumpToKeyframe(Number(btn.dataset.kid)));
  });

  keyframeListEl.querySelectorAll(".kfDel").forEach((btn) => {
    btn.addEventListener("click", () => deleteKeyframe(Number(btn.dataset.kid)));
  });
}

function renderDancerNameInputs() {
  if (!dancerNamesContainer) return;
  ensureDancerNames();
  dancerNamesContainer.innerHTML = state.dancerNames
    .map(
      (name, i) =>
        `<label class="dNameRow"><span class="dNameIdx">${i + 1}</span><input type="text" class="dNameInput" data-idx="${i}" maxlength="32" value="${escapeAttr(
          name
        )}" spellcheck="false" /></label>`
    )
    .join("");
  dancerNamesContainer.querySelectorAll(".dNameInput").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.dataset.idx);
      if (Number.isFinite(idx) && idx >= 0 && idx < state.dancerCount) {
        state.dancerNames[idx] = inp.value;
        renderFormation();
        scheduleAutosave();
      }
    });
  });
}

function tick() {
  if (!state.playing) return;
  updateLabels();
  renderFormation();
  state.rafId = requestAnimationFrame(tick);
}

function startPlaying() {
  const player = getPlayer();
  if (!player) {
    setStatus("Upload a video or audio file first.", "err");
    return;
  }
  state.playing = true;
  setStatus("Playing…", "ok");
  player
    .play()
    .then(() => {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.rafId = requestAnimationFrame(tick);
    })
    .catch(() => {
      state.playing = false;
      setStatus("Play blocked — click Play again.", "err");
    });
}

function pausePlaying() {
  const player = getPlayer();
  if (!player) return;
  state.playing = false;
  player.pause();
  setStatus("Paused.", "ok");
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = null;
  updateLabels();
  renderFormation();
}

function restart() {
  const player = getPlayer();
  if (!player) return;
  player.currentTime = Math.max(0, state.offsetSec);
  updateLabels();
  updateTimeSliderMax();
  renderFormation();
}

function applyDancerCount() {
  const n = Math.max(1, Math.min(24, Math.floor(Number(dancersInput.value) || 8)));
  state.dancerCount = n;
  dancersInput.value = String(n);
  ensureDancerNames();
  for (const kf of state.keyframes) {
    kf.positions = padPositions(kf.positions, n);
  }
  renderDancerNameInputs();
  renderKeyframeList();
  renderFormation();
  scheduleAutosave();
}

function applyGridAxes() {
  if (gridColsInput) {
    state.gridCols = clampGridAxis(gridColsInput.value);
    gridColsInput.value = String(state.gridCols);
  }
  if (gridRowsInput) {
    state.gridRows = clampGridAxis(gridRowsInput.value);
    gridRowsInput.value = String(state.gridRows);
  }
  renderFormation();
  scheduleAutosave();
}

function clearAllKeyframes() {
  state.keyframes = [];
  state.selectedKeyframeId = null;
  renderKeyframeList();
  renderFormation();
  setStatus("All keyframes cleared.", "ok");
  scheduleAutosave();
}

function exportProject() {
  ensureDancerNames();
  const data = buildExportObject(state);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "formation-project.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("Exported formation-project.json", "ok");
  scheduleAutosave();
}

function importProject(file) {
  const reader = new FileReader();
  reader.onerror = () => {
    setStatus("Could not read the file from disk.", "err");
  };
  reader.onload = () => {
    try {
      const data = parseProjectData(String(reader.result));
      applyParsedProject(state, keyframeIdSeq, data);
      if (offsetInput) offsetInput.value = String(state.offsetSec);
      if (dancersInput) dancersInput.value = String(state.dancerCount);
      if (gridColsInput) gridColsInput.value = String(state.gridCols);
      if (gridRowsInput) gridRowsInput.value = String(state.gridRows);
      ensureDancerNames();
      renderKeyframeList();
      renderDancerNameInputs();
      updateTimeSliderMax();
      renderFormation();
      setStatus("Formation loaded from file.", "ok");
      flushAutosave();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Import failed: ${msg}`, "err");
      console.error(e);
    }
  };
  reader.readAsText(file, "UTF-8");
}

function clampSlider() {
  const max = Number(timeSlider.max);
  const v = Number(timeSlider.value);
  if (!Number.isFinite(max) || max < 0) return;
  if (max === 0) {
    timeSlider.value = "0";
    return;
  }
  if (Number.isFinite(v)) timeSlider.value = String(Math.max(0, Math.min(max, v)));
}

function bind() {
  if (layoutStudio && sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      layoutStudio.classList.toggle("is-sidebar-collapsed");
      const collapsed = layoutStudio.classList.contains("is-sidebar-collapsed");
      sidebarToggle.textContent = collapsed ? "›" : "‹";
      sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
      sidebarToggle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
      requestAnimationFrame(() => renderFormation());
    });
  }

  mediaFile.addEventListener("change", () => {
    const file = mediaFile.files && mediaFile.files[0];
    if (!file) return;
    if (state.mediaUrl) URL.revokeObjectURL(state.mediaUrl);
    state.mediaUrl = URL.createObjectURL(file);
    pausePlaying();
    setStatus("Media loaded.", "ok");
    timeSlider.value = "0";
    const isVideo = (file.type || "").startsWith("video/");
    state.mediaKind = isVideo ? "video" : "audio";
    if (state.mediaKind === "video") {
      audioPlayer.pause();
      audioPlayer.removeAttribute("src");
      audioPlayer.style.display = "none";
      videoPlayer.style.display = "block";
      videoPlayer.src = state.mediaUrl;
    } else {
      videoPlayer.pause();
      videoPlayer.removeAttribute("src");
      videoPlayer.style.display = "none";
      audioPlayer.style.display = "block";
      audioPlayer.src = state.mediaUrl;
    }
  });

  const onLoaded = () => {
    updateTimeSliderMax();
    updateLabels();
    renderFormation();
  };
  videoPlayer.addEventListener("loadedmetadata", onLoaded);
  audioPlayer.addEventListener("loadedmetadata", onLoaded);

  playBtn.addEventListener("click", () => startPlaying());
  pauseBtn.addEventListener("click", () => pausePlaying());
  restartBtn.addEventListener("click", () => restart());

  stepBackBtn.addEventListener("click", () => seekToFormationTime(Math.max(0, getFormationTime() - 1)));
  stepFwdBtn.addEventListener("click", () => seekToFormationTime(getFormationTime() + 1));
  stepBack4Btn.addEventListener("click", () => seekToFormationTime(Math.max(0, getFormationTime() - 4)));
  stepFwd4Btn.addEventListener("click", () => seekToFormationTime(getFormationTime() + 4));

  dancersInput.addEventListener("input", () => applyDancerCount());

  if (gridColsInput) {
    gridColsInput.value = String(state.gridCols);
    gridColsInput.addEventListener("change", () => applyGridAxes());
    gridColsInput.addEventListener("input", () => applyGridAxes());
  }
  if (gridRowsInput) {
    gridRowsInput.value = String(state.gridRows);
    gridRowsInput.addEventListener("change", () => applyGridAxes());
    gridRowsInput.addEventListener("input", () => applyGridAxes());
  }

  if (offsetInput) {
    offsetInput.value = String(state.offsetSec);
    offsetInput.addEventListener("input", () => {
      const v = Number(offsetInput.value);
      state.offsetSec = Number.isFinite(v) && v >= 0 ? v : 0;
      updateTimeSliderMax();
      updateLabels();
      renderFormation();
      scheduleAutosave();
    });
  }

  if (setOffsetNowBtn) {
    setOffsetNowBtn.addEventListener("click", () => {
      state.offsetSec = Math.max(0, getCurrentMediaTime());
      if (offsetInput) offsetInput.value = String(state.offsetSec.toFixed(2));
      updateTimeSliderMax();
      updateLabels();
      renderFormation();
      setStatus("Offset = current media time.", "ok");
      scheduleAutosave();
    });
  }

  editModeInput.addEventListener("change", () => {
    state.editMode = !!editModeInput.checked;
    state.dragging.active = false;
    if (state.editMode && state.playing) pausePlaying();
    setStatus(state.editMode ? "Edit on: drag dancers on the stage." : "Edit off.", "ok");
    renderFormation();
  });

  saveKeyframeBtn.addEventListener("click", () => saveKeyframeAtCurrentTime());
  clearAllBtn.addEventListener("click", () => clearAllKeyframes());
  exportBtn.addEventListener("click", () => exportProject());
  if (importFile) {
    importFile.addEventListener("change", () => {
      const f = importFile.files && importFile.files[0];
      if (f) importProject(f);
      importFile.value = "";
    });
  }

  let sliderDragging = false;
  timeSlider.addEventListener("pointerdown", () => {
    sliderDragging = true;
  });
  timeSlider.addEventListener("pointerup", () => {
    sliderDragging = false;
  });
  timeSlider.addEventListener("input", () => {
    clampSlider();
    seekToFormationTime(Number(timeSlider.value));
    setStatus(sliderDragging ? "Scrubbing…" : "Seeked.", "ok");
  });

  const syncSliderFromPlayback = () => {
    const formT = getFormationTime();
    const max = Number(timeSlider.max);
    if (!Number.isFinite(max) || max <= 0) timeSlider.value = "0";
    else timeSlider.value = String(Math.max(0, Math.min(max, formT)));
    updateLabels();
  };

  videoPlayer.addEventListener("timeupdate", () => {
    if (!state.playing || sliderDragging) return;
    syncSliderFromPlayback();
  });
  audioPlayer.addEventListener("timeupdate", () => {
    if (!state.playing || sliderDragging) return;
    syncSliderFromPlayback();
  });

  window.addEventListener("resize", () => renderFormation());

  window.addEventListener("beforeunload", flushAutosave);

  window.addEventListener("keydown", (e) => {
    const t = e.target;
    const tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
    const inField = t && (t.isContentEditable || tag === "input" || tag === "textarea" || tag === "select");

    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
      if (inField) return;
      e.preventDefault();
      if (undoLastDrag()) {
        renderKeyframeList();
        renderFormation();
        scheduleAutosave();
        setStatus("Undid last move.", "ok");
      }
      return;
    }

    if (e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "ArrowLeft" || e.code === "ArrowRight") {
      if (inField) return;
      if (!state.editMode || state.playing || state.dragging.active) return;
      e.preventDefault();
      const step = e.shiftKey ? 2 : 0.5;
      let dx = 0;
      let dy = 0;
      if (e.code === "ArrowLeft") dx = -step;
      else if (e.code === "ArrowRight") dx = step;
      else if (e.code === "ArrowUp") dy = -step;
      else if (e.code === "ArrowDown") dy = step;
      nudgeSelectedDancer(dx, dy);
      return;
    }

    if (e.code !== "Space" || e.repeat) return;
    if (inField || tag === "button") return;
    e.preventDefault();
    if (state.playing) pausePlaying();
    else startPlaying();
  });

  canvas.style.touchAction = "none";

  function getCanvasLocalPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    const g = getStageGeom() || { size: 1, origin: { x: 28, y: 28 }, stage: 1 };
    const sx = g.size / Math.max(1, rect.width);
    const sy = g.size / Math.max(1, rect.height);
    return {
      x: (evt.clientX - rect.left) * sx,
      y: (evt.clientY - rect.top) * sy,
    };
  }

  function percentFromLocalPoint(x, y) {
    const g = getStageGeom();
    const ox = g?.origin?.x ?? 28;
    const sw = g?.stage ?? 1;
    const rt = g?.rowTop ?? g?.origin?.y ?? 28;
    const rs = g?.rowSpan ?? sw;
    const px = ((x - ox) / sw) * 100;
    const py = ((y - rt) / rs) * 100;
    return { x: Math.max(0, Math.min(100, px)), y: Math.max(0, Math.min(100, py)) };
  }

  canvas.addEventListener("pointerdown", (evt) => {
    if (!state.editMode || state.playing) return;
    if (!getStageGeom()) renderFormation();
    const g = getStageGeom();
    if (!g || g.rowTop == null) return;
    evt.preventDefault();
    canvas.setPointerCapture(evt.pointerId);

    const tForm = getFormationTime();
    const positions = getInterpolatedPositions(tForm, state.keyframes, state.dancerCount);
    const pt = getCanvasLocalPoint(evt);
    const hit = percentFromLocalPoint(pt.x, pt.y);
    const rr = g.r || Math.max(5, g.stage * 0.025);
    let bestIdx = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const cx = g.origin.x + (p.x / 100) * g.stage;
      const cy = g.rowTop + (p.y / 100) * g.rowSpan;
      const d2 = (cx - pt.x) ** 2 + (cy - pt.y) ** 2;
      if (d2 <= (rr * 1.25) ** 2 && d2 < bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) return;

    state.selectedDancer = bestIdx;
    const kf = ensureKeyframeAtFormationTime(tForm);
    kf.positions = padPositions(kf.positions, state.dancerCount);
    pushDragUndo(kf.id, cloneKeyframePositions(kf.positions));
    state.dragging = { active: true, index: bestIdx, keyframeId: kf.id };
    kf.positions[bestIdx] = { x: hit.x, y: hit.y };
    renderKeyframeList();
    renderFormation();
  });

  canvas.addEventListener("pointermove", (evt) => {
    if (!state.editMode || !state.dragging.active) return;
    if (!getStageGeom()) renderFormation();
    evt.preventDefault();
    const pt = getCanvasLocalPoint(evt);
    const np = percentFromLocalPoint(pt.x, pt.y);
    const kf = findKeyframeById(state.dragging.keyframeId);
    if (!kf) return;
    kf.positions = padPositions(kf.positions, state.dancerCount);
    kf.positions[state.dragging.index] = { x: np.x, y: np.y };
    renderFormation();
  });

  const stopDrag = () => {
    const was = state.dragging.active;
    state.dragging = { active: false, index: -1, keyframeId: null };
    if (was) scheduleAutosave();
  };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  const restored = loadAutosavedProject(state, keyframeIdSeq);
  ensureDancerNames();
  if (restored) {
    if (offsetInput) offsetInput.value = String(state.offsetSec);
    if (dancersInput) dancersInput.value = String(state.dancerCount);
    if (gridColsInput) gridColsInput.value = String(state.gridCols);
    if (gridRowsInput) gridRowsInput.value = String(state.gridRows);
    setStatus("Restored your last session from this browser.", "ok");
  } else {
    setStatus("Ready — build keyframes from scratch, or import JSON.", "ok");
  }
  renderKeyframeList();
  renderDancerNameInputs();
  updateTimeSliderMax();
  updateLabels();
  renderFormation();
}

bind();

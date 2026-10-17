(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("simulation-form");
  const rows = $("process-rows");
  const algorithms = {
    fcfs: { short: "FCFS", description: "First in, first out. Processes run to completion in arrival order. Equal arrivals follow your row order." },
    sjf: { short: "SJF · Non-preemptive", description: "The shortest ready burst runs next, to completion. Ties use arrival time, then row order." },
    priority: { short: "Priority · Non-preemptive", description: "The ready process with the lowest priority number runs to completion. Ties use arrival time, then row order." },
    rr: { short: "Round Robin", description: "Ready processes take turns in a FIFO queue. Each gets up to one quantum; endpoint arrivals join before the running process returns." }
  };
  const palette = [
    ["#e4defc", "#48348c", "#7462c2"], ["#dceafa", "#244f80", "#5183b5"],
    ["#dfecdf", "#315e37", "#608c5a"], ["#f8e5d5", "#7c4822", "#bb824b"],
    ["#f6dfe9", "#813854", "#b76588"], ["#d9eeee", "#245e61", "#4a9296"]
  ];
  let nextId = 1;
  let hasResults = false;
  let playback = null;
  let animationId = null;
  let timelineBlocks = [];
  let timelineScale = 40;
  let playhead = null;
  let processCards = new Map();
  const color = id => palette[(Number(id.slice(1)) - 1) % palette.length];

  function announce(message) { $("announcement").textContent = message; }

  function clearResults() {
    const hadPlayback = hasResults || Boolean(playback);
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
    playback = null;
    timelineBlocks = [];
    processCards.clear();
    hasResults = false;
    $("results").hidden = true;
    $("empty-state").hidden = false;
    $("gantt").replaceChildren();
    $("legend").replaceChildren();
    $("metrics-body").replaceChildren();
    $("process-board").replaceChildren();
    $("ready-queue").replaceChildren();
    $("activity-feed").replaceChildren();
    ["completion-banner", "summary-metrics", "final-breakdown"].forEach(id => { $(id).hidden = true; });
    $("playback-stage").classList.remove("is-playing", "is-paused", "is-complete", "is-idle");
    $("run-label").textContent = "Run simulation";
    $("timeline-tooltip").hidden = true;
    $("result-state").textContent = "Awaiting input";
    $("result-state").classList.remove("complete", "playing", "paused");
    if (hadPlayback) announce("Previous playback cleared. Run the simulation again.");
  }

  function clearErrors() {
    form.querySelectorAll(".field-error").forEach(node => { node.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach(node => node.removeAttribute("aria-invalid"));
    $("form-message").textContent = "";
  }

  function invalidate() { clearResults(); clearErrors(); }

  function updateAlgorithm() {
    const selected = $("algorithm").value;
    $("algorithm-description").textContent = algorithms[selected].description;
    $("quantum-field").hidden = selected !== "rr";
    document.querySelectorAll(".priority-column").forEach(cell => { cell.hidden = selected !== "priority"; });
    $("priority-help").hidden = selected !== "priority";
  }

  function updateCount() {
    const count = rows.children.length;
    $("process-count").textContent = `${count} process${count === 1 ? "" : "es"}`;
    $("add-process").disabled = count >= 20;
    rows.querySelectorAll(".remove-button").forEach(button => { button.disabled = count <= 1; });
  }

  function addRow(values = { arrival: 0, burst: 1, priority: 1 }) {
    if (rows.children.length >= 20) return;
    const id = `P${nextId++}`;
    const row = document.createElement("tr");
    row.dataset.processId = id;
    const idCell = document.createElement("td");
    idCell.append(processLabel(id));
    row.append(idCell);
    ["arrival", "burst", "priority"].forEach(field => {
      const cell = document.createElement("td");
      if (field === "priority") cell.className = "priority-column";
      const input = document.createElement("input");
      input.type = "number";
      input.id = `${id}-${field}`;
      input.dataset.field = field;
      input.min = field === "arrival" ? "0" : "1";
      input.max = field === "arrival" ? "1000" : "100";
      input.step = "1";
      input.value = values[field];
      input.setAttribute("aria-label", `${id} ${field === "priority" ? "priority" : field + " time"}`);
      input.setAttribute("aria-describedby", `${id}-${field}-error`);
      const error = document.createElement("span");
      error.id = `${id}-${field}-error`;
      error.className = "field-error";
      cell.append(input, error);
      row.append(cell);
    });
    const actionCell = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${id}`);
    remove.addEventListener("click", () => {
      if (rows.children.length <= 1) return;
      const focusTarget = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      invalidate();
      updateCount();
      if (focusTarget) focusTarget.querySelector("input").focus();
      announce(`${id} removed. ${rows.children.length} processes in the queue.`);
    });
    actionCell.append(remove);
    row.append(actionCell);
    rows.append(row);
    updateCount();
    updateAlgorithm();
    return row;
  }

  function processLabel(id) {
    const label = document.createElement("span");
    label.className = "process-label";
    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = color(id)[2];
    dot.setAttribute("aria-hidden", "true");
    label.append(dot, document.createTextNode(id));
    return label;
  }

  function loadExample(resetAlgorithm) {
    invalidate();
    rows.replaceChildren();
    nextId = 1;
    if (resetAlgorithm) $("algorithm").value = "fcfs";
    if (resetAlgorithm) {
      $("playback-speed").value = "1";
      $("follow-cpu").checked = true;
    }
    $("quantum").value = "2";
    [{ arrival: 0, burst: 5, priority: 2 }, { arrival: 1, burst: 3, priority: 1 }, { arrival: 2, burst: 1, priority: 3 }].forEach(addRow);
    updateAlgorithm();
  }

  function parseInput(input, min, max, title, errors) {
    const raw = input.value.trim();
    const value = raw === "" ? NaN : Number(raw);
    if (!raw || input.validity.badInput || !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
      $(input.getAttribute("aria-describedby")).textContent = `${title}: enter a whole number ${min}–${max}.`;
      input.setAttribute("aria-invalid", "true");
      errors.push(input);
    }
    return value;
  }

  function collectInput() {
    const errors = [];
    const algorithm = $("algorithm").value;
    const processes = Array.from(rows.children, row => {
      const id = row.dataset.processId;
      const get = field => row.querySelector(`[data-field="${field}"]`);
      return {
        id,
        arrival: parseInput(get("arrival"), 0, 1000, "Arrival", errors),
        burst: parseInput(get("burst"), 1, 100, "Burst", errors),
        priority: algorithm === "priority" ? parseInput(get("priority"), 1, 100, "Priority", errors) : Number(get("priority").value)
      };
    });
    const quantum = algorithm === "rr" ? parseInput($("quantum"), 1, 100, "Quantum", errors) : undefined;
    if (errors.length) {
      $("form-message").textContent = `Fix ${errors.length} highlighted field${errors.length === 1 ? "" : "s"} before running.`;
      errors[0].focus();
      return null;
    }
    return { processes, algorithm, quantum };
  }

  function renderTimeline(timeline) {
    const gantt = $("gantt");
    const total = timeline[timeline.length - 1].end;
    // One consistent scale for the entire chart. Minimum 40px per unit
    // keeps integer boundary labels legible without distorting short slices.
    const scale = Math.max(40, Math.min(80, (gantt.parentElement.clientWidth - 2) / total));
    timelineScale = scale;
    gantt.style.width = `${total * scale}px`;
    timeline.forEach((segment, index) => {
      const { processId, start, end } = segment;
      const name = processId === null ? "Idle" : processId;
      const colors = processId === null ? ["#edf0f4", "#596579"] : color(processId);
      const block = document.createElement("div");
      block.className = "gantt-segment future-segment";
      block.style.width = `${(end - start) * scale}px`;
      block.style.color = colors[1];
      block.tabIndex = -1;
      block.setAttribute("aria-hidden", "true");
      const fill = document.createElement("span");
      fill.className = "gantt-fill";
      fill.style.background = colors[0];
      const description = `${name}: start ${start}, end ${end}, duration ${end - start} time units`;
      block.setAttribute("aria-label", description);
      block.setAttribute("aria-describedby", "timeline-tooltip");
      const showTooltip = () => {
        const tooltip = $("timeline-tooltip");
        tooltip.textContent = description;
        tooltip.hidden = false;
        const box = block.getBoundingClientRect();
        const tip = tooltip.getBoundingClientRect();
        const left = Math.max(8, Math.min(box.left, window.innerWidth - tip.width - 8));
        const top = box.top - tip.height - 8 >= 8 ? box.top - tip.height - 8 : box.bottom + 8;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };
      const hideTooltip = () => { $("timeline-tooltip").hidden = true; };
      block.addEventListener("mouseenter", showTooltip);
      block.addEventListener("mouseleave", () => { if (document.activeElement !== block) hideTooltip(); });
      block.addEventListener("focus", showTooltip);
      block.addEventListener("blur", hideTooltip);
      block.addEventListener("keydown", event => { if (event.key === "Escape") hideTooltip(); });
      const label = document.createElement("span");
      label.className = "gantt-label";
      label.textContent = name;
      const tick = document.createElement("span");
      tick.className = "time-tick";
      tick.textContent = start;
      block.append(fill, label, tick);
      if (index === timeline.length - 1) {
        const endTick = document.createElement("span");
        endTick.className = "end-tick";
        endTick.textContent = end;
        endTick.hidden = true;
        block.append(endTick);
      }
      gantt.append(block);
      timelineBlocks.push({ block, fill, segment });
    });
    playhead = document.createElement("div");
    playhead.className = "gantt-playhead";
    playhead.setAttribute("aria-hidden", "true");
    gantt.append(playhead);
    const unique = [...new Set(timeline.map(segment => segment.processId))];
    unique.forEach(id => {
      const item = document.createElement("span");
      item.className = "legend-item";
      if (id !== null) item.append(processLabel(id));
      else item.textContent = "Idle (CPU available)";
      $("legend").append(item);
    });
    gantt.parentElement.scrollLeft = 0;
  }

  function renderResults(result, algorithm) {
    ["completion-banner", "summary-metrics", "final-breakdown"].forEach(id => { $(id).hidden = false; });
    ["waiting", "turnaround", "response"].forEach(metric => {
      $(`avg-${metric}`).textContent = result.averages[metric].toFixed(2);
    });
    $("algorithm-tag").textContent = algorithms[algorithm].short;
    result.metrics.forEach(p => {
      const row = document.createElement("tr");
      const idCell = document.createElement("td");
      idCell.append(processLabel(p.id));
      row.append(idCell);
      ["arrival", "burst", "firstStart", "completion", "turnaround", "waiting", "response"].forEach(key => {
        const cell = document.createElement("td");
        cell.textContent = p[key];
        row.append(cell);
      });
      $("metrics-body").append(row);
    });
    hasResults = true;
    $("result-state").textContent = "Simulation complete";
    $("result-state").classList.add("complete");
    announce(`${algorithms[algorithm].short} simulation complete. Average waiting time ${result.averages.waiting.toFixed(2)} time units.`);
  }

  function createProcessBoard(processes) {
    processes.forEach(p => {
      const card = document.createElement("article");
      card.className = "process-card";
      card.style.setProperty("--process-color", color(p.id)[2]);
      const top = document.createElement("div");
      top.className = "process-card-top";
      const state = document.createElement("span");
      state.className = "process-state";
      top.append(processLabel(p.id), state);
      const bar = document.createElement("div");
      bar.className = "process-meter";
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", `${p.id} CPU burst completed`);
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(p.burst));
      const fill = document.createElement("span");
      bar.append(fill);
      const detail = document.createElement("p");
      card.append(top, bar, detail);
      $("process-board").append(card);
      processCards.set(p.id, { card, state, bar, fill, detail });
    });
  }

  function updateTransport(complete) {
    const playing = playback && playback.playing && !complete;
    const stage = $("playback-stage");
    stage.classList.toggle("is-playing", Boolean(playing));
    stage.classList.toggle("is-paused", !playing && !complete);
    stage.classList.toggle("is-complete", complete);
    $("pause-playback").textContent = complete ? "↻ Replay" : playing ? "Ⅱ Pause" : "▶ Resume";
    $("step-playback").disabled = complete;
    $("finish-playback").disabled = complete;
    $("live-label").lastChild.textContent = complete ? " EXECUTION COMPLETE" : playing ? " LIVE EXECUTION" : " PLAYBACK PAUSED";
    const badge = $("result-state");
    badge.classList.toggle("playing", Boolean(playing));
    badge.classList.toggle("paused", !playing && !complete);
    badge.textContent = complete ? "Simulation complete" : playing ? "Simulation running" : "Simulation paused";
  }

  function displayFrame(frame) {
    const session = playback;
    if (!session) return;
    const segmentChanged = session.segmentIndex !== frame.segmentIndex;
    const percent = frame.time / frame.duration * 100;
    $("sim-clock").firstChild.textContent = `${(Math.floor(frame.time * 10) / 10).toFixed(1)} `;
    $("playback-progress").style.width = `${percent}%`;
    $("playback-progress").setAttribute("aria-valuenow", percent.toFixed(1));
    $("completed-count").textContent = `${frame.completedCount} of ${frame.states.length} completed`;
    $("playback-fraction").textContent = `${(Math.floor(frame.time * 10) / 10).toFixed(1)} / ${frame.duration} time units`;
    const active = frame.states.find(p => p.id === frame.runningId);
    $("cpu-process").textContent = frame.complete ? "✓" : frame.runningId || "Idle";
    $("cpu-detail").textContent = frame.complete ? "All processes done" : active ? `${active.remaining.toFixed(1)} tu remaining` : "Waiting for arrival";
    $("playback-stage").classList.toggle("is-idle", !active && !frame.complete);
    $("cpu-core").style.setProperty("--cpu-color", active ? color(active.id)[2] : "#959eaf");
    $("execution-caption").textContent = frame.complete ? "All processes have finished. Your final results are ready below." : active
      ? `${active.id} is executing${session.input.algorithm === "rr" ? ` · ${(frame.segment.end - frame.time).toFixed(1)} tu left in this time slice` : " · runs to completion"}.`
      : `No process is ready. Next arrival at t = ${frame.segment.end}.`;

    const queueKey = `${frame.complete ? "done" : "live"}:${frame.ready.join(",")}`;
    if (session.queueKey !== queueKey) {
      $("ready-queue").replaceChildren();
      frame.ready.forEach((id, index) => {
        const token = document.createElement("span");
        token.className = "queue-token";
        token.style.background = color(id)[0];
        token.style.color = color(id)[1];
        token.style.setProperty("--token-delay", `${Math.min(index, 4) * 35}ms`);
        token.append(processLabel(id));
        $("ready-queue").append(token);
      });
      if (!frame.ready.length) {
        const empty = document.createElement("span");
        empty.className = "queue-empty";
        empty.textContent = frame.complete ? "Queue cleared ✓" : "No processes waiting";
        $("ready-queue").append(empty);
      }
      session.queueKey = queueKey;
    }
    $("ready-count").textContent = `${frame.ready.length} waiting`;
    $("queue-note").textContent = frame.complete ? "All work has been dispatched." : "Next process first →";
    frame.states.forEach(p => {
      const view = processCards.get(p.id);
      const labels = { upcoming: "Not arrived", ready: "Ready", running: "Running", completed: "Done ✓" };
      if (view.card.dataset.state !== p.state) {
        view.card.dataset.state = p.state;
        view.state.textContent = labels[p.state];
      }
      view.fill.style.width = `${p.used / p.burst * 100}%`;
      view.bar.setAttribute("aria-valuenow", p.used.toFixed(1));
      view.detail.textContent = `${p.used.toFixed(1)} / ${p.burst} tu executed`;
    });
    if (session.eventCount !== frame.eventCount) {
      $("activity-feed").replaceChildren();
      frame.events.slice().reverse().forEach(event => {
        const item = document.createElement("li");
        item.className = `activity-${event.type}`;
        const timestamp = document.createElement("span");
        timestamp.textContent = `t=${event.time}`;
        const description = document.createElement("span");
        description.textContent = event.text;
        item.append(timestamp, description);
        $("activity-feed").append(item);
      });
      session.eventCount = frame.eventCount;
    }

    // Reveal only elapsed execution. Future allocations stay hidden to avoid
    // giving away the result before the scheduler has played through it.
    const target = frame.complete ? timelineBlocks.length - 1 : frame.segmentIndex;
    for (let i = Math.max(0, session.revealedIndex); i <= target; i++) {
      const visual = timelineBlocks[i];
      visual.block.classList.remove("future-segment", "active-segment");
      visual.block.removeAttribute("aria-hidden");
      visual.block.tabIndex = 0;
      const fraction = Math.max(0, Math.min(1, (frame.time - visual.segment.start) / (visual.segment.end - visual.segment.start)));
      visual.fill.style.width = `${fraction * 100}%`;
      if (!frame.complete && i === frame.segmentIndex) visual.block.classList.add("active-segment");
    }
    session.revealedIndex = target;
    if (frame.complete) timelineBlocks[timelineBlocks.length - 1].block.querySelector(".end-tick").hidden = false;
    playhead.style.left = `${frame.time * timelineScale}px`;
    playhead.classList.toggle("finished", frame.complete);
    const scroller = $("gantt").parentElement;
    if ($("follow-cpu").checked) {
      const x = frame.time * timelineScale;
      if (x > scroller.scrollLeft + scroller.clientWidth - 45 || x < scroller.scrollLeft) {
        scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.65);
      }
    }
    if (segmentChanged) announce(frame.complete ? "Execution complete." : active ? `${active.id} is now running.` : "CPU is idle.");
    session.segmentIndex = frame.segmentIndex;
  }

  function completePlayback() {
    if (!playback || hasResults) return;
    playback.playing = false;
    animationId = null;
    updateTransport(true);
    $("run-label").textContent = "Run simulation";
    renderResults(playback.result, playback.input.algorithm);
  }

  function animate(timestamp) {
    animationId = null;
    if (!playback || !playback.playing) return;
    const elapsed = playback.lastTimestamp === null ? 0 : Math.min(200, timestamp - playback.lastTimestamp);
    playback.lastTimestamp = timestamp;
    // At 1×, one simulated time unit takes 700ms. Cap frame catch-up so
    // switching tabs cannot silently skip the learning experience.
    playback.time = Math.min(playback.model.duration, playback.time + elapsed / 700 * Number($("playback-speed").value));
    const frame = playback.model.frame(playback.time);
    displayFrame(frame);
    if (frame.complete) completePlayback();
    else animationId = requestAnimationFrame(animate);
  }

  function pausePlayback() {
    if (!playback || hasResults) return;
    playback.playing = false;
    playback.lastTimestamp = null;
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
    updateTransport(false);
  }

  function startPlayback(input, result) {
    clearResults();
    playback = {
      input, result, model: window.CPUPlayback.create(input.processes, result, input.algorithm),
      time: 0, playing: true, lastTimestamp: null, revealedIndex: 0,
      segmentIndex: null, queueKey: null, eventCount: -1
    };
    $("empty-state").hidden = true;
    $("results").hidden = false;
    $("algorithm-tag").textContent = algorithms[input.algorithm].short;
    $("run-label").textContent = "Restart simulation";
    renderTimeline(result.timeline);
    createProcessBoard(input.processes);
    displayFrame(playback.model.frame(0));
    updateTransport(false);
    animationId = requestAnimationFrame(animate);
  }

  $("pause-playback").addEventListener("click", () => {
    if (!playback) return;
    if (hasResults) { startPlayback(playback.input, playback.result); return; }
    if (playback.playing) pausePlayback();
    else {
      playback.playing = true;
      playback.lastTimestamp = null;
      updateTransport(false);
      animationId = requestAnimationFrame(animate);
    }
  });
  $("step-playback").addEventListener("click", () => {
    if (!playback || hasResults) return;
    pausePlayback();
    playback.time = playback.model.frame(playback.time).nextEvent;
    const frame = playback.model.frame(playback.time);
    displayFrame(frame);
    if (frame.complete) completePlayback();
  });
  $("finish-playback").addEventListener("click", () => {
    if (!playback || hasResults) return;
    pausePlayback();
    playback.time = playback.model.duration;
    displayFrame(playback.model.frame(playback.time));
    completePlayback();
  });
  $("playback-speed").addEventListener("change", () => {
    if (playback) playback.lastTimestamp = null;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playback && playback.playing) { pausePlayback(); announce("Playback paused because the page is hidden."); }
  });

  form.addEventListener("input", invalidate);
  window.addEventListener("scroll", () => { $("timeline-tooltip").hidden = true; }, true);
  window.addEventListener("resize", () => { $("timeline-tooltip").hidden = true; });
  $("algorithm").addEventListener("change", () => { invalidate(); updateAlgorithm(); });
  $("add-process").addEventListener("click", () => {
    invalidate();
    const row = addRow();
    if (row) { row.querySelector("input").focus(); announce(`${row.dataset.processId} added.`); }
  });
  $("load-example").addEventListener("click", () => { loadExample(false); announce("Example workload loaded. Run the simulation to see results."); });
  $("reset").addEventListener("click", () => { loadExample(true); announce("Simulator reset to the initial example."); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    clearResults();
    clearErrors();
    const input = collectInput();
    if (!input) return;
    try {
      startPlayback(input, window.CPUScheduler.simulate(input.processes, input.algorithm, input.quantum));
    } catch (error) {
      clearResults();
      $("form-message").textContent = error.message;
    }
  });
  loadExample(true);
})();

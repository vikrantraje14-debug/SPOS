/* Pure scheduling engine. No browser UI or external dependencies. */
(function (root) {
  "use strict";
  const ALGORITHMS = ["fcfs", "sjf", "srtf", "priority", "priority-preemptive", "rr"];

  function integer(value, min, max, label) {
    // Do not coerce strings: the UI must explicitly parse complete inputs.
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${label} must be an integer from ${min} to ${max}.`);
    }
  }

  function validate(processes, algorithm, quantum) {
    if (!ALGORITHMS.includes(algorithm)) throw new Error("Select a supported scheduling algorithm.");
    if (!Array.isArray(processes) || processes.length < 1 || processes.length > 20) {
      throw new Error("Provide between 1 and 20 processes.");
    }
    const ids = new Set();
    processes.forEach((p, index) => {
      if (!p || typeof p !== "object") throw new Error(`Process ${index + 1} must be an object.`);
      if (typeof p.id !== "string" || !p.id.trim() || ids.has(p.id)) {
        throw new Error("Process IDs must be nonempty, unique strings.");
      }
      ids.add(p.id);
      integer(p.arrival, 0, 1000, `${p.id} arrival time`);
      integer(p.burst, 1, 100, `${p.id} burst time`);
      if (algorithm === "priority" || algorithm === "priority-preemptive") integer(p.priority, 1, 100, `${p.id} priority`);
    });
    if (algorithm === "rr") integer(quantum, 1, 100, "Time quantum");
  }

  function arrivalOrder(a, b) {
    return a.arrival - b.arrival || a.order - b.order;
  }

  // All metrics come from the actual timeline, with the same definitions
  // regardless of which algorithm produced it.
  function calculateMetrics(processes, timeline) {
    const times = new Map();
    timeline.forEach(({ processId, start, end }) => {
      if (processId === null) return;
      const prior = times.get(processId);
      times.set(processId, { firstStart: prior ? prior.firstStart : start, completion: end });
    });
    const metrics = processes.map(p => {
      const { firstStart, completion } = times.get(p.id);
      const turnaround = completion - p.arrival;
      return {
        id: p.id, arrival: p.arrival, burst: p.burst, priority: p.priority,
        firstStart, completion, turnaround,
        waiting: turnaround - p.burst, response: firstStart - p.arrival
      };
    });
    const averages = {};
    ["turnaround", "waiting", "response"].forEach(key => {
      averages[key] = metrics.reduce((sum, p) => sum + p[key], 0) / metrics.length;
    });
    return { metrics, averages };
  }

  function simulate(processes, algorithm, quantum) {
    validate(processes, algorithm, quantum);
    const pending = processes.map((p, order) => ({ ...p, order, remaining: p.burst })).sort(arrivalOrder);
    const timeline = [];
    let time = 0;
    const append = (processId, duration, merge = false) => {
      const prior = timeline[timeline.length - 1];
      if (merge && prior && prior.processId === processId && prior.end === time) prior.end += duration;
      else timeline.push({ processId, start: time, end: time + duration });
      time += duration;
    };

    if (algorithm === "rr") {
      const ready = [];
      let next = 0;
      const enqueueArrivals = () => {
        while (next < pending.length && pending[next].arrival <= time) ready.push(pending[next++]);
      };
      while (next < pending.length || ready.length) {
        enqueueArrivals();
        if (!ready.length) {
          append(null, pending[next].arrival - time);
          enqueueArrivals();
        }
        const process = ready.shift();
        const duration = Math.min(quantum, process.remaining);
        append(process.id, duration);
        process.remaining -= duration;
        // Endpoint arrivals enter before the running process returns to the queue.
        enqueueArrivals();
        if (process.remaining > 0) ready.push(process);
      }
    } else if (algorithm === "srtf" || algorithm === "priority-preemptive") {
      const ready = [];
      let next = 0;
      let current = null;
      const key = process => algorithm === "srtf" ? process.remaining : process.priority;
      while (current || next < pending.length || ready.length) {
        while (next < pending.length && pending[next].arrival <= time) ready.push(pending[next++]);
        ready.sort((a, b) => key(a) - key(b) || arrivalOrder(a, b));
        // A tie never interrupts the CPU. Arrival/order ties apply only when
        // choosing from the queue after completion or a strict preemption.
        if (!current) current = ready.shift() || null;
        else if (ready.length && key(ready[0]) < key(current)) {
          ready.push(current);
          current = ready.shift();
        }
        if (!current) {
          append(null, pending[next].arrival - time);
          continue;
        }
        const nextArrival = next < pending.length ? pending[next].arrival : Infinity;
        const duration = Math.min(current.remaining, nextArrival - time);
        // Re-evaluate at each arrival, but merge uninterrupted execution so
        // the Gantt chart shows actual interruptions, not artificial slices.
        append(current.id, duration, true);
        current.remaining -= duration;
        if (current.remaining === 0) current = null;
      }
    } else {
      while (pending.length) {
        const ready = pending.filter(p => p.arrival <= time);
        if (!ready.length) {
          append(null, pending[0].arrival - time);
          continue;
        }
        ready.sort((a, b) => {
          if (algorithm === "sjf") return a.burst - b.burst || arrivalOrder(a, b);
          if (algorithm === "priority") return a.priority - b.priority || arrivalOrder(a, b);
          return arrivalOrder(a, b);
        });
        const process = ready[0];
        append(process.id, process.burst);
        pending.splice(pending.indexOf(process), 1);
      }
    }
    return { timeline, ...calculateMetrics(processes, timeline) };
  }

  root.CPUScheduler = Object.freeze({ simulate });
})(typeof window !== "undefined" ? window : globalThis);

/* A pure view of execution at any simulated time. No timers or DOM here. */
(function (root) {
  "use strict";

  function create(processes, result, algorithm) {
    const arrivals = processes.map((p, order) => ({ ...p, order })).sort((a, b) => a.arrival - b.arrival || a.order - b.order);
    const byId = new Map(arrivals.map(p => [p.id, p]));
    const metrics = new Map(result.metrics.map(p => [p.id, p]));
    const used = Object.fromEntries(processes.map(p => [p.id, 0]));
    const duration = result.timeline[result.timeline.length - 1].end;
    const queue = [];
    let nextArrival = 0;
    const enqueue = time => {
      while (nextArrival < arrivals.length && arrivals[nextArrival].arrival <= time) queue.push(arrivals[nextArrival++].id);
    };

    // Cache queue/CPU state at allocation boundaries. Looking up a frame is
    // cheap, even when Round Robin produces thousands of allocations.
    const checkpoints = result.timeline.map(segment => {
      enqueue(segment.start);
      if (segment.processId !== null) queue.splice(queue.indexOf(segment.processId), 1);
      const checkpoint = { segment, queue: queue.slice(), nextArrival, used: { ...used } };
      if (segment.processId !== null) used[segment.processId] += segment.end - segment.start;
      enqueue(segment.end);
      if (algorithm === "rr" && segment.processId !== null && used[segment.processId] < byId.get(segment.processId).burst) {
        queue.push(segment.processId);
      }
      return checkpoint;
    });

    const events = arrivals.map(p => ({ time: p.arrival, rank: 1, type: "arrival", text: `${p.id} arrived in the ready queue.` }));
    result.timeline.forEach(segment => {
      if (segment.processId === null) {
        events.push({ time: segment.start, rank: 3, type: "idle", text: "CPU is idle, waiting for the next arrival." });
        return;
      }
      const id = segment.processId;
      events.push({ time: segment.start, rank: 3, type: "dispatch", text: `${id} was dispatched to the CPU.` });
      const complete = segment.end === metrics.get(id).completion;
      events.push({ time: segment.end, rank: complete ? 0 : 2, type: complete ? "complete" : "rotate", text: complete ? `${id} completed its CPU burst.` : `${id}'s time slice ended; it returned to the queue.` });
    });
    events.sort((a, b) => a.time - b.time || a.rank - b.rank);
    const eventTimes = [...new Set([0, ...events.map(event => event.time), duration])].sort((a, b) => a - b);

    function frame(time) {
      if (!Number.isFinite(time)) throw new Error("Playback time must be a finite number.");
      time = Math.max(0, Math.min(duration, time));
      const complete = time >= duration;
      // Find the allocation containing time. At a boundary, the new turn owns it.
      let low = 0;
      let high = checkpoints.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (checkpoints[mid].segment.end <= time) low = mid + 1;
        else high = mid;
      }
      const index = complete ? checkpoints.length - 1 : low;
      const checkpoint = checkpoints[index];
      const segment = complete ? null : checkpoint.segment;
      const runningId = segment ? segment.processId : null;
      const consumed = complete ? used : { ...checkpoint.used };
      if (!complete && runningId !== null) consumed[runningId] += time - segment.start;
      let ready = complete ? [] : checkpoint.queue.slice();
      if (!complete) {
        for (let i = checkpoint.nextArrival; i < arrivals.length && arrivals[i].arrival <= time; i++) ready.push(arrivals[i].id);
      }
      if (algorithm !== "rr") ready.sort((aId, bId) => {
        const a = byId.get(aId), b = byId.get(bId);
        const tie = a.arrival - b.arrival || a.order - b.order;
        return algorithm === "sjf" ? a.burst - b.burst || tie : algorithm === "priority" ? a.priority - b.priority || tie : tie;
      });
      const states = processes.map(p => ({
        id: p.id, burst: p.burst, used: consumed[p.id], remaining: Math.max(0, p.burst - consumed[p.id]),
        state: time >= metrics.get(p.id).completion ? "completed" : p.id === runningId ? "running" : p.arrival > time ? "upcoming" : "ready"
      }));
      // Binary search also keeps the activity feed efficient on large workloads.
      low = 0; high = events.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (events[mid].time <= time) low = mid + 1;
        else high = mid;
      }
      return {
        time, duration, complete, runningId, segment, segmentIndex: complete ? -1 : index,
        ready, states, completedCount: states.filter(p => p.state === "completed").length,
        events: events.slice(Math.max(0, low - 5), low), eventCount: low,
        nextEvent: eventTimes.find(t => t > time + 1e-8) ?? duration
      };
    }

    return Object.freeze({ duration, frame });
  }

  root.CPUPlayback = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);

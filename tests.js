/* Runs in a browser or Node with no packages. Expected fixtures are hand-calculated. */
(function (root) {
  "use strict";
  const { simulate } = root.CPUScheduler;
  const results = [];
  const modes = ["fcfs", "sjf", "srtf", "priority", "priority-preemptive", "rr"];
  const p = (id, arrival, burst, priority = 1) => ({ id, arrival, burst, priority });
  const fixture = [p("P1", 0, 5, 2), p("P2", 1, 3, 1), p("P3", 2, 1, 3)];
  function equal(actual, expected, message = "Values differ") {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
    }
  }
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function throws(fn, expectedPart) {
    let error;
    try { fn(); } catch (caught) { error = caught; }
    assert(error instanceof Error, "Expected a descriptive error.");
    if (expectedPart) assert(error.message.includes(expectedPart), `Expected error containing ${expectedPart}; got ${error.message}`);
  }
  function test(name, run) {
    try { run(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
  }
  function timeline(result) { return result.timeline.map(s => [s.processId, s.start, s.end]); }
  function checkMetrics(result, expected) {
    // Tuples: first start, completion, turnaround, waiting, response.
    equal(result.metrics.map(m => [m.firstStart, m.completion, m.turnaround, m.waiting, m.response]), expected, "Process metrics");
  }
  function invariants(input, result) {
    const used = new Map(input.map(process => [process.id, 0]));
    let end = 0;
    result.timeline.forEach(segment => {
      assert(segment.start === end, "Timeline must be contiguous from zero, including Idle.");
      assert(segment.end > segment.start, "Intervals must have positive duration.");
      if (segment.processId !== null) {
        const process = input.find(item => item.id === segment.processId);
        assert(Boolean(process), "Unknown process in timeline.");
        assert(segment.start >= process.arrival, "Process ran before arrival.");
        used.set(process.id, used.get(process.id) + segment.end - segment.start);
      } else {
        assert(!input.some(process => process.arrival <= segment.start && used.get(process.id) < process.burst), "CPU idled while a process was ready.");
        assert(!input.some(process => process.arrival > segment.start && process.arrival < segment.end), "Idle interval skipped an arrival.");
      }
      end = segment.end;
    });
    input.forEach(process => equal(used.get(process.id), process.burst, "Total CPU allocation"));
    equal(result.metrics.map(m => m.id), input.map(process => process.id), "Original metrics order");
    result.metrics.forEach(metric => {
      const slices = result.timeline.filter(s => s.processId === metric.id);
      equal(metric.firstStart, slices[0].start);
      equal(metric.completion, slices[slices.length - 1].end);
      equal(metric.turnaround, metric.completion - metric.arrival);
      equal(metric.waiting, metric.turnaround - metric.burst);
      equal(metric.response, metric.firstStart - metric.arrival);
      assert(metric.waiting >= 0 && metric.response >= 0, "Negative waiting or response time.");
    });
    ["turnaround", "waiting", "response"].forEach(key => {
      equal(result.averages[key], result.metrics.reduce((sum, m) => sum + m[key], 0) / input.length);
    });
    assert(result.timeline[result.timeline.length - 1].processId !== null, "No trailing Idle allowed.");
  }

  test("FCFS: required regression timeline, metrics, and averages", () => {
    const r = simulate(fixture, "fcfs");
    equal(timeline(r), [["P1", 0, 5], ["P2", 5, 8], ["P3", 8, 9]]);
    checkMetrics(r, [[0, 5, 5, 0, 0], [5, 8, 7, 4, 4], [8, 9, 7, 6, 6]]);
    equal(r.averages, { turnaround: 19 / 3, waiting: 10 / 3, response: 10 / 3 });
  });
  test("SJF: required regression timeline and metrics", () => {
    const r = simulate(fixture, "sjf");
    equal(timeline(r), [["P1", 0, 5], ["P3", 5, 6], ["P2", 6, 9]]);
    checkMetrics(r, [[0, 5, 5, 0, 0], [6, 9, 8, 5, 5], [5, 6, 4, 3, 3]]);
    equal(r.averages.waiting, 8 / 3);
  });
  test("Priority: example timeline and metrics", () => {
    const r = simulate(fixture, "priority");
    equal(timeline(r), [["P1", 0, 5], ["P2", 5, 8], ["P3", 8, 9]]);
    checkMetrics(r, [[0, 5, 5, 0, 0], [5, 8, 7, 4, 4], [8, 9, 7, 6, 6]]);
  });
  test("Round Robin: required quantum-2 regression and metrics", () => {
    const r = simulate(fixture, "rr", 2);
    equal(timeline(r), [["P1", 0, 2], ["P2", 2, 4], ["P3", 4, 5], ["P1", 5, 7], ["P2", 7, 8], ["P1", 8, 9]]);
    checkMetrics(r, [[0, 9, 9, 4, 0], [2, 8, 7, 4, 1], [4, 5, 3, 2, 2]]);
    equal(r.averages, { turnaround: 19 / 3, waiting: 10 / 3, response: 1 });
  });
  modes.forEach(mode => {
    test(`${mode}: single process and initial idle`, () => {
      const r = simulate([p("A", 3, 2)], mode, 5);
      equal(timeline(r), [[null, 0, 3], ["A", 3, 5]]);
      checkMetrics(r, [[3, 5, 2, 0, 0]]);
    });
    test(`${mode}: intermediate idle and unsorted input`, () => {
      const input = [p("Later", 6, 1), p("First", 0, 2)];
      const r = simulate(input, mode, 3);
      equal(timeline(r), [["First", 0, 2], [null, 2, 6], ["Later", 6, 7]]);
      checkMetrics(r, [[6, 7, 1, 0, 0], [0, 2, 2, 0, 0]]);
    });
    test(`${mode}: equal arrivals and equal choices retain input order`, () => {
      const r = simulate([p("Z", 0, 1), p("A", 0, 1), p("M", 0, 1)], mode, 1);
      equal(timeline(r), [["Z", 0, 1], ["A", 1, 2], ["M", 2, 3]]);
      checkMetrics(r, [[0, 1, 1, 0, 0], [1, 2, 2, 1, 1], [2, 3, 3, 2, 2]]);
    });
    test(`${mode}: inputs can be frozen and remain unchanged`, () => {
      const input = fixture.map(item => Object.freeze({ ...item }));
      const before = JSON.stringify(input);
      Object.freeze(input);
      simulate(input, mode, 2);
      equal(JSON.stringify(input), before);
    });
    test(`${mode}: invariant checks on 40 deterministic workloads`, () => {
      for (let trial = 0; trial < 40; trial++) {
        const input = Array.from({ length: trial % 9 + 1 }, (_, i) => p(`X${i}`, (trial * 7 + i * 13) % 25, (trial + i * 5) % 9 + 1, (trial + i * 3) % 4 + 1));
        invariants(input, simulate(input, mode, trial % 5 + 1));
      }
    });
  });
  test("FCFS: sorts unsorted arrivals without reordering metrics", () => {
    const r = simulate([p("Late", 2, 1), p("First", 0, 3), p("Middle", 1, 1)], "fcfs");
    equal(timeline(r), [["First", 0, 3], ["Middle", 3, 4], ["Late", 4, 5]]);
    checkMetrics(r, [[4, 5, 3, 2, 2], [0, 3, 3, 0, 0], [3, 4, 3, 2, 2]]);
  });
  test("SJF: simultaneous arrivals choose the shortest burst", () => {
    const r = simulate([p("A", 0, 4), p("B", 0, 1), p("C", 0, 2)], "sjf");
    equal(timeline(r), [["B", 0, 1], ["C", 1, 3], ["A", 3, 7]]);
    checkMetrics(r, [[3, 7, 7, 3, 3], [0, 1, 1, 0, 0], [1, 3, 3, 1, 1]]);
  });
  ["sjf", "priority"].forEach(mode => {
    test(`${mode}: equal choices favor earlier arrival over row order`, () => {
      const r = simulate([p("Later", 2, 1), p("Earlier", 1, 1), p("Runner", 0, 4)], mode);
      equal(timeline(r), [["Runner", 0, 4], ["Earlier", 4, 5], ["Later", 5, 6]]);
      checkMetrics(r, [[5, 6, 4, 3, 3], [4, 5, 4, 3, 3], [0, 4, 4, 0, 0]]);
    });
    test(`${mode}: does not preempt the running process`, () => {
      const r = simulate([p("A", 0, 5, 10), p("B", 1, 1, 1)], mode);
      equal(timeline(r), [["A", 0, 5], ["B", 5, 6]]);
    });
  });
  test("Priority: smaller priority number wins among ready processes", () => {
    const r = simulate([p("A", 0, 2, 3), p("B", 0, 3, 1), p("C", 0, 1, 2)], "priority");
    equal(timeline(r), [["B", 0, 3], ["C", 3, 4], ["A", 4, 6]]);
    checkMetrics(r, [[4, 6, 6, 4, 4], [0, 3, 3, 0, 0], [3, 4, 4, 3, 3]]);
  });
  test("Round Robin: quantum 1 rotates simultaneous arrivals", () => {
    const r = simulate([p("A", 0, 2), p("B", 0, 2)], "rr", 1);
    equal(timeline(r), [["A", 0, 1], ["B", 1, 2], ["A", 2, 3], ["B", 3, 4]]);
    checkMetrics(r, [[0, 3, 3, 1, 0], [1, 4, 4, 2, 1]]);
  });
  test("Round Robin: endpoint arrival precedes requeued process", () => {
    const r = simulate([p("A", 0, 4), p("B", 2, 1)], "rr", 2);
    equal(timeline(r), [["A", 0, 2], ["B", 2, 3], ["A", 3, 5]]);
    checkMetrics(r, [[0, 5, 5, 1, 0], [2, 3, 1, 0, 0]]);
  });
  test("Round Robin: waiting processes precede arrivals; arrivals are chronological", () => {
    const input = [p("A", 0, 4), p("B", 0, 1), p("Late", 2, 1), p("Early", 1, 1)];
    const r = simulate(input, "rr", 2);
    equal(timeline(r), [["A", 0, 2], ["B", 2, 3], ["Early", 3, 4], ["Late", 4, 5], ["A", 5, 7]]);
    checkMetrics(r, [[0, 7, 7, 3, 0], [2, 3, 3, 2, 2], [4, 5, 3, 2, 2], [3, 4, 3, 2, 2]]);
  });
  test("Round Robin: quantum greater than every burst behaves as FCFS", () => {
    const r = simulate(fixture, "rr", 100);
    equal(timeline(r), [["P1", 0, 5], ["P2", 5, 8], ["P3", 8, 9]]);
    checkMetrics(r, [[0, 5, 5, 0, 0], [5, 8, 7, 4, 4], [8, 9, 7, 6, 6]]);
  });
  test("Round Robin: consecutive slices are preserved", () => {
    const r = simulate([p("A", 0, 5)], "rr", 2);
    equal(timeline(r), [["A", 0, 2], ["A", 2, 4], ["A", 4, 5]]);
    checkMetrics(r, [[0, 5, 5, 0, 0]]);
  });
  test("Limits: maximum 20-process workload and 2000 quantum-1 slices", () => {
    const input = Array.from({ length: 20 }, (_, i) => p(`P${i + 1}`, 1000, 100, 100));
    const r = simulate(input, "rr", 1);
    equal(r.timeline.length, 2001);
    equal(r.timeline[r.timeline.length - 1].end, 3000);
    invariants(input, r);
  });

  test("Validation: empty, oversized, and non-array process collections", () => {
    [[], null, {}, Array.from({ length: 21 }, (_, i) => p(`P${i}`, 0, 1))].forEach(input => throws(() => simulate(input, "fcfs"), "1 and 20"));
  });
  test("Validation: unsupported algorithm and invalid process objects", () => {
    throws(() => simulate(fixture, "unknown"), "supported");
    throws(() => simulate([null], "fcfs"), "object");
  });
  test("Validation: empty and duplicate process IDs", () => {
    ["", " ", null, 1].forEach(id => throws(() => simulate([p(id, 0, 1)], "fcfs"), "IDs"));
    throws(() => simulate([p("A", 0, 1), p("A", 1, 1)], "fcfs"), "IDs");
  });
  ["arrival", "burst", "priority", "quantum"].forEach(field => {
    test(`Validation: ${field} rejects blanks, strings, non-finite, fractional and out-of-range values`, () => {
      const max = field === "arrival" ? 1000 : 100;
      const invalid = [undefined, null, "", "2", NaN, Infinity, -Infinity, 1.5, -1, max + 1];
      if (field !== "arrival") invalid.push(0);
      invalid.forEach(value => {
        const process = p("A", 0, 1);
        if (field !== "quantum") process[field] = value;
        throws(() => simulate([process], field === "priority" ? "priority" : field === "quantum" ? "rr" : "fcfs", field === "quantum" ? value : 2), "integer");
      });
    });
  });
  test("Validation: priority and quantum are ignored when not applicable", () => {
    ["fcfs", "sjf"].forEach(mode => simulate([p("A", 0, 1, "invalid")], mode, "invalid"));
    simulate([p("A", 0, 1, "invalid")], "rr", 1);
    simulate([p("A", 0, 1, 1)], "priority", "invalid");
  });

  test("Playback: starts with P1 running and later arrivals unrevealed", () => {
    const model = root.CPUPlayback.create(fixture, simulate(fixture, "fcfs"), "fcfs");
    const f = model.frame(0);
    equal(f.runningId, "P1");
    equal(f.ready, []);
    equal(f.states.map(p => p.state), ["running", "upcoming", "upcoming"]);
    equal(f.states.map(p => p.used), [0, 0, 0]);
    equal(f.complete, false);
    equal(f.nextEvent, 1);
  });
  test("Playback: partial execution and mid-slice arrivals", () => {
    const f = root.CPUPlayback.create(fixture, simulate(fixture, "fcfs"), "fcfs").frame(1.5);
    equal(f.ready, ["P2"]);
    equal(f.states.map(p => p.state), ["running", "ready", "upcoming"]);
    equal(f.states.map(p => p.used), [1.5, 0, 0]);
    equal(f.states[0].remaining, 3.5);
  });
  test("Playback: Round Robin endpoint arrivals precede the returning process", () => {
    const f = root.CPUPlayback.create(fixture, simulate(fixture, "rr", 2), "rr").frame(2);
    equal(f.runningId, "P2");
    equal(f.ready, ["P3", "P1"]);
    equal(f.states.map(p => p.state), ["ready", "running", "ready"]);
    equal(f.states.map(p => p.used), [2, 0, 0]);
  });
  test("Playback: Round Robin retains FIFO order at later boundaries", () => {
    const model = root.CPUPlayback.create(fixture, simulate(fixture, "rr", 2), "rr");
    const f = model.frame(4);
    equal(f.runningId, "P3");
    equal(f.ready, ["P1", "P2"]);
    equal(f.states.map(p => p.used), [2, 2, 0]);
    equal(model.frame(6.5).states.map(p => p.used), [3.5, 2, 1]);
  });
  test("Playback: SJF orders only ready processes by burst", () => {
    const f = root.CPUPlayback.create(fixture, simulate(fixture, "sjf"), "sjf").frame(3);
    equal(f.runningId, "P1");
    equal(f.ready, ["P3", "P2"]);
    equal(f.completedCount, 0);
  });
  test("Playback: Priority orders the ready queue by priority", () => {
    const input = [p("A", 0, 5, 1), p("B", 1, 1, 9), p("C", 2, 2, 2)];
    const f = root.CPUPlayback.create(input, simulate(input, "priority"), "priority").frame(3);
    equal(f.runningId, "A");
    equal(f.ready, ["C", "B"]);
  });
  test("Playback: CPU idle state handles initial and intermediate gaps", () => {
    const input = [p("A", 3, 1), p("B", 8, 1)];
    const model = root.CPUPlayback.create(input, simulate(input, "fcfs"), "fcfs");
    equal(model.frame(0).states.map(p => p.state), ["upcoming", "upcoming"]);
    const f = model.frame(5);
    equal(f.runningId, null);
    equal(f.ready, []);
    equal(f.states.map(p => p.state), ["completed", "upcoming"]);
    equal(f.nextEvent, 8);
  });
  test("Playback: final frame completes every process without exposing future work early", () => {
    const model = root.CPUPlayback.create(fixture, simulate(fixture, "rr", 2), "rr");
    equal(model.frame(8.5).complete, false);
    equal(model.frame(8.5).completedCount, 2);
    const f = model.frame(9);
    equal(f.complete, true);
    equal(f.runningId, null);
    equal(f.ready, []);
    equal(f.states.map(p => p.used), [5, 3, 1]);
    equal(f.states.map(p => p.state), ["completed", "completed", "completed"]);
    equal(f.completedCount, 3);
  });
  test("Playback: Next event stops at arrivals and allocation boundaries", () => {
    const model = root.CPUPlayback.create(fixture, simulate(fixture, "rr", 2), "rr");
    equal([0, 1, 2, 4, 5, 7, 8, 9].map(time => model.frame(time).nextEvent), [1, 2, 4, 5, 7, 8, 9, 9]);
  });
  test("Playback: time is clamped and non-finite values are rejected", () => {
    const model = root.CPUPlayback.create(fixture, simulate(fixture, "fcfs"), "fcfs");
    equal(model.frame(-1).time, 0);
    equal(model.frame(100).time, 9);
    [NaN, Infinity, undefined].forEach(value => throws(() => model.frame(value), "finite"));
  });
  test("Playback: seeking backwards returns the same queue and consumed CPU time", () => {
    const model = root.CPUPlayback.create(fixture, simulate(fixture, "rr", 2), "rr");
    const before = model.frame(2);
    model.frame(9);
    equal(model.frame(2), before);
  });
  test("Playback: frames never mutate engine results or original processes", () => {
    const result = simulate(fixture, "rr", 2);
    const before = JSON.stringify({ fixture, result });
    const model = root.CPUPlayback.create(fixture, result, "rr");
    [0, 1.5, 5, 9].forEach(time => model.frame(time));
    equal(JSON.stringify({ fixture, result }), before);
  });
  test("Playback: activity order shows arrival before quantum rotation and dispatch", () => {
    const f = root.CPUPlayback.create(fixture, simulate(fixture, "rr", 2), "rr").frame(2);
    equal(f.events.slice(-3).map(event => event.type), ["arrival", "rotate", "dispatch"]);
    assert(f.events.every(event => event.time <= 2), "Future events leaked into the activity feed.");
  });
  modes.forEach(mode => {
    test(`Playback ${mode}: ready states and consumption match actual timeline at 36 checkpoints`, () => {
      const input = [p("A", 4, 7, 2), p("B", 0, 3, 3), p("C", 9, 2, 1), p("D", 2, 5, 1)];
      const result = simulate(input, mode, 2);
      const model = root.CPUPlayback.create(input, result, mode);
      for (let i = 0; i <= 35; i++) {
        const time = model.duration * i / 35;
        const f = model.frame(time);
        f.states.forEach(state => {
          const expected = result.timeline.filter(s => s.processId === state.id).reduce((sum, s) => sum + Math.max(0, Math.min(time, s.end) - s.start), 0);
          assert(Math.abs(state.used - expected) < 1e-8, "CPU progress differs from actual allocations.");
          assert(state.remaining >= 0, "Remaining burst cannot be negative.");
        });
        equal([...f.ready].sort(), f.states.filter(p => p.state === "ready").map(p => p.id).sort());
        assert(!f.ready.includes(f.runningId), "Running process cannot be in the ready queue.");
      }
    });
  });

  test("SRTF: repeated interruptions, resumption and final metrics", () => {
    const r = simulate(fixture, "srtf");
    equal(timeline(r), [["P1", 0, 1], ["P2", 1, 2], ["P3", 2, 3], ["P2", 3, 5], ["P1", 5, 9]]);
    checkMetrics(r, [[0, 9, 9, 4, 0], [1, 5, 4, 1, 0], [2, 3, 1, 0, 0]]);
    equal(r.averages, { turnaround: 14 / 3, waiting: 5 / 3, response: 0 });
  });
  test("SRTF: a longer arrival does not split uninterrupted execution", () => {
    const r = simulate([p("A", 0, 4), p("B", 1, 8)], "srtf");
    equal(timeline(r), [["A", 0, 4], ["B", 4, 12]]);
    checkMetrics(r, [[0, 4, 4, 0, 0], [4, 12, 11, 3, 3]]);
  });
  test("SRTF: equal remaining time keeps the running process", () => {
    const r = simulate([p("A", 0, 5), p("B", 2, 3)], "srtf");
    equal(timeline(r), [["A", 0, 5], ["B", 5, 8]]);
    checkMetrics(r, [[0, 5, 5, 0, 0], [5, 8, 6, 3, 3]]);
  });
  test("SRTF: shortest remaining time is different from original burst", () => {
    const input = [p("A", 0, 10), p("B", 6, 2), p("C", 7, 5)];
    const r = simulate(input, "srtf");
    equal(timeline(r), [["A", 0, 6], ["B", 6, 8], ["A", 8, 12], ["C", 12, 17]]);
    checkMetrics(r, [[0, 12, 12, 2, 0], [6, 8, 2, 0, 0], [12, 17, 10, 5, 5]]);
    equal(root.CPUPlayback.create(input, r, "srtf").frame(7.5).ready, ["A", "C"]);
  });
  test("Preemptive Priority: higher priority interrupts and unfinished work resumes", () => {
    const r = simulate(fixture, "priority-preemptive");
    equal(timeline(r), [["P1", 0, 1], ["P2", 1, 4], ["P1", 4, 8], ["P3", 8, 9]]);
    checkMetrics(r, [[0, 8, 8, 3, 0], [1, 4, 3, 0, 0], [8, 9, 7, 6, 6]]);
    equal(r.averages, { turnaround: 6, waiting: 3, response: 2 });
  });
  test("Preemptive Priority: equal or lower priority does not interrupt", () => {
    const r = simulate([p("A", 0, 4, 2), p("B", 1, 1, 2), p("C", 2, 1, 3)], "priority-preemptive");
    equal(timeline(r), [["A", 0, 4], ["B", 4, 5], ["C", 5, 6]]);
    checkMetrics(r, [[0, 4, 4, 0, 0], [4, 5, 4, 3, 3], [5, 6, 4, 3, 3]]);
  });
  test("Preemptive Priority: nested interruptions retain exact remaining bursts", () => {
    const input = [p("A", 0, 6, 3), p("B", 1, 4, 2), p("C", 2, 1, 1)];
    const r = simulate(input, "priority-preemptive");
    equal(timeline(r), [["A", 0, 1], ["B", 1, 2], ["C", 2, 3], ["B", 3, 6], ["A", 6, 11]]);
    checkMetrics(r, [[0, 11, 11, 5, 0], [1, 6, 5, 1, 0], [2, 3, 1, 0, 0]]);
  });
  ["srtf", "priority-preemptive"].forEach(mode => {
    test(`${mode}: simultaneous arrivals choose correctly without a zero-length turn`, () => {
      const input = [p("A", 0, 5, 3), p("B", 0, 2, 1), p("C", 0, 3, 2)];
      const r = simulate(input, mode);
      equal(timeline(r), [["B", 0, 2], ["C", 2, 5], ["A", 5, 10]]);
      invariants(input, r);
    });
    test(`${mode}: completion exactly at an arrival is not a preemption`, () => {
      const input = [p("A", 0, 2, 3), p("B", 2, 1, 1)];
      const r = simulate(input, mode);
      equal(timeline(r), [["A", 0, 2], ["B", 2, 3]]);
      const f = root.CPUPlayback.create(input, r, mode).frame(2);
      equal(f.states.map(p => p.state), ["completed", "running"]);
      assert(!f.events.some(event => event.type === "preempt"), "A finished process cannot be preempted.");
    });
    test(`${mode}: every executed unit satisfies the scheduling policy across 60 workloads`, () => {
      for (let trial = 0; trial < 60; trial++) {
        const input = Array.from({ length: 6 }, (_, i) => p(`X${i}`, (trial * 7 + i * 11) % 15, (trial + i * 3) % 10 + 1, (trial + i * 5) % 4 + 1));
        const r = simulate(input, mode);
        const used = new Map(input.map(process => [process.id, 0]));
        r.timeline.forEach(segment => {
          for (let time = segment.start; time < segment.end; time++) {
            if (segment.processId === null) continue;
            const current = input.find(process => process.id === segment.processId);
            const currentKey = mode === "srtf" ? current.burst - used.get(current.id) : current.priority;
            input.filter(process => process.arrival <= time && used.get(process.id) < process.burst).forEach(process => {
              const key = mode === "srtf" ? process.burst - used.get(process.id) : process.priority;
              assert(currentKey <= key, "CPU ignored a strictly better ready process.");
            });
            used.set(current.id, used.get(current.id) + 1);
          }
        });
        invariants(input, r);
      }
    });
    test(`Playback ${mode}: interrupted process is ready with its exact remaining work`, () => {
      const input = [p("A", 0, 5, 3), p("B", 1, 2, 1)];
      const r = simulate(input, mode);
      const f = root.CPUPlayback.create(input, r, mode).frame(1);
      equal(f.runningId, "B");
      equal(f.ready, ["A"]);
      equal(f.states.map(p => [p.state, p.remaining]), [["ready", 4], ["running", 2]]);
      const event = f.events.find(event => event.type === "preempt");
      assert(event && event.text.includes("A was preempted by B"), "Missing interruption explanation.");
      equal(f.events.slice(-3).map(event => event.type), ["arrival", "preempt", "dispatch"]);
    });
  });
  test("Validation: preemptive Priority validates priority while SRTF ignores it", () => {
    [undefined, "", 0, -1, 1.5, Infinity, 101].forEach(priority => {
      throws(() => simulate([{ ...p("A", 0, 1), priority }], "priority-preemptive"), "priority");
    });
    simulate([p("A", 0, 1, "ignored")], "srtf", "ignored");
  });

  root.CPUTestResults = results;
  if (typeof document !== "undefined") {
    const passed = results.filter(result => result.pass).length;
    const summary = document.getElementById("test-summary");
    summary.textContent = `${passed} / ${results.length} checks passed${passed === results.length ? " — all checks passed." : " — review failures below."}`;
    summary.classList.add(passed === results.length ? "test-pass" : "test-fail");
    results.forEach(result => {
      const item = document.createElement("li");
      item.className = result.pass ? "test-pass" : "test-fail";
      item.textContent = `${result.pass ? "PASS" : "FAIL"} · ${result.name}`;
      if (!result.pass) {
        const detail = document.createElement("span");
        detail.className = "test-error";
        detail.textContent = result.error;
        item.append(detail);
      }
      document.getElementById("test-results").append(item);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);

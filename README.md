# Dispatch — CPU Scheduling Simulator and Visualizer

A dependency-free SPOS mini-project built with HTML, CSS, and vanilla JavaScript. All calculations happen locally. No installation, account, internet connection, or development server is needed.

## Repository and GitHub Pages

Source repository: [vikrantraje14-debug/SPOS](https://github.com/vikrantraje14-debug/SPOS).

The project is ready for GitHub Pages without a build step. Use **Deploy from a branch**, branch **main**, folder **/ (root)**. The `.nojekyll` file makes this a plain static site. All asset links are relative so the site also works under the `/SPOS/` project path. Source updates pushed to the configured branch are published by GitHub Pages automatically once Pages is enabled.

The local `Dispatch.zip` archive is excluded from Git; the actual website files and test suite are tracked directly.

## Run on Windows

1. Open `D:\SPOS LAB` in File Explorer.
2. Double-click `index.html`, or right-click it and choose **Open with → Microsoft Edge / Google Chrome**.
3. Use the example processes or enter your own. Choose an algorithm and click **Run simulation** to start animated execution.
4. Watch the ready queue, active CPU, per-process progress, and execution timeline. Final metrics appear only after execution finishes.
5. Use **Pause / Resume**, **Next event**, and **0.5×–16× speed** to explore the schedule. **Next event** pauses playback and advances to the next arrival or allocation boundary. It is useful for long idle gaps.
6. **Skip to results** deliberately finishes playback immediately. After completion, **Replay** starts the same workload again.
7. Hover or focus visible timeline blocks to inspect their allocations. Use **Follow CPU** to control automatic horizontal scrolling.

Open `tests.html` to run the automated scheduling checks. The page shows a total and individual PASS/FAIL results. Reload to rerun. A failure displays expected/actual details where applicable. These tests check engine calculations and validation; they do not replace manual browser interaction checks.

Optional: with Node.js installed, run the exact same engine tests from PowerShell:

```powershell
node -e "require('./scheduler.js');require('./playback.js');require('./tests.js');const r=globalThis.CPUTestResults;console.log(r);console.log(r.filter(t=>t.pass).length+'/'+r.length+' passed');if(r.some(t=>!t.pass))process.exitCode=1;"
```

## File responsibilities

| File | Purpose |
| --- | --- |
| `index.html` | Semantic simulator structure and controls |
| `style.css` | Responsive dashboard, tables, timeline, and test page styles |
| `scheduler.js` | Pure input validation, four algorithms, and shared metrics calculation |
| `playback.js` | Pure timeline snapshots: queue order, process states, progress, and scheduler events |
| `app.js` | Editable queue, validation, animation clock, playback controls, and result rendering |
| `tests.html` | Offline test runner interface |
| `tests.js` | Hand-calculated regression fixtures, error tests, and invariant checks |
| `README.md` | Setup, assumptions, algorithm conventions, and demonstration guide |

## Model and limits

- One CPU; one CPU burst per process; integer time units.
- No I/O, priority aging, or context-switch overhead.
- 1–20 processes; arrival 0–1000; burst 1–100.
- Priority and Round Robin quantum: 1–100.
- Priority is validated only for Priority Scheduling. Quantum is validated only for Round Robin.
- IDs are automatic and read-only; deleting a row never renumbers the remaining rows. Reset/example loading intentionally starts a new queue at P1.
- Initial state is the three-process example, FCFS selected, quantum 2, with no results.
- Load Example preserves the selected algorithm. Reset restores the complete initial state.
- Changing any workload input or algorithm cancels playback and clears results. Simulate again to see the updated workload. Speed and Follow CPU controls do not invalidate the workload.

## Scheduling conventions

**FCFS:** earliest arrival first; equal arrivals use input order.

**SJF (non-preemptive):** select the shortest burst among arrived processes. Ties use arrival time, then input order. A running process finishes even if a shorter process arrives.

**Priority (non-preemptive):** select the smallest priority number among arrived processes. Ties use arrival time, then input order. A running process finishes even if a higher-priority process arrives.

**Round Robin:** use a FIFO ready queue. Run at most one quantum, then enqueue arrivals in chronological order (input order for equal arrivals), including those exactly at the endpoint, before returning the unfinished running process to the queue. Processes already waiting remain ahead of newcomers. Consecutive allocations of the same process remain separate timeline blocks.

The timeline begins at 0 and explicitly records Idle periods until the next arrival. There is no trailing idle time. Every chart uses one consistent pixels-per-time-unit scale; short intervals are not widened to fit labels. Large Round Robin workloads can require extensive horizontal scrolling (up to 2000 slices under the stated limits).

## Calculations

- Completion: end of a process's final allocation.
- Turnaround = completion − arrival.
- Waiting = turnaround − burst.
- Response = first start − arrival.

One shared function derives all process metrics from each algorithm's timeline. Averages retain full precision internally and display two decimal places. Results stay in original input order.

The pure API is `window.CPUScheduler.simulate(processes, algorithm, quantum)`. Algorithm values: `fcfs`, `sjf`, `priority`, `rr`. Invalid inputs throw descriptive errors. Inputs are copied, never mutated. The returned object contains `timeline`, `metrics`, and `averages`; idle timeline entries have `processId: null`.

## How the animation works

The engine calculates the correct schedule first. A separate pure API, `window.CPUPlayback.create(processes, result, algorithm)`, converts that schedule into a view at any simulated time using `.frame(time)`. The UI reveals that schedule gradually rather than exposing final results immediately. Playback is a visualization of the simulation, not real operating-system process execution.

At 1× speed, one simulated time unit takes 700 milliseconds. The animation clock uses `requestAnimationFrame`; process progress, CPU state, Gantt fills, and the ready queue all use the same simulated time. Allocation checkpoints preserve Round Robin FIFO queue order, including arrivals during a slice and exactly at its endpoint.

The stage includes moving data packets, a CPU orbit/glow, arriving queue tokens, live process states, a recent activity feed, a moving timeline cursor, and a completion reveal. Upcoming processes and ready processes are distinct states. Future timeline blocks and final metrics remain hidden during playback. CSS decorative motion respects `prefers-reduced-motion`; the educational playback remains controllable.

Pausing freezes simulated time. Next event advances to the next meaningful boundary and stays paused. Replay restarts from zero. Reset, repeated runs, and edits cancel the previous animation frame, preventing concurrent players. Switching to another tab automatically pauses playback; resume when ready.

## Two-minute viva demonstration

1. Introduce the problem: several ready processes share one CPU; the scheduler determines which process runs next.
2. Run the default FCFS example. Pause when P2 arrives and point out that it waits while P1 continues. Resume to show P1 0–5, P2 5–8, P3 8–9. Explain P3's final waiting time: 8 − 2 = 6.
3. Switch to SJF and run again. Explain why P1 still runs first (only P1 has arrived at 0), then P3 precedes P2 at time 5.
4. Switch to Round Robin, quantum 2. Use Next event to trace the ready queue and show P1 returning behind endpoint arrivals. After playback, show P1 completing at 9, P2 at 8, P3 at 5. Explain response time versus waiting time.
5. Select Priority and change priorities to demonstrate smaller numbers winning among ready processes.
6. Set all arrival times above 0 to demonstrate initial CPU idle time. Enter an invalid burst to demonstrate inline validation.
7. Open Algorithm tests to show regression checks. Explain the separation between the pure engine and the UI.

## Verification boundaries

The test page includes explicit timelines/metrics, scheduling tie cases, API validation, frozen input checks, 160 deterministic workload invariant checks, and the maximum-size Round Robin workload. Browser layout and interaction checks must be reported separately from engine tests. No finite test suite guarantees that software has no bugs.

### Build verification (17 October 2026)

- Executed the engine and playback model test suite with Node.js: **62/62 checks passed**. The 17 playback checks cover partial progress, queue order, event boundaries, idle states, completion, seeking, and state consistency.
- JavaScript syntax and local HTML/script/stylesheet references were checked separately.
- Live browser verification was unavailable: the in-app browser rejected `file:` URLs under its security policy. Therefore desktop/mobile layout, real browser interactions, offline opening, and keyboard tooltips still require manual confirmation. No live browser pass is claimed.

Manual browser checklist:

1. Open `index.html` and confirm the three example rows and empty results.
2. Run FCFS. Confirm the CPU animates and metrics stay hidden until completion. Repeat the run; each completion should show exactly three result rows and three allocations.
3. Switch to SJF, Priority, and Round Robin. Previous results should disappear, and priority/quantum inputs should appear only when applicable.
4. Add a row, delete an intermediate row, then add another. Existing IDs must stay unchanged; the new ID must be unique.
5. Enter a blank, zero burst, negative arrival, fraction, and oversized value. Each relevant field must show an error on submission.
6. Switch from an invalid Priority input to FCFS. The hidden priority must not block FCFS.
7. Verify Load Example preserves the algorithm and Reset restores FCFS, quantum 2, the original three rows, and empty results.
8. At browser viewport widths 375px and 1440px, check that the page itself does not scroll sideways. Long tables/charts should scroll inside their own containers.
9. Tab through controls and visible timeline blocks; confirm visible focus, detail tooltips, and Escape dismissal.
10. Open `tests.html` offline and confirm 62/62 checks pass in your browser.
11. Pause for several seconds; simulated time must remain frozen. Resume, change speed, and verify the CPU, progress bars, and Gantt cursor stay synchronized.
12. Use Next event and verify that playback stays paused. Skip to results should finish immediately; Replay must hide final metrics and start from zero.
13. Change inputs, reset, or restart while playing. The previous animation must stop, and no old results may reappear.
14. Switch browser tabs during playback and return. It should stay paused until Resume is clicked.
15. Check reduced-motion browser settings: decorative orbit/glow/token animations should stop; scheduling playback and controls must remain usable.

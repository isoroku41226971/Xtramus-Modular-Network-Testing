# XMNT — Web app

A browser version of XMNT (Xtramus Modular Network Testing). It ports the [Python app](../python-app/)'s engine to JavaScript and wraps it in a UI where tests are composed instead of coded:

**pick a test → tune its modules → add it to the queue → run → export a PDF / Excel report**

## Features

- **11 presets**: 10 matching the Python hardware scripts (the 8 RFC-2889 tests plus FullyMesh / ManyToMany) and one for PCAP replay, or a blank item assembled from scratch across the five recipe dimensions (topology, learning, stream, trigger, reader).
- **A guarded editor**: incompatible module combinations (the Python app's documented pitfalls) are blocked before anything runs, with an explanation of why, instead of failing mid-run.
- **A test queue** with drag-to-reorder, live progress, and per-round logs for convergence tests.
- **Port leasing**: ports are picked once per project and leased for the whole session, so several browser tabs cannot grab the same ports.
- **Project files** (`.xmnt`) saved and reopened via the File System Access API, with a download fallback in browsers that lack it.
- **Reports** exported as PDF and Excel, generated entirely in the browser by hand-written PDF / OOXML / ZIP writers.
- **Custom packet replay**: import a `.pcap` / `.pcapng` capture and replay its frames byte for byte. Captures can be built in the companion [Packet Studio](https://github.com/isoroku41226971/Xtramus-packet-studio).

## Same logic as the Python app

The web app does not reimplement XMNT; it carries the [Python app](../python-app/)'s logic over to JavaScript unchanged:

- **Algorithm layer**: the same binary-search and linear convergence (including the "drop 20%, then close in" step), the same single-verdict and measurement shapes, and the same six check functions with the same percent-scale loss threshold (plus `checkPureSend`, used only by the web-only PCAP replay).
- **Recipes**: the same five dimensions, module names, field names and default values, and the same compatibility rules.
- **Connection layer**: the same resolution of topology, streams and learning, emitting the same sequence of NuPython-level commands for a given recipe.
- **Numbers**: Python's `round()` (round-half-to-even on the exact double value) is reimplemented in `engine/py-compat.js`, because JavaScript's rounding differs and would change convergence results.

Field and result names keep Python's `snake_case`, so a config or result from one app reads the same in the other. The only intended differences are additions and robustness: PCAP replay exists only in the web app, and when one frame size fails, the web app keeps the results of the others, while the Python app loses the whole batch.

## Design constraints

The app has to run from a company web server that serves static files only. That rules out a backend and a build step, so:

- Plain ES modules and CSS, with **zero npm dependencies and no bundler**. The source files are what the browser loads.
- Node.js was used only for development and testing; the test suite is not included in this repository.

## Architecture

```
web-app/
  engine/     JavaScript port of the Python engine; no DOM
    convergence.js, checks.js, assembly.js, config.js    algorithm layer
    primitives.js, backend.js, recipe-spec.js,
    recipe-assembly.js, mac-vary.js                       connection layer
    catalog.js                                            module catalog, compatibility rules, presets
    emitter/                                              command emitters (recording / replay / JSON channel)
    capture-parser.js                                     PCAP / PCAPNG parser
    pdf-writer.js, pdf-chart.js, xlsx-writer.js, zip-writer.js   report writers
  ui/         pure logic (store, queue, runner, formatting, validation messages) kept
              separate from thin DOM view-*.js files
  index.html, workspace.html    home page and workspace
  tools/devserver.py            static dev server with caching disabled
```

Key design decisions:

- **The engine is a faithful port.** Module names, field names and defaults follow the Python app exactly, and the connection layer emits the same sequence of NuPython-level commands.
- **Commands are batched before they reach the wire.** NuPython's `config_*` calls only change a local struct; the JS side keeps its own copy of that struct and sends JSON only for the operations that actually reach the chassis, carrying the full state with each. This is designed to cut one Forwarding iteration from about 30 round trips to an estimated 8, and the channel keeps no per-session stream state.
- **Errors are typed by how they are handled**: `ConfigError` (invalid recipe, blocked before any command), `ChannelError` (network/lease problems, retryable), `DeviceError` (chassis faults such as link down, not retried automatically).

## How the port was verified

- The algorithm layer's tests were translated from the Python test suite.
- The connection layer was checked against complete command sequences recorded from the Python engine for each hardware test recipe: replaying a recipe in JavaScript must reproduce the recorded sequence call for call, and any divergence fails at the exact command where it happens. `engine/emitter/recording.js`, `replay.js` and `golden-transport.js` are that verification harness, and "golden recordings" in code comments refers to these Python recordings. (The recordings and the test suite are not part of this repository.)
- The UI was tested by hand in the browser across the whole workflow: building tests from presets and from scratch, the editor's blocked module combinations, queuing and reordering, running in simulation mode, saving and reopening projects, and exporting PDF / Excel reports.

## Running locally

```bash
cd web-app
python tools/devserver.py
```

Then open <http://127.0.0.1:8000>, turn on the **模擬模式** (simulation mode) toggle, and create a project. The UI text is in Traditional Chinese, the language of the tool's users. A simulated device stands in for the chassis, so every preset can be composed, run and exported with no hardware. (ES modules cannot load from `file://`, which is why a local server is needed; `tools/devserver.py` takes an optional port argument.)

## Status

In simulation mode the UI runs the ported algorithm layer against a simulated device (`ui/fake-dut.js`), so tests can be composed, queued, run and exported end to end. The ported connection layer (recipe assembly, backend and JSON channel emitter) is implemented and verified against the Python recordings, but the UI does not call it yet: driving a real chassis requires a small gateway service that exposes NuPython operations over HTTP. Its endpoints are specified by this project; the gateway itself is provided by Xtramus and is not part of this repository.

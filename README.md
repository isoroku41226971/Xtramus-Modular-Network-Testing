# XMNT — Xtramus Modular Network Testing

XMNT is a modular framework for automated network testing on Xtramus test chassis (such as the NuStreams-900). Instead of writing each test as a one-off script, a test is **assembled from interchangeable modules**: which ports to use, how the device under test (DUT) learns addresses, what traffic to send, how to trigger it, how to read results, and how to decide pass/fail. The current reference implementation is the full **RFC-2889** LAN switch benchmark suite, with all eight tests verified on real hardware.

> Published with permission from Xtramus. The code drives Xtramus test hardware and requires it to run.

The repository contains two implementations of the same design:

| | [Python app](python-app/) | [Web app](web-app/) |
|---|---|---|
| Role | Drives the chassis directly | Browser UI for composing, queuing and reporting tests |
| Stack | Python 3, standard library only | Plain ES modules + CSS, zero dependencies, no build step |
| Hardware | Talks to the chassis through the vendor NuPython SDK | Simulated device today; chassis access planned via an HTTP gateway (not included) |
| Status | All 8 RFC-2889 tests + mesh topologies verified on real hardware | Runs in simulation mode; connection layer ported but not yet wired to the UI |

The bugs that only appeared on real hardware, and how each was tracked down, are described in the Python app's [Engineering challenges](python-app/README.md#engineering-challenges).

## Key ideas

**Two layers, cleanly separated.**

- The **connection layer** knows how to talk to the chassis: configure streams, send learning frames, trigger transmission, read counters. It knows nothing about any particular test.
- The **algorithm layer** knows how to decide a result: a binary-search or linear convergence loop, a single pass/fail verdict, or a plain measurement. It never touches hardware, so the whole convergence logic can be run and tested with a simulated device.

**Declarative recipes.** Between the layers, a test is described as data, a recipe with five dimensions:

| Dimension | Examples |
|---|---|
| Topology | two ports, three ports with a monitor, many-to-many, full mesh |
| Learning | none, standard address learning, hardware-accelerated learning of thousands of MACs |
| Stream | unicast, broadcast, errored frames, above-line-rate pressure |
| Trigger | one port immediately, several ports in sync |
| Reader | port counters, monitor-port flooding, latency, per-pair matrices |

A generic assembler turns any valid combination into chassis operations, so a new test is a new combination of modules, not new connection code.

## Architecture

```
          Python app                            Web app
  ┌────────────────────────────┐      ┌────────────────────────────┐
  │ test scripts / template    │      │ editor · queue · reports   │
  ├────────────────────────────┤      ├────────────────────────────┤
  │ Algorithm layer            │      │ Algorithm layer (JS port)  │──► Simulated device
  │ convergence · verdicts     │      │                            │    (used today)
  ├────────────────────────────┤      ├────────────────────────────┤
  │ Recipe assembly            │      │ Recipe assembly (JS port)  │
  ├────────────────────────────┤      ├────────────────────────────┤
  │ Connection layer           │      │ Connection layer (JS port) │
  └─────────────┬──────────────┘      └─────────────┬──────────────┘
                │ NuPython SDK (TCP)                ┆ JSON over HTTP via a gateway
                ▼                                   ┆ (planned, not yet connected)
     Xtramus test chassis + DUT ◄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

The web app's engine is a JavaScript port of the Python engine, with the same module names, fields and defaults (plus a few web-only additions, such as PCAP replay). The ported connection layer was verified by recording the complete chassis command sequence the Python engine produces for each hardware test recipe and requiring the JavaScript engine to reproduce it call for call. Today the web UI runs the ported algorithm layer against a simulated device; the connection layer will be used once the gateway is available.

## Repository layout

- [`python-app/`](python-app/): the Python framework, the eight RFC-2889 test scripts, mesh topology demos, and a template for composing new tests.
- [`web-app/`](web-app/): the browser application: engine port, UI, and a local development server.

Each folder has its own README with architecture details and instructions for running it.

## Notes

- The NuPython SDK files in `python-app/` are © Xtramus and are included with the company's permission. Running tests against hardware requires an Xtramus chassis; the web app can be explored without one in simulation mode.
- Code, comments and documentation are in English. The web UI and the Python scripts' console and error messages are in Traditional Chinese, the language of the tools' users.
- Companion project: [Packet Studio](https://github.com/isoroku41226971/Xtramus-packet-studio), a browser-based packet builder by the same author. The capture files it exports can be replayed by the web app's custom packet replay.
- No open-source license is granted; all rights are reserved.
- Developed during an internship at Xtramus (July–August 2026).

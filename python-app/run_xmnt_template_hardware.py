"""
Shows how to compose a new RFC-2889 test by picking from the 5 declarative
connection-layer modules and the 3 algorithm-layer shapes.

The 8 production hardware scripts (run_rfc2889_forwarding_hardware.py and the rest)
are finished examples with their modules already chosen. Read them alongside this
template to see what a filled-in version looks like.

## Architecture overview

The system has two layers:

**Connection layer (5 dimensions that make up a PhysicalRecipeSpec)**: how to talk
to the chassis.
    1. Topology  - how many physical ports, and the role of each
    2. Learning  - how the DUT (device under test) is taught the MAC addresses the
                   test uses before the test starts
    3. Stream    - what the frames look like (unicast/broadcast/errored/pressure, ...)
    4. Trigger   - how sending is triggered (one port immediately, or several ports
                   in sync)
    5. Reader    - how results are read back (port counters / whether the monitor
                   port received anything / latency)

**Algorithm layer (3 assembly shapes)**: how to decide whether the test passed.
    - ConvergenceSpec  - a convergence loop that keeps adjusting one value (e.g.
                          loading %) to find the threshold between pass and fail
                          (e.g. Forwarding throughput, the Address Caching MAC limit)
    - SingleTestSpec   - one trial with a pass/fail verdict (e.g. Error Filtering)
    - MeasurementSpec  - one measurement with no verdict, just a number (e.g. the
                          Broadcast Latency value)

How the two layers connect:
    1. Pick the 5 dimensions and build a PhysicalRecipeSpec.
    2. Wrap the connection layer into the test_fn the algorithm layer needs with
       make_convergence_test_fn(recipe_spec) or make_single_test_fn(recipe_spec).
       Both detect simulate mode on their own.
    3. Put that test_fn (plus a check_fn where needed) into
       ConvergenceSpec/SingleTestSpec/MeasurementSpec.
    4. Call run_test_item(cfg, spec, backend=backend). It handles all three shapes
       and dispatches on the spec type, so you never pick the lower-level function
       yourself.

Usage:
    1. Replace the None values in the "Connection settings" section with your
       chassis IP and slots.
    2. Read the "Module menu" section and pick one option per dimension (or leave
       None where appropriate).
    3. Fill the chosen modules into main(), keep one of the three assembly shapes,
       and delete the other two.
    4. cd python-app && python run_xmnt_template_hardware.py
"""

from pprint import pprint

from xmnt_config import Config
from xmnt_checks import (
    check_loss_based,
    check_loss_based_with_detail,
    check_rx_zero,
    check_rx_zero_with_full_detail,
    check_monitor_received,
    check_monitor_received_with_detail,
)
from xmnt_assembly import ConvergenceSpec, SingleTestSpec, MeasurementSpec, run_test_item
from nupython_xmnt import NuPythonBackend
from nupython_xmnt_recipe_spec import (
    #topology
    OneToOneTopology,
    ManyToMany,
    FullyMesh,
    #learning
    NoLearningSpec,
    AddressLearningSpec,
    VaryingAddressAgedLearningSpec,
    #stream
    UnicastStreamSpec,
    BroadcastStreamSpec,
    MacSweepStreamSpec,
    ErrorSweepStreamSpec,
    PressureStreamSpec,
    #trigger
    ImmediateSingleKind,
    SynchronizedMultiKind,
    #reader
    PortCountersReaderKind,
    MonitorReceivedReaderKind,
    StreamLatencyReaderKind,
    PairwiseStreamReaderKind,
    #other
    PhysicalRecipeSpec,
)
from nupython_xmnt_recipe_assembly import make_convergence_test_fn, make_single_test_fn

# =============================================================================
# Connection settings: required, or the chassis cannot be reached
# =============================================================================

SERVER_IP = None    # TODO: chassis IP, e.g. "192.168.1.8"
TX_PORT = None       # TODO: (cid, bid, pid), e.g. (0, 7, 1)
RX_PORT = None       # TODO: (cid, bid, pid)

# Only needed for the matching Topology; otherwise leave None:
MONITOR_PORT = None  # only for OneToOneTopology.ThreePortMonitor (separate monitor port)
MESH_TX_PORTS = None  # only for ManyToMany(), e.g. (TX_PORT_1, TX_PORT_2)
MESH_RX_PORTS = None  # only for ManyToMany(), e.g. (RX_PORT_1,)
MESH_PORTS = None     # only for FullyMesh(), every port sends to every other, e.g. (PORT_1, PORT_2, PORT_3)

# =============================================================================
# Common parameters: only the matching StreamSpec uses them; harmless otherwise
# =============================================================================

GAP_BITS = 88                 # for PressureStreamSpec: a gap below the standard 96 bits
LOADING_PERCENT = 10.0        # fixed loading % for most StreamSpecs (None = driven by the convergence target)
UNDERSIZE_FRAMESIZE = 32      # for ErrorSweepStreamSpec: below the 64-byte legal minimum
OVERSIZE_FRAMESIZE = 1600     # for ErrorSweepStreamSpec: above the 1518-byte legal maximum (non-jumbo)


# =============================================================================
# Module menu: pick one option per dimension and fill it into main() below
# =============================================================================

# --- 1. Topology: how many physical ports, and the role of each ---
#
#   OneToOneTopology.TwoPort()          — 2 ports (tx + rx), the simplest one-to-one test.
#                         Most tests use it (Forwarding, Broadcast Forwarding,
#                         Error Filtering, Broadcast Latency).
#   OneToOneTopology.ThreePortMonitor() — 3 ports (tx + rx + monitor); the extra monitor
#                         port detects flooding. Used by Forwarding Pressure,
#                         Address Caching and Address Learning. Set MONITOR_PORT.
#   ManyToMany()          — N tx ports send to M rx ports, any number of each.
#                         Congestion Control (2 tx -> 1 rx) is a special case,
#                         paired with SynchronizedMultiKind to start all sources
#                         at once. Set MESH_TX_PORTS/MESH_RX_PORTS.
#   FullyMesh()            — N ports all send to each other (every port is both tx
#                         and rx). Set MESH_PORTS. Supports exactly what
#                         ManyToMany() supports (same underlying logic; only the
#                         port resolution differs).
#
#   Unsupported / mutually exclusive combinations (anything not listed is supported):
#     - mesh(ManyToMany/FullyMesh) + VaryingAddressAgedLearningSpec
#       → VaryingAddressAgedLearningSpec works only with OneToOneTopology
#     - OneToOneTopology + PairwiseStreamReaderKind
#       → PairwiseStreamReaderKind works only with mesh topologies
#     - mesh + StreamLatencyReaderKind with ErrorSweepStreamSpec/PressureStreamSpec
#       → latency can only be measured on unicast/broadcast frames
#         (UnicastStreamSpec/BroadcastStreamSpec)

# --- 2. LearningSpec: how the DUT learns MAC addresses before the test ---
#
#   NoLearningSpec()
#       — No learning step. Broadcast tests (all-ones destination) don't need one,
#         because the DUT floods them without a table lookup.
#   AddressLearningSpec()
#       — Standard unicast learning: send a learning frame from rx_port so the DUT
#         knows "rx_mac is on rx_port". Most unicast tests (Forwarding,
#         Congestion Control, ...) use it, so that any loss measured later is
#         really caused by congestion/filtering and not by an unknown
#         destination address.
#   VaryingAddressAgedLearningSpec(aging_time=..., mac_count=..., learning_loading=...)
#       — For Address Caching/Address Learning: teaches/tests many MACs at once
#         using the hardware DA/SA vary mechanism. With mac_count=None the MAC
#         count comes from the convergence target (target_now) (Address Caching);
#         with a fixed mac_count, leave learning_loading=None so the convergence
#         target drives the learning rate instead (Address Learning). Don't leave
#         both fields None or set both.

# --- 3. StreamSpec: what the frames look like ---
#
#   UnicastStreamSpec(loading=...)
#       — Standard unicast frames. With loading=None the rate is driven by the
#         convergence target (target_now), the usual ConvergenceSpec setup;
#         a fixed value means that fixed loading %.
#   BroadcastStreamSpec(loading=...)
#       — Broadcast frames (all-ones destination); loading works as above.
#   MacSweepStreamSpec(loading=10.0)
#       — Generates as many synthetic MACs as the convergence target asks for,
#         one stream per MAC (the older approach, without hardware vary).
#         Address Caching/Learning now use VaryingAddressAgedLearningSpec, so no
#         test currently uses this. In a mesh topology the real sender port's
#         MAC is used.
#   ErrorSweepStreamSpec(error_types=(...), loading=10.0, undersize_framesize=32, oversize_framesize=2000)
#       — Sends a set of errored frames (bad CRC / undersize / oversize /
#         alignment error), for Error Filtering. OneToOne produces a series of
#         ErrorStreams; a mesh topology produces MeshErrorStreams.
#   PressureStreamSpec(gap_bits=88)
#       — Uses a gap below the standard 96 bits to create traffic above line
#         rate, for Forwarding Pressure. OneToOne produces one PressureStream;
#         a mesh topology produces MeshPressureStreams (each tx port pressures
#         every other mesh port at once).

# --- 4. TriggerKind: how sending is triggered ---
#
#   ImmediateSingleKind()
#       — One port, triggered right after setup. Most tests use this.
#   SynchronizedMultiKind()
#       — Several ports triggered at once (via the chassis's global-start
#         broadcast command). Only needed when several source ports must apply
#         load at the same time, as in ManyToMany (Congestion Control is the
#         2 tx -> 1 rx special case).

# --- 5. ReaderKind: how results are read back ---
#
#   PortCountersReaderKind(aggregate="once", per_port_detail=False,
#                           keep_per_stream_results=False, use_stream_counters=False)
#       — Reads the tx/rx port frame counters and returns tx_packets/rx_packets.
#         Pair with check_loss_based (which needs tx_packets/rx_packets). Works
#         with OneToOne and mesh topologies (mesh sums over all ports).
#         per_port_detail=True also returns tx_packets_by_port (how much each
#         source port sent; Congestion Control uses it to check symmetry).
#         keep_per_stream_results=True also keeps each stream's raw result
#         (Error Filtering uses it to recover rx_packets per error type).
#         use_stream_counters=True reads the per-slot stream counters instead of
#         the port-wide counters: frames with injected CRC errors are not counted
#         by the port-wide counters, so this flag is needed to get correct numbers.
#   MonitorReceivedReaderKind(aggregate="once")
#       — Reads whether the monitor port received frames and returns
#         monitor_received (bool). Pair with check_monitor_received. Used by
#         Forwarding Pressure / Address Caching / Address Learning. Works with
#         any topology (it only depends on cfg.monitor_port being set).
#   StreamLatencyReaderKind()
#       — Reads stream-level latency. Has no matching check_fn; it is for
#         MeasurementSpec only (Broadcast Latency uses it: a pure measurement with
#         no verdict). OneToOne returns latency; a mesh topology returns the
#         per-pair matrix pairwise_latency_matrix (keyed by
#         (sender_port_idx, receiver_port_idx)). Works only with
#         UnicastStreamSpec/BroadcastStreamSpec (see the unsupported list above).
#   PairwiseStreamReaderKind()
#       — Mesh topologies only (see the unsupported list above). Reads the
#         per-slot counters for each (sender, receiver) pair and picks the result
#         shape from the stream type it is given: UnicastStreamSpec/
#         BroadcastStreamSpec produce pairwise_matrix (keyed by
#         (sender_port_idx, receiver_port_idx)), paired with
#         check_loss_based_with_detail; ErrorSweepStreamSpec produces
#         pairwise_error_matrix (the key adds error_type), paired with
#         check_rx_zero_with_full_detail.

# reader can also be a tuple that combines several readers, e.g.
# reader=(MonitorReceivedReaderKind(), PortCountersReaderKind())
# Forwarding Pressure uses this combination: it checks whether the monitor port
# received anything and uses the tx/rx counts to confirm the pressure traffic
# was really sent.


def main():
    # -------------------------------------------------------------------
    # Step 1: pick the 5 dimensions (from the module menu above, or leave None where appropriate)
    # -------------------------------------------------------------------
    topology = None       # TODO: e.g. OneToOneTopology.TwoPort()
    learning = None        # TODO: e.g. NoLearningSpec()
    stream = None           # TODO: e.g. UnicastStreamSpec()
    trigger = None          # TODO: e.g. ImmediateSingleKind()
    reader = None           # TODO: e.g. PortCountersReaderKind()

    for name, value in [
        ("topology", topology), ("learning", learning), ("stream", stream),
        ("trigger", trigger), ("reader", reader),
    ]:
        if value is None:
            raise ValueError(f"請先選擇 {name}——看上面「模組選單區」的說明")

    recipe_spec = PhysicalRecipeSpec(
        topology=topology, learning=learning, stream=stream, trigger=trigger, reader=reader,
    )

    # -------------------------------------------------------------------
    # Step 2: connection settings + other Config fields
    # -------------------------------------------------------------------
    if SERVER_IP is None or TX_PORT is None or RX_PORT is None:
        raise ValueError("請先填上面「連線設定」區的 SERVER_IP/TX_PORT/RX_PORT")

    cfg = Config(
        # --- Connection settings ---
        test_type="forwarding",    # TODO: one of VALID_TEST_TYPES for your test
                                    # (it only controls which fields validate() requires;
                                    # actual behavior is decided entirely by the modules)
        server_ip=SERVER_IP,
        tx_port=TX_PORT,
        rx_port=RX_PORT,
        tx_port2=None,                 
        monitor_port=MONITOR_PORT,     # None unless using OneToOneTopology.ThreePortMonitor
        mesh_tx_ports=MESH_TX_PORTS,   # None unless using ManyToMany()
        mesh_rx_ports=MESH_RX_PORTS,   # None unless using ManyToMany()
        mesh_ports=MESH_PORTS,         # None unless using FullyMesh()
        simulate=False,

        # --- Frame size sweep ---
        mode_framesize=0,          # 0 = custom list, 1 = sweep from start to stop
        framesize_custom=(64,),
        framesize_start=64,
        framesize_step=64,
        framesize_stop=1518,

        # --- Convergence target (used only by ConvergenceSpec; harmless for other shapes) ---
        mode_convergence=0,        # 0=binary search,1=linear/step
        target_min=1.0,
        target_max=100.0,
        target_now=50.0,
        target_step=2.0,
        target_resolution=0.01,
        target_acceptloss=0.005,   # percent scale (effectively zero loss)

        # --- Transmit mode ---
        mode_tx=0,                 # 0 = by time (tx_duration_time), 1 = by frame count (tx_burst_frames)
        tx_duration_time=2,        # seconds per trial; real runs typically use 60, kept short here for validation
        tx_burst_frames=10000,

        # --- Learning frames (used by AddressLearningSpec) ---
        learning_enabled=True,
        learning_frames=10,
        learning_gap_seconds=0.1,
        learning_settle_time=1.0,

        # --- Error Filtering only (used by ErrorSweepStreamSpec) ---
        error_types=("bad_crc", "undersize", "alignment", "oversize"),  

        # --- Address Caching only (used by VaryingAddressAgedLearningSpec) ---
        aging_time=60.0,           # for real runs, set this to the DUT's actual aging time

        # --- Address Learning only ---
        fixed_mac_count=None,      # the MAC limit converged by Address Caching

        # --- Connection timing parameters ---
        counter_clear_wait=0.2,
        counter_settle_time=1.0,
        counter_read_wait=1.0,
        arp_reply_config="arp_reply.csv",
        arp_reply_start_wait=1.0,
    )

    # -------------------------------------------------------------------
    # Step 3: keep one of the three assembly shapes and delete the other two
    # -------------------------------------------------------------------

    # --- (A) ConvergenceSpec: a convergence loop, suits most tests ---
    # The target_*/mode_convergence values below are read from cfg. To change the range, edit
    # the Config(...) lines above rather than hard-coding different numbers here.
    # spec = ConvergenceSpec(
    #     test_fn=make_convergence_test_fn(recipe_spec),
    #     check_fn=check_loss_based,  # TODO: use the check_fn that matches your reader
    #     result_key="throughput",    # TODO: use the result_key that matches what you converge on
    #     mode_convergence=cfg.mode_convergence,
    #     target_min=cfg.target_min,
    #     target_max=cfg.target_max,
    #     target_now=cfg.target_now,
    #     target_step=cfg.target_step,
    #     target_resolution=cfg.target_resolution,
    # )

    # --- (B) SingleTestSpec: one trial with a pass/fail verdict (e.g. Error Filtering) ---
    # spec = SingleTestSpec(
    #     test_fn=make_single_test_fn(recipe_spec),
    #     check_fn=check_rx_zero,  # TODO: use the check_fn that matches your reader
    # )

    # --- (C) MeasurementSpec: one measurement with no verdict (e.g. Broadcast Latency) ---
    # spec = MeasurementSpec(
    #     test_fn=make_single_test_fn(recipe_spec),
    # )

    raise NotImplementedError(
        "請選好 (A)/(B)/(C) 其中一種組裝形狀,取消對應區塊的註解,"
        "並刪掉這行 raise"
    )

    # -------------------------------------------------------------------
    # Step 4: connect and run
    # -------------------------------------------------------------------
    print(f"連接機箱 {SERVER_IP} ...")
    with NuPythonBackend(cfg) as backend:
        print(
            f"連線成功:tx_port_idx={backend.tx_port_idx}, rx_port_idx={backend.rx_port_idx}, "
            f"tx_port2_idx={backend.tx_port2_idx}, monitor_port_idx={backend.monitor_port_idx}"
        )
        results = run_test_item(cfg, spec, backend=backend)

    print("=== 結果(依 frame size)===")
    pprint(results)


if __name__ == "__main__":
    main()

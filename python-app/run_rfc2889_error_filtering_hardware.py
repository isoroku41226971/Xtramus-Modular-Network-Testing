"""
Error Filtering (RFC-2889): runs the full test against a real chassis.

Sends 4 kinds of errored/undefined frames (bad_crc/undersize/oversize/alignment);
the test passes only if the receive count is 0 for all of them.

    Algorithm-layer assembly: SingleTestSpec(test_fn=..., check_fn=...) + run_test_item()
        test_fn  = make_single_test_fn(recipe_spec) (no target_now parameter, matching
                    the single-verdict, non-converging shape)
        check_fn = check_rx_zero_with_full_detail (in xmnt_checks.py; wraps
                    check_rx_zero and also recovers tx_packets/rx_packets per error
                    type. Both are needed: rx=0 can mean "correctly filtered" or
                    "never sent", and rx alone cannot tell them apart)

    Connection-layer assembly: PhysicalRecipeSpec(topology, learning, stream, trigger, reader)
        + assemble_and_run() (the generic executor in nupython_xmnt_recipe_assembly.py)
        topology = OneToOneTopology.TwoPort() (tx_port + rx_port, one to one)
        learning = AddressLearningSpec() (NoLearningSpec() when cfg.learning_enabled=False)
                   sends learning frames from rx_port so the DUT knows where rx_mac is;
                   a receive count of 0 then means the errored frames were filtered,
                   not that the destination address was unknown
        stream   = ErrorSweepStreamSpec(error_types, loading, undersize_framesize,
                   oversize_framesize): generates the errored frames for each entry
                   of error_types, one round per type
        trigger  = ImmediateSingleKind(): single port, triggered right after setup
        reader   = PortCountersReaderKind(aggregate="sum", keep_per_stream_results=True,
                   use_stream_counters=True): rx_packets is the sum over the 4 error
                   types; keep_per_stream_results keeps each type's raw result so
                   check_rx_zero_with_full_detail can build the per_type detail
                   (tx_packets/rx_packets per type). use_stream_counters=True reads the
                   per-slot stream counters instead of the port-wide
                   IDX_PORTCOUNTER_TX_PKT, because a loopback test on real hardware
                   showed the port-wide counter does not count frames with injected
                   CRC errors, while the per-slot counters do

Before running:
1. Set SERVER_IP / TX_PORT / RX_PORT to the chassis IP and slots (cid, bid, pid).
2. Put the PC's NIC on the chassis subnet (the chassis has no DHCP; a 169.254.x.x
   address means no static IP is configured).
3. Cable both ports.
4. UNDERSIZE_FRAMESIZE / OVERSIZE_FRAMESIZE are chosen values (legal Ethernet frames
   are 64-1518 bytes and these are deliberately outside that range). RFC-2889 does
   not fix exact values, so change these two constants if you follow a different
   convention.

Usage:
    cd python-app
    python run_rfc2889_error_filtering_hardware.py
"""

from pprint import pprint

from xmnt_config import Config
from xmnt_checks import check_rx_zero_with_full_detail
from xmnt_assembly import SingleTestSpec, run_test_item
from nupython_xmnt import NuPythonBackend
from nupython_xmnt_recipe_spec import (
    OneToOneTopology,
    AddressLearningSpec,
    NoLearningSpec,
    ErrorSweepStreamSpec,
    ImmediateSingleKind,
    PortCountersReaderKind,
    PhysicalRecipeSpec,
)
from nupython_xmnt_recipe_assembly import make_single_test_fn

SERVER_IP = "192.168.1.8"
TX_PORT = (0, 7, 1)   # TODO: set to the actual slot (cid, bid, pid)
RX_PORT = (0, 7, 2)   # TODO: set to the actual slot (cid, bid, pid)

LOADING_PERCENT = 10.0        # error frames don't need heavy traffic; use a fixed, moderate rate
UNDERSIZE_FRAMESIZE = 32      # below the 64-byte legal minimum (config_stream_pktlen clamps it to 40)
OVERSIZE_FRAMESIZE = 1600     # above the 1518-byte legal maximum (non-jumbo frames)


def main():
    cfg = Config(
        test_type="error_filtering",
        server_ip=SERVER_IP,
        tx_port=TX_PORT,
        rx_port=RX_PORT,
        simulate=False,
        mode_framesize=0,
        framesize_custom=(64,),
        error_types=("bad_crc", "undersize", "alignment", "oversize"),
        tx_duration_time=2,       # 2 s per trial for quick manual checks; use the 60 s default for real runs
        learning_enabled=True,
    )

    recipe_spec = PhysicalRecipeSpec(
        topology=OneToOneTopology.TwoPort(),
        learning=AddressLearningSpec() if cfg.learning_enabled else NoLearningSpec(),
        stream=ErrorSweepStreamSpec(
            error_types=cfg.error_types,
            loading=LOADING_PERCENT,
            undersize_framesize=UNDERSIZE_FRAMESIZE,
            oversize_framesize=OVERSIZE_FRAMESIZE,
        ),
        trigger=ImmediateSingleKind(),
        reader=PortCountersReaderKind(aggregate="sum", keep_per_stream_results=True, use_stream_counters=True),
    )

    spec = SingleTestSpec(
        test_fn=make_single_test_fn(recipe_spec),
        check_fn=check_rx_zero_with_full_detail,
    )

    print(f"連接機箱 {SERVER_IP},tx_port={TX_PORT}, rx_port={RX_PORT} ...")
    with NuPythonBackend(cfg) as backend:
        print(f"連線成功:tx_port_idx={backend.tx_port_idx}, rx_port_idx={backend.rx_port_idx}")
        print(f"開始執行 Error Filtering 測試(依序送 {cfg.error_types})...\n")
        results = run_test_item(cfg, spec, backend=backend)

    print("=== 結果(依 frame size)===")
    pprint(results)


if __name__ == "__main__":
    main()

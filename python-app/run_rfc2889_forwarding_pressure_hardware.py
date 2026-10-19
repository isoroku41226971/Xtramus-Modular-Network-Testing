"""
Forwarding Pressure (RFC-2889): runs the full test against a real chassis.

Principle: send pressure traffic above 100% line rate by using an inter-frame gap
below 96 bits (the minimum gap at 100% Ethernet rate). A DUT that cannot keep up
floods frames to a third port (monitor_port). This script uses a fixed 88-bit gap,
below the vendor SDK's original 96-bit floor; that floor has been removed from the
NuPython.py copy bundled here.

    Algorithm-layer assembly: SingleTestSpec(test_fn=..., check_fn=...) + run_test_item()
        test_fn  = make_single_test_fn(recipe_spec) (no target_now parameter, matching
                    the single-verdict, non-converging shape)
        check_fn = check_monitor_received_with_detail (in xmnt_checks.py; wraps
                    check_monitor_received and also keeps tx_packets/rx_packets to
                    confirm the pressure traffic really went out near line rate)

    Connection-layer assembly: PhysicalRecipeSpec(topology, learning, stream, trigger, reader)
        + assemble_and_run() (the generic executor in nupython_xmnt_recipe_assembly.py)
        topology = OneToOneTopology.ThreePortMonitor() (tx_port + rx_port + monitor_port)
        learning = AddressLearningSpec() (NoLearningSpec() when cfg.learning_enabled=False)
                   sends learning frames from rx_port so the DUT knows where rx_mac is;
                   frames on monitor_port then mean flooding, not an unknown
                   destination address
        stream   = PressureStreamSpec(gap_bits=GAP_BITS): a single port in manual
                   rate mode (manual_tx_rate) sends with a fixed gap below 96 bits,
                   bypassing the loading % calculation
        trigger  = ImmediateSingleKind(): single port, triggered right after setup
        reader   = (MonitorReceivedReaderKind(), PortCountersReaderKind()): a tuple
                   that reads both: monitor_received decides whether flooding
                   happened, and tx_packets/rx_packets confirm the pressure traffic
                   was actually sent (no false pass)

Before running:
1. Set SERVER_IP / TX_PORT / RX_PORT / MONITOR_PORT to the chassis IP and slots
   (cid, bid, pid). This test needs 3 ports.
2. Put the PC's NIC on the chassis subnet (the chassis has no DHCP; a 169.254.x.x
   address means no static IP is configured).
3. Cable tx_port, rx_port and monitor_port to the DUT.

Usage:
    cd python-app
    python run_rfc2889_forwarding_pressure_hardware.py
"""

from pprint import pprint

from xmnt_config import Config
from xmnt_checks import check_monitor_received_with_detail
from xmnt_assembly import SingleTestSpec, run_test_item
from nupython_xmnt import NuPythonBackend
from nupython_xmnt_recipe_spec import (
    OneToOneTopology,
    AddressLearningSpec,
    NoLearningSpec,
    PressureStreamSpec,
    ImmediateSingleKind,
    MonitorReceivedReaderKind,
    PortCountersReaderKind,
    PhysicalRecipeSpec,
)
from nupython_xmnt_recipe_assembly import make_single_test_fn

SERVER_IP = "192.168.1.8"
TX_PORT = (0, 7, 1)        # TODO: set to the actual slot (cid, bid, pid)
RX_PORT = (0, 7, 2)        # TODO: set to the actual slot (cid, bid, pid)
MONITOR_PORT = (0, 7, 3)   # TODO: set to the actual slot (cid, bid, pid), third port

GAP_BITS = 88   # below 96 bits by design


def main():
    cfg = Config(
        test_type="forwarding_pressure",
        server_ip=SERVER_IP,
        tx_port=TX_PORT,
        rx_port=RX_PORT,
        monitor_port=MONITOR_PORT,
        simulate=False,
        mode_framesize=0,
        framesize_custom=(64, 512),
        tx_duration_time=2,       # 2 s per trial for quick manual checks; use the 60 s default for real runs
        learning_enabled=True,
    )

    recipe_spec = PhysicalRecipeSpec(
        topology=OneToOneTopology.ThreePortMonitor(),
        learning=AddressLearningSpec() if cfg.learning_enabled else NoLearningSpec(),
        stream=PressureStreamSpec(gap_bits=GAP_BITS),
        trigger=ImmediateSingleKind(),
        reader=(MonitorReceivedReaderKind(), PortCountersReaderKind()),
    )

    spec = SingleTestSpec(
        test_fn=make_single_test_fn(recipe_spec),
        check_fn=check_monitor_received_with_detail,
    )

    print(f"連接機箱 {SERVER_IP},tx_port={TX_PORT}, rx_port={RX_PORT}, monitor_port={MONITOR_PORT} ...")
    with NuPythonBackend(cfg) as backend:
        print(
            f"連線成功:tx_port_idx={backend.tx_port_idx}, "
            f"rx_port_idx={backend.rx_port_idx}, monitor_port_idx={backend.monitor_port_idx}"
        )
        print(f"開始執行 Forwarding Pressure 測試(gap_bits={GAP_BITS})...\n")
        results = run_test_item(cfg, spec, backend=backend)

    print("=== 結果(依 frame size)===")
    pprint(results)


if __name__ == "__main__":
    main()

"""
Address Learning (RFC-2889): runs the full test against a real chassis.

Uses the same "teach N MACs -> age -> test N MACs" mechanism as Address Caching,
but the convergence target is the learning-phase loading % instead of the MAC
count. The MAC count is fixed (FIXED_MAC_COUNT, taken from the converged_mac_count
found by run_rfc2889_address_caching_hardware.py); the test finds the fastest
learning rate (as 0-100% loading, the same scale as Forwarding) at which the DUT
still remembers every MAC.

    Algorithm-layer assembly: ConvergenceSpec(test_fn=..., check_fn=...) + run_test_item()
        test_fn     = make_convergence_test_fn(recipe_spec): because
                       recipe_spec.learning is a VaryingAddressAgedLearningSpec, it
                       routes to the dedicated assemble_and_run_varying_address_caching
                       executor, sharing all of its logic with Address Caching
        check_fn    = check_monitor_received (in xmnt_checks.py)
        result_key  = "throughput": the converged value is a learning rate, but it is
                       the same kind of quantity as Forwarding's throughput (the
                       highest rate the DUT still handles correctly, found by binary
                       search), so it keeps the same key

    Connection-layer assembly: PhysicalRecipeSpec(topology, learning, stream, trigger, reader)
        + assemble_and_run_varying_address_caching()
        topology = OneToOneTopology.ThreePortMonitor() (tx_port + rx_port + monitor_port)
        learning = VaryingAddressAgedLearningSpec(aging_time, mac_count=FIXED_MAC_COUNT):
                   mac_count is fixed to the value converged by
                   run_rfc2889_address_caching_hardware.py; learning_loading stays None
                   and is driven by the convergence target (target_now), the opposite
                   of Address Caching
        stream   = UnicastStreamSpec(): unused, because VaryingAddressAgedLearning
                   builds its own stream; it is set only to satisfy
                   PhysicalRecipeSpec's required fields
        trigger  = ImmediateSingleKind(): unused, same as above
        reader   = MonitorReceivedReaderKind(): whether monitor_port received
                   frames tells us whether the DUT still remembers every MAC at
                   this learning rate

Before running:
1. Set SERVER_IP / TX_PORT / RX_PORT / MONITOR_PORT to the chassis IP and slots
   (cid, bid, pid). This test needs 3 ports.
2. Set FIXED_MAC_COUNT to the value converged by run_rfc2889_address_caching_hardware.py.
3. Put the PC's NIC on the chassis subnet (the chassis has no DHCP; a 169.254.x.x
   address means no static IP is configured).
4. Cable tx_port, rx_port and monitor_port to the DUT.

Usage:
    cd python-app
    python run_rfc2889_address_learning_hardware.py
"""

from pprint import pprint

from xmnt_config import Config
from xmnt_checks import check_monitor_received
from xmnt_assembly import ConvergenceSpec, run_test_item
from nupython_xmnt import NuPythonBackend
from nupython_xmnt_recipe_spec import (
    OneToOneTopology,
    VaryingAddressAgedLearningSpec,
    UnicastStreamSpec,
    ImmediateSingleKind,
    MonitorReceivedReaderKind,
    PhysicalRecipeSpec,
)
from nupython_xmnt_recipe_assembly import make_convergence_test_fn

SERVER_IP = "192.168.1.8"
TX_PORT = (0, 7, 1)        # TODO: set to the actual slot (cid, bid, pid)
RX_PORT = (0, 7, 2)        # TODO: set to the actual slot (cid, bid, pid)
MONITOR_PORT = (0, 7, 3)   # TODO: set to the actual slot (cid, bid, pid)

FIXED_MAC_COUNT = 16384      # converged result of run_rfc2889_address_caching_hardware.py on real hardware


def main():
    cfg = Config(
        test_type="address_learning",
        server_ip=SERVER_IP,
        tx_port=TX_PORT,
        rx_port=RX_PORT,
        monitor_port=MONITOR_PORT,
        fixed_mac_count=FIXED_MAC_COUNT,
        simulate=False,
        mode_framesize=0,
        framesize_custom=(64,),
        mode_convergence=0,     
        target_min=1.0,
        target_max=100.0,       
        target_now=50.0,
        target_step=10.0,
        target_resolution=1.0,
        aging_time=60.0,
        learning_settle_time=0.5,
    )

    recipe_spec = PhysicalRecipeSpec(
        topology=OneToOneTopology.ThreePortMonitor(),
        learning=VaryingAddressAgedLearningSpec(aging_time=cfg.aging_time, mac_count=cfg.fixed_mac_count),
        stream=UnicastStreamSpec(),     # unused: VaryingAddressAgedLearning builds its own stream
        trigger=ImmediateSingleKind(),  # unused, same as above
        reader=MonitorReceivedReaderKind(),
    )

    spec = ConvergenceSpec(
        test_fn=make_convergence_test_fn(recipe_spec),
        check_fn=check_monitor_received,
        result_key="throughput",
        zero_result={"monitor_received": True},
        mode_convergence=cfg.mode_convergence,
        target_min=cfg.target_min,
        target_max=cfg.target_max,
        target_now=cfg.target_now,
        target_step=cfg.target_step,
        target_resolution=cfg.target_resolution,
    )

    print(f"連接機箱 {SERVER_IP},tx_port={TX_PORT}, rx_port={RX_PORT}, monitor_port={MONITOR_PORT} ...")
    with NuPythonBackend(cfg) as backend:
        print(
            f"連線成功:tx_port_idx={backend.tx_port_idx}, "
            f"rx_port_idx={backend.rx_port_idx}, monitor_port_idx={backend.monitor_port_idx}"
        )
        print(f"開始執行 Address Learning 收斂測試(固定 MAC 數量={FIXED_MAC_COUNT})...\n")
        results = run_test_item(cfg, spec, backend=backend)

    print("=== 結果(依 frame size)===")
    pprint(results)


if __name__ == "__main__":
    main()

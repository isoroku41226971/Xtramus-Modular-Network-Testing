"""ManyToMany (XMNT's general many-to-many topology): runs the full test against a real chassis.

ManyToMany is a general topology capability of the XMNT framework, independent of
any one RFC. This script builds the frames, receives them, and decides pass/fail
for a many-to-many test.

Before running:
1. Set SERVER_IP and the TX_PORT_* / RX_PORT_* constants to the chassis IP and
   slots (cid, bid, pid).
2. Put the PC's NIC on the chassis subnet (the chassis has no DHCP; a 169.254.x.x
   address means no static IP is configured).
3. Cable the ports you use to the DUT.
4. tx_duration_time / target_resolution are set short/coarse for quick manual
   validation; use finer resolution and longer trials for real measurements.

Usage:
    cd python-app
    python run_xmnt_manytomany_hardware.py
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

SERVER_IP = "192.168.1.8"
TX_PORT_1 = (0, 7, 1)   # TODO: set to the actual slot (cid, bid, pid), first tx port
TX_PORT_2 = (0, 7, 2)   # TODO: set to the actual slot (cid, bid, pid), second tx port
RX_PORT_1 = (0, 7, 3)   # TODO: set to the actual slot (cid, bid, pid), first rx port
RX_PORT_2 = (0, 7, 4)   # TODO: set to the actual slot (cid, bid, pid), second rx port
MONITOR_PORT = (0, 7, 4)

GAP_BITS = 88

LOADING_PERCENT = 10.0        # error frames don't need heavy traffic; use a fixed, moderate rate
UNDERSIZE_FRAMESIZE = 32      # below the 64-byte legal minimum (config_stream_pktlen clamps it to 40)
OVERSIZE_FRAMESIZE = 1600     # above the 1518-byte legal maximum (non-jumbo frames)

def main():
    cfg = Config(
        test_type="broadcast_latency",   
        server_ip=SERVER_IP,
        tx_port=TX_PORT_1,
        rx_port=RX_PORT_1,
        mesh_tx_ports=(TX_PORT_1, TX_PORT_2),
        mesh_rx_ports=(RX_PORT_1, RX_PORT_2),
        monitor_port=MONITOR_PORT,
        simulate=False,
        mode_framesize=0,
        framesize_custom=(64,),
        error_types=("bad_crc", "undersize", "oversize", "alignment"),
        mode_convergence=0,       # 0 = binary search
        target_min=1.0,
        target_max=100.0,
        target_now=50.0,
        target_resolution=1.0,    # 1% resolution for a quick validation run; converges much faster than the 0.01% default
        target_acceptloss=0.005,  
        tx_duration_time=2,       # 2 s per trial for quick manual checks; use the 60 s default for real runs
    )

    recipe_spec = PhysicalRecipeSpec(
        topology=ManyToMany(),
        learning=AddressLearningSpec(),
        stream=UnicastStreamSpec(),
        # stream=ErrorSweepStreamSpec(
        #     error_types=cfg.error_types,
        #     loading=LOADING_PERCENT,
        #     undersize_framesize=UNDERSIZE_FRAMESIZE,
        #     oversize_framesize=OVERSIZE_FRAMESIZE,
        # ),
        trigger=SynchronizedMultiKind(),
        reader=PortCountersReaderKind(),
    )

    spec = ConvergenceSpec(
        test_fn=make_convergence_test_fn(recipe_spec),
        check_fn=check_loss_based_with_detail,
        result_key="throughput",
        mode_convergence=cfg.mode_convergence,
        target_min=cfg.target_min,
        target_max=cfg.target_max,
        target_now=cfg.target_now,
        target_step=cfg.target_step,
        target_resolution=cfg.target_resolution,
    )

    # spec = SingleTestSpec(
    #     test_fn=make_single_test_fn(recipe_spec),
    #     check_fn=check_rx_zero_with_full_detail,
    # )

    # spec = MeasurementSpec(
    #     test_fn=make_single_test_fn(recipe_spec),
    # )

    print(
        f"連接機箱 {SERVER_IP},mesh_tx_ports={cfg.mesh_tx_ports} mesh_rx_ports={cfg.mesh_rx_ports} ..."
    )
    with NuPythonBackend(cfg) as backend:
        print(
            f"連線成功:mesh_tx_port_idxs={backend.mesh_tx_port_idxs}, "
            f"mesh_rx_port_idxs={backend.mesh_rx_port_idxs}"
        )
        print("開始執行 ManyToMany ...\n")
        results = run_test_item(cfg, spec, backend=backend)

    print("=== 結果(依 frame size)===")
    pprint(results)


if __name__ == "__main__":
    main()

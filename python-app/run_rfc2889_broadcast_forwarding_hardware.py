"""
Broadcast Forwarding (RFC-2889): runs the full test against a real chassis.

Differences from Forwarding: frames are broadcast instead of unicast, and no
learning step is needed.

    Algorithm-layer assembly: ConvergenceSpec(test_fn=..., check_fn=...) + run_test_item()
        test_fn  = make_convergence_test_fn(recipe_spec)
        check_fn = check_loss_based (same check as Forwarding: frames sent vs. received)

    Connection-layer assembly: PhysicalRecipeSpec(topology, learning, stream, trigger, reader)
        + assemble_and_run() (the generic executor in nupython_xmnt_recipe_assembly.py)
        topology = OneToOneTopology.TwoPort()
        learning = NoLearningSpec() (always off, unlike Forwarding where it is optional)
        stream   = BroadcastStreamSpec()
        trigger  = ImmediateSingleKind()
        reader   = PortCountersReaderKind()
                   (for a BroadcastStreamSpec this automatically reads the
                    RX_BORADCAST counter instead of RX_UNICAST; _read() and
                    _fire_and_read() pick the counter by stream type)

Before running:
1. Set SERVER_IP / TX_PORT / RX_PORT to the chassis IP and slots (cid, bid, pid).
2. Put the PC's NIC on the chassis subnet (the chassis has no DHCP; a 169.254.x.x
   address means no static IP is configured).
3. Cable both ports so broadcast frames can be flooded from tx_port to rx_port.

Usage:
    cd python-app
    python run_rfc2889_broadcast_forwarding_hardware.py
"""

from pprint import pprint

from xmnt_config import Config
from xmnt_checks import check_loss_based
from xmnt_assembly import ConvergenceSpec, run_test_item
from nupython_xmnt import NuPythonBackend
from nupython_xmnt_recipe_spec import (
    OneToOneTopology,
    NoLearningSpec,
    BroadcastStreamSpec,
    ImmediateSingleKind,
    PortCountersReaderKind,
    PhysicalRecipeSpec,
)
from nupython_xmnt_recipe_assembly import make_convergence_test_fn

SERVER_IP = "192.168.1.8"
TX_PORT = (0, 7, 1)   # TODO: set to the actual slot (cid, bid, pid)
RX_PORT = (0, 7, 2)   # TODO: set to the actual slot (cid, bid, pid)


def main():
    cfg = Config(
        test_type="broadcast_forwarding",
        server_ip=SERVER_IP,
        tx_port=TX_PORT,
        rx_port=RX_PORT,
        simulate=False,
        mode_framesize=0,
        framesize_custom=(64,),
        mode_convergence=0,       # 0 = binary search
        target_min=1.0,
        target_max=100.0,
        target_now=50.0,
        target_resolution=1.0,    # 1% resolution for a quick validation run; converges much faster than the 0.01% default
        target_acceptloss=0.005,  
        tx_duration_time=2,       # 2 s per trial for quick manual checks; use the 60 s default for real runs
    )

    recipe_spec = PhysicalRecipeSpec(
        topology=OneToOneTopology.TwoPort(),
        learning=NoLearningSpec(),
        stream=BroadcastStreamSpec(),
        trigger=ImmediateSingleKind(),
        reader=PortCountersReaderKind(),
    )

    spec = ConvergenceSpec(
        test_fn=make_convergence_test_fn(recipe_spec),
        check_fn=check_loss_based,
        result_key="throughput",
        mode_convergence=cfg.mode_convergence,
        target_min=cfg.target_min,
        target_max=cfg.target_max,
        target_now=cfg.target_now,
        target_step=cfg.target_step,
        target_resolution=cfg.target_resolution,
    )

    print(f"連接機箱 {SERVER_IP},tx_port={TX_PORT}, rx_port={RX_PORT} ...")
    with NuPythonBackend(cfg) as backend:
        print(f"連線成功:tx_port_idx={backend.tx_port_idx}, rx_port_idx={backend.rx_port_idx}")
        print("開始執行 Broadcast Forwarding 收斂測試(每個 frame size 各自二分搜尋)...\n")
        results = run_test_item(cfg, spec, backend=backend)

    print("=== 結果(依 frame size)===")
    pprint(results)


if __name__ == "__main__":
    main()

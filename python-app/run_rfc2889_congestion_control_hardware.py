"""
Congestion Control (RFC-2889): runs the full test against a real chassis.

Two ports (mesh_tx_ports) send to the same target port (mesh_rx_ports) at once, so
the combined traffic can exceed the target port's line rate (two 100% loads add up
to 200%). This exercises the DUT's congestion handling. The convergence target is
each source port's loading %, i.e. the highest combined load that causes no loss
at the target port.

    Algorithm-layer assembly: ConvergenceSpec(test_fn=..., check_fn=...) + run_test_item()
        test_fn  = make_convergence_test_fn(recipe_spec)
        check_fn = check_loss_based_with_detail (in xmnt_checks.py; wraps
                    check_loss_based and also keeps the tx_packets_by_port detail)

    Connection-layer assembly: PhysicalRecipeSpec(topology, learning, stream, trigger, reader)
        + assemble_and_run() (the generic executor in nupython_xmnt_recipe_assembly.py)
        topology = ManyToMany() (cfg.mesh_tx_ports = the two source ports,
                   cfg.mesh_rx_ports = the one target port)
        learning = AddressLearningSpec() (NoLearningSpec() when cfg.learning_enabled=False)
                   sends one learning frame per rx port so the DUT knows where each
                   port is; any loss measured afterwards is then caused by congestion,
                   not by an unknown destination address
        stream   = UnicastStreamSpec(): when _resolve_streams() sees plural rx_ports it
                   builds one MeshStream per tx port, with the same framesize/loading,
                   all aimed at the single target port
        trigger  = SynchronizedMultiKind(): both ports start sending at the same
                   instant, which is what actually overloads the target port
        reader   = PortCountersReaderKind(per_port_detail=True): tx_packets is the
                   sum over both source ports, and tx_packets_by_port gives
                   {port index: count} so you can confirm both ports really sent
                   simultaneously and at the same rate

Before running:
1. Set SERVER_IP / TX_PORT / TX_PORT2 / RX_PORT to the chassis IP and slots
   (cid, bid, pid). This test needs 3 ports.
2. Put the PC's NIC on the chassis subnet (the chassis has no DHCP; a 169.254.x.x
   address means no static IP is configured).
3. Cable tx_port, tx_port2 and rx_port to the DUT.

Usage:
    cd python-app
    python run_rfc2889_congestion_control_hardware.py
"""

from pprint import pprint

from xmnt_config import Config
from xmnt_checks import check_loss_based_with_detail
from xmnt_assembly import ConvergenceSpec, run_test_item
from nupython_xmnt import NuPythonBackend
from nupython_xmnt_recipe_spec import (
    ManyToMany,
    AddressLearningSpec,
    NoLearningSpec,
    UnicastStreamSpec,
    SynchronizedMultiKind,
    PortCountersReaderKind,
    PhysicalRecipeSpec,
)
from nupython_xmnt_recipe_assembly import make_convergence_test_fn

SERVER_IP = "192.168.1.8"
TX_PORT = (0, 7, 1)    # TODO: set to the actual slot (cid, bid, pid), first sender port
TX_PORT2 = (0, 7, 2)   # TODO: set to the actual slot (cid, bid, pid), second sender port
RX_PORT = (0, 7, 3)    # TODO: set to the actual slot (cid, bid, pid), target port


def main():
    cfg = Config(
        test_type="congestion_control",
        server_ip=SERVER_IP,
        tx_port=TX_PORT,
        rx_port=RX_PORT,
        mesh_tx_ports=(TX_PORT, TX_PORT2),
        mesh_rx_ports=(RX_PORT,),
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
        learning_enabled=True,
    )

    recipe_spec = PhysicalRecipeSpec(
        topology=ManyToMany(),
        learning=AddressLearningSpec() if cfg.learning_enabled else NoLearningSpec(),
        stream=UnicastStreamSpec(),
        trigger=SynchronizedMultiKind(),
        reader=PortCountersReaderKind(per_port_detail=True),
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

    print(f"連接機箱 {SERVER_IP},mesh_tx_ports=[{TX_PORT}, {TX_PORT2}], mesh_rx_ports=[{RX_PORT}] ...")
    with NuPythonBackend(cfg) as backend:
        print(
            f"連線成功:mesh_tx_port_idxs={backend.mesh_tx_port_idxs}, "
            f"mesh_rx_port_idxs={backend.mesh_rx_port_idxs}"
        )
        print("開始執行 Congestion Control 收斂測試...\n")
        results = run_test_item(cfg, spec, backend=backend)

    print("=== 結果(依 frame size)===")
    pprint(results)


if __name__ == "__main__":
    main()

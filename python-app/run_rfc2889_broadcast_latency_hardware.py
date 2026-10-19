"""
Broadcast Latency (RFC-2889): runs the full test against a real chassis.

Send broadcast frames and measure a latency value. Uses MeasurementSpec: no
check_fn is involved, and whatever test_fn returns is passed through as the result.

    Algorithm-layer assembly: MeasurementSpec(test_fn=...) + run_test_item()
        (not ConvergenceSpec/SingleTestSpec: there is no convergence and no verdict)
        test_fn = make_single_test_fn(recipe_spec) (no target_now parameter, matching
                   the interface MeasurementSpec expects)

    Connection-layer assembly: PhysicalRecipeSpec(topology, learning, stream, trigger, reader)
        + assemble_and_run() (the generic executor in nupython_xmnt_recipe_assembly.py)
        topology = OneToOneTopology.TwoPort()
        learning = NoLearningSpec() (broadcast needs no learning, as in Broadcast Forwarding)
        stream   = BroadcastStreamSpec(loading=LOADING_PERCENT) (fixed rate; unlike
                   Forwarding, latency is a measurement, not a convergence target)
        trigger  = ImmediateSingleKind()
        reader   = StreamLatencyReaderKind()

Before running:
1. Set SERVER_IP / TX_PORT / RX_PORT to the chassis IP and slots (cid, bid, pid).
2. Put the PC's NIC on the chassis subnet (the chassis has no DHCP; a 169.254.x.x
   address means no static IP is configured).
3. Cable both ports.
4. set_config_rxstream() has a built-in 0.7 s sleep (vendor SDK behavior, not added
   by this script), so a short pause on every call is normal.

Usage:
    cd python-app
    python run_rfc2889_broadcast_latency_hardware.py
"""

from pprint import pprint

from xmnt_config import Config
from xmnt_assembly import MeasurementSpec, run_test_item
from nupython_xmnt import NuPythonBackend
from nupython_xmnt_recipe_spec import (
    OneToOneTopology,
    NoLearningSpec,
    BroadcastStreamSpec,
    ImmediateSingleKind,
    StreamLatencyReaderKind,
    PhysicalRecipeSpec,
)
from nupython_xmnt_recipe_assembly import make_single_test_fn

SERVER_IP = "192.168.1.8"
TX_PORT = (0, 7, 1)   # TODO: set to the actual slot (cid, bid, pid)
RX_PORT = (0, 7, 2)   # TODO: set to the actual slot (cid, bid, pid)

LOADING_PERCENT = 10.0   # latency is measured, not converged on, so a fixed moderate rate is enough


def main():
    cfg = Config(
        test_type="broadcast_latency",
        server_ip=SERVER_IP,
        tx_port=TX_PORT,
        rx_port=RX_PORT,
        simulate=False,
        mode_framesize=0,
        framesize_custom=(64, 128, 256,),
        tx_duration_time=2,       # 2 s per trial for quick manual checks; use the 60 s default for real runs
    )

    recipe_spec = PhysicalRecipeSpec(
        topology=OneToOneTopology.TwoPort(),
        learning=NoLearningSpec(),
        stream=BroadcastStreamSpec(loading=LOADING_PERCENT),
        trigger=ImmediateSingleKind(),
        reader=StreamLatencyReaderKind(),
    )

    spec = MeasurementSpec(test_fn=make_single_test_fn(recipe_spec))

    print(f"連接機箱 {SERVER_IP},tx_port={TX_PORT}, rx_port={RX_PORT} ...")
    with NuPythonBackend(cfg) as backend:
        print(f"連線成功:tx_port_idx={backend.tx_port_idx}, rx_port_idx={backend.rx_port_idx}")
        print("開始執行 Broadcast Latency 量測(每個 frame size 各量一次)...\n")
        results = run_test_item(cfg, spec, backend=backend)

    print("=== 結果(依 frame size)===")
    pprint(results)


if __name__ == "__main__":
    main()

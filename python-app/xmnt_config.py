from dataclasses import dataclass
from typing import Callable, Optional, Tuple


@dataclass
class Config:
    test_type: str = "forwarding"
    # Valid values: "forwarding", "error_filtering", "broadcast_forwarding",
    # "broadcast_latency", "congestion_control", "forwarding_pressure",
    # "address_caching", "address_learning"

    # --- Shared port settings ---
    server_ip: str = "192.168.1.8"
    tx_port: Tuple[int, int, int] = (0, 2, 3)
    rx_port: Tuple[int, int, int] = (0, 2, 3)
    tx_port2: Optional[Tuple[int, int, int]] = None      # generic optional 2nd tx port, no current test type requires it
    monitor_port: Optional[Tuple[int, int, int]] = None  # forwarding_pressure only
    mesh_tx_ports: Optional[Tuple[Tuple[int, int, int], ...]] = None  # ManyToMany topology only
    mesh_rx_ports: Optional[Tuple[Tuple[int, int, int], ...]] = None  # ManyToMany topology only
    mesh_ports: Optional[Tuple[Tuple[int, int, int], ...]] = None     # FullyMesh topology only

    # --- Frame size sweep (shared by all 8 test types) ---
    mode_framesize: int = 0  # 0=custom list, 1=start~stop sweep
    framesize_custom: tuple = (64, 128, 256, 512, 1024, 1280, 1518)
    framesize_start: int = 64
    framesize_step: int = 64
    framesize_stop: int = 1518

    # --- Generic convergence target (replaces per-test loading_min/mac_count_min/etc.) ---
    mode_convergence: int = 0  # 0=binary search, 1=linear/step
    target_min: float = 1.0
    target_max: float = 100.0
    target_now: float = 50.0
    target_step: float = 2.0
    target_resolution: float = 0.01
    target_acceptloss: float = 0.005  # percentage scale (matches loss_rate, 0-100), not a fraction — same convention as Xtramus's RFC-2544 reference implementation

    # --- Tx mode (mirrors rfc2544) ---
    mode_tx: int = 0
    tx_duration_time: int = 60
    tx_burst_frames: int = 10000

    # --- Pre-test route learning (mirrors rfc2544) ---
    learning_enabled: bool = True
    learning_frames: int = 10
    learning_gap_seconds: float = 0.1
    learning_settle_time: float = 1.0

    # --- Error Filtering specific ---
    error_types: Tuple[str, ...] = ("bad_crc", "undersize", "alignment", "oversize")

    # --- Address Caching specific ---
    aging_time: float = 300.0

    # --- Address Learning specific (filled in by run_address_learning_with_caching()) ---
    fixed_mac_count: Optional[int] = None

    # --- Connection/timing parameters (mirrors rfc2544) ---
    counter_clear_wait: float = 0.2
    counter_settle_time: float = 1.0
    counter_read_wait: float = 1.0
    arp_reply_config: str = "arp_reply.csv"
    arp_reply_start_wait: float = 1.0

    simulate: bool = True


VALID_TEST_TYPES = {
    "forwarding",
    "error_filtering",
    "broadcast_forwarding",
    "broadcast_latency",
    "congestion_control",
    "forwarding_pressure",
    "address_caching",
    "address_learning",
}

REQUIRED_FIELDS_BY_TEST_TYPE = {
    "congestion_control": ("mesh_tx_ports", "mesh_rx_ports"),
    "forwarding_pressure": ("monitor_port",),
    "address_caching": ("monitor_port",),
    "address_learning": ("fixed_mac_count", "monitor_port"),
}


def validate(cfg: Config) -> None:
    if cfg.test_type not in VALID_TEST_TYPES:
        raise ValueError("invalid test_type: {!r}".format(cfg.test_type))

    required = REQUIRED_FIELDS_BY_TEST_TYPE.get(cfg.test_type, ())
    missing = [name for name in required if getattr(cfg, name) is None]
    if missing:
        raise ValueError(
            "test_type={!r} requires these Config fields to be set: {}".format(
                cfg.test_type, missing
            )
        )


def run_address_learning_with_caching(
    cfg_caching: Config,
    cfg_learning: Config,
    run_fn: Callable[[Config, object], dict],
    backend: object = None,
) -> dict:
    """Run the address_caching test, then feed its result into the address_learning config.

    run_fn must have the signature (cfg: Config, backend) -> dict. When called with
    test_type="address_caching", the returned dict must contain the key
    "converged_mac_count". This function mutates cfg_learning.fixed_mac_count in place
    (a deliberate side effect; no new object is returned).
    """
    if cfg_caching.test_type != "address_caching":
        raise ValueError("cfg_caching.test_type must be 'address_caching'")
    if cfg_learning.test_type != "address_learning":
        raise ValueError("cfg_learning.test_type must be 'address_learning'")

    validate(cfg_caching)
    caching_result = run_fn(cfg_caching, backend)

    cfg_learning.fixed_mac_count = caching_result["converged_mac_count"]
    validate(cfg_learning)
    learning_result = run_fn(cfg_learning, backend)

    return {"address_caching": caching_result, "address_learning": learning_result}

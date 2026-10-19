from xmnt_config import Config


def check_loss_based(cfg: Config, result: dict) -> dict:
    tx = result["tx_packets"]
    rx = result["rx_packets"]
    loss_packets = max(0, tx - rx)
    loss_rate = (loss_packets / tx * 100.0) if tx else 0.0
    passed = tx > 0 and loss_rate <= cfg.target_acceptloss
    return {
        "passed": passed,
        "tx_packets": tx,
        "rx_packets": rx,
        "loss_packets": loss_packets,
        "loss_rate": loss_rate,
    }


def check_rx_zero(cfg: Config, result: dict) -> dict:
    rx = result["rx_packets"]
    return {"passed": rx == 0, "rx_packets": rx}


def check_monitor_received(cfg: Config, result: dict, expect_received: bool = False) -> dict:
    monitor_received = result["monitor_received"]
    return {"passed": monitor_received == expect_received, "monitor_received": monitor_received}


def check_loss_based_with_detail(cfg: Config, result: dict) -> dict:

    if "pairwise_matrix" in result:
        matrix = result["pairwise_matrix"]
        passed = all(check_loss_based(cfg, counts)["passed"] for counts in matrix.values())
        return {"passed": passed, "pairwise_matrix": matrix}
    return {
        **check_loss_based(cfg, result),
        "tx_packets_by_port": result.get("tx_packets_by_port"),
        "rx_packets_by_port": result.get("rx_packets_by_port"),
    }


def check_rx_zero_with_full_detail(cfg: Config, result: dict) -> dict:
    if "pairwise_error_matrix" in result:
        matrix = result["pairwise_error_matrix"]
        passed = all(check_rx_zero(cfg, counts)["passed"] for counts in matrix.values())
        return {"passed": passed, "pairwise_error_matrix": matrix}
    per_type = {
        error_type: {"tx_packets": r["tx_packets"], "rx_packets": r["rx_packets"]}
        for error_type, r in zip(cfg.error_types, result.get("per_stream_results", []))
    }
    return {**check_rx_zero(cfg, result), "per_type": per_type}


def check_monitor_received_with_detail(cfg: Config, result: dict) -> dict:
    checked = check_monitor_received(cfg, result)
    return {**checked, "tx_packets": result.get("tx_packets"), "rx_packets": result.get("rx_packets")}

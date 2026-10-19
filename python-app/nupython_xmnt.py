import csv
import ipaddress
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple, Union

import NuPython
import nuconst
from nupython_xmnt_mac_vary import _compute_mac_vary_blocks, _mac_vary_block_base_mac


@dataclass
class NoLearning:
    pass


@dataclass
class AddressLearning:
    sender_port_idx: int
    mac_list: List[str]
    dest_mac: str


@dataclass
class VaryingAddressAgedLearning:
    aging_time: float
    sender_port_idx: int
    tx_port_idx: int
    mac_count: int
    dest_mac: str
    src_mac: str
    framesize: int
    loading: float            # Testing phase (DA vary) loading, unchanged by this task
    learning_loading: float   # Learning phase (SA vary) loading, drives auto-rate pacing


@dataclass
class UnicastStream:
    framesize: int
    loading: float
    smac: str
    dmac: str


@dataclass
class BroadcastStream:
    framesize: int
    loading: float
    smac: str


@dataclass
class ErrorStream:
    framesize: int
    loading: float
    smac: str
    dmac: str
    error_type: str


@dataclass
class PressureStream:
    framesize: int
    smac: str
    dmac: str
    gap_bits: int


@dataclass
class ImmediateSingle:
    port_idx: int


@dataclass
class SynchronizedMulti:
    port_idxs: List[int]


@dataclass
class MeshStream:
    sender_mac: str
    dest_macs: List[str]
    framesize: int
    loading_per_dest: float
    sid_offset: int = 0


@dataclass
class MeshErrorStream:
    sender_mac: str
    entries: List[Tuple[str, str, int]]  # (dest_mac, error_type, framesize)
    loading: float
    sid_offset: int = 0


@dataclass
class MeshPressureStream:
    sender_mac: str
    dest_macs: List[str]
    framesize: int
    gap_bits: int
    sid_offset: int = 0


def load_arp_reply_entries(csv_path: str) -> List[Dict[str, str]]:
    """Read the ARP reply config file (CSV) and return the enabled entries (each with mac/ipv4/gateway)."""
    path = Path(csv_path)
    if not path.is_file():
        return []
 
    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        required_fields = {"Enable", "MAC", "IPv4", "Gateway"}
        actual_fields = set(reader.fieldnames or [])
        missing_fields = required_fields - actual_fields
        if missing_fields:
            raise ValueError(
                "ARP reply CSV is missing columns: {}".format(", ".join(sorted(missing_fields)))
            )

        entries = []
        for row_number, row in enumerate(reader, start=2):
            if not _parse_enable(row["Enable"], row_number):
                continue
            entries.append({
                "mac": _parse_mac(row["MAC"], row_number),
                "ipv4": _parse_ipv4(row["IPv4"], "IPv4", row_number),
                "gateway": _parse_ipv4(row["Gateway"], "Gateway", row_number),
            })
    return entries


def _parse_enable(value: str, row_number: int) -> bool:
    normalized = (value or "").strip().lower()
    if normalized in {"1", "true", "yes", "on", "enable", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "off", "disable", "disabled", ""}:
        return False
    raise ValueError(f"Invalid Enable value at ARP reply CSV row {row_number}: {value!r}")


def _parse_mac(value: str, row_number: int) -> str:
    parts = (value or "").strip().split(":")
    if len(parts) != 6:
        raise ValueError(f"Invalid MAC at ARP reply CSV row {row_number}: {value!r}")
    try:
        octets = [int(part, 16) for part in parts]
    except ValueError:
        raise ValueError(f"Invalid MAC at ARP reply CSV row {row_number}: {value!r}")
    if any(octet < 0 or octet > 255 for octet in octets):
        raise ValueError(f"Invalid MAC at ARP reply CSV row {row_number}: {value!r}")
    return ":".join("{:02X}".format(octet) for octet in octets)


def _parse_ipv4(value: str, field_name: str, row_number: int) -> str:
    try:
        return str(ipaddress.IPv4Address((value or "").strip()))
    except ValueError:
        raise ValueError(
            "Invalid {} at ARP reply CSV row {}: {!r}".format(
                field_name,
                row_number,
                value,
            )
        )


class NuPythonBackend:
    def __init__(self, cfg):
        self.cfg = cfg
        self.nscmd = None
        self.nsconst = None
        self.tx_port_idx = None
        self.rx_port_idx = None
        self.tx_port2_idx = None
        self.monitor_port_idx = None
        self.mesh_tx_port_idxs = None
        self.mesh_rx_port_idxs = None
        self.mesh_port_idxs = None
        self.locked = False
        self.connected = False
        self.arp_reply_started = False

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
        return False

    def _ensure_open(self) -> None:
        if not self.connected or not self.locked:
            raise RuntimeError("NuPython backend is not connected and locked")

    def _configure_stream(self, spec, stream_port_idx=None) -> None:
        self._ensure_open()
        port_idx = stream_port_idx if stream_port_idx is not None else self.tx_port_idx
        if isinstance(spec, UnicastStream):
            self.nscmd.config_stream_pktlen(spec.framesize)
            self.nscmd.config_stream_smac(spec.smac)
            self.nscmd.config_stream_dmac(spec.dmac)
            self.nscmd.config_stream_utilization(spec.loading)
            self.nscmd.config_stream_streamnum(1)
            self.nscmd.set_stream(port_idx, 0)
            return
        if isinstance(spec, BroadcastStream):
            self.nscmd.config_stream_pktlen(spec.framesize)
            self.nscmd.config_stream_smac(spec.smac)
            self.nscmd.config_stream_dmac("FF:FF:FF:FF:FF:FF")
            self.nscmd.config_stream_utilization(spec.loading)
            self.nscmd.config_stream_streamnum(1)
            self.nscmd.set_stream(port_idx, 0)
            return
        if isinstance(spec, ErrorStream):
            self.nscmd.config_stream_pktlen(spec.framesize)
            self.nscmd.config_stream_smac(spec.smac)
            self.nscmd.config_stream_dmac(spec.dmac)
            self.nscmd.config_stream_utilization(spec.loading)
            self.nscmd.config_stream_streamnum(1)
            if spec.error_type == "bad_crc":
                self.nscmd.config_stream_adderror(self.nsconst.ERROR_CRC)
            elif spec.error_type == "alignment":
                self.nscmd.config_stream_adderror(self.nsconst.ERROR_ALIGN)
            elif spec.error_type in ("undersize", "oversize"):
                self.nscmd.config_stream_adderror(0)
            else:
                raise ValueError(f"unsupported error_type: {spec.error_type!r}")
            self.nscmd.set_stream(port_idx, 0)
            return
        if isinstance(spec, PressureStream):
            self.nscmd.config_stream_pktlen(spec.framesize)
            self.nscmd.config_stream_smac(spec.smac)
            self.nscmd.config_stream_dmac(spec.dmac)
            self.nscmd.config_stream_streamnum(1)
            self.nscmd.config_manual_txrate(2)
            self.nscmd.config_stream_ifg(spec.gap_bits)
            self.nscmd.config_stream_ibg(spec.gap_bits)
            self.nscmd.set_stream(port_idx, 0)
            self.nscmd.config_manual_txrate(0)
            return
        if isinstance(spec, MeshStream):
            self.nscmd.config_stream_pktlen(spec.framesize)
            self.nscmd.config_stream_smac(spec.sender_mac)
            self.nscmd.config_stream_streamnum(spec.sid_offset + len(spec.dest_macs))
            for local_idx, dest_mac in enumerate(spec.dest_macs):
                sid = spec.sid_offset + local_idx
                self.nscmd.config_stream_dmac(dest_mac)
                self.nscmd.config_stream_utilization(spec.loading_per_dest)
                self.nscmd.set_stream(port_idx, sid)
            # config_stream_streamnum() always resets beginidx to 0, so override it here
            self.nscmd.streamcfg.stream_beginidx = spec.sid_offset
            self.nscmd.streamcfg.stream_endidx = spec.sid_offset + len(spec.dest_macs) - 1
            return
        if isinstance(spec, MeshErrorStream):
            self.nscmd.config_stream_smac(spec.sender_mac)
            self.nscmd.config_stream_streamnum(spec.sid_offset + len(spec.entries))
            for local_idx, (dest_mac, error_type, entry_framesize) in enumerate(spec.entries):
                sid = spec.sid_offset + local_idx
                self.nscmd.config_stream_pktlen(entry_framesize)
                self.nscmd.config_stream_dmac(dest_mac)
                self.nscmd.config_stream_utilization(spec.loading)
                if error_type == "bad_crc":
                    self.nscmd.config_stream_adderror(self.nsconst.ERROR_CRC)
                elif error_type == "alignment":
                    self.nscmd.config_stream_adderror(self.nsconst.ERROR_ALIGN)
                elif error_type in ("undersize", "oversize"):
                    # Must explicitly reset — streamcfg.stream_error is shared,
                    # connection-wide state, not per-entry (the single-pair ErrorStream
                    # branch resets it the same way).
                    self.nscmd.config_stream_adderror(0)
                else:
                    raise ValueError(f"unsupported error_type: {error_type!r}")
                self.nscmd.set_stream(port_idx, sid)
            self.nscmd.streamcfg.stream_beginidx = spec.sid_offset
            self.nscmd.streamcfg.stream_endidx = spec.sid_offset + len(spec.entries) - 1
            return
        if isinstance(spec, MeshPressureStream):
            self.nscmd.config_stream_pktlen(spec.framesize)
            self.nscmd.config_stream_smac(spec.sender_mac)
            self.nscmd.config_stream_streamnum(spec.sid_offset + len(spec.dest_macs))
            self.nscmd.config_manual_txrate(2)
            self.nscmd.config_stream_ifg(spec.gap_bits)
            self.nscmd.config_stream_ibg(spec.gap_bits)
            for local_idx, dest_mac in enumerate(spec.dest_macs):
                sid = spec.sid_offset + local_idx
                self.nscmd.config_stream_dmac(dest_mac)
                self.nscmd.set_stream(port_idx, sid)
            self.nscmd.streamcfg.stream_beginidx = spec.sid_offset
            self.nscmd.streamcfg.stream_endidx = spec.sid_offset + len(spec.dest_macs) - 1
            # Reset to auto-rate so this doesn't leak into the next set_stream()
            # call — same leak class as the single-slot PressureStream branch.
            self.nscmd.config_manual_txrate(0)
            return
        raise TypeError(f"unsupported stream spec type: {type(spec).__name__}")

    def _fire_trigger(self, spec) -> None:
        self._ensure_open()
        if isinstance(spec, ImmediateSingle):
            self.nscmd.config_tx_isimmediate(1)
            self.nscmd.transmit_pkts(spec.port_idx)
            return
        if isinstance(spec, SynchronizedMulti):
            self.nscmd.config_tx_isimmediate(0)
            for port_idx in spec.port_idxs:
                self.nscmd.transmit_pkts(port_idx)
            self.nscmd.transmit_pkts_sync()
            return
        raise TypeError(f"unsupported trigger spec type: {type(spec).__name__}")

    def _media_speed_bps(self) -> int:
        media_speed = self.nscmd.get_media_speed(self.tx_port_idx)
        speed_bps = {
            self.nsconst.MEDIA_SPEED_10G: 10_000_000_000,
            self.nsconst.MEDIA_SPEED_5G: 5_000_000_000,
            self.nsconst.MEDIA_SPEED_2P5G: 2_500_000_000,
            self.nsconst.MEDIA_SPEED_1G: 1_000_000_000,
            self.nsconst.MEDIA_SPEED_100M: 100_000_000,
            self.nsconst.MEDIA_SPEED_10M: 10_000_000,
        }.get(media_speed)
        if speed_bps is None:
            raise RuntimeError(f"Unsupported TX media speed: {media_speed!r}")
        return speed_bps

    def _learning_gap_bits(self) -> int:
        return max(96, min(int(self._media_speed_bps() * self.cfg.learning_gap_seconds), 0xFFFFFFFF))

    def _apply_learning(self, spec) -> None:
        self._ensure_open()
        if isinstance(spec, NoLearning):
            return
        if isinstance(spec, AddressLearning):
            self._send_learning_frames(spec.sender_port_idx, spec.mac_list, spec.dest_mac)
            return
        if isinstance(spec, VaryingAddressAgedLearning):
            time.sleep(spec.aging_time)
            self._send_varying_learning_frames(spec.sender_port_idx, spec.mac_count, spec.dest_mac, spec.learning_loading)
            self._clear_counters()
            self._send_varying_test_frames(spec.tx_port_idx, spec.mac_count, spec.src_mac, spec.framesize, spec.loading)
            return
        raise TypeError(f"unsupported learning spec type: {type(spec).__name__}")

    def _send_learning_frames(self, sender_port_idx: int, mac_list: List[str], dest_mac: str) -> None:
        gap_bits = self._learning_gap_bits()
        for smac in mac_list:
            self.nscmd.config_manual_txrate(2)
            self.nscmd.config_stream_ifg(gap_bits)
            self.nscmd.config_stream_ibg(gap_bits)
            self._configure_stream(UnicastStream(64, 100.0, smac, dest_mac), stream_port_idx=sender_port_idx)
            self.nscmd.config_tx_txpkts(sender_port_idx, self.cfg.learning_frames)
            self.nscmd.config_tx_isimmediate(1)
            self.nscmd.transmit_pkts(sender_port_idx)

        self.nscmd.config_manual_txrate(0)

        learning_wait = (
            len(mac_list) * self.cfg.learning_frames * self.cfg.learning_gap_seconds
            + self.cfg.learning_settle_time
        )
        time.sleep(learning_wait)

    def _send_varying_learning_frames(self, sender_port_idx: int, mac_count: int, dest_mac: str, loading: float) -> None:
        blocks = _compute_mac_vary_blocks(mac_count)
        total_duration = 0.0
        for block_index, block_count in blocks:
            base_mac = _mac_vary_block_base_mac(block_index)
            if block_count > 1:
                self.nscmd.config_stream_vary(sa_mode=1, sa_delta=1, sa_limit=block_count - 1)
            else:
                self.nscmd.config_stream_vary()
            self._configure_stream(UnicastStream(64, loading, base_mac, dest_mac), stream_port_idx=sender_port_idx)
            self.nscmd.config_tx_txpkts(sender_port_idx, block_count)
            self.nscmd.config_tx_isimmediate(1)
            self.nscmd.transmit_pkts(sender_port_idx)
            total_duration += self._estimate_burst_duration(64, block_count, loading)

        # Reset vary staging so it doesn't leak into the testing phase's
        # set_stream() call.
        self.nscmd.config_stream_vary()
        time.sleep(total_duration + self.cfg.learning_settle_time)

    def _send_varying_test_frames(self, tx_port_idx: int, mac_count: int, src_mac: str, framesize: int, loading: float) -> None:
        blocks = _compute_mac_vary_blocks(mac_count)
        total_duration = 0.0
        for block_index, block_count in blocks:
            base_mac = _mac_vary_block_base_mac(block_index)
            if block_count > 1:
                self.nscmd.config_stream_vary(da_mode=1, da_delta=1, da_limit=block_count - 1)
            else:
                self.nscmd.config_stream_vary()
            self._configure_stream(UnicastStream(framesize, loading, src_mac, base_mac), stream_port_idx=tx_port_idx)
            self.nscmd.config_tx_txpkts(tx_port_idx, block_count)
            self.nscmd.config_tx_isimmediate(1)
            self.nscmd.transmit_pkts(tx_port_idx)
            total_duration += self._estimate_burst_duration(framesize, block_count, loading)

        # Reset so this doesn't leak into whatever set_stream() call comes next.
        self.nscmd.config_stream_vary()
        time.sleep(total_duration + self.cfg.counter_settle_time)

    def _read_port_counters(self, stream: Union[UnicastStream, BroadcastStream]) -> Dict[str, int]:
        self._ensure_open()
        rx_counter_idx = (
            self.nsconst.IDX_PORTCOUNTER_RX_BORADCAST
            if isinstance(stream, BroadcastStream)
            else self.nsconst.IDX_PORTCOUNTER_RX_UNICAST
        )
        for port_idx in {self.tx_port_idx, self.rx_port_idx}:
            self.nscmd.read_counter_port_once(port_idx)
        time.sleep(self.cfg.counter_read_wait)
        return {
            "tx_packets": int(self.nscmd.get_counter_port(self.tx_port_idx, self.nsconst.IDX_PORTCOUNTER_TX_PKT)),
            "rx_packets": int(self.nscmd.get_counter_port(self.rx_port_idx, rx_counter_idx)),
        }

    def _read_stream_latency(self) -> Dict[str, float]:
        self._ensure_open()
        self.nscmd.read_counter_stream_once(self.rx_port_idx)
        return {"latency": float(self.nscmd.get_counter_stream_rx_latency(self.rx_port_idx, 0))}

    def _read_monitor_received(self) -> Dict[str, bool]:
        self._ensure_open()
        self.nscmd.read_counter_port_once(self.monitor_port_idx)
        time.sleep(self.cfg.counter_read_wait)
        received = self.nscmd.get_counter_port(self.monitor_port_idx, self.nsconst.IDX_PORTCOUNTER_RX_UNICAST) > 0
        return {"monitor_received": received}

    @staticmethod
    def _default_mac(port) -> str:
        cid, bid, pid = port
        return "00:22:A2:{:02X}:{:02X}:{:02X}".format(cid, bid, pid)

    def _clear_counters(self, clear_stream: bool = False) -> None:
        port_idxs = {self.tx_port_idx, self.rx_port_idx}
        if self.tx_port2_idx is not None:
            port_idxs.add(self.tx_port2_idx)
        if self.monitor_port_idx is not None:
            port_idxs.add(self.monitor_port_idx)
        if self.mesh_tx_port_idxs is not None:
            port_idxs.update(self.mesh_tx_port_idxs)
        if self.mesh_rx_port_idxs is not None:
            port_idxs.update(self.mesh_rx_port_idxs)
        if self.mesh_port_idxs is not None:
            port_idxs.update(self.mesh_port_idxs)
        for port_idx in port_idxs:
            self.nscmd.clear_counter_port(port_idx)
            if clear_stream:
                self.nscmd.clear_counter_stream(port_idx)
        if self.cfg.counter_clear_wait > 0:
            time.sleep(self.cfg.counter_clear_wait)

    def _estimate_burst_duration(self, framesize: int, burst_frames: int, loading: float = 100.0) -> float:
        pps = max(1, (self._media_speed_bps() // 8) // (framesize + 20))
        pps = max(1, int(pps * loading / 100.0))
        return burst_frames / float(pps)

    def open(self) -> None:
        self.nscmd = NuPython.NuStreamsModuleSetting()
        self.nsconst = nuconst.NuStreamsConst()

        if self.nscmd.server_connect(self.cfg.server_ip) == 0:
            self.close()
            raise RuntimeError(f"Connect to NuPython server {self.cfg.server_ip} failed")
        self.connected = True

        ports = {self.cfg.tx_port, self.cfg.rx_port}
        if self.cfg.tx_port2 is not None:
            ports.add(self.cfg.tx_port2)
        if self.cfg.monitor_port is not None:
            ports.add(self.cfg.monitor_port)
        if self.cfg.mesh_tx_ports is not None:
            ports.update(self.cfg.mesh_tx_ports)
        if self.cfg.mesh_rx_ports is not None:
            ports.update(self.cfg.mesh_rx_ports)
        if self.cfg.mesh_ports is not None:
            ports.update(self.cfg.mesh_ports)
        for port in ports:
            self.nscmd.port_mark(*port)

        if self.nscmd.port_lock() == 0:
            self.close()
            raise RuntimeError("Lock NuPython test port failed")
        self.locked = True

        self.tx_port_idx = self.nscmd.get_portidx(*self.cfg.tx_port)
        self.rx_port_idx = self.nscmd.get_portidx(*self.cfg.rx_port)
        if self.cfg.tx_port2 is not None:
            self.tx_port2_idx = self.nscmd.get_portidx(*self.cfg.tx_port2)
        if self.cfg.monitor_port is not None:
            self.monitor_port_idx = self.nscmd.get_portidx(*self.cfg.monitor_port)
        if self.cfg.mesh_tx_ports is not None:
            self.mesh_tx_port_idxs = [self.nscmd.get_portidx(*p) for p in self.cfg.mesh_tx_ports]
        if self.cfg.mesh_rx_ports is not None:
            self.mesh_rx_port_idxs = [self.nscmd.get_portidx(*p) for p in self.cfg.mesh_rx_ports]
        if self.cfg.mesh_ports is not None:
            self.mesh_port_idxs = [self.nscmd.get_portidx(*p) for p in self.cfg.mesh_ports]
        if (
            self.tx_port_idx < 0
            or self.rx_port_idx < 0
            or (self.cfg.tx_port2 is not None and self.tx_port2_idx < 0)
            or (self.cfg.monitor_port is not None and self.monitor_port_idx < 0)
            or (self.mesh_tx_port_idxs is not None and any(i < 0 for i in self.mesh_tx_port_idxs))
            or (self.mesh_rx_port_idxs is not None and any(i < 0 for i in self.mesh_rx_port_idxs))
            or (self.mesh_port_idxs is not None and any(i < 0 for i in self.mesh_port_idxs))
        ):
            self.close()
            raise RuntimeError("Cannot resolve NuPython port index")

        try:
            self._configure_arp_reply()
        except Exception:
            self.close()
            raise

        port_idxs = {self.tx_port_idx, self.rx_port_idx}
        if self.cfg.tx_port2 is not None:
            port_idxs.add(self.tx_port2_idx)
        if self.cfg.monitor_port is not None:
            port_idxs.add(self.monitor_port_idx)
        if self.mesh_tx_port_idxs is not None:
            port_idxs.update(self.mesh_tx_port_idxs)
        if self.mesh_rx_port_idxs is not None:
            port_idxs.update(self.mesh_rx_port_idxs)
        if self.mesh_port_idxs is not None:
            port_idxs.update(self.mesh_port_idxs)
        for port_idx in port_idxs:
            self.nscmd.read_info_link(port_idx)

    def close(self) -> None:
        if self.nscmd is None:
            return

        try:
            if self.arp_reply_started and self.tx_port_idx is not None:
                self.nscmd.arp_reply_stop(self.tx_port_idx)
        finally:
            self.arp_reply_started = False
            try:
                if self.locked:
                    self.nscmd.port_unlock()
            finally:
                self.locked = False
                try:
                    if self.connected:
                        self.nscmd.server_disconnect()
                finally:
                    self.connected = False
                    try:
                        self.nscmd.log_close()
                    except Exception:
                        pass

    def _configure_arp_reply(self) -> None:
        entries = load_arp_reply_entries(self.cfg.arp_reply_config)
        if not entries:
            return

        max_nodes = len(self.nscmd.ns_cmd_arpreply.arpnode)
        if len(entries) > max_nodes:
            raise ValueError(
                f"ARP reply CSV enables {len(entries)} entries; NuPython supports at most {max_nodes}"
            )

        for node_index in range(max_nodes):
            self.nscmd.config_arp_enablenode(node_index, False)

        for node_index, entry in enumerate(entries):
            self.nscmd.config_arp_enablenode(node_index, True)
            self.nscmd.config_arp_mac(node_index, entry["mac"])
            self.nscmd.config_arp_ipv4(node_index, entry["ipv4"])
            self.nscmd.config_arp_gateway(node_index, entry["gateway"])

        self.nscmd.arp_reply_start(self.tx_port_idx)
        self.arp_reply_started = True
        if self.cfg.arp_reply_start_wait > 0:
            time.sleep(self.cfg.arp_reply_start_wait)

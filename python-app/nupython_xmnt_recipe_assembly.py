import time
from dataclasses import replace
from typing import Dict, List

from nupython_xmnt import (
    NoLearning,
    AddressLearning,
    VaryingAddressAgedLearning,
    UnicastStream,
    BroadcastStream,
    ErrorStream,
    PressureStream,
    ImmediateSingle,
    SynchronizedMulti,
    MeshStream,
    MeshErrorStream,
    MeshPressureStream,
)
from nupython_xmnt_recipe_spec import (
    OneToOneTopology,
    ManyToMany,
    FullyMesh,
    NoLearningSpec,
    AddressLearningSpec,
    VaryingAddressAgedLearningSpec,
    UnicastStreamSpec,
    BroadcastStreamSpec,
    MacSweepStreamSpec,
    ErrorSweepStreamSpec,
    PressureStreamSpec,
    ImmediateSingleKind,
    SynchronizedMultiKind,
    PortCountersReaderKind,
    MonitorReceivedReaderKind,
    StreamLatencyReaderKind,
    PairwiseStreamReaderKind,
)


def _resolve_topology_ports(topology, backend) -> Dict[str, object]:
    """Resolve a Topology into concrete port roles.

    The one-to-one family (OneToOneTopology.*) returns {"tx_ports": [...],
    "rx_port": a single index or None, "monitor_port": a single index or None}.

    ManyToMany/FullyMesh return {"tx_ports": [...], "rx_ports": [...]} (note the
    plural "rx_ports"; for FullyMesh, tx_ports and rx_ports are the same list because
    every port both sends and receives). Downstream stages (_resolve_streams(),
    _resolve_learning(), _read()) detect the plural key and switch to their mesh
    behavior, e.g. building a MeshStream so each tx port sends to every rx port.
    """

    if isinstance(topology, OneToOneTopology.TwoPort):
        return {"tx_ports": [backend.tx_port_idx], "rx_port": backend.rx_port_idx, "monitor_port": None}
    if isinstance(topology, OneToOneTopology.ThreePortMonitor):
        return {
            "tx_ports": [backend.tx_port_idx],
            "rx_port": backend.rx_port_idx,
            "monitor_port": backend.monitor_port_idx,
        }
    if isinstance(topology, ManyToMany):
        if backend.mesh_tx_port_idxs is None or backend.mesh_rx_port_idxs is None:
            raise ValueError("ManyToMany topology requires cfg.mesh_tx_ports and cfg.mesh_rx_ports")
        return {"tx_ports": backend.mesh_tx_port_idxs, "rx_ports": backend.mesh_rx_port_idxs}
    if isinstance(topology, FullyMesh):
        if backend.mesh_port_idxs is None:
            raise ValueError("FullyMesh topology requires cfg.mesh_ports")
        return {"tx_ports": backend.mesh_port_idxs, "rx_ports": backend.mesh_port_idxs}
    raise TypeError(f"unsupported topology type: {type(topology).__name__}")


def _generate_synthetic_macs(count: int) -> List[str]:
    return [
        "02:00:00:{:02X}:{:02X}:{:02X}".format((i >> 16) & 0xFF, (i >> 8) & 0xFF, i & 0xFF)
        for i in range(count)
    ]


def _tx_mac_for_position(backend, position: int) -> str:
    if position == 0:
        return backend._default_mac(backend.cfg.tx_port)
    if position == 1:
        return backend._default_mac(backend.cfg.tx_port2)
    raise ValueError(f"unsupported tx port position: {position}")


def _mesh_port_macs(backend, port_tuples, port_idxs) -> List[tuple]:
    """Pair the raw mesh port tuples (cfg.mesh_tx_ports/mesh_rx_ports/mesh_ports) with
    the port indexes resolved by open() (both in the same order) and compute each
    port's MAC. Returns [(port_idx, mac), ...] in input order."""
    return [(port_idx, backend._default_mac(tuple_)) for tuple_, port_idx in zip(port_tuples, port_idxs)]


def _mesh_receiver_lookup(backend, ports: dict) -> Dict[str, int]:
    """Return a MAC -> receiving port index map for a mesh topology, and explicitly ask
    the chassis to report fresh stream counters (otherwise stale values are read; this
    step was found to be required on real hardware). Shared by
    PairwiseStreamReaderKind (packet matrix) and the mesh branch of
    StreamLatencyReaderKind (latency matrix)."""
    rx_port_tuples = backend.cfg.mesh_rx_ports if backend.cfg.mesh_rx_ports is not None else backend.cfg.mesh_ports
    rx_macs = _mesh_port_macs(backend, rx_port_tuples, ports["rx_ports"])
    for port_idx in set(ports["tx_ports"]) | set(ports["rx_ports"]):
        backend.nscmd.read_counter_stream_once(port_idx)
    return {mac: port_idx for port_idx, mac in rx_macs}


def _first_tx_mac(backend, ports: dict) -> str:
    """Return the MAC that actually belongs to the first sending port. In a mesh
    topology cfg.tx_port is an unrelated port, so the real mesh port map is used."""
    if "rx_ports" not in ports:
        return _tx_mac_for_position(backend, 0)
    tx_port_tuples = backend.cfg.mesh_tx_ports if backend.cfg.mesh_tx_ports is not None else backend.cfg.mesh_ports
    tx_macs = _mesh_port_macs(backend, tx_port_tuples, ports["tx_ports"])
    return tx_macs[0][1]


def _resolve_loading(stream_spec, target_now) -> float:
    if target_now is not None:
        return target_now
    if stream_spec.loading is None:
        raise ValueError(
            f"{type(stream_spec).__name__} requires a fixed 'loading' value when no target_now is provided"
        )
    return stream_spec.loading


def _resolve_streams(stream_spec, backend, ports: dict, target_now, framesize: int) -> List[tuple]:
    tx_ports = ports["tx_ports"]

    if "rx_ports" in ports and isinstance(stream_spec, UnicastStreamSpec):
        tx_port_tuples = backend.cfg.mesh_tx_ports if backend.cfg.mesh_tx_ports is not None else backend.cfg.mesh_ports
        rx_port_tuples = backend.cfg.mesh_rx_ports if backend.cfg.mesh_rx_ports is not None else backend.cfg.mesh_ports
        tx_macs = _mesh_port_macs(backend, tx_port_tuples, ports["tx_ports"])
        rx_macs = _mesh_port_macs(backend, rx_port_tuples, ports["rx_ports"])
        loading = _resolve_loading(stream_spec, target_now)
        result = []
        sid_offset = 0
        for tx_port_idx, tx_mac in tx_macs:
            dest_macs = [mac for port_idx, mac in rx_macs if port_idx != tx_port_idx]
            result.append((tx_port_idx, MeshStream(tx_mac, dest_macs, framesize, loading, sid_offset=sid_offset)))
            sid_offset += len(dest_macs)
        if sid_offset > 64:
            raise ValueError(
                f"ManyToMany/FullyMesh 需要 {sid_offset} 個 stream slot,"
                f"超過 vendor SDK 上限 64(get_counter_stream_rx_pkts 只支援 sidx<64)"
            )
        return result

    if "rx_ports" in ports and isinstance(stream_spec, BroadcastStreamSpec):
        tx_port_tuples = backend.cfg.mesh_tx_ports if backend.cfg.mesh_tx_ports is not None else backend.cfg.mesh_ports
        tx_macs = _mesh_port_macs(backend, tx_port_tuples, ports["tx_ports"])
        loading = _resolve_loading(stream_spec, target_now)
        return [(tx_port_idx, BroadcastStream(framesize, loading, tx_mac)) for tx_port_idx, tx_mac in tx_macs]

    if "rx_ports" in ports and isinstance(stream_spec, ErrorSweepStreamSpec):
        tx_port_tuples = backend.cfg.mesh_tx_ports if backend.cfg.mesh_tx_ports is not None else backend.cfg.mesh_ports
        rx_port_tuples = backend.cfg.mesh_rx_ports if backend.cfg.mesh_rx_ports is not None else backend.cfg.mesh_ports
        tx_macs = _mesh_port_macs(backend, tx_port_tuples, ports["tx_ports"])
        rx_macs = _mesh_port_macs(backend, rx_port_tuples, ports["rx_ports"])
        result = []
        sid_offset = 0
        for tx_port_idx, tx_mac in tx_macs:
            entries = []
            for dest_port_idx, dest_mac in rx_macs:
                if dest_port_idx == tx_port_idx:
                    continue
                for error_type in stream_spec.error_types:
                    if error_type == "undersize":
                        fs = stream_spec.undersize_framesize
                    elif error_type == "oversize":
                        fs = stream_spec.oversize_framesize
                    else:
                        fs = framesize
                    entries.append((dest_mac, error_type, fs))
            result.append((tx_port_idx, MeshErrorStream(tx_mac, entries, stream_spec.loading, sid_offset=sid_offset)))
            sid_offset += len(entries)
        if sid_offset > 64:
            raise ValueError(
                f"ManyToMany/FullyMesh Error Filtering 需要 {sid_offset} 個 stream slot,"
                f"超過 vendor SDK 上限 64(get_counter_stream_rx_pkts 只支援 sidx<64)"
            )
        return result

    if "rx_ports" in ports and isinstance(stream_spec, PressureStreamSpec):
        tx_port_tuples = backend.cfg.mesh_tx_ports if backend.cfg.mesh_tx_ports is not None else backend.cfg.mesh_ports
        rx_port_tuples = backend.cfg.mesh_rx_ports if backend.cfg.mesh_rx_ports is not None else backend.cfg.mesh_ports
        tx_macs = _mesh_port_macs(backend, tx_port_tuples, ports["tx_ports"])
        rx_macs = _mesh_port_macs(backend, rx_port_tuples, ports["rx_ports"])
        result = []
        sid_offset = 0
        for tx_port_idx, tx_mac in tx_macs:
            dest_macs = [mac for port_idx, mac in rx_macs if port_idx != tx_port_idx]
            result.append((tx_port_idx, MeshPressureStream(tx_mac, dest_macs, framesize, stream_spec.gap_bits, sid_offset=sid_offset)))
            sid_offset += len(dest_macs)
        if sid_offset > 64:
            raise ValueError(
                f"ManyToMany/FullyMesh Forwarding Pressure 需要 {sid_offset} 個 stream slot,"
                f"超過 vendor SDK 上限 64(get_counter_stream_rx_pkts 只支援 sidx<64)"
            )
        return result

    if isinstance(stream_spec, MacSweepStreamSpec):
        tx_port_idx = tx_ports[0]
        tx_mac = _first_tx_mac(backend, ports)
        mac_count = max(1, int(target_now))
        macs = _generate_synthetic_macs(mac_count)
        return [(tx_port_idx, UnicastStream(framesize, stream_spec.loading, tx_mac, mac)) for mac in macs]

    if isinstance(stream_spec, ErrorSweepStreamSpec):
        tx_port_idx = tx_ports[0]
        tx_mac = _tx_mac_for_position(backend, 0)
        rx_mac = backend._default_mac(backend.cfg.rx_port)
        result = []
        for error_type in stream_spec.error_types:
            if error_type == "undersize":
                fs = stream_spec.undersize_framesize
            elif error_type == "oversize":
                fs = stream_spec.oversize_framesize
            else:
                fs = framesize
            result.append((tx_port_idx, ErrorStream(fs, stream_spec.loading, tx_mac, rx_mac, error_type)))
        return result

    if isinstance(stream_spec, UnicastStreamSpec):
        loading = _resolve_loading(stream_spec, target_now)
        rx_mac = backend._default_mac(backend.cfg.rx_port)
        return [
            (tx_port_idx, UnicastStream(framesize, loading, _tx_mac_for_position(backend, position), rx_mac))
            for position, tx_port_idx in enumerate(tx_ports)
        ]

    if isinstance(stream_spec, BroadcastStreamSpec):
        loading = _resolve_loading(stream_spec, target_now)
        return [
            (tx_port_idx, BroadcastStream(framesize, loading, _tx_mac_for_position(backend, position)))
            for position, tx_port_idx in enumerate(tx_ports)
        ]

    if isinstance(stream_spec, PressureStreamSpec):
        tx_port_idx = tx_ports[0]
        tx_mac = _tx_mac_for_position(backend, 0)
        rx_mac = backend._default_mac(backend.cfg.rx_port)
        return [(tx_port_idx, PressureStream(framesize, tx_mac, rx_mac, stream_spec.gap_bits))]

    raise TypeError(f"unsupported stream spec type: {type(stream_spec).__name__}")


def _collect_target_macs(streams: List[tuple]) -> List[str]:
    return list(dict.fromkeys(stream.dmac for _, stream in streams if hasattr(stream, "dmac")))


def _resolve_learning(learning_spec, backend, ports: dict, streams: List[tuple]):
    if isinstance(learning_spec, NoLearningSpec):
        return NoLearning()

    if "rx_ports" in ports and isinstance(learning_spec, AddressLearningSpec):
        tx_port_tuples = backend.cfg.mesh_tx_ports if backend.cfg.mesh_tx_ports is not None else backend.cfg.mesh_ports
        rx_port_tuples = backend.cfg.mesh_rx_ports if backend.cfg.mesh_rx_ports is not None else backend.cfg.mesh_ports
        tx_macs = _mesh_port_macs(backend, tx_port_tuples, ports["tx_ports"])
        rx_macs = _mesh_port_macs(backend, rx_port_tuples, ports["rx_ports"])
        arbitrary_dest_mac = tx_macs[0][1]
        return [AddressLearning(rx_port_idx, [rx_mac], arbitrary_dest_mac) for rx_port_idx, rx_mac in rx_macs]

    tx_mac = _tx_mac_for_position(backend, 0)
    target_macs = _collect_target_macs(streams)

    if isinstance(learning_spec, AddressLearningSpec):
        return AddressLearning(ports["rx_port"], target_macs, tx_mac)

    raise TypeError(f"unsupported learning spec type: {type(learning_spec).__name__}")


def _read(reader_kind, backend, ports: dict, streams: List[tuple] = None) -> Dict[str, object]:
    if isinstance(reader_kind, (tuple, list)):
        merged: Dict[str, object] = {}
        for sub_kind in reader_kind:
            merged.update(_read(sub_kind, backend, ports, streams))
        return merged

    if isinstance(reader_kind, PortCountersReaderKind):
        rx_port_list = ports["rx_ports"] if "rx_ports" in ports else [ports["rx_port"]]
        if reader_kind.use_stream_counters:

            for port_idx in set(ports["tx_ports"]) | set(rx_port_list):
                backend.nscmd.read_counter_stream_once(port_idx)
            tx_by_port = {
                port_idx: int(backend.nscmd.get_counter_stream_tx_pkts(port_idx, 0))
                for port_idx in ports["tx_ports"]
            }
            rx_by_port = {
                port_idx: int(backend.nscmd.get_counter_stream_rx_pkts(port_idx, 0))
                for port_idx in rx_port_list
            }
        else:
            for port_idx in ports["tx_ports"]:
                backend.nscmd.read_counter_port_once(port_idx)
            for port_idx in rx_port_list:
                backend.nscmd.read_counter_port_once(port_idx)
            time.sleep(backend.cfg.counter_read_wait)
            tx_by_port = {
                port_idx: int(backend.nscmd.get_counter_port(port_idx, backend.nsconst.IDX_PORTCOUNTER_TX_PKT))
                for port_idx in ports["tx_ports"]
            }
            is_broadcast = bool(streams) and isinstance(streams[0][1], BroadcastStream)
            rx_idx = backend.nsconst.IDX_PORTCOUNTER_RX_BORADCAST if is_broadcast else backend.nsconst.IDX_PORTCOUNTER_RX_UNICAST
            rx_by_port = {
                port_idx: int(backend.nscmd.get_counter_port(port_idx, rx_idx))
                for port_idx in rx_port_list
            }
        tx_total = sum(tx_by_port.values())
        rx_total = sum(rx_by_port.values())
        result = {"tx_packets": int(tx_total), "rx_packets": int(rx_total)}
        if reader_kind.per_port_detail:
            result["tx_packets_by_port"] = tx_by_port
            result["rx_packets_by_port"] = rx_by_port
        return result

    if isinstance(reader_kind, MonitorReceivedReaderKind):
        return backend._read_monitor_received()

    if isinstance(reader_kind, StreamLatencyReaderKind):
        if "rx_ports" not in ports:
            return backend._read_stream_latency()
        mac_to_port_idx = _mesh_receiver_lookup(backend, ports)
        matrix = {}
        for tx_port_idx, mesh_obj in streams:
            if not isinstance(mesh_obj, MeshStream):
                raise TypeError(
                    "StreamLatencyReaderKind's mesh mode only supports MeshStream "
                    f"(from UnicastStreamSpec/BroadcastStreamSpec); got {type(mesh_obj).__name__} "
                    "-- latency isn't meaningful for error-injection or pressure streams"
                )
            for local_idx, dest_mac in enumerate(mesh_obj.dest_macs):
                sid = mesh_obj.sid_offset + local_idx
                receiver_port_idx = mac_to_port_idx[dest_mac]
                matrix[(tx_port_idx, receiver_port_idx)] = {
                    "latency": float(backend.nscmd.get_counter_stream_rx_latency(receiver_port_idx, sid)),
                }
        return {"pairwise_latency_matrix": matrix}

    if isinstance(reader_kind, PairwiseStreamReaderKind):
        mac_to_port_idx = _mesh_receiver_lookup(backend, ports)
        matrix = {}
        is_error_matrix = False
        for tx_port_idx, mesh_obj in streams:
            if isinstance(mesh_obj, MeshErrorStream):
                is_error_matrix = True
                for local_idx, (dest_mac, error_type, _fs) in enumerate(mesh_obj.entries):
                    sid = mesh_obj.sid_offset + local_idx
                    receiver_port_idx = mac_to_port_idx[dest_mac]
                    matrix[(tx_port_idx, receiver_port_idx, error_type)] = {
                        "tx_packets": int(backend.nscmd.get_counter_stream_tx_pkts(tx_port_idx, sid)),
                        "rx_packets": int(backend.nscmd.get_counter_stream_rx_pkts(receiver_port_idx, sid)),
                    }
            else:
                for local_idx, dest_mac in enumerate(mesh_obj.dest_macs):
                    sid = mesh_obj.sid_offset + local_idx
                    receiver_port_idx = mac_to_port_idx[dest_mac]
                    matrix[(tx_port_idx, receiver_port_idx)] = {
                        "tx_packets": int(backend.nscmd.get_counter_stream_tx_pkts(tx_port_idx, sid)),
                        "rx_packets": int(backend.nscmd.get_counter_stream_rx_pkts(receiver_port_idx, sid)),
                    }
        return {"pairwise_error_matrix": matrix} if is_error_matrix else {"pairwise_matrix": matrix}

    raise TypeError(f"unsupported reader kind: {type(reader_kind).__name__}")


def _pressure_burst_frames(backend, framesize: int, gap_bits: int) -> int:
    speed_bps = backend._media_speed_bps()
    bits_per_slot = (framesize + 8) * 8 + gap_bits
    pps = speed_bps / bits_per_slot
    return max(1, int(pps * backend.cfg.tx_duration_time))


def _configure_tx_mode_and_get_duration(backend, port_idx: int, framesize: int, stream_obj) -> float:
    if isinstance(stream_obj, PressureStream):
        burst_frames = _pressure_burst_frames(backend, framesize, stream_obj.gap_bits)
        backend.nscmd.config_tx_txpkts(port_idx, burst_frames)
        return backend._estimate_burst_duration(framesize, burst_frames)

    if isinstance(stream_obj, MeshPressureStream):
        per_dest_burst = _pressure_burst_frames(backend, framesize, stream_obj.gap_bits)
        total_burst = per_dest_burst * len(stream_obj.dest_macs)
        backend.nscmd.config_tx_txpkts(port_idx, total_burst)
        return backend._estimate_burst_duration(framesize, total_burst)

    if backend.cfg.mode_tx == 0:
        backend.nscmd.config_tx_txtime(port_idx, backend.cfg.tx_duration_time)
        return float(backend.cfg.tx_duration_time)

    backend.nscmd.config_tx_txpkts(port_idx, backend.cfg.tx_burst_frames)
    return backend._estimate_burst_duration(framesize, backend.cfg.tx_burst_frames)


def _fire_and_read(streams: List[tuple], trigger_kind, reader_kind, backend, ports: dict, framesize: int) -> dict:
    distinct_ports = {port_idx for port_idx, _ in streams}
    aggregate = getattr(reader_kind, "aggregate", "once")

    if len(distinct_ports) == 1 and aggregate == "sum":
        port_idx = next(iter(distinct_ports))
        use_stream_counters = getattr(reader_kind, "use_stream_counters", False)
        if use_stream_counters:
            rx_port_list = ports["rx_ports"] if "rx_ports" in ports else [ports["rx_port"]]
            for rx_port_idx in rx_port_list:
                if rx_port_idx != port_idx:
                    backend.nscmd.set_config_rxstream(rx_port_idx)
        total: Dict[str, object] = {}
        per_stream_results: List[Dict[str, object]] = []
        for _, stream_obj in streams:
            backend._clear_counters(clear_stream=use_stream_counters)
            backend._configure_stream(stream_obj, stream_port_idx=port_idx)
            duration = _configure_tx_mode_and_get_duration(backend, port_idx, framesize, stream_obj)
            if use_stream_counters:
                backend.nscmd.set_config_rxstream(port_idx)
            backend._fire_trigger(ImmediateSingle(port_idx))
            time.sleep(duration + backend.cfg.counter_settle_time)
            partial = _read(reader_kind, backend, ports, [(port_idx, stream_obj)])
            per_stream_results.append(partial)
            for key, value in partial.items():
                if isinstance(value, dict):
                    merged = total.get(key, {})
                    for sub_key, sub_value in value.items():
                        merged[sub_key] = merged.get(sub_key, 0) + sub_value
                    total[key] = merged
                else:
                    total[key] = total.get(key, 0) + value
        if getattr(reader_kind, "keep_per_stream_results", False):
            total["per_stream_results"] = per_stream_results
        return total

    durations = []

    if isinstance(trigger_kind, SynchronizedMultiKind) and len(distinct_ports) > 1:
        backend.nscmd.config_tx_isimmediate(0)
        for port_idx, stream_obj in streams:
            backend._configure_stream(stream_obj, stream_port_idx=port_idx)
            durations.append(_configure_tx_mode_and_get_duration(backend, port_idx, framesize, stream_obj))
            if isinstance(reader_kind, PairwiseStreamReaderKind):
                backend.nscmd.set_config_rxstream(port_idx)
            if isinstance(reader_kind, StreamLatencyReaderKind) and "rx_ports" in ports and port_idx in ports["rx_ports"]:
                backend.nscmd.set_config_rxstream(port_idx)
            backend.nscmd.transmit_pkts(port_idx)
        if isinstance(reader_kind, StreamLatencyReaderKind):
            if "rx_ports" in ports:
                for rx_port_idx in ports["rx_ports"]:
                    if rx_port_idx not in distinct_ports:
                        backend.nscmd.set_config_rxstream(rx_port_idx)
            else:
                backend.nscmd.set_config_rxstream(backend.rx_port_idx)
        if isinstance(reader_kind, PairwiseStreamReaderKind):
            for rx_port_idx in ports["rx_ports"]:
                if rx_port_idx not in distinct_ports:
                    backend.nscmd.set_config_rxstream(rx_port_idx)
        backend.nscmd.transmit_pkts_sync()
    else:
        for port_idx, stream_obj in streams:
            backend._configure_stream(stream_obj, stream_port_idx=port_idx)
            durations.append(_configure_tx_mode_and_get_duration(backend, port_idx, framesize, stream_obj))
            if isinstance(reader_kind, PairwiseStreamReaderKind):
                backend.nscmd.set_config_rxstream(port_idx)
            if isinstance(reader_kind, StreamLatencyReaderKind) and "rx_ports" in ports and port_idx in ports["rx_ports"]:
                backend.nscmd.set_config_rxstream(port_idx)
        if isinstance(reader_kind, StreamLatencyReaderKind):
            if "rx_ports" in ports:
                for rx_port_idx in ports["rx_ports"]:
                    if rx_port_idx not in distinct_ports:
                        backend.nscmd.set_config_rxstream(rx_port_idx)
            else:
                backend.nscmd.set_config_rxstream(backend.rx_port_idx)
        if isinstance(reader_kind, PairwiseStreamReaderKind):
            for rx_port_idx in ports["rx_ports"]:
                if rx_port_idx not in distinct_ports:
                    backend.nscmd.set_config_rxstream(rx_port_idx)
        for port_idx, _ in streams:
            backend._fire_trigger(ImmediateSingle(port_idx))

    time.sleep(max(durations) + backend.cfg.counter_settle_time)
    return _read(reader_kind, backend, ports, streams)


def _reader_kinds(reader_kind):
    """Flatten reader_kind into a tuple (works for a single kind or a tuple of kinds)
    for the sanity checks."""
    return reader_kind if isinstance(reader_kind, (tuple, list)) else (reader_kind,)


def assemble_and_run(spec, backend, framesize: int, target_now=None) -> Dict[str, object]:
    ports = _resolve_topology_ports(spec.topology, backend)

    if "rx_ports" not in ports and any(isinstance(r, PairwiseStreamReaderKind) for r in _reader_kinds(spec.reader)):
        raise ValueError(
            "PairwiseStreamReaderKind requires a mesh topology (ManyToMany/FullyMesh); "
            f"got {type(spec.topology).__name__}"
        )
    if (
        "rx_ports" in ports
        and isinstance(spec.stream, ErrorSweepStreamSpec)
        and len(spec.stream.error_types) > 1
    ):
        return _assemble_and_run_mesh_error_sweep(spec, backend, ports, framesize)

    streams = _resolve_streams(spec.stream, backend, ports, target_now, framesize)
    learning = _resolve_learning(spec.learning, backend, ports, streams)

    if isinstance(learning, list):
        for single_learning in learning:
            backend._apply_learning(single_learning)
    else:
        backend._apply_learning(learning)
    backend._clear_counters(clear_stream=isinstance(spec.reader, (StreamLatencyReaderKind, PairwiseStreamReaderKind)))

    return _fire_and_read(streams, spec.trigger, spec.reader, backend, ports, framesize)


def _assemble_and_run_mesh_error_sweep(spec, backend, ports: Dict[str, object], framesize: int) -> Dict[str, object]:
    learning = _resolve_learning(spec.learning, backend, ports, [])
    if isinstance(learning, list):
        for single_learning in learning:
            backend._apply_learning(single_learning)
    else:
        backend._apply_learning(learning)

    clear_stream = isinstance(spec.reader, (StreamLatencyReaderKind, PairwiseStreamReaderKind))
    keep_per_stream_results = getattr(spec.reader, "keep_per_stream_results", False)
    per_stream_results: List[Dict[str, object]] = []
    merged: Dict[str, object] = {}
    for error_type in spec.stream.error_types:
        single_type_stream_spec = replace(spec.stream, error_types=(error_type,))
        streams = _resolve_streams(single_type_stream_spec, backend, ports, None, framesize)
        backend._clear_counters(clear_stream=clear_stream)
        partial = _fire_and_read(streams, spec.trigger, spec.reader, backend, ports, framesize)
        if keep_per_stream_results:
            per_stream_results.append({k: v for k, v in partial.items() if k != "per_stream_results"})
        _merge_mesh_error_sweep_round(merged, partial)
    if keep_per_stream_results:
        merged["per_stream_results"] = per_stream_results
    return merged


def _merge_mesh_error_sweep_round(merged: Dict[str, object], partial: Dict[str, object]) -> None:
    for key, value in partial.items():
        if key == "per_stream_results":
            continue
        if isinstance(value, dict):
            existing = merged.setdefault(key, {})
            for sub_key, sub_value in value.items():
                if isinstance(sub_value, dict):
                    nested = existing.setdefault(sub_key, {})
                    for nested_key, nested_value in sub_value.items():
                        nested[nested_key] = nested.get(nested_key, 0) + nested_value
                else:
                    existing[sub_key] = existing.get(sub_key, 0) + sub_value
        else:
            merged[key] = merged.get(key, 0) + value


def make_convergence_test_fn(recipe_spec):
    executor = (
        assemble_and_run_varying_address_caching
        if isinstance(recipe_spec.learning, VaryingAddressAgedLearningSpec)
        else assemble_and_run
    )

    def test_fn(cfg, framesize, target_now, backend=None, fake_result_fn=None):
        if not cfg.simulate:
            if backend is None:
                raise RuntimeError("real mode requires a backend")
            return executor(recipe_spec, backend, framesize, target_now=target_now)
        if fake_result_fn is None:
            raise RuntimeError("simulate mode requires fake_result_fn")
        return fake_result_fn(cfg, framesize, target_now)
    return test_fn


def make_single_test_fn(recipe_spec):
    def test_fn(cfg, framesize, backend=None, fake_result_fn=None):
        if not cfg.simulate:
            if backend is None:
                raise RuntimeError("real mode requires a backend")
            return assemble_and_run(recipe_spec, backend, framesize, target_now=None)
        if fake_result_fn is None:
            raise RuntimeError("simulate mode requires fake_result_fn")
        return fake_result_fn(cfg, framesize)
    return test_fn


_VARYING_ADDRESS_CACHING_TEST_LOADING = 10.0


def assemble_and_run_varying_address_caching(spec, backend, framesize: int, target_now=None) -> Dict[str, object]:
    ports = _resolve_topology_ports(spec.topology, backend)
    learning_spec = spec.learning
    mac_count = learning_spec.mac_count if learning_spec.mac_count is not None else max(1, int(target_now))
    learning_loading = learning_spec.learning_loading if learning_spec.learning_loading is not None else target_now
    tx_mac = backend._default_mac(backend.cfg.tx_port)

    learning = VaryingAddressAgedLearning(
        aging_time=learning_spec.aging_time,
        sender_port_idx=ports["rx_port"],
        tx_port_idx=ports["tx_ports"][0],
        mac_count=mac_count,
        dest_mac=tx_mac,
        src_mac=tx_mac,
        framesize=framesize,
        loading=_VARYING_ADDRESS_CACHING_TEST_LOADING,
        learning_loading=learning_loading,
    )
    backend._apply_learning(learning)
    return _read(spec.reader, backend, ports)

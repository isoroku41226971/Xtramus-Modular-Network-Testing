from dataclasses import dataclass
from typing import Optional, Tuple


# --- 1. Topology ---

class OneToOneTopology:

    @dataclass
    class TwoPort:
        pass

    @dataclass
    class ThreePortMonitor:
        pass


@dataclass
class ManyToMany:
    pass


@dataclass
class FullyMesh:
    pass


# --- 2. LearningSpec ---

@dataclass
class NoLearningSpec:
    pass


@dataclass
class AddressLearningSpec:
    pass


@dataclass
class VaryingAddressAgedLearningSpec:
    aging_time: float = 300.0
    mac_count: Optional[int] = None  
                                       
    learning_loading: Optional[float] = None  
                                               
                                               


# --- 3. StreamSpec ---

@dataclass
class UnicastStreamSpec:
    loading: Optional[float] = None


@dataclass
class BroadcastStreamSpec:
    loading: Optional[float] = None

@dataclass
class MacSweepStreamSpec:
    loading: float = 10.0


@dataclass
class ErrorSweepStreamSpec:
    error_types: Tuple[str, ...] = ("bad_crc", "undersize", "alignment", "oversize")
    loading: float = 10.0
    undersize_framesize: int = 32
    oversize_framesize: int = 2000


@dataclass
class PressureStreamSpec:
    gap_bits: int = 88


# --- 4. TriggerKind ---

@dataclass
class ImmediateSingleKind:
    pass


@dataclass
class SynchronizedMultiKind:
    pass


# --- 5. ReaderKind ---

@dataclass
class PortCountersReaderKind:
    aggregate: str = "once"
    per_port_detail: bool = False
    keep_per_stream_results: bool = False
    use_stream_counters: bool = False


@dataclass
class MonitorReceivedReaderKind:
    aggregate: str = "once"


@dataclass
class StreamLatencyReaderKind:
    pass


@dataclass
class PairwiseStreamReaderKind:
    pass


# --- Bundle ---

@dataclass
class PhysicalRecipeSpec:
    topology: object
    learning: object
    stream: object
    trigger: object
    reader: object

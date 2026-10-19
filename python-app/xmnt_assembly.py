import dataclasses
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Union

from xmnt_config import Config, validate
from xmnt_convergence import (
    get_framesizes,
    run_convergence_framesize,
    run_single_test,
    run_measurement,
)


@dataclass
class ConvergenceSpec:
    test_fn: Callable
    check_fn: Callable
    result_key: str = "throughput"
    zero_result: Optional[dict] = None
    mode_convergence: int = 0
    target_min: float = 1.0
    target_max: float = 100.0
    target_now: float = 50.0
    target_step: float = 10.0
    target_resolution: float = 0.01


@dataclass
class SingleTestSpec:
    test_fn: Callable
    check_fn: Callable


@dataclass
class MeasurementSpec:
    test_fn: Callable


TestSpec = Union[ConvergenceSpec, SingleTestSpec, MeasurementSpec]


def run_test_item(cfg: Config, spec: TestSpec, backend=None, fake_result_fn=None) -> Dict[int, dict]:
    if isinstance(spec, ConvergenceSpec):
        effective_cfg = dataclasses.replace(
            cfg,
            mode_convergence=spec.mode_convergence,
            target_min=spec.target_min,
            target_max=spec.target_max,
            target_now=spec.target_now,
            target_step=spec.target_step,
            target_resolution=spec.target_resolution,
        )
        validate(effective_cfg)
        framesizes = get_framesizes(effective_cfg)
        return {
            fs: run_convergence_framesize(
                effective_cfg, fs, spec.test_fn, spec.check_fn,
                result_key=spec.result_key, zero_result=spec.zero_result,
                backend=backend, fake_result_fn=fake_result_fn,
            )
            for fs in framesizes
        }

    if isinstance(spec, SingleTestSpec):
        validate(cfg)
        framesizes = get_framesizes(cfg)
        return {
            fs: run_single_test(cfg, fs, spec.test_fn, spec.check_fn, backend=backend, fake_result_fn=fake_result_fn)
            for fs in framesizes
        }

    if isinstance(spec, MeasurementSpec):
        validate(cfg)
        framesizes = get_framesizes(cfg)
        return {
            fs: run_measurement(cfg, fs, spec.test_fn, backend=backend, fake_result_fn=fake_result_fn)
            for fs in framesizes
        }

    raise TypeError(f"unsupported spec type: {type(spec).__name__}")

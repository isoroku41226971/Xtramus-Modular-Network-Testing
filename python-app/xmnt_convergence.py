from typing import List, Tuple

from xmnt_config import Config


def generate_sweep(start, stop, step) -> List:
    if step == 0:
        raise ValueError("step cannot be 0")
    if (start < stop and step < 0) or (start > stop and step > 0):
        raise ValueError("step direction does not match start/stop")

    values = []
    current = start
    if step > 0:
        while current < stop:
            values.append(current)
            current = round(current + step, 12)
    else:
        while current > stop:
            values.append(current)
            current = round(current + step, 12)

    if not values or values[-1] != stop:
        values.append(stop)
    return values


def get_framesizes(cfg: Config) -> List[int]:
    if cfg.mode_framesize == 0:
        return list(cfg.framesize_custom)
    if cfg.mode_framesize == 1:
        return generate_sweep(cfg.framesize_start, cfg.framesize_stop, cfg.framesize_step)
    raise ValueError("invalid mode_framesize")


def next_binary_target(
    passed: bool,
    now: float,
    min_target: float,
    max_target: float,
    fail_count: int,
) -> Tuple[float, float, float, int]:
    if passed:
        min_target = now
        next_now = round((min_target + max_target) / 2.0, 3)
        return next_now, min_target, max_target, fail_count

    fail_count += 1
    if fail_count == 1:
        next_now = round(now * 0.8, 3)
        if next_now < min_target:
            next_now = min_target
        return next_now, min_target, max_target, fail_count

    max_target = now
    next_now = round((min_target + max_target) / 2.0, 3)
    return next_now, min_target, max_target, fail_count


def run_convergence_framesize(
    cfg: Config,
    framesize: int,
    test_fn,
    check_fn,
    result_key: str = "throughput",
    zero_result: dict = None,
    backend=None,
    fake_result_fn=None,
) -> dict:
    # If no iteration ever passes (e.g. the DUT is overloaded from the start), this returns
    # {result_key: 0.0, "passed": False, **zero_result} rather than raising or returning None.
    if cfg.mode_convergence == 0:
        return _run_binary_convergence(cfg, framesize, test_fn, check_fn, result_key, zero_result, backend, fake_result_fn)
    if cfg.mode_convergence == 1:
        return _run_linear_convergence(cfg, framesize, test_fn, check_fn, result_key, zero_result, backend, fake_result_fn)
    raise ValueError("invalid mode_convergence")


def _run_binary_convergence(
    cfg: Config,
    framesize: int,
    test_fn,
    check_fn,
    result_key: str = "throughput",
    zero_result: dict = None,
    backend=None,
    fake_result_fn=None,
) -> dict:
    if cfg.target_resolution <= 0:
        raise ValueError("target_resolution must be greater than 0")

    min_target = round(cfg.target_min, 3)
    max_target = round(cfg.target_max, 3)
    now_target = round(cfg.target_now, 3)
    fail_count = 0
    last_pass_result = None
    previous_states = set()
    final_boundary_test = False

    while True:
        state = (
            round(min_target, 3),
            round(max_target, 3),
            round(now_target, 3),
            fail_count,
        )
        if state in previous_states:
            break
        previous_states.add(state)

        raw_result = test_fn(cfg, framesize, now_target, backend, fake_result_fn)
        checked = check_fn(cfg, raw_result)

        if checked["passed"]:
            last_pass_result = {result_key: now_target, **checked}

        if final_boundary_test:
            break

        next_target, min_target, max_target, fail_count = next_binary_target(
            checked["passed"], now_target, min_target, max_target, fail_count
        )

        if abs(next_target - now_target) <= cfg.target_resolution:
            if next_target > now_target:
                boundary_target = max_target
            elif next_target < now_target:
                boundary_target = min_target
            else:
                boundary_target = max_target if checked["passed"] else min_target

            boundary_target = round(boundary_target, 3)
            if boundary_target == now_target:
                break

            now_target = boundary_target
            final_boundary_test = True
            continue

        now_target = round(next_target, 3)

    if last_pass_result is None:
        return {result_key: 0.0, "passed": False, **(zero_result or {})}
    return last_pass_result


def _run_linear_convergence(
    cfg: Config,
    framesize: int,
    test_fn,
    check_fn,
    result_key: str = "throughput",
    zero_result: dict = None,
    backend=None,
    fake_result_fn=None,
) -> dict:
    if cfg.target_step <= 0:
        raise ValueError("target_step must be greater than 0")

    steps = generate_sweep(cfg.target_min, cfg.target_max, cfg.target_step)
    last_pass_result = None

    for now_target in steps:
        raw_result = test_fn(cfg, framesize, now_target, backend, fake_result_fn)
        checked = check_fn(cfg, raw_result)
        if checked["passed"]:
            last_pass_result = {result_key: now_target, **checked}

    if last_pass_result is None:
        return {result_key: 0.0, "passed": False, **(zero_result or {})}
    return last_pass_result


def run_single_test(cfg: Config, framesize: int, test_fn, check_fn, backend=None, fake_result_fn=None) -> dict:
    raw_result = test_fn(cfg, framesize, backend, fake_result_fn)
    return check_fn(cfg, raw_result)


def run_measurement(cfg: Config, framesize: int, test_fn, backend=None, fake_result_fn=None) -> dict:
    return test_fn(cfg, framesize, backend, fake_result_fn)

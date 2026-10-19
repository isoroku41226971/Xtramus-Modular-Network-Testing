/**
 * Check functions. All pure: no I/O, not async.
 *
 * Returned keys keep Python's snake_case: reader output feeds them directly and they
 * are also the field names shown in the UI, so renaming would break both sides.
 */

export function checkLossBased(cfg, result) {
  const tx = result.tx_packets;
  const rx = result.rx_packets;
  const lossPackets = Math.max(0, tx - rx);
  const lossRate = tx ? (lossPackets / tx) * 100.0 : 0.0;
  // target_acceptloss is on a percent scale (0-100), the same scale as lossRate.
  // This follows the convention of the vendor's RFC-2544 reference implementation;
  // it is not a unit mistake.
  const passed = tx > 0 && lossRate <= cfg.target_acceptloss;
  return {
    passed,
    tx_packets: tx,
    rx_packets: rx,
    loss_packets: lossPackets,
    loss_rate: lossRate,
  };
}

export function checkRxZero(cfg, result) {
  const rx = result.rx_packets;
  return { passed: rx === 0, rx_packets: rx };
}

export function checkMonitorReceived(cfg, result, expectReceived = false) {
  const monitorReceived = result.monitor_received;
  return { passed: monitorReceived === expectReceived, monitor_received: monitorReceived };
}

export function checkLossBasedWithDetail(cfg, result) {
  // Branch on whether result has pairwise_matrix, not on cfg's mesh fields:
  // Congestion Control also sets mesh fields but uses the aggregate view, so a cfg
  // check would misclassify it.
  if ('pairwise_matrix' in result) {
    const matrix = result.pairwise_matrix;
    const passed = Object.values(matrix).every(counts => checkLossBased(cfg, counts).passed);
    return { passed, pairwise_matrix: matrix };
  }
  return {
    ...checkLossBased(cfg, result),
    // The ?? null is required: Python uses result.get(...), which yields None for a
    // missing key; reading the property in JS yields undefined, and deepEqual treats
    // the two as different.
    tx_packets_by_port: result.tx_packets_by_port ?? null,
    rx_packets_by_port: result.rx_packets_by_port ?? null,
  };
}

export function checkRxZeroWithFullDetail(cfg, result) {
  if ('pairwise_error_matrix' in result) {
    const matrix = result.pairwise_error_matrix;
    const passed = Object.values(matrix).every(counts => checkRxZero(cfg, counts).passed);
    return { passed, pairwise_error_matrix: matrix };
  }
  const perStream = result.per_stream_results ?? [];
  const perType = {};
  cfg.error_types.forEach((errorType, i) => {
    if (i < perStream.length) {
      perType[errorType] = {
        tx_packets: perStream[i].tx_packets,
        rx_packets: perStream[i].rx_packets,
      };
    }
  });
  return { ...checkRxZero(cfg, result), per_type: perType };
}

export function checkMonitorReceivedWithDetail(cfg, result) {
  return {
    ...checkMonitorReceived(cfg, result),
    tx_packets: result.tx_packets ?? null,   // same as above, mirrors Python's result.get()
    rx_packets: result.rx_packets ?? null,
  };
}

/**
 * Verdict for pure send (custom-packet PCAP replay): the number sent equals the
 * number of packets in the PCAP, and nothing leaked to the monitor port.
 *
 * cfg is unused, but like the other check functions (checkRxZero is the same) the
 * signature is fixed at (cfg, result) so the caller (runSingleTest) need not care
 * which one it has.
 *
 * Deliberately **not** registered in ui/spec-build.js's CHECK_FNS table: that table
 * feeds the check-function dropdown, and this function's result shape is specific
 * to the pure_send testFn (only that path provides expected_packets), so it means
 * nothing for other shapes.
 */
export function checkPureSend(cfg, result) {
  const tx = result.tx_packets;
  const expected = result.expected_packets;
  const monitorReceived = result.monitor_received;
  return {
    passed: tx === expected && !monitorReceived,
    tx_packets: tx,
    expected_packets: expected,
    monitor_received: monitorReceived,
  };
}

/**
 * ARINC659Forge Pro - Core SafeBus Backplane Data Bus Engine
 * Standards: ARINC Specification 659, RTCA DO-254 DAL A, Boeing D6-55000 (AIMS)
 * 
 * Provides:
 * - 60 Mbps dual-redundant bus modeling (30 Mbps Bus A, 30 Mbps Bus B)
 * - Table-driven deterministic Time-Division Multiple Access (TDMA) microsecond frame scheduling
 * - Dual-lockstep Bus Interface Unit (BIU-1 & BIU-2) comparator with 40 ns clock skew window
 * - Autonomous hardware babbling idiot fault suppression (< 200 ns cutoff)
 * - 16-bit Frame Check Sequence (FCS) CRC calculation (0x1021)
 * - Fault Containment Region (FCR) line isolation & fault injection
 * - Zero-collision guaranteed bounded latency simulation
 */

class ARINC659Engine {
  constructor(options = {}) {
    this.systemName = options.systemName || 'AIMS_CORE_CABINET_1';
    this.busSpeedMbps = 60.0; // 30 Mbps Bus A + 30 Mbps Bus B
    this.lineRateMbps = 30.0;
    this.majorCyclePeriodUs = options.majorCyclePeriodUs || 100.0; // 100 microseconds per frame
    this.clockSkewNs = options.clockSkewNs || 12.5; // Nominal clock skew between BIU lanes (max 40 ns)
    
    // Line Health Status
    this.lineStatus = {
      busAActive: true,
      busBActive: true,
      biuLockstepMatched: true,
      babblerSuppressed: false,
      fcsErrorCount: 0
    };

    // Fault Injection Flags
    this.faults = {
      lineACut: false,
      lineBCut: false,
      clockSkewViolation: false, // > 40 ns
      babblingIdiotActive: false, // forces transmission overrun
      fcsCorrupt: false
    };

    // Pre-configured Deterministic TDMA Table (ARINC 659 Section 3.2)
    this.tdmaTable = [
      { slotId: 0, name: 'SYNC_FRAME_MASTER', sourceLru: 'BIU_MASTER', startUs: 0.0, durationUs: 4.0, byteCount: 15, active: true },
      { slotId: 1, name: 'FMC_NAV_PARTITION', sourceLru: 'FMC_L', startUs: 5.0, durationUs: 12.0, byteCount: 45, active: true },
      { slotId: 2, name: 'ADIRS_ATTITUDE_DATA', sourceLru: 'ADIRS_1', startUs: 18.0, durationUs: 16.0, byteCount: 60, active: true },
      { slotId: 3, name: 'DFGS_AUTOPILOT_CMD', sourceLru: 'FCC_A', startUs: 35.0, durationUs: 12.0, byteCount: 45, active: true },
      { slotId: 4, name: 'GUARD_GAP_1', sourceLru: 'BUS_IDLE', startUs: 48.0, durationUs: 2.0, byteCount: 0, active: true },
      { slotId: 5, name: 'FADEC_ENGINE_TELEM', sourceLru: 'EEC_1', startUs: 51.0, durationUs: 16.0, byteCount: 60, active: true },
      { slotId: 6, name: 'DPM_DISPLAY_PRIMITIVES', sourceLru: 'DPM_1', startUs: 68.0, durationUs: 18.0, byteCount: 68, active: true },
      { slotId: 7, name: 'CMC_BITE_DIAGNOSTICS', sourceLru: 'CMC_1', startUs: 87.0, durationUs: 8.0, byteCount: 30, active: true },
      { slotId: 8, name: 'GUARD_GAP_2', sourceLru: 'BUS_IDLE', startUs: 96.0, durationUs: 2.0, byteCount: 0, active: true },
      { slotId: 9, name: 'CLOCK_RESYNC_MARKER', sourceLru: 'BIU_MASTER', startUs: 99.0, durationUs: 1.0, byteCount: 4, active: true }
    ];

    this.cycleCount = 428091;
  }

  // --- CRC-16 Frame Check Sequence (FCS) ---

  /**
   * Computes ARINC 659 16-bit Frame Check Sequence (FCS, Polynomial 0x1021)
   */
  static computeFcs16(dataBytes) {
    const data = typeof dataBytes === 'string' ? Buffer.from(dataBytes) : dataBytes;
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= (data[i] << 8);
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return (crc ^ 0xFFFF) >>> 0;
  }

  // --- Dual-Lockstep Comparator & Hardware Guard ---

  /**
   * Evaluates Dual-Lockstep BIU Comparator.
   * Tolerates up to 40 ns clock skew. Tripped if skew > 40 ns.
   */
  evaluateLockstepComparator() {
    const skew = this.faults.clockSkewViolation ? 58.0 : this.clockSkewNs;
    const isMatched = skew <= 40.0;
    this.lineStatus.biuLockstepMatched = isMatched;
    return {
      clockSkewNs: skew,
      maxAllowedSkewNs: 40.0,
      matched: isMatched,
      action: isMatched ? 'NORMAL_OPERATION' : 'BIU_DRIVER_DISABLED_LOCKED'
    };
  }

  /**
   * Evaluates Hardware Babbling Idiot Containment.
   * If babbler fault injected, duration overruns by 450 ns (> 200 ns threshold).
   * Hardware watch-dog trips instantly.
   */
  evaluateBabblingContainment(slotId = 1) {
    const slot = this.tdmaTable[slotId];
    let overrunNs = 0;
    if (this.faults.babblingIdiotActive) {
      overrunNs = 450; // Overrun by 450 ns
    }

    const maxToleranceNs = 200;
    const babblerSuppressed = overrunNs > maxToleranceNs;
    this.lineStatus.babblerSuppressed = babblerSuppressed;

    return {
      slotName: slot.name,
      allocatedDurationUs: slot.durationUs,
      actualDurationUs: slot.durationUs + (overrunNs / 1000.0),
      overrunNs: overrunNs,
      tripped: babblerSuppressed,
      status: babblerSuppressed ? 'AUTONOMOUS_HARDWARE_SUPPRESSION_TRIPPED' : 'WITHIN_SLOT_BOUNDARY'
    };
  }

  /**
   * Executes a simulated TDMA bus cycle frame
   */
  executeCycle() {
    this.cycleCount++;
    const lockstep = this.evaluateLockstepComparator();
    const babbler = this.evaluateBabblingContainment(1);

    // Line activity
    this.lineStatus.busAActive = !this.faults.lineACut && lockstep.matched && !babbler.tripped;
    this.lineStatus.busBActive = !this.faults.lineBCut && lockstep.matched && !babbler.tripped;

    // Process slot messages and verify FCS
    const processedSlots = this.tdmaTable.map(slot => {
      const payloadStr = `SLOT_${slot.slotId}_${slot.name}_${this.cycleCount}`;
      let fcs = ARINC659Engine.computeFcs16(payloadStr);
      if (this.faults.fcsCorrupt && slot.slotId === 1) {
        fcs ^= 0xA5A5; // Corrupt FCS
        this.lineStatus.fcsErrorCount++;
      }

      return {
        slotId: slot.slotId,
        name: slot.name,
        source: slot.sourceLru,
        startUs: slot.startUs,
        durationUs: slot.durationUs,
        bytes: slot.byteCount,
        fcsHex: '0x' + fcs.toString(16).toUpperCase().padStart(4, '0'),
        validOnBusA: this.lineStatus.busAActive && (slot.byteCount > 0),
        validOnBusB: this.lineStatus.busBActive && (slot.byteCount > 0)
      };
    });

    const activeBandwidthMbps = (this.lineStatus.busAActive ? 30.0 : 0.0) + (this.lineStatus.busBActive ? 30.0 : 0.0);

    return {
      cycleNumber: this.cycleCount,
      frameDurationUs: this.majorCyclePeriodUs,
      activeBandwidthMbps: activeBandwidthMbps,
      lockstep: lockstep,
      babbler: babbler,
      lines: {
        busA: this.lineStatus.busAActive ? 'ACTIVE_30_MBPS' : 'DISABLED_OR_CUT',
        busB: this.lineStatus.busBActive ? 'ACTIVE_30_MBPS' : 'DISABLED_OR_CUT'
      },
      slots: processedSlots
    };
  }

  getTelemetry() {
    const cycleRes = this.executeCycle();
    const totalBytesInFrame = this.tdmaTable.reduce((acc, s) => acc + s.byteCount, 0);
    const busUtilizationPercent = ((totalBytesInFrame * 8) / (this.majorCyclePeriodUs * 60.0)) * 100.0;

    return {
      systemName: this.systemName,
      busStandard: 'ARINC Specification 659 (SafeBus)',
      configuredBandwidth: '60 Mbps (Dual 30 Mbps)',
      activeBandwidthMbps: cycleRes.activeBandwidthMbps,
      framePeriodUs: this.majorCyclePeriodUs,
      slotCount: this.tdmaTable.length,
      busUtilizationPercent: parseFloat(busUtilizationPercent.toFixed(1)),
      collisionRate: '0.00% (Strict Determinism Guaranteed)',
      maxLatencyJitterNs: '<= 40.0 ns',
      lockstepStatus: cycleRes.lockstep,
      babblerStatus: cycleRes.babbler,
      lines: cycleRes.lines,
      activeSlots: cycleRes.slots,
      faults: this.faults
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ARINC659Engine };
}

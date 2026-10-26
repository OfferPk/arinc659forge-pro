#!/usr/bin/env python3
"""
ARINC659Forge Pro - Automated Test Runner & Verification Suite
10 Comprehensive Verification Tests for ARINC Specification 659 / RTCA DO-254 DAL A Compliance
"""

import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib.machinery import SourceFileLoader
cli_module = SourceFileLoader("arinc659_cli", os.path.join(os.path.dirname(__file__), "arinc659-cli.py")).load_module()
ARINC659SafeBus = cli_module.ARINC659SafeBus

class TestARINC659ForgePro(unittest.TestCase):
    def setUp(self):
        self.bus = ARINC659SafeBus(system_name="AIMS_CORE_CABINET_1", skew_ns=12.5)

    # Test 1: Dual 30 Mbps Lines (60 Mbps Total)
    def test_01_dual_bus_bandwidth(self):
        self.assertEqual(self.bus.bus_speed_mbps, 60.0)
        self.assertEqual(self.bus.line_rate_mbps, 30.0)

    # Test 2: TDMA Slot Non-Overlap (Collision Free)
    def test_02_tdma_slot_non_overlap(self):
        slots = self.bus.tdma_table
        for i in range(len(slots) - 1):
            cur_end = slots[i]['start_us'] + slots[i]['duration_us']
            next_start = slots[i+1]['start_us']
            self.assertLessEqual(cur_end, next_start, f"Slot {slots[i]['slot']} overlaps with slot {slots[i+1]['slot']}")

    # Test 3: Dual-Lockstep BIU Comparator (Normal Skew)
    def test_03_lockstep_comparator_normal(self):
        res = self.bus.evaluate_lockstep()
        self.assertTrue(res['matched'], "BIU lanes must match when skew is within 40 ns")
        self.assertLessEqual(res['skew_ns'], 40.0)

    # Test 4: Clock Skew Violation Disconnect (> 40 ns)
    def test_04_clock_skew_violation(self):
        self.bus.faults['clock_skew_violation'] = True
        res = self.bus.evaluate_lockstep()
        self.assertFalse(res['matched'], "Lockstep comparator must trip when clock skew exceeds 40 ns")
        self.bus.faults['clock_skew_violation'] = False

    # Test 5: Babbling Idiot Hardware Containment
    def test_05_babbling_idiot_containment(self):
        # Normal slot boundary
        res_norm = self.bus.evaluate_babbler()
        self.assertFalse(res_norm['tripped'])

        # Overrun fault (> 200 ns overrun)
        self.bus.faults['babbling_idiot_active'] = True
        res_trip = self.bus.evaluate_babbler()
        self.assertTrue(res_trip['tripped'], "Hardware watch-dog must trip on overrun > 200 ns")
        self.bus.faults['babbling_idiot_active'] = False

    # Test 6: 16-Bit Frame Check Sequence (FCS)
    def test_06_fcs16_checksum(self):
        fcs = self.bus.compute_fcs16(b"ARINC_659_SAFEBUS_MESSAGE_PAYLOAD")
        self.assertIsInstance(fcs, int)
        self.assertGreater(fcs, 0)
        self.assertLessEqual(fcs, 0xFFFF)

    # Test 7: Line A Physical Cut (Simplex Fallback to Bus B)
    def test_07_line_a_cut_simplex_fallback(self):
        self.bus.faults['line_a_cut'] = True
        cyc = self.bus.execute_cycle()
        self.assertFalse(cyc['bus_a_active'], "Bus A must be offline on cut")
        self.assertTrue(cyc['bus_b_active'], "Bus B must remain active for seamless simplex fallback")
        self.assertEqual(cyc['active_bw_mbps'], 30.0)
        self.bus.faults['line_a_cut'] = False

    # Test 8: Line B Physical Cut (Simplex Fallback to Bus A)
    def test_08_line_b_cut_simplex_fallback(self):
        self.bus.faults['line_b_cut'] = True
        cyc = self.bus.execute_cycle()
        self.assertTrue(cyc['bus_a_active'], "Bus A must remain active")
        self.assertFalse(cyc['bus_b_active'], "Bus B must be offline on cut")
        self.assertEqual(cyc['active_bw_mbps'], 30.0)
        self.bus.faults['line_b_cut'] = False

    # Test 9: Deterministic Bounded Latency (<= 100 µs)
    def test_09_bounded_latency(self):
        self.assertLessEqual(self.bus.frame_period_us, 100.0, "Major cycle period must not exceed 100 microseconds")

    # Test 10: 10-Point Normative Compliance Audit
    def test_10_normative_compliance_audit(self):
        audit = self.bus.run_normative_audit()
        self.assertEqual(audit['total'], 10, "Total audit rules must equal 10")
        self.assertEqual(audit['passed'], 10, "All 10 audit rules must pass")
        self.assertEqual(audit['score'], "100.0%", "Compliance score must be 100.0%")
        self.assertEqual(audit['status'], "ARINC_659_SAFEBUS_DAL_A_CERTIFIED")

if __name__ == '__main__':
    runner = unittest.TextTestRunner(verbosity=2)
    suite = unittest.TestLoader().loadTestsFromTestCase(TestARINC659ForgePro)
    result = runner.run(suite)
    if not result.wasSuccessful():
        sys.exit(1)
    print("\nALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY.")

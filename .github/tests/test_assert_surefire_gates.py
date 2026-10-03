"""Regression tests for the fail-closed CI integration evidence checker."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from assert_surefire_gates import validate_gates


class SurefireGateTest(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def report(self, attributes='tests="1" failures="0" errors="0" skipped="0"',
               cases='<testcase name="realTest"/>'):
        (self.directory / "TEST-example.CriticalGate.xml").write_text(
            f"<testsuite {attributes}>{cases}</testsuite>", encoding="utf-8")

    def test_executed_gate_passes(self):
        self.report()
        validate_gates(self.directory, ["CriticalGate=1"])

    def test_missing_report_fails(self):
        with self.assertRaises(ValueError):
            validate_gates(self.directory, ["CriticalGate=1"])

    def test_skipped_gate_fails(self):
        self.report('tests="1" failures="0" errors="0" skipped="1"',
                    '<testcase><skipped/></testcase>')
        with self.assertRaises(ValueError):
            validate_gates(self.directory, ["CriticalGate=1"])

    def test_failure_or_error_fails(self):
        for issue in ("failure", "error"):
            with self.subTest(issue=issue):
                self.report(cases=f"<testcase><{issue}/></testcase>")
                with self.assertRaises(ValueError):
                    validate_gates(self.directory, ["CriticalGate=1"])

    def test_incorrect_count_fails(self):
        self.report()
        with self.assertRaises(ValueError):
            validate_gates(self.directory, ["CriticalGate=2"])

    def test_missing_testcase_evidence_fails(self):
        self.report(cases="")
        with self.assertRaises(ValueError):
            validate_gates(self.directory, ["CriticalGate=1"])

    def test_missing_count_attributes_fails(self):
        self.report(attributes='tests="1"')
        with self.assertRaises(ValueError):
            validate_gates(self.directory, ["CriticalGate=1"])


if __name__ == "__main__":
    unittest.main()

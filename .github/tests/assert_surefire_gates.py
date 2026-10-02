"""Fail CI when a required opt-in Surefire suite is absent, failed or skipped."""

import argparse
from pathlib import Path
import xml.etree.ElementTree as ET


def validate_gates(directory: Path, expected: list[str]) -> None:
    for specification in expected:
        class_name, count_text = specification.rsplit("=", 1)
        expected_count = int(count_text)
        if expected_count <= 0:
            raise ValueError("Expected test count must be positive")
        reports = list(directory.glob(f"TEST-*.{class_name}.xml"))
        if len(reports) != 1:
            raise ValueError(f"{class_name}: expected exactly one report, found {len(reports)}")
        suite = ET.parse(reports[0]).getroot()
        counts = {key: int(suite.get(key, "-1"))
                  for key in ("tests", "failures", "errors", "skipped")}
        cases = suite.findall("testcase")
        if counts != {"tests": expected_count, "failures": 0, "errors": 0, "skipped": 0}:
            raise ValueError(f"{class_name}: required {expected_count} executed tests, got {counts}")
        if len(cases) != expected_count or any(
            case.find(tag) is not None for case in cases
            for tag in ("skipped", "failure", "error")
        ):
            raise ValueError(f"{class_name}: testcase evidence is missing, skipped or failed")
        print(f"{class_name}: {expected_count} executed, 0 failures/errors/skips")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("expected", nargs="+", help="SimpleClassName=expected_count")
    args = parser.parse_args()
    validate_gates(args.directory, args.expected)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Validate Flyway migration filenames without connecting to a database."""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
MIGRATION_ROOTS = sorted(ROOT.glob("services/*/src/main/resources/db/migration"))
VERSIONED = re.compile(r"^V(?P<version>[0-9][0-9._]*)__(?P<description>.+)\.sql$")
REPEATABLE = re.compile(r"^R__(?P<description>.+)\.sql$")


def normalized_version(raw: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.split(r"[._]", raw))


errors: list[str] = []
for migration_root in MIGRATION_ROOTS:
    versions: dict[tuple[int, ...], Path] = {}
    repeatables: set[str] = set()
    for path in sorted(migration_root.glob("*.sql")):
        versioned_match = VERSIONED.match(path.name)
        repeatable_match = REPEATABLE.match(path.name)
        if versioned_match:
            version = normalized_version(versioned_match.group("version"))
            if version in versions:
                errors.append(
                    f"{migration_root}: duplicate Flyway version {version}: "
                    f"{versions[version].name} and {path.name}"
                )
            versions[version] = path
        elif repeatable_match:
            description = repeatable_match.group("description").lower()
            if description in repeatables:
                errors.append(f"{migration_root}: duplicate repeatable migration {path.name}")
            repeatables.add(description)
        else:
            errors.append(f"{path}: invalid Flyway migration filename")

if not MIGRATION_ROOTS:
    errors.append("No Flyway migration directories were found")

if errors:
    print("Flyway migration validation failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print(f"Validated Flyway migrations in {len(MIGRATION_ROOTS)} services.")

# PR #6 CI hardening (2026-10-02)

Product-source baseline: `50d40456accd88b2946f8e5fdb65b4a3eb6a62eb`.
Previous CI HEAD: `bbe5467610a0c3e3b87fe0fb387d71da4795044e`.
Scope: CI configuration/evidence checks and compatible dependency patches only.
No business logic, production configuration, migrations or feature flags changed.
Production touched: NO. No merge or deployment.

## Correct interpretation of run #20

GitHub Actions run `37021729898` reported Booking 107 tests, 0 failures,
0 errors, **19 skipped**; Payment 90 tests, 0 failures, 0 errors, **6 skipped**.
These generic jobs are not equivalent to the prior local opt-in suites with
zero skips. Both generic builds succeeded; the overall workflow failed.

Booking skipped groups:

- BookingRoomChangeOutboxPostgresUpgradeTest: 1 (CI_BOOKING_MIGRATION_POSTGRES absent).
- BookingMutationPostgresConcurrencyTest: 7 (CI_BOOKING_MUTATION_POSTGRES absent).
- RoomChangeFinancialRabbitIntegrationTest: 4 (CI_RABBIT_INTEGRATION absent).
- CustomerDailyPricingPostgresRedisIntegrationTest: 6 and disabled counterpart: 1
  (CI_DAILY_PRICING_INTEGRATION absent).

Payment skipped groups:

- PaymentV12PostgresUpgradeTest: 1 and PaymentV13PostgresUpgradeTest: 2
  (CI_MIGRATION_POSTGRES absent).
- RoomChangeFinancialRabbitIntegrationTest: 3 (CI_RABBIT_INTEGRATION absent).

## Explicit critical jobs

The generic matrix remains unchanged. Separate isolated jobs enable the opt-ins:

- Booking financial: PostgreSQL 16 with separate guarded migration/concurrency
  databases and RabbitMQ; expected executed suite counts 1 + 7 + 4.
- Booking daily pricing regression: PostgreSQL 16 and Redis; expected 6 + 1.
- Payment migration/Rabbit: PostgreSQL 16 V12/V13/V14 upgrade proofs plus real
  signed Rabbit messaging; expected 1 + 2 + 3. Rabbit consumer persistence in this
  existing test uses H2, while migration proofs use real PostgreSQL separately.
- Hotel migration condition also recognizes PRs targeting the integration base.

Existing specialized push conditions are preserved. Services are disposable
GitHub Actions containers; database and broker guards target loopback only.
Required Surefire reports must exist and contain their exact expected test count,
zero failures/errors/skips and matching testcase evidence. Missing/disabled gates
therefore fail CI. The checker has seven fail-closed regression tests.
Docker builds still publish no images and additionally depend on Booking gates.

## Import path and security gates

eKYC uses `python -m pytest -q` with `PYTHONPATH=.`; no application/test import
hacks. Local exact-command validation: 25 passed, zero collection errors.
Trivy uses published `aquasecurity/trivy-action@v0.36.0`, preserving fs scan,
vuln/misconfig, HIGH/CRITICAL, ignore-unfixed=true and exit-code=1.
Dependency Review is retained without continue-on-error.

Dependency graph could not be enabled with the available connector/security UI
automation constraints. Repository owner manual action required:
Settings -> Security / Code security and analysis -> Dependency graph -> Enable.
Do not alter unrelated settings or bypass the failing Dependency Review gate.

## Compatible frontend patches

- axios 1.19.0 -> 1.20.0 (direct dependency remains major 1).
- brace-expansion 5.0.9 -> 5.0.12 (minimatch ^5 transitive range).
- nanoid 3.3.16 -> 3.3.19 (PostCSS ^3 transitive range; additional HIGH found
  by the fresh full audit).

Only these lock entries and the axios manifest range change; no override,
force audit fix, Capacitor major change or application code change.
Local npm ci, lint, build and high/critical audit passed.
Full and production audits show **0 HIGH, 0 CRITICAL, 3 MODERATE**.
Remaining moderate chain: @capacitor/cli 8.5.1 -> xcode 3.0.1 -> uuid 7.0.3
(GHSA-w5hq-g745-h8pq). npm's suggested breaking dependency change is not applied.

## Evidence boundary

This is the pre-push local hardening record, not a claim that remote CI passes.
New run completion, exact HEAD, each required gate and Docker builds must be
verified after push. A failed security/repository-setting gate still blocks merge.

# Security remediation and incident containment

Validation completed: 2026-10-03 (Asia/Bangkok).

Branch: `chore/security-trivy-remediation-2026-10-02`.

Baseline HEAD: `4146b8c32f67f8c2621f8e856922cfe0541005ad`.

Forensic classification: **B — CONNECTION_ONLY_NO_WRITE_EVIDENCE**. This is not a proven-zero-mutation declaration. Final post-cleanup regression and the conditional local commit decision are recorded below. Dependency Review remains externally blocked; no push, security PR, merge, deployment, or production configuration application is authorized here.

PR #6 was not modified. Its local feature-branch ref remains `d29672c300d59e9a61c7f16c510608f2b8c85aff`.

## Production Hotel DB incident

**Production touched: YES. A production connection is proven; historical zero DML/DDL is not provable from SQL logs.**

The preceding validation attempt unintentionally booted `HotelServiceApplicationTests` against `localhost:5434/hotel_db`:

- Hikari connected at 2026-10-02 23:34:09.762 +07:00 (16:34:09.762Z).
- Flyway 11.7.2 validated 18 migrations; current version was `20260920.01`. It reported `No migration necessary`.
- Hibernate initialized/validated the persistence schema. Context startup subsequently failed because `JWT_SECRET` was missing; Hikari closed at 23:34:11.726 +07:00.

Read-only follow-up audit used SELECT queries with `default_transaction_read_only=on`; the session confirmed `transaction_read_only=on`. No database settings were changed.

- Flyway history still contained 18 successful entries; latest installation was `20260920.01`, dated 2026-09-28 18:55:51.576205. No migration entry was inserted during the incident window.
- Existing PostgreSQL container logs for 16:33Z–16:36Z contained no connection/statement evidence.
- `log_connections=off`, `log_disconnections=off`, `log_statement=none`, `log_min_duration_statement=-1`, and `logging_collector=off`; destination was stderr, with no preloaded audit extension.
- Cumulative database statistics showed 1,256 inserted, 419 updated, and 31 deleted tuples, with no useful pre-incident baseline or per-test attribution. These counters cannot identify incident mutations.

No mutation was detected, but absence of a new migration/history entry and absence of statement logs **do not prove zero DDL/DML**. No restore, manual rollback, migration, or corrective production mutation was attempted.

All 21 production containers retained their exact IDs, running states, and `StartedAt` timestamps across containment and validation. Production container delta: **0**. This container evidence is separate from, and does not resolve, the DB impact uncertainty.

## PRODUCTION DB FORENSIC REVIEW

### Exact access and why production was marked touched

The original full Hotel Maven regression launched `com.smarthotel.hotel.HotelServiceApplicationTests.contextLoads` from the source snapshot `C:\Users\DELL\AppData\Local\Temp\EnziuSecurity-8406803f988647d28906b98555c3194d\services\hotel-service`. The original complete Maven CLI flags were not retained; the test, process and datasource are identified by its retained Surefire XML and Maven output, not an invented command reconstruction.

- Test JVM: Java 17.0.20, PID 9584; startup 2026-10-02 23:34:06.959 +07.
- No active profile; original context test had an empty method and no setup/cleanup.
- Resolved URL: `jdbc:postgresql://localhost:5434/hotel_db`, user `hotel_user`.
- The main-config fallback credentials matched the running production DB credentials. Comparison emitted only a boolean equality result; no password was printed or recorded here.
- Actual production container: `smart-hotel-hotel-postgres`, ID `77457c89771dd7bfbe200f38a647ca1f31987e31425f5765c790571586e956a1`, PostgreSQL 16.14. Compose project `smart-hotel-booking-system`, service `hotel-postgres`, host port 5434 → 5432. Start timestamp `2026-10-02T07:42:45.903244332Z` was unchanged.
- Hikari added an actual PostgreSQL connection at 23:34:09.762 +07; this was not merely an attempted/rejected connection.
- Flyway's startup migrate/check path ran: PostgreSQL database identified at 09.803; 18 migrations validated at 09.934; version `20260920.01` at 09.968; `No migration necessary` at 09.976. No migration was applied.
- Hibernate `ddl-auto=validate`, not update/create. EntityManagerFactory initialized at 11.706. Context refresh failed at 11.716 because `JWT_SECRET` was missing. EntityManagerFactory closed at 11.717 and Hikari shut down at 11.726.
- The Spring test instance could not be prepared; no test method/setup/cleanup executed.
- Whether internal JDBC/Flyway metadata/lock transactions began/committed is **NOT PROVABLE**. A connection and Flyway execution must not be equated with proof of zero transactions.

### Code-path and fixture evidence

All 107 Hotel `src/main` files (88 Java and 19 resources) in the incident snapshot matched the current source by SHA-256. Startup-hook inspection found local-directory creation in `MediaStorageService.@PostConstruct`, not a DB writer. The DB-writing coordinate backfill is an `ApplicationRunner`; Spring Boot 3.5.12 invokes runners only after successful context refresh. The recorded refresh exception prevented that phase. No custom Flyway callback, SQL initializer or other DB-writing startup hook was identified.

The incident Surefire reports show both actual SQL-fixture tests **SKIPPED**: `HotelDailyPricingPostgresUpgradeTest` and `ManualDailyPricingPostgresIntegrationTest`. All remaining executed Hotel tests were Mockito/pure/standalone MockMvc tests without a datasource. The only failed context test was empty and failed before execution.

Read-only searches used exact fixture signatures extracted from those sources, returning zero matches:

| Signature | Result |
| --- | --- |
| Hotel name `CI Synthetic Hotel`, address `CI Street`, city `CI City` | 0 |
| Room types `CI Deluxe` / `CI Suite` | 0 |
| Room number `CI-201` | 0 |
| Upgrade pricing window 2027-01-10 → 2027-01-12, nightly 800000, approved price at save 1000000 | 0 |
| Integration nightly 750, approved price at save 1000/500, dates 2026-11-01 or 2026-11-02 | 0 |
| Mock portfolio `Enziu One` / `Enziu Two` with `1 Enziu Street` | 0 |
| Mock policy `Hotel A` with `1 Đường A` and `Hà Nội` | 0 |

The integration fixture uses `LocalDate.now().plusDays(30)`; November 1 covers the October 2 incident, November 2 covers later October 3 isolated runs. UUIDs/owner IDs are randomly generated inside skipped test methods, so there is no retained concrete test UUID/email to search. Generic room numbers such as 101 are not treated as unique test fingerprints.

For 2026-10-02 16:33–16:36Z, zero created/updated matches were found in hotels, room types, rooms, manual daily price rules and hotel policies, plus image creation, owner-demotion fence updates and hotel geocoding timestamps. These checks cannot detect every deletion, an untimestamped relation change, or an insert subsequently removed; they are corroboration, not sole proof.

### Logs, safe-state comparison and limits

All production queries were SELECT/catalog reads using `PGOPTIONS=-c default_transaction_read_only=on`; the session confirmed `hotel_db`, `hotel_user`, `transaction_read_only=on`, DB timezone UTC. No repair, test row, DML, DDL, configuration change or migration was issued.

PostgreSQL connection/statement logging was disabled and the incident-window Docker logs were empty. Therefore historical zero successful DML/DDL **cannot be proven from logs**. The cumulative tuple counters have no pre-incident baseline and cannot attribute changes to this test.

Flyway history has 18 successful migrations; latest `20260920.01` was installed on 2026-09-28 at 18:55:51.576205 UTC, matching the existing September 29 deployment report. There was no failed/new incident-window migration entry. Expected manual-rule constraints/indexes remained present.

Existing backup `D:\EnziuRooms-Backups\feature-77a85a0-20260929-014156\hotel_db.dump` exists (75485 bytes). Read-only `pg_restore --list` in an offline container identified archive creation at 2026-09-28 18:41:56 UTC, PostgreSQL 16.14, 65 TOC entries. It predates the daily-pricing migration and does not contain `manual_daily_price_rules`. No restore was performed; no byte-for-byte or full business-data equality is claimed.

### Classification and decision

**B — CONNECTION_ONLY_NO_WRITE_EVIDENCE.** Connection and startup Flyway checks are proven. No specific successful production mutation was identified. Skipped fixture writers, the failed pre-runner context, validate-only Hibernate, unchanged migration history and negative fingerprint/audit checks support no successful write. Missing statement/transaction audit prevents classification A. This classification does not erase the incident or assert absolute historical zero writes; final fields for historical DML and DDL remain **NOT PROVABLE**.

The user's phase-15 policy permits a local security commit for B only after all local code/security validation gates pass. Dependency Review remains the explicitly permitted external repository-setting blocker, never relabeled PASS. Production remains marked touched **YES** because of the confirmed earlier access.

## Root cause and isolation remediation

The original Hotel context test had `@SpringBootTest` without an active test profile. There was no classpath Hotel `application-test.yml`, no explicit test datasource, and no Surefire/Testcontainers override. Main configuration therefore resolved its existing default `jdbc:postgresql://localhost:5434/hotel_db` and runtime credentials. Missing JWT was discovered only after datasource/Flyway initialization.

Remediation is test-classpath only:

- Hotel uses `@ActiveProfiles("test")`. Booking, Hotel, and Identity classpath test profiles require `TEST_DB_URL`, `TEST_DB_USERNAME`, and `TEST_DB_PASSWORD` without defaults.
- Every independently built PostgreSQL service has an `IsolatedDatabaseInitializer`, registered through test `META-INF/spring.factories`, before bean creation/DataSource/Flyway.
- The initializer requires explicit loopback PostgreSQL configuration, database suffix `_ci`/`_test`, a `ci_`/`test_` username, and CI port 5432 or an explicit high test port. Runtime ports 5433–5438, runtime database names, remote hosts, URL query/userinfo/fragment overrides, and divergent Flyway URL/user configuration are rejected.
- Before each full database context, the guard prints only sanitized host, port, and database name.
- A cryptographically random 32-byte JWT key overrides inherited JWT properties per test context. No production JWT is used or logged.
- Payment retains only its existing exact in-memory H2 wallet fixture, with Flyway disabled; H2 file/TCP/INIT URLs are not allowed.
- Identity's real test profile provides synthetic OAuth registrations using non-discovering loopback test providers and local mail configuration. A final full suite passed with JWT/Google/Facebook environment credentials removed.
- CI backend matrix databases now use `_ci` names and explicit `TEST_DB_*` variables. Workflow triggers, jobs, permissions, and repository settings were not changed.
- Removed the obsolete Identity YAML under `src/test/java/com/smarthotel/identity/resources/application-test.yml`; Maven did not load it as a test resource and no configuration referenced it. Only the real `src/test/resources/application-test.yml` remains, eliminating duplicate precedence ambiguity.

Regression evidence: **91/91** guard tests across six services passed (15 each; Payment 16). Production/runtime URL negative fixtures never constructed a DataSource. A full-context negative smoke using an unreachable `.invalid` host failed in the initializer before any Hikari/Flyway beans; positive Hotel context plus guard passed 16/16 on `hotel_ci` at port 25432. No negative full-context attempt against a reachable production DB was executed during containment.

These guards do not change runtime application datasource defaults. Explicitly supplied test infrastructure must still be provisioned as disposable; there is no unavailable-Testcontainers fallback.

## Diff scope review

| Class | Files / purpose | Review |
| --- | --- | --- |
| A — security/runtime compatibility | Nine service POMs; frontend package/lock; eKYC requirements; Gateway YAML prefix migration; frontend and Realtime Dockerfiles | Intended security-only changes. No Java business logic or SQL migration edits. |
| B — test isolation/validation | Six guards and guard test classes; six test factory registrations; three classpath test profiles; Hotel context annotation; existing Hotel/Payment migration guards; deletion of obsolete Identity test YAML; Gateway HTTP tests; CI test DB matrix/env | Test-only changes. No production credential dependency. |
| C — production deployment configuration | `infrastructure/deploy/docker-compose.prod.yml` frontend expose 80→8080; `infrastructure/deploy/nginx/enziurooms.conf` frontend upstream 80→8080 | Necessary paired port adaptation for the unprivileged frontend image. Separately inspected and validated with an isolated proxy; **not applied to production**. These two lines must accompany the candidate image when any future deployment is separately authorized. |
| D — accidental/out-of-scope | None identified | No `.env.prod`, Cloudflare, Java business logic, permission widening, migration source, generated binary, dump, seed, log, `target/`, or `node_modules/` changes included in the candidate. |

Negative-test literals for known production URLs are rejection assertions, not datasource defaults. Added OAuth strings are visibly synthetic test credentials. Source-only Trivy secret scan exited 0; added lines/files were also manually reviewed. No secret files are staged.

## Dependency/runtime changes

- Spring Boot: **3.5.12**, consistently across all nine Java services; Java remains 17.
- Spring Cloud: **2025.0.3** for Gateway, with `spring-cloud-starter-gateway-server-webflux` and the corresponding `spring.cloud.gateway.server.webflux` prefix.
- Structural YAML comparison proved all 10 Gateway routes, ordering, predicates, filters, and CORS values unchanged.
- Springdoc: **2.8.17** across all seven services using it.
- pgjdbc: **42.7.12** across all six PostgreSQL services; dependency trees confirmed resolution. No 42.7.11 override remains. This closes the scanner's remaining CVE-2026-54291 finding.
- Added BOM-managed `flyway-database-postgresql` to the six services because the upgraded Flyway requires its PostgreSQL module; Flyway resolved to 11.7.2. Existing migration files were not changed.
- python-multipart: **0.0.30**.
- Frontend: axios 1.20.0 and compatible lockfile security updates for brace-expansion 5.0.12 and nanoid 3.3.19; no forced/breaking dependency upgrade.
- Frontend runtime: unprivileged nginx, explicit UID/GID **101:101**, port 8080.
- Realtime runtime: explicit UID/GID **10001:10001**, readable/non-writable application JAR, writable `/tmp`.

## Java and PostgreSQL validation

All nine Java services completed `clean verify` using Java 17 in an isolated source snapshot (Gateway's final suite ran in its workspace). Host Booking's previously locked target JAR was not overwritten and its host process was not stopped.

Generic suites initially skipped opt-in integrations. Those integrations were subsequently explicitly enabled and passed on disposable PostgreSQL 16.14, with Redis/Rabbit inside the same test namespace. The following totals combine the final full-suite evidence with separately completed opt-in tests; they are **not a claim that every test ran in one Maven invocation**.

| Service | Tests validated | Failures/errors | Unvalidated skips |
| --- | ---: | ---: | ---: |
| AI | 1 | 0 | 0 |
| Gateway | 10 | 0 | 0 |
| Booking | 84 | 0 | 0 |
| Chat | 18 | 0 | 0 |
| Hotel | 36 | 0 | 0 |
| Identity | 47 | 0 | 0 |
| Notification | 25 | 0 | 0 |
| Payment | 44 | 0 | 0 |
| Realtime | No existing test sources; package/verify and real runtime smoke passed | 0 | N/A |

Aggregate existing/new JUnit evidence: **265 tests, zero failure/error, no remaining unvalidated opt-in skip**.

Additional real infrastructure proofs:

- Booking daily pricing enabled/disabled PostgreSQL + Redis integration: **7/7 PASS**. Disposable `booking_daily_ci`, not the production Booking DB.
- Hotel daily pricing PostgreSQL integration: **1/1 PASS** on `hotel_daily_ci`.
- Hotel real upgrade: **1/1 PASS**, pre-daily-pricing schema → `20260920.01`, preserving synthetic catalog and validating constraints/Flyway.
- Payment real upgrade: **1/1 PASS**, synthetic V11 → V12, preserving wallet/transfer data and validating constraints/Flyway.
- Payment's existing wallet/concurrency/ownership/PayOS-related regressions passed in its full suite. PR #6 V13/V14 implementation is not on this security branch and was not modified or substituted into these tests.
- Migration name/version checker validated all six services.

## HTTP, WebSocket, and non-root smoke

- Isolated HTTP `/v3/api-docs` returned OpenAPI 3.1.0 and `/swagger-ui/index.html` returned HTTP 200 for **Hotel, AI, Booking, Chat, Identity, Notification, and Payment**. No startup compatibility failure or 5xx remained.
- Identity runtime smoke used a synthetic local OAuth provider, not a real login or external account.
- Gateway real random-port HTTP tests proved route precedence, JWT rejection, current-role mismatch rejection, CUSTOMER admin denial, CORS preflight/denial/deduplication, health, and Prometheus. Existing role-specific authorization was preserved; test fixtures were corrected to use CUSTOMER/HOTEL_ADMIN as appropriate.
- Realtime UID/GID 10001, JAR readability/non-writability, `/tmp` writability, port, and health UP passed.
- Real WebSocket tests passed for authenticated and guest handshakes, ping/PONG, invalid signature/issuer/expired-token rejection (no protocol upgrade), Rabbit JSON delivery, and private event audience isolation. The pre-existing rejected-handshake HTTP status behavior was not changed.
- Local candidate reverse proxy → Gateway WebFlux → Realtime WebSocket upgrade/PONG passed.
- Frontend UID/GID 101, readable SPA assets, writable `/tmp`, and SPA HTTP 200 through the candidate proxy upstream port 8080 passed. Nginx config syntax passed.

## Frontend, eKYC, builds, scanners

- Frontend `npm ci`, lint, production build, and `npm audit --omit=dev --audit-level=high`: **PASS**.
- Remaining npm audit findings: **three MODERATE**, one underlying UUID advisory `GHSA-w5hq-g745-h8pq` through xcode/Capacitor CLI. Suggested npm fix requires a breaking CLI change; no forced fix was applied. No HIGH/CRITICAL remains at the requested audit gate.
- eKYC: **25/25 PASS** after python-multipart 0.0.30; one non-failing Starlette/AnyIO deprecation warning.
- Docker: **11/11 local candidate image builds PASS** (frontend, nine Java services, eKYC). Final Gateway/Identity test-source and Realtime permission changes were rebuilt. All tags use the `enziu-security-*` namespace; no production service image/tag was replaced.
- Trivy **0.70.0**, filesystem `vuln,misconfig` scan of the source-only final candidate: **0 CRITICAL, 0 HIGH, 0 fixable HIGH**, exit 0. Both CI-compatible `--ignore-unfixed` and an additional `--ignore-unfixed=false` HIGH/CRITICAL scan passed. No remaining HIGH finding is being hidden/deferred.
- Scanner input excluded ignored runtime/generated files and used the same manifests/Dockerfiles as the candidate. These are filesystem scan results; they are **not** a claim of full image-layer CVE scans.
- Dependency Review: **BLOCKED_BY_REPO_SETTING**. No repository setting was changed, and no PASS is claimed.

## Cleanup and final boundary

### Final post-cleanup regression — 2026-10-03

After deleting the misplaced Identity resource, a fresh source-only snapshot was created at `C:\Users\DELL\AppData\Local\Temp\EnziuSecurityForensic-2728c5b9127f4776bc7ed512f1cb099b`. No ignored env/runtime files were copied. All nine Java services reran sequential Java 17 `clean verify` successfully outside the sandbox dependency-JAR access restriction. Identity again ran without inherited JWT/Google/Facebook credentials.

Full-suite XML totals remained AI 1, Gateway 10, Booking 84, Chat 18, Hotel 36, Identity 47, Notification 25, Payment 44: zero failures/errors. The ten opt-in skips (Booking 7, Hotel 2, Payment 1) were then rerun explicitly with **10/10 PASS, zero failures/errors/skips**. The combined evidence remains 265 validated tests, including 91 isolation guard cases; these are full suites plus separate opt-in invocations, not one no-skip Maven invocation.

Fresh disposable PostgreSQL 16, Redis and Rabbit used the `enziu-security-forensic-*-20261003` namespace, label `enziu.task=security-forensic-20261003`, loopback host ports 25432/26379/25672. Host full-context tests used `*_ci` DBs and synthetic `ci_daily` credentials. Opt-in helpers shared only this disposable container network namespace, so their required `localhost:5432`/6379/5672 referred to isolated dependencies, not the host's PR #6 infrastructure or production.

An initial opt-in helper was stopped while still compiling on a slow Windows source/dependency bind mount (exit 143); it had not reached its test phase. It is not counted as a successful test or a source failure. The four final invocations used source-exact cached Docker `builder` stages with Linux-native filesystems. Their container exit codes and retained Surefire XML were verified:

- Booking enabled/disabled real PostgreSQL + Redis: 7/7.
- Hotel real daily-pricing integration: 1/1.
- Hotel real pre-pricing → `20260920.01` upgrade: 1/1.
- Payment real V11 → V12 upgrade: 1/1.

Generated XML evidence is retained under the temporary snapshot's `final-integrations`, not added to Git.

Final frontend `npm ci`, lint, build and HIGH-level audit passed (same three MODERATE findings disclosed above). eKYC reran 25/25 PASS. All eleven runtime candidate images rebuilt under `enziu-security-*:20261003`; no production image tag was overwritten. Fresh candidate runtime checks verified frontend UID 101, writable `/tmp`, nginx syntax and SPA response; Realtime UID 10001, read-only/readable JAR, writable `/tmp` and health UP.

Final Trivy 0.70.0 source-only `vuln,misconfig` scan with `--ignore-unfixed=false` and exit-code gate 1 returned **0 CRITICAL, 0 HIGH, 0 fixable HIGH; exit 0**. A separate source-only secret scan also exited 0 without findings. The scanner warned about POM dependencies with unspecified versions; resolved packaged dependency versions were additionally checked locally. Filesystem results do not assert full image-layer or complete resolved-transitive CVE coverage.

Known non-failing observations: deprecated Spring `@MockBean`, existing idempotent Flyway “already exists, skipping” notices, the eKYC AnyIO deprecation, and a Gateway active-client Prometheus meter tag-key warning in the observability-enabled HTTP test. Gateway HTTP/security/CORS/health/Prometheus assertions passed; this does not assert that every active-client metric family registered. No additional business/observability implementation change was made in this security-only task.

Final CI structural review proved the only workflow edits are six DB names (`*_db` → `*_ci`) and three `TEST_DB_*` aliases. Triggers, all jobs, permissions and all other job content are identical to the baseline. Dependency Review remains **BLOCKED_BY_REPO_SETTING**, as permitted by this task; no gate was weakened and no repository setting was changed.

Final path audit: 45 intended paths; no forbidden generated/secret/IDE/log/dump file, no migration-source edit, no `.env.prod` or Cloudflare change. The two reviewed frontend production port-pair lines are candidate source configuration only and have not been applied.

The original four security test containers were identity/label verified and stopped/removed: `enziu-security-postgres-20261002`, `enziu-security-redis-20261002`, `enziu-security-rabbit-20261002`, and `enziu-security-frontend-20261002`.

Subsequent explicitly isolated validation containers were also identity/label verified and removed after testing. The now-empty security proxy network was removed. No security test container remains running. No `docker prune`, image deletion, volume deletion, backup deletion, or production container stop/restart/recreate was performed. Candidate images and volumes were retained; PR #6 test containers were not touched.

Final production baseline comparison: 21/21 same IDs, same running state, same start timestamps; delta 0. This does not prove zero production DB mutation during the earlier incident.

The five fresh validation dependencies/runtime containers and four completed native opt-in helpers were exact-ID/label verified and removed after retaining test evidence. The interrupted helper was also test-identity verified. Images, volumes and backups were retained; no prune or production/PR #6 container action occurred.

Commit decision: classification B plus all local validation gates permits **one local security remediation commit**, `chore: harden test isolation and remediate security findings`, under the user's phase-15 policy. The resulting commit identity is in Git history; this report does not self-embed its own commit hash. No push, PR #6 edit, security PR creation, merge or deployment is part of that decision. A clean working tree is verified after committing.

This is local validation approval, not production release approval or a claim that Dependency Review passed. Review the forensic classification and disclosed port-pair candidate before any later release decision. Do not report `Production touched: NO` for the earlier confirmed DB access.

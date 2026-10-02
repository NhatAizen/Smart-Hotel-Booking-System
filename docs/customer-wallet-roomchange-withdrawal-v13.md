# Customer Wallet, Room-change Settlement and Manual Withdrawal V13

- Final remediation / pre-commit gates: PASS
- Validation date: 2026-10-02 (Asia/Bangkok)
- Feature branch: `feature/customer-wallet-roomchange-withdrawal-v13`
- Base HEAD: `4146b8c32f67f8c2621f8e856922cfe0541005ad`

Production touched: NO. The feature branch has been pushed and PR #6 opened against
`ui/enziu-home-creative-rebuild`: https://github.com/NhatAizen/Smart-Hotel-Booking-System/pull/6.
No merge, deployment, production migration, production flag change or production-branch push occurred.

## Scope and foundations

The existing Wallet aggregate, owner types (PLATFORM, HOTEL_ADMIN, HOTEL,
CUSTOMER), withdrawal state machine, payment model and V12 HotelCustomerTransfer
are reused. No duplicate wallet subsystem was introduced. Booking owns the
room-change workflow and price; Payment alone owns settled-money calculation,
wallet balances, financial ledger and financial idempotency.

Intended changes are limited to this feature, its shared financial safety
guards, base Compose wiring, tests and this report. Base `docker-compose.yml` may
also be used in future production layering; it is NOT intrinsically local/dev-only.
The feature flag defaults false in that base file. The production
deployment report, .env.prod, production overlays, Cloudflare and credentials
were not modified. The two initially dirty EOL-only markers
(presentation.js and WalletTransactionType.java) have no content change.

## Financial hardening and exact lock order

All affected Payment booking mutations participate in the same durable
booking_financial_locks row mutex, held until the database transaction commits:

- Room-change settlement, including inbox claim/replay and version advancement.
- Refund creation, approval/rejection, component execution and manual resolution.
- Hotel revenue release.
- Booking-linked legacy HOTEL-to-CUSTOMER transfer.
- Cash settlement, Customer-wallet checkout and successful booking-payment callback.

Exact acquisition order:

1. PaymentOrder row at callback entry, when applicable (no reverse acquisition).
2. All booking mutexes, distinct and sorted by UUID for multi-booking operations.
3. Refund/payment/transfer rows.
4. Owner-demotion fences, sorted for callbacks.
5. Multi-wallet paths: PLATFORM, then HOTEL_ADMIN/HOTEL, then CUSTOMER.
6. Ledger and transaction commit.

Checkout prelocks PLATFORM/HOTEL_ADMIN before its CUSTOMER balance check.
Cash no longer inverts PLATFORM/HOTEL_ADMIN order. Single-wallet withdrawal
or top-up does not subsequently acquire a booking mutex or another wallet.
Scalar booking-ID projections avoid loading a managed stale payment/refund
entity while waiting for the booking mutex.

Room-change and withdrawal creation use atomic wallet insert-if-absent plus a
pessimistic wallet lock. Withdrawal review/completion also serializes the request
row; the existing Wallet optimistic version protects shared-wallet updates.
No Customer automatic payout occurs before or after such updates.

True concurrent service tests use real repositories/transactions and the actual
credit, refund, revenue-release and HotelCustomerTransfer services (external
clients are mocks). They prove bounded completion with exactly one financially
valid winner, no double credit and a fail-closed loser. These race tests run on
H2; PostgreSQL 16 is separately exercised by migration tests and full-stack smoke.

## Fail-closed exposure policy

Automatic Customer room-change credit is blocked for current exposure, even if
the exposure occurred after the delayed command's timestamp:

- PAID CASH (money collected outside Payment's retained-money authority).
- Any REFUNDED payment.
- PAID payment with released revenue, missing paidAt, walletApplied=false or
  bookingApplied=false.
- RefundRequest in PENDING_HOTEL_REVIEW, APPROVED, PARTIALLY_COMPLETED or COMPLETED.
- Booking-linked HotelCustomerTransfer in RESERVED or COMPLETED.

The model does not authoritatively represent arbitrary partial provider
refunds/reversals. Unsafe or ambiguous exposure is not guessed or subtracted:
ROOM_CHANGE_RECONCILIATION_REQUIRED requires audited manual reconciliation.

The reciprocal guard prevents automatic full refund, revenue release or legacy
HotelCustomerTransfer after a positive room-change credit. V13 does not pretend
to reverse the original platform/hotel allocation partially. The legacy
single-payment refund endpoint also rejects split-payment bookings; their
existing audited RefundRequest component workflow must be used.

## Cumulative, ordered settlement

Commands contain eventId=roomChangeId, booking/customer IDs, monotonically
increasing booking version, whole new booking total, occurrence timestamp,
correlation ID and Booking's expected net-retained snapshot. The snapshot is a
consistency fence, not financial authority.

Payment derives:

```text
grossSettled = SUM(PAID payment.amount with paidAt <= event.occurredAt)
priorCredits = SUM(committed earlier room-change inbox credited_amount)
netRetained = max(grossSettled - priorCredits, 0)
credit = max(netRetained - newWholeBookingTotal, 0)
```

Settled payment ownership must match the command Customer. Current unsafe
exposure guards run before credit. netRetained below the Booking snapshot rolls
back with SETTLEMENT_NOT_YET_VISIBLE for retry; above the snapshot fails closed.
Only exact agreement permits automatic reconciliation.

Booking keeps the public/confirmed retained-paid position unchanged while
reconciliation is PENDING, using a nullable snapshot. The legacy DB paid_amount
column is a bounded compatibility projection (existing paid <= total constraint),
not proof of wallet credit. The snapshot is cleared and financial position
normalized only after a durable authoritative CONFIRMED Payment result. A later
more-expensive room needs additional payment only against the confirmed net
position; unresolved or failed reconciliation blocks further financial room changes.

Versions must equal lastProcessedVersion+1. Gaps roll back for retry; stale/new
event-ID collisions and reused event IDs with changed payloads are rejected.
Booking mutex precedes inbox claim, avoiding cross-flow lock inversion.
Inbox, version, wallet credit and ledger are one Payment transaction.
Zero-credit events advance the version without creating a wallet-credit ledger.

Required sequence passed: paid 2,000,000 -> total 1,600,000 => 400,000;
total 1,400,000 => additional 200,000; replay => no additional mutation;
total 1,900,000 => zero credit; subsequent valid additional settlement and
another cheaper change => only the incremental remaining excess.

The financial operation type is ROOM_CHANGE_CREDIT, but the ledger reuses the
existing CUSTOMER_REFUND_CREDIT type with reference_type=ROOM_CHANGE.
No transaction-type constraint replacement or new enum is needed.

## Outbox, RabbitMQ and message authenticity

Booking approval, nightly pricing, financial version and immutable outbox event
commit together. Unique roomChangeId and (bookingId, version) protect duplicates.
The publisher selects pending rows using FOR UPDATE SKIP LOCKED and holds later
versions until earlier outbox versions are PUBLISHED.

Topology:

- Durable topic exchange: enziurooms.financial.
- Durable queue: enziurooms.payment.room-change-credit.
- Exact key: booking.room-change.credit.requested.
- Durable DLX: enziurooms.financial.dlx.
- Durable DLQ: enziurooms.payment.room-change-credit.dlq.
- DLQ key: booking.room-change.credit.failed.

Financial messages are persistent JSON, have message ID/correlation, and are
HMAC-SHA256 signed over the exact body. Payment verifies the signature with
constant-time comparison before parsing or invoking financial code.
Missing/invalid/tampered signatures produce no inbox or wallet mutation.
The secret comes only from ROOM_CHANGE_FINANCIAL_HMAC_SECRET and must have at
least 32 characters when enabled; no operational secret is hardcoded.

The dedicated financial RabbitTemplate is mandatory. Correlated publisher
confirm ACK plus no returned message is required before PUBLISHED.
NACK, NO_ROUTE, timeout or unavailable broker keep the durable outbox pending
with retry metadata/backoff. Other Booking publishers retain non-mandatory
semantics. After five consumer attempts the original message is rejected to the
broker-configured DLQ, not acknowledged by a best-effort client republish.
Notification for room-change credit is after the Payment commit.

Delivery is at-least-once with idempotent financial mutation, not a distributed
transaction or unconditional exactly-once broker guarantee. Broker redundancy,
DLQ monitoring and audited replay remain operational requirements.

## Feature flag behavior

ROOM_CHANGE_CUSTOMER_WALLET_CREDIT_ENABLED defaults to false in both services
and base Compose (which can participate in production layering). Production
configuration was not changed or enabled.

OFF: legacy cheaper-than-paid rejection remains; the new publisher, financial
topology, signer/verifier and consumer beans are inactive. Payment's newly added
AMQP dependency does not make OFF health depend on RabbitMQ.

ON: a valid HMAC secret and broker are required; ordered outbox/inbox settlement
is active. In the actual isolated smoke, Booking ON / Payment OFF produced
PENDING + NO_ROUTE, no inbox and no wallet credit. Starting Payment ON then
delivered the retained event through retry and credited exactly 400,000.
No silent loss was observed.

## Customer authorization and withdrawal safety

Wallet/history and withdrawal/media reads scope both ownerType and the
authenticated JWT subject. CUSTOMER/HOTEL with the same ID do not cross-read;
Customer A cannot read B; Hotel Admin is not routed into Customer history.
System Admin retains explicit administrative access. Role matching is exact,
not substring-based. Existing admin route protection remains unchanged.
There is no new public internal-financial command endpoint.

Customer withdrawal is manual only. executePayout=true is rejected before any
PayOsPayoutClient call; mocks verify no automatic-payout client interaction.
Frontend always sends executePayout=false. Existing non-Customer payout
infrastructure remains present.

Create requires an idempotency header, locks/reserves available money and
writes audited ledger. Same owner/type/key and matching payload replay safely;
changed payload is rejected. Completion uses a persisted unique key and matching
reference; repeat completion cannot debit locked funds twice. Invalid state
transitions roll back. Rejection releases the reservation. Concurrent requests
cannot overspend. Existing legacy failure-release behavior is retained.

PENDING -> APPROVED -> PAID is manual; PENDING -> REJECTED releases the hold.
Customer self-cancel is not added. Existing PROCESSING/FAILED paths remain for
non-Customer legacy payout.

## Database proofs

Payment V13 and Booking V20260930.01 are additive, PostgreSQL-compatible and
contain zero DROP statements, no destructive ALTER or historical money rewrite.
No prior migration was edited.

V13 adds nullable ledger audit fields and withdrawal idempotency fields; old
unknown audits intentionally stay null. Partial unique indexes allow historical
null keys and enforce new financial identities. Inbox constraints enforce
operation identity, booking version, integer nonnegative VND and complete result
pairs. Booking financial version is safely backfilled with default 0.

Real PostgreSQL 16.14 validation executed (not skipped):

- Representative Payment V12 -> V13 preserves PLATFORM, HOTEL_ADMIN, HOTEL and
  CUSTOMER wallets, exact balances, withdrawals, ledger and HotelCustomerTransfer.
- Existing V12 regression upgraded through V13 and passed.
- Booking pre-outbox 20260903.03 -> 20260930.01 preserves booking financial
  state and creates the version/outbox/index/unique constraints.
- Flyway migration/validation succeeded for both services.
- The V13 zero-DROP migration contract also passed.

## Original implementation validation (historical, commit f6fdd943)

The results and browser observations below belong to the original implementation
validation. PR #6 subsequently identified premature Booking financial normalization;
they are not proof that the new async-confirmation remediation has passed its gates.

| Gate | Result |
|---|---|
| Payment compile | PASS, including after shared-lock hardening |
| RoomChangeCreditService | PASS, 27 tests |
| HotelCustomerTransfer V12 regression | PASS, 16 tests |
| CustomerWithdrawal V13 | PASS, 11 tests |
| Payment ownership/PayOS callback regression | PASS, 7 tests |
| Wallet ownerType authorization | PASS, 4 tests |
| Message verifier | PASS, 2 tests |
| Rabbit feature/config unit gates | PASS |
| Real Booking Rabbit integration | PASS, 4 tests: routed persistent signed ACK, return, retry, real reject-publish NACK |
| Real Payment Rabbit integration | PASS, 3 tests: duplicate exactly one mutation, settlement-visibility retry, invalid-signature DLQ |
| Payment full suite | PASS, 84 tests, 0 failures/errors/skips |
| Booking full suite, all opt-in gates enabled | PASS, 87 tests, 0 failures/errors/skips |
| PostgreSQL migrations | PASS, real PostgreSQL 16.14 |
| Frontend ESLint | PASS |
| Frontend build | PASS |
| Authenticated local browser smoke | PASS |
| Final diff/security/whitespace audit | PASS |

Maven was run sequentially. Windows sandbox AccessDenied for otherwise valid
dependency JARs was resolved by the established approved local build context,
without source hacks. No relevant frontend component-test script exists; no new
test framework was invented. Expected negative-test warnings include mocked
Redis/email failures, real NO_ROUTE/NACK/signature rejection and Flyway's
PostgreSQL-16 support-version warning; they did not fail migration or tests.

## Original authenticated isolated browser smoke (historical, commit f6fdd943)

Only loopback test infrastructure was used: separate PostgreSQL 16 databases,
RabbitMQ 3.13 and Redis 7, real Payment/Booking application JARs and the actual
built frontend. Identity, Hotel and notification dependencies used a disposable
test gateway with synthetic users/rooms, signed test JWTs and PayOS disabled.
This is not a production auth/integration test; financial APIs, persistence,
outbox, broker, inbox and wallet updates were real.

Customer /customer/wallet:

- Empty wallet/history, balances and two-page transaction history passed.
- Invalid/overspend form validation blocked submission.
- Manual-processing text and amount/masked-bank confirmation passed.
- One 100,000 test withdrawal reserved funds: available 500,000 -> 400,000,
  locked 0 -> 100,000, exactly one request/hold ledger.
- Intentional HTTP 400 error state, retry, loading and recovery passed.
- 390x844 layout had no document horizontal overflow and inputs had labels.

Admin /admin/wallet:

- Server status filters, empty results and withdrawal detail passed.
- Manual approval sent executePayout=false exactly once.
- Missing mark-paid reference/proof was blocked by required form validation.
- Completion confirmation, fixture proof upload and one idempotent mark-paid
  request passed. PAID detail shows proof/reference and no repeat-pay action.
- 390px responsive/table layout had no document horizontal overflow.
- Dialog keyboard/Escape behavior was checked; shared dialogs and Hotel review
  have accessible names. This is focused accessibility smoke, not WCAG certification.

Room change:

- OFF quote preserved legacy rejection, approval disabled, no outbox/inbox.
- ON showed possible-credit copy, explicitly not confirmed money or PayOS refund.
- Real first cheaper change 2,000,000 -> 1,600,000 credited 400,000 after retry.
- Customer requested and Hotel Admin approved a second cheaper change
  1,600,000 -> 1,400,000; version 2 credited exactly 200,000.
- Final Customer wallet: available 1,000,000; locked 0; totalWithdrawn 100,000.
  Two room-change credit rows (400,000 + 200,000) and one manual withdrawal paid
  row were visible. No actual bank transfer/PayOS charge or payout was made.

Final local gateway observation: 67 financial requests, zero 5xx and zero
401/403; five mutating requests after gateway restart were each single successful
requests. The earlier Customer create was verified separately by its one
request/ledger/DB row. Three expected 400 reads were legacy OFF rejection and
intentional wallet-error injection. Browser console warnings/errors were empty;
no CORS, React error or auth loop was observed. Both real apps were UP after smoke.

Initial fixture-only gateway routing/h2c errors were corrected in the ignored
harness before the clean rerun; no application workaround was introduced.
Directory names in Admin are fixture profiles, not production identity data.

Screenshots are ignored local artifacts, not application source or credentials:

- services/payment-service/target/v13-smoke/customer-wallet.jpg
- services/payment-service/target/v13-smoke/customer-mobile.jpg
- services/payment-service/target/v13-smoke/customer-final.jpg
- services/payment-service/target/v13-smoke/admin-manual-paid.jpg
- services/payment-service/target/v13-smoke/admin-mobile.jpg
- services/payment-service/target/v13-smoke/room-change-off.jpg
- services/payment-service/target/v13-smoke/room-change-on.jpg

The computer-use skill provided the session-bound browser workflow, responsive
observations, confirmations and screenshot evidence. The production tab was not used.

## Operational limitations and review handoff

Positive credit intentionally blocks subsequent automatic full refund, hotel
revenue release and legacy transfer for that booking until explicit audited
counterparty reconciliation exists. Booking approval can succeed while unsafe
Payment reconciliation fails closed. The PR remediation keeps paid funds unchanged,
marks/retains PENDING or RECONCILIATION_REQUIRED and blocks dependent room-change,
payment and check-in actions. Monitor pending outbox/result outbox/DLQ and reconcile
manually instead of implying confirmed credit in the UI.

No partial-reversal/clawback subsystem or Customer cancel workflow was added.
Broker availability/redundancy, DLQ alerting and coordinated HMAC configuration
must be addressed during any separately authorized rollout. Do not purge
outbox/inbox/ledger or destructively downgrade these additive migrations.

All final gates above passed before the feature-only commit was authorized.
No production container, database, flag, PayOS operation, Cloudflare state,
production backup or rollback image was changed. No merge or deployment was
performed. The original commit was pushed and PR #6 is open; further remediation
commits must remain on the same feature branch, with no amend/force push/merge/deploy.

## PR #6 async-confirmation remediation

Status: PASS. Fresh local gates completed before the new feature-branch commit.
The original f6fdd943 history is preserved. Normal push updates PR #6 only;
no merge, production-branch push or deployment is authorized.

Final flow: Booking room change -> durable command outbox -> Payment
reconciliation -> wallet credit / reconciliation result -> durable Payment V14
result outbox -> Booking result consumer -> CONFIRMED or RECONCILIATION_REQUIRED.

- Blocker confirmed: the original Booking transaction used min(paid, newTotal)
  before Payment credit existed. This could invent a 300,000 additional payment
  after the 2,000,000 -> 1,600,000 fail-closed example.
- Booking now commits the business change with PENDING and unchanged confirmed
  retained-paid position. A nullable retained-paid snapshot backs public paidAmount
  while unresolved. The old DB paid_amount remains a bounded compatibility projection
  to preserve ck_bookings_paid_amount (paid <= total); it is never evidence of credit.
  Only CONFIRMED replaces the financial position and clears the snapshot; failure
  preserves the snapshot for audit.
  Payment due is not actionable, subsequent room changes/payments/check-in are
  blocked, and Customer/Hotel Admin responses expose reconciliation state.
- Payment credit/inbox/version plus immutable result outbox are one transaction.
  Success (including valid zero-credit) emits CONFIRMED; deterministic unsafe
  exposure/ownership/stale failures roll back credit first, then durably record
  RECONCILIATION_REQUIRED. Visibility gaps/infrastructure/invalid signature retain
  retry/DLQ semantics. Result publication requires routed ACK and is HMAC signed.
- Booking verifies signature, matches the originating outbox's event/customer/
  version/total/snapshot, locks Booking then outbox, and atomically applies result
  plus received-payload audit. Replay is idempotent; altered replay is rejected;
  stale result cannot overwrite a newer version. Rabbit loss/delay does not reduce paid.
- New additive migrations: Booking V20261002.01/.02 and Payment V14. Previous migration
  files are unchanged. No historical money rewrite. Pre-confirmation versioned
  Bookings lacking confirmation proof are treated as RECONCILIATION_REQUIRED,
  never inferred successful; audited manual handling is required.
- CI investigation: Platform CI pull_request only targets main/develop; its push
  branches exclude this feature. Identity push paths do not match these changes
  and its PR targets also exclude this base. Daily-pricing integration PR targets
  feat/manual-daily-pricing; browser QA has no PR trigger. Thus no workflow matches
  PR #6. CI: NOT STARTED — trigger mismatch. GitHub reads also returned zero
  workflow runs and zero combined statuses for f6fdd943. A one-line Platform CI
  PR-base addition was proposed previously; the final checklist explicitly defers
  workflow changes until separately approved. .github/workflows/ci.yml is unchanged.
  No assertion about uninspected repository Actions settings.

### Fresh validation of the async-confirmation implementation

| Gate | Result |
| --- | --- |
| Full Booking suite, all PostgreSQL/Rabbit/Redis opt-ins | PASS: 98 tests, 0 failures/errors/skips |
| Full Payment suite, all PostgreSQL/Rabbit opt-ins | PASS: 90 tests, 0 failures/errors/skips |
| Booking pending/confirmed/required, zero, delay, duplicate/stale/malformed result | PASS: 8 entity + 7 result-service tests |
| Cumulative settlement, ownership, exposure/race guards, atomic result rollback | PASS: RoomChangeCreditServiceTest 31 tests |
| Customer manual withdrawal / no automatic payout | PASS: 11 tests; local manual UI flow |
| Hotel Wallet V12, ownership/PayOS callback regressions | PASS in fresh full Payment suite |
| Real PostgreSQL 16 Booking pre-outbox upgrade | PASS through V20260930.01 and V20261002.01/.02; legacy paid constraint retained |
| Real PostgreSQL 16 Payment upgrades | PASS: representative V12 -> V13 and V13 -> V14; balances/ledger/withdrawals/transfers preserved |
| Real Rabbit integrations | PASS: Booking 4 + Payment 3 tests, including signed command/result, routed ACK, unroutable return/retry, duplicate and invalid command signature |
| Result publisher failure guards | PASS: deterministic mock NACK, unavailable broker and return remain pending; routed ACK marks published |
| Frontend lint / production bundle build | PASS |
| Fresh authenticated isolated browser smoke | PASS; details below |
| Final diff/security/config audit | PASS; additive SQL, unchanged old migrations/production overlays, flags default false, no generated artifacts tracked |

Maven suites ran sequentially in the approved local build context. After the
retained-paid snapshot correction both full suites were rerun. Windows held the
active test JAR during repackage; only that verified local smoke process was
stopped and package was rerun successfully (no source failure or production restart).

### Fresh browser and real service/Rabbit evidence

Only disposable PostgreSQL 16/Rabbit/Redis infrastructure and loopback services
18080/18083/18084 were used. Identity/Hotel fixtures were synthetic; Booking,
Payment, migrations, outbox/inbox, Rabbit results and wallet mutations were real
isolated implementations. No production tab, PayOS charge, actual bank transfer
or provider payout was used.

- Customer Wallet: 500,000 initial balance, history pagination, required/invalid
  input handling, confirmation and one synthetic 100,000 withdrawal passed.
  Manual-processing wording, injected error/retry and delayed-loading recovery
  were observed. The existing summary remains visible during refresh.
- Admin Wallet: status filters/empty results, detail, manual approval with
  executePayout=false, required reference/proof, one mark-paid confirmation and
  paid proof/no repeat-payment action passed. Synthetic screenshot proof and
  PR6-ISOLATED-NO-REAL-TRANSFER reference were used, not a real transfer.
- OFF: cheaper-than-paid quote rejected by legacy rules, approval disabled,
  no command/inbox/result-outbox rows before enabling the isolated feature.
- ON with Payment OFF: business room change 2,000,000 -> 1,600,000 committed,
  command remained PENDING/NO_ROUTE. Booking UI still showed paid 2,000,000,
  pending explanation, disabled subsequent change and no actionable payment due.
  Starting isolated Payment ON retried the same event, credited 400,000 and
  durably returned CONFIRMED through Rabbit; Booking then showed paid 1,600,000.
- Customer requested and Hotel Admin approved the next 1,400,000 room. Version 2
  credited exactly 200,000, result was confirmed, Booking paid became 1,400,000.
  Final wallet: available 1,000,000; locked 0; totalWithdrawn 100,000; exactly two
  room-change credit rows (400,000 and 200,000).
- Separate released-revenue fixture: business change succeeded but Payment
  produced RECONCILIATION_REQUIRED with null credit/net, zero inbox/credit rows.
  Booking retained the 2,000,000 snapshot, UI showed manual reconciliation and
  disabled another change/payment. Service tests additionally block both
  1,900,000 and 1,400,000 subsequent changes, so no invented 300,000 charge.
- Mobile 390x844: Customer cards/inputs/stacked transaction rows and Admin table
  cards remained readable; Admin document client/scroll widths were 375/375.
  Customer was 375/381 (6px document-width difference, within 390px viewport),
  with no visible content clipping. This is focused responsive/accessibility
  smoke, not a claim of zero CSS overflow or full WCAG certification.
- Final gateway segment: 49 financial requests, zero 5xx and zero 401/403;
  four mutating requests each occurred once with successful responses. Two 400
  reads were intentional wallet-error injection. Earlier withdrawal mutations
  were separately verified by UI/DB/request rows. Console warning/error list was
  empty; no CORS, auth loop or React runtime failure. Both local apps were UP.

The initial ON smoke exposed the existing PostgreSQL paid <= total constraint
against the first direct-retention design. That failed transaction rolled back;
the additive nullable snapshot/projection design fixed it before the fresh full
suites and clean browser rerun. Earlier gateway EADDRINUSE was a leftover ignored
test harness, not application/production failure; it was replaced before resetting
the final metrics segment. Expected NO_ROUTE logs proved pending/retry behavior.

Fresh screenshots (ignored, never committed):

- services/payment-service/target/v13-smoke/pr6-customer-final.jpg
- services/payment-service/target/v13-smoke/pr6-admin-paid.jpg
- services/payment-service/target/v13-smoke/pr6-admin-mobile.jpg
- services/payment-service/target/v13-smoke/pr6-room-off.jpg
- services/payment-service/target/v13-smoke/pr6-room-pending.jpg
- services/payment-service/target/v13-smoke/pr6-room-failclosed.jpg

The computer-use skill guided the isolated session, synthetic manual-flow
confirmations, responsive observations and screenshot evidence. Production touched: NO.

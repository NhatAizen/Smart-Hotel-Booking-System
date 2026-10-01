# Customer Wallet, Room-change Settlement and Manual Withdrawal V13

- Final remediation / pre-commit gates: PASS
- Validation date: 2026-10-02 (Asia/Bangkok)
- Feature branch: `feature/customer-wallet-roomchange-withdrawal-v13`
- Base HEAD: `4146b8c32f67f8c2621f8e856922cfe0541005ad`

Production touched: NO. No merge, deployment, production migration, production flag change or push.

## Scope and foundations

The existing Wallet aggregate, owner types (PLATFORM, HOTEL_ADMIN, HOTEL,
CUSTOMER), withdrawal state machine, payment model and V12 HotelCustomerTransfer
are reused. No duplicate wallet subsystem was introduced. Booking owns the
room-change workflow and price; Payment alone owns settled-money calculation,
wallet balances, financial ledger and financial idempotency.

Intended changes are limited to this feature, its shared financial safety
guards, local/dev compose wiring, tests and this report. The production
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

Booking normalizes paidAmount to net value retained for the booking and computes
remainingAmount accordingly. A later more-expensive room needs additional
payment; earlier wallet credits are not silently treated as still-paid money.

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
and local/dev compose. Production configuration was not changed.

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

## Fresh validation results

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

## Authenticated isolated browser smoke

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
Payment reconciliation fails closed; monitor pending outbox/DLQ and reconcile
manually instead of implying confirmed credit in the UI.

No partial-reversal/clawback subsystem or Customer cancel workflow was added.
Broker availability/redundancy, DLQ alerting and coordinated HMAC configuration
must be addressed during any separately authorized rollout. Do not purge
outbox/inbox/ledger or destructively downgrade these additive migrations.

All final gates above passed before the feature-only commit was authorized.
No production container, database, flag, PayOS operation, Cloudflare state,
production backup or rollback image was changed. No merge or deployment was
performed. Stop after the commit and wait for user review.

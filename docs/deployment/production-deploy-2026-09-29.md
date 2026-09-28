# EnziuRooms Production Deployment Closeout

- **Final status:** DEPLOY PASS
- **Deployment date:** 2026-09-29 (Asia/Bangkok)
- **Deployed Git commit:** `77a85a04b0428124d8026141b6f1429889c97f0c`
- **Closeout scope:** Read-only verification. No rebuild, restart, migration run, source change, feature-flag change, credential change, or production-data mutation was performed.

## Production containers

| Target | Container ID | Image ID | Runtime status | Health |
|---|---|---|---|---|
| Hotel | `f28e352f2fc2da419e3e4eb7124b9575ad6e687e8449bff49fd228e6ac6367ad` | `sha256:4087d27c3cf2d3badcc6cd920c488f2f7e66a3a86d28d80ac9259ede4143a362` | running | healthy |
| Booking | `77fab464944ecc9d4b2c8368db8f585b6f64450c8a8789a0037b277906abda99` | `sha256:e05271eaa63d212e9c829be30979cb0070f13c584349dc0d6119d49746eeadda` | running | healthy |
| Payment | `f6129a953d9baabf9185f2af013c41a46f4a7e9bc7cc11d5844964b883a22744` | `sha256:32253f9bd882b813fa3f5e6e92aeb4d0bc45f40c70e93b8c3ac6275df41847be` | running | healthy |
| Frontend | `3de4cba6ce4f89acf470da89344201497a8793ecd080458794f8c96515b13f73` | `sha256:c3e0d5f786dcba3ab3ef38cf3e05b63842f458042f442a1fa653efc435f8e967` | running | n/a (no Docker healthcheck) |

## Database migrations

- **Hotel migration applied:** `20260920.01`
- **Payment migration applied:** `V12` (Flyway schema version `12`)

Both values were read from the corresponding production `flyway_schema_history` tables during closeout. No migration command was run.

## Feature flags

- `MANUAL_DAILY_CUSTOMER_PRICING_ENABLED=false`
- `PAYOS_AUTO_RELEASE_HOTEL_REVENUE=false`
- `PAYOS_PAYOUT_ENABLED=false`

No PayOS charge, wallet funding, transfer, payout, or other payment mutation was performed during deployment smoke or closeout.

## Smoke results

| Check | Result | Evidence |
|---|---|---|
| `http://localhost/` | PASS | HTTP 200 |
| `https://enziurooms.xyz/` | PASS | HTTP 200 |
| Login | PASS | Login endpoint HTTP 200; authenticated Hotel Admin session remained valid with no auth loop |
| Availability Calendar | PASS | Authenticated page loaded without redirect; 5 rooms and live room/occupancy state were displayed; 14-day to 7-day filter, room-type filter, and date navigation worked; no frontend console/runtime error |
| Housekeeping | PASS | Housekeeping section loaded and displayed the current empty queue (`0` rooms requiring follow-up); no room status was changed |
| Daily Pricing | PASS | Hotel and room type loaded; saved-rule empty state displayed correctly; no rule was created, updated, or deleted |
| API/network | PASS | No observed 5xx, CORS error, auth loop, or `PRICE_CHANGED` during read-only smoke |
| Backend logs | PASS | Hotel and Payment had no critical matches; Booking had only the benign SSE disconnect described below; API Gateway had no 5xx, CORS, or `PRICE_CHANGED` matches |

No production data mutation occurred during authenticated smoke testing.

### Known benign observation

Booking availability SSE logged `java.io.IOException: Broken pipe` when the browser navigated away or changed views. This is a client-disconnect observation from `/api/availability/stream/...`, not a booking/payment business error, and did not affect page loading, API results, or container health.

## Rollback readiness

All rollback tags still exist and were inspected without retagging or modification:

| Rollback tag | Image ID |
|---|---|
| `enziurooms-rollback/hotel-service:pre-77a85a0` | `sha256:e904c47bf961ac5ef8dd6d7dfa572300288880d7ce7db02c5d99b6dcc8e73e49` |
| `enziurooms-rollback/booking-service:pre-77a85a0` | `sha256:e0c34ce3cbbb0b9cd7a9f97243fb4414ec082d9a79e6639b99263e18475fe127` |
| `enziurooms-rollback/payment-service:pre-77a85a0` | `sha256:1fc0ed0b7cf0c97da8898a08082265222f48d22ae5261bcf5aed00f9ce8fbd97` |
| `enziurooms-rollback/frontend-prod:pre-77a85a0` | `sha256:115749ebea8aa95b71b5945b8cfa11e8e6ecbd3e00ad091c794d4fafda018039` |

## Backup

- **Path:** `D:\EnziuRooms-Backups\feature-77a85a0-20260929-014156`
- **Exists at closeout:** yes

The backup was not modified or deleted.

## Non-target invariance

- **Non-target container delta:** `0`
- Reverse proxy, PostgreSQL databases, Redis, RabbitMQ, API Gateway, and all other non-target services retained their pre-deployment container IDs.
- No non-target service was recreated or restarted during the deployment or closeout.

## Git closeout

The working tree was clean before this report was created. This report is intentionally left untracked; it was not staged, committed, or pushed.

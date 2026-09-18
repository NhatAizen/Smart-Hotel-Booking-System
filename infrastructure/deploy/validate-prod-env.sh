#!/usr/bin/env sh
set -eu

ENV_FILE="${1:-$(dirname "$0")/.env.prod}"
[ -f "$ENV_FILE" ] || { echo "Không tìm thấy production env file: $ENV_FILE" >&2; exit 1; }

read_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | sed "s/^[\"']//;s/[\"']$//"
}

require_secret() {
  name="$1"
  min="${2:-16}"
  value="$(read_value "$name")"
  case "$value" in ""|CHANGE_ME*|dev-*) echo "$name chưa được cấu hình bằng secret production hợp lệ" >&2; exit 1;; esac
  [ "${#value}" -ge "$min" ] || { echo "$name quá ngắn cho production" >&2; exit 1; }
}

for name in NOTIFICATION_INTERNAL_API_KEY RABBITMQ_PASSWORD REDIS_PASSWORD \
  IDENTITY_DB_PASSWORD HOTEL_DB_PASSWORD BOOKING_DB_PASSWORD PAYMENT_DB_PASSWORD \
  NOTIFICATION_DB_PASSWORD CHAT_DB_PASSWORD EKYC_INTERNAL_API_KEY EKYC_TOKEN_SECRET; do
  require_secret "$name"
done
require_secret JWT_SECRET 32
jwt_secret="$(read_value JWT_SECRET)"
if ! printf '%s' "$jwt_secret" | base64 -d >/dev/null 2>&1; then
  echo "JWT_SECRET phải là Base64 hợp lệ" >&2
  exit 1
fi
jwt_bytes="$(printf '%s' "$jwt_secret" | base64 -d | wc -c | tr -d ' ')"
[ "$jwt_bytes" -ge 32 ] || { echo "JWT_SECRET phải giải mã thành ít nhất 32 byte" >&2; exit 1; }

public_url="$(read_value PUBLIC_WEB_URL)"
case "$public_url" in https://*) :;; *) echo "PUBLIC_WEB_URL production phải là URL HTTPS tuyệt đối" >&2; exit 1;; esac

case "$(read_value PAYOS_ENABLED | tr '[:upper:]' '[:lower:]')" in
  true|1|yes)
    require_secret PAYOS_CLIENT_ID 4
    require_secret PAYOS_API_KEY
    require_secret PAYOS_CHECKSUM_KEY
    ;;
esac

case "$(read_value PAYOS_PAYOUT_ENABLED | tr '[:upper:]' '[:lower:]')" in
  true|1|yes)
    echo "PAYOS_PAYOUT_ENABLED phải giữ false cho production hiện tại" >&2
    exit 1
    ;;
esac

echo "Production environment validation passed (secret values were not printed)."

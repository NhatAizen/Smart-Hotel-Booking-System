#!/usr/bin/env python3
"""Hosted-only HTTP integration for Hotel Service and Booking Service."""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4


HOTEL_URL = "http://127.0.0.1:18082"
BOOKING_URL = "http://127.0.0.1:18083"
IDENTITY_URL = "http://127.0.0.1:18081"
_candidate = datetime.now(timezone.utc).date() + timedelta(days=30)
_check_in = _candidate + timedelta(days=(-_candidate.weekday()) % 7)
CHECK_IN = _check_in.isoformat()
CHECK_OUT = (_check_in + timedelta(days=2)).isoformat()
CALENDAR_TO = (_check_in + timedelta(days=1)).isoformat()


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def decode_jwt_payload(token: str) -> dict:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


def jwt(secret_b64: str, subject: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps({
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode()
    signature = b64url(hmac.new(base64.b64decode(secret_b64), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


class IdentityHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if self.path != "/api/users/me/role-snapshot":
            self.send_error(404)
            return
        authorization = self.headers.get("Authorization", "")
        try:
            claims = decode_jwt_payload(authorization.removeprefix("Bearer "))
            body = json.dumps({"role": claims["role"], "active": True}).encode()
        except (IndexError, KeyError, ValueError, json.JSONDecodeError):
            self.send_error(401)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


class ServiceProcess:
    def __init__(self, name: str, jar: Path, port: int, env: dict[str, str]):
        self.name = name
        self.port = port
        self.log_path = Path(f"{name}.log")
        self.log = self.log_path.open("w", encoding="utf-8")
        self.process = subprocess.Popen(
            ["java", "-jar", str(jar)],
            env={**os.environ, **env},
            stdout=self.log,
            stderr=subprocess.STDOUT,
        )

    def wait_ready(self, timeout: int = 90) -> None:
        deadline = time.time() + timeout
        last_error = "service did not answer"
        while time.time() < deadline:
            if self.process.poll() is not None:
                raise AssertionError(f"{self.name} exited with {self.process.returncode}\n{self.tail()}")
            try:
                status, _ = http("GET", f"http://127.0.0.1:{self.port}/actuator/info")
                if status == 200:
                    return
                last_error = f"health status {status}"
            except (AssertionError, URLError) as error:
                last_error = str(error)
            time.sleep(1)
        raise AssertionError(f"{self.name} was not ready: {last_error}\n{self.tail()}")

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        if not self.log.closed:
            self.log.close()

    def tail(self, lines: int = 80) -> str:
        if not self.log.closed:
            self.log.flush()
        try:
            return "\n".join(self.log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:])
        except FileNotFoundError:
            return "<no service log>"


def http(method: str, url: str, body: dict | None = None, token: str | None = None,
         expected: tuple[int, ...] = (200,)) -> tuple[int, object | None]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=15) as response:
            status = response.status
            raw = response.read()
    except HTTPError as error:
        status = error.code
        raw = error.read()
    if status not in expected:
        text = raw.decode("utf-8", errors="replace")
        raise AssertionError(f"{method} {url} returned {status}, expected {expected}: {text}")
    if not raw:
        return status, None
    return status, json.loads(raw)


def assert_money(actual: object, expected: str, label: str) -> None:
    if Decimal(str(actual)) != Decimal(expected):
        raise AssertionError(f"{label}: expected {expected}, got {actual}")


def wait_port_closed(port: int, timeout: int = 15) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket() as client:
            client.settimeout(0.5)
            if client.connect_ex(("127.0.0.1", port)) != 0:
                return
        time.sleep(0.25)
    raise AssertionError(f"port {port} remained open after service termination")


def approve_synthetic_catalog(container: str, user: str, database: str,
                              hotel_id: str, room_type_id: str) -> None:
    sql = (
        "UPDATE hotels SET approval_status='APPROVED', reviewed_at=CURRENT_TIMESTAMP "
        f"WHERE id='{hotel_id}'; "
        "UPDATE room_types SET approval_status='APPROVED', approved_base_price=base_price, "
        f"reviewed_at=CURRENT_TIMESTAMP WHERE id='{room_type_id}';"
    )
    result = subprocess.run(
        ["docker", "exec", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", user,
         "-d", database, "-c", sql],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(f"synthetic catalog approval failed: {result.stdout}\n{result.stderr}")


def setup_hotel(admin_token: str, postgres_container: str, db_user: str, hotel_db: str) -> dict:
    _, hotel = http("POST", f"{HOTEL_URL}/api/hotels", {
        "name": "HTTP Synthetic Hotel",
        "description": "GitHub Actions only",
        "address": "1 CI Street",
        "ward": "CI Ward",
        "district": "CI District",
        "city": "CI City",
        "latitude": 10.0,
        "longitude": 106.0,
        "phone": "0900000000",
        "email": "hotel@example.test",
        "starRating": 4,
        "checkInTime": "14:00:00",
        "checkOutTime": "12:00:00",
        "amenities": [],
    }, admin_token, (201,))
    hotel_id = hotel["id"]

    _, room_type = http("POST", f"{HOTEL_URL}/api/hotels/{hotel_id}/room-types", {
        "name": "HTTP Suite",
        "description": "Synthetic room type",
        "basePrice": 1000,
        "maxAdults": 2,
        "maxChildren": 0,
        "bedType": "KING",
        "bedCount": 1,
        "areaSqm": 30,
        "breakfastIncluded": False,
        "refundable": True,
        "smokingAllowed": False,
        "payAtHotelAllowed": True,
        "depositAllowed": False,
        "depositPercent": 30,
        "fullPaymentAllowed": True,
        "amenities": [],
    }, admin_token, (201,))
    room_type_id = room_type["id"]

    rooms = []
    for number in ("HTTP-101", "HTTP-102", "HTTP-103"):
        _, room = http("POST", f"{HOTEL_URL}/api/hotels/{hotel_id}/rooms", {
            "roomTypeId": room_type_id,
            "roomNumber": number,
            "floor": 1,
            "customPrice": 900,
            "note": "GitHub Actions only",
        }, admin_token, (201,))
        rooms.append(room["id"])

    approve_synthetic_catalog(postgres_container, db_user, hotel_db, hotel_id, room_type_id)
    http("GET", f"{HOTEL_URL}/api/hotels/{hotel_id}")
    http("GET", f"{HOTEL_URL}/api/room-types/{room_type_id}")

    _, rule = http("POST", f"{HOTEL_URL}/api/hotels/{hotel_id}/daily-price-rules", {
        "roomTypeId": room_type_id,
        "startDate": CHECK_IN,
        "endDate": CALENDAR_TO,
        "nightlyPrice": 750,
    }, admin_token, (201,))
    return {"hotel": hotel_id, "room_type": room_type_id, "rooms": rooms, "rule": rule["id"]}


def quote(room_id: str) -> dict:
    _, result = http("POST", f"{BOOKING_URL}/api/pricing/quote", {
        "hotelId": STATE["hotel"],
        "roomIds": [room_id],
        "checkIn": CHECK_IN,
        "checkOut": CHECK_OUT,
    })
    return result


def hold(room_id: str, customer_token: str) -> str:
    _, result = http("POST", f"{BOOKING_URL}/api/availability/holds", {
        "hotelId": STATE["hotel"],
        "roomIds": [room_id],
        "checkIn": CHECK_IN,
        "checkOut": CHECK_OUT,
        "holdToken": None,
    }, customer_token, (201,))
    return result["holdToken"]


def booking_payload(room_id: str, hold_token: str, quote_data: dict | None) -> dict:
    payload = {
        "customerId": STATE["customer"],
        "hotelId": STATE["hotel"],
        "roomIds": [room_id],
        "checkIn": CHECK_IN,
        "checkOut": CHECK_OUT,
        "adults": 1,
        "children": 0,
        "paymentOption": "PAY_AT_HOTEL",
        "bookerLastName": "CI",
        "bookerFirstName": "Customer",
        "bookerEmail": "customer@example.test",
        "bookerPhone": "0900000000",
        "bookerDateOfBirth": "1990-01-01",
        "ageConfirmed": True,
        "bookerIsGuest": True,
        "guestLastName": None,
        "guestFirstName": None,
        "guestPhone": None,
        "specialRequest": None,
        "invoiceRequested": False,
        "invoiceCompanyName": None,
        "invoiceTaxCode": None,
        "invoiceAddress": None,
        "invoiceEmail": None,
        "termsAccepted": True,
        "holdToken": hold_token,
        "hotelPromotionCode": None,
        "platformPromotionCode": None,
        "expectedGrossAmount": None,
        "expectedFinalAmount": None,
        "expectedPricingFingerprint": None,
    }
    if quote_data is not None:
        payload.update({
            "expectedGrossAmount": quote_data["totalAmount"],
            "expectedFinalAmount": quote_data["totalAmount"],
            "expectedPricingFingerprint": quote_data["pricingFingerprint"],
        })
    return payload


def calendar(admin_token: str) -> dict:
    _, result = http(
        "GET",
        f"{BOOKING_URL}/api/hotel-admin/hotels/{STATE['hotel']}/availability-calendar"
        f"?from={CHECK_IN}&to={CALENDAR_TO}",
        token=admin_token,
    )
    return result


def start_booking(jar: Path, common_env: dict[str, str], enabled: bool) -> ServiceProcess:
    service = ServiceProcess("booking-service", jar, 18083, {
        **common_env,
        "SERVER_PORT": "18083",
        "HOTEL_SERVICE_URL": HOTEL_URL,
        "IDENTITY_SERVICE_URL": IDENTITY_URL,
        "PAYMENT_SERVICE_URL": "http://127.0.0.1:1",
        "NOTIFICATION_SERVICE_URL": "http://127.0.0.1:1",
        "MANUAL_DAILY_CUSTOMER_PRICING_ENABLED": str(enabled).lower(),
        "SPRING_RABBITMQ_LISTENER_SIMPLE_AUTO_STARTUP": "false",
        "BOOKING_HOLD_CLEANUP_DELAY_MS": "3600000",
    })
    service.wait_ready()
    return service


STATE: dict[str, object] = {}


def run(args: argparse.Namespace) -> None:
    secret = os.environ["JWT_SECRET"]
    customer_id = str(uuid4())
    owner_id = str(uuid4())
    customer_token = jwt(secret, customer_id, "CUSTOMER")
    admin_token = jwt(secret, owner_id, "HOTEL_ADMIN")
    STATE["customer"] = customer_id

    identity = ThreadingHTTPServer(("127.0.0.1", 18081), IdentityHandler)
    identity_thread = threading.Thread(target=identity.serve_forever, daemon=True)
    identity_thread.start()

    common_hotel_env = {
        "SERVER_PORT": "18082",
        "DB_URL": os.environ["HOTEL_DB_URL"],
        "DB_USERNAME": os.environ["DB_USERNAME"],
        "DB_PASSWORD": os.environ["DB_PASSWORD"],
        "JWT_SECRET": secret,
        "IDENTITY_SERVICE_URL": IDENTITY_URL,
        "NOTIFICATION_SERVICE_URL": "http://127.0.0.1:1",
        "NOMINATIM_ENABLED": "false",
        "JPA_SHOW_SQL": "false",
    }
    common_booking_env = {
        "DB_URL": os.environ["BOOKING_DB_URL"],
        "DB_USERNAME": os.environ["DB_USERNAME"],
        "DB_PASSWORD": os.environ["DB_PASSWORD"],
        "REDIS_HOST": "127.0.0.1",
        "REDIS_PORT": "6379",
        "JWT_SECRET": secret,
        "JPA_SHOW_SQL": "false",
    }

    hotel = ServiceProcess("hotel-service", args.hotel_jar, 18082, common_hotel_env)
    booking: ServiceProcess | None = None
    try:
        hotel.wait_ready()
        STATE.update(setup_hotel(
            admin_token,
            os.environ["POSTGRES_CONTAINER_ID"],
            os.environ["DB_USERNAME"],
            os.environ["HOTEL_DB_NAME"],
        ))

        booking = start_booking(args.booking_jar, common_booking_env, enabled=False)
        legacy_room = STATE["rooms"][0]
        legacy_quote = quote(legacy_room)
        assert_money(legacy_quote["totalAmount"], "1800.00", "flag-off legacy quote")
        if legacy_quote.get("pricingFingerprint") is not None:
            raise AssertionError("flag-off quote unexpectedly returned a pricing fingerprint")
        legacy_hold = hold(legacy_room, customer_token)
        _, legacy_booking = http("POST", f"{BOOKING_URL}/api/bookings/batch",
                                 booking_payload(legacy_room, legacy_hold, None), customer_token, (201,))
        assert_money(legacy_booking[0]["totalPrice"], "1800.00", "flag-off stored booking")
        print("PASS flag-off: legacy quote and stored booking remain 1800.00")

        booking.stop()
        wait_port_closed(18083)
        booking = start_booking(args.booking_jar, common_booking_env, enabled=True)

        priced_room = STATE["rooms"][1]
        priced_hold = hold(priced_room, customer_token)
        before_change = calendar(admin_token)
        if not any(item["roomId"] == priced_room for item in before_change["holds"]):
            raise AssertionError("Calendar did not expose the active Redis hold")

        accepted_before_change = quote(priced_room)
        assert_money(accepted_before_change["totalAmount"], "1500.00", "flag-on Hotel price")
        if [night["pricingType"] for night in accepted_before_change["rooms"][0]["nights"]] != [
                "MANUAL_DAILY", "MANUAL_DAILY"]:
            raise AssertionError("Booking quote did not use nightly prices returned by Hotel Service")

        http("PUT", f"{HOTEL_URL}/api/hotels/{STATE['hotel']}/daily-price-rules/{STATE['rule']}", {
            "roomTypeId": STATE["room_type"],
            "startDate": CHECK_IN,
            "endDate": CALENDAR_TO,
            "nightlyPrice": 800,
        }, admin_token)

        status, changed = http("POST", f"{BOOKING_URL}/api/bookings/batch",
                               booking_payload(priced_room, priced_hold, accepted_before_change),
                               customer_token, (409,))
        if status != 409 or changed.get("code") != "PRICE_CHANGED":
            raise AssertionError(f"expected PRICE_CHANGED, got {status}: {changed}")
        after_change = calendar(admin_token)
        if not any(item["roomId"] == priced_room for item in after_change["holds"]):
            raise AssertionError("PRICE_CHANGED removed the still-valid Redis hold")
        if any(item["roomId"] == priced_room for item in after_change["bookings"]):
            raise AssertionError("PRICE_CHANGED persisted a booking")

        refreshed = quote(priced_room)
        assert_money(refreshed["totalAmount"], "1600.00", "refreshed Hotel price")
        _, saved = http("POST", f"{BOOKING_URL}/api/bookings/batch",
                        booking_payload(priced_room, priced_hold, refreshed), customer_token, (201,))
        assert_money(saved[0]["totalPrice"], "1600.00", "confirmed stored booking")
        after_booking = calendar(admin_token)
        if any(item["roomId"] == priced_room for item in after_booking["holds"]):
            raise AssertionError("Calendar still exposed the released hold after booking")
        if not any(item["roomId"] == priced_room and item["status"] == "CONFIRMED"
                   for item in after_booking["bookings"]):
            raise AssertionError("Calendar did not expose the confirmed booking")
        print("PASS flag-on: Hotel HTTP price, PRICE_CHANGED, hold retention and Calendar transition")

        outage_room = STATE["rooms"][2]
        outage_quote = quote(outage_room)
        outage_hold = hold(outage_room, customer_token)
        _, bookings_before = http("GET", f"{BOOKING_URL}/api/bookings/me", token=customer_token)
        hotel.stop()
        wait_port_closed(18082)

        outage_status, _ = http("POST", f"{BOOKING_URL}/api/bookings/batch",
                                booking_payload(outage_room, outage_hold, outage_quote),
                                customer_token, (500, 502, 503, 504))
        if outage_status < 500:
            raise AssertionError("Booking unexpectedly succeeded while Hotel Service was unavailable")
        _, bookings_after = http("GET", f"{BOOKING_URL}/api/bookings/me", token=customer_token)
        if len(bookings_after) != len(bookings_before):
            raise AssertionError("Booking was persisted while Hotel Service was unavailable")
        _, availability = http(
            "GET",
            f"{BOOKING_URL}/api/availability/hotels/{STATE['hotel']}"
            f"?checkIn={CHECK_IN}&checkOut={CHECK_OUT}",
        )
        if outage_room not in availability["unavailableRoomIds"]:
            raise AssertionError("Hotel outage unexpectedly released the Customer's Redis hold")
        print("PASS fail-closed: Hotel outage creates no booking and preserves the accepted hold")
    except Exception:
        print("\n--- hotel-service.log ---\n" + hotel.tail(), file=sys.stderr)
        if booking is not None:
            print("\n--- booking-service.log ---\n" + booking.tail(), file=sys.stderr)
        raise
    finally:
        if booking is not None:
            booking.stop()
        hotel.stop()
        identity.shutdown()
        identity.server_close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hotel-jar", type=Path, required=True)
    parser.add_argument("--booking-jar", type=Path, required=True)
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        message = str(exc).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error title=Hotel and Booking HTTP integration failed::{message}", file=sys.stderr)
        raise

#!/usr/bin/env python3
"""Run the existing frontend against real Hotel/Booking services for browser QA."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from calendar_daily_pricing_http_e2e import (
    BOOKING_URL,
    CALENDAR_TO,
    CHECK_IN,
    CHECK_OUT,
    HOTEL_URL,
    IdentityHandler,
    ServiceProcess,
    decode_jwt_payload,
    http,
    jwt,
    setup_hotel,
    start_booking,
)


FRONTEND_URL = "http://127.0.0.1:5300"


class BrowserIdentityHandler(IdentityHandler):
    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if self.path == "/api/users/me/role-snapshot":
            super().do_GET()
            return
        if self.path != "/api/users/me":
            self.send_error(404)
            return
        authorization = self.headers.get("Authorization", "")
        try:
            claims = decode_jwt_payload(authorization.removeprefix("Bearer "))
            body = json.dumps({
                "id": claims["sub"],
                "userId": claims["sub"],
                "email": "customer@example.test",
                "phone": "0900000000",
                "dateOfBirth": "1990-01-01",
                "firstName": "Customer",
                "lastName": "CI",
                "role": claims["role"],
                "active": True,
            }).encode()
        except (IndexError, KeyError, ValueError, json.JSONDecodeError):
            self.send_error(401)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class QaGatewayHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def target(self) -> str:
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/users/"):
            return "http://127.0.0.1:18081"
        if (path.startswith("/api/hotels/") or path == "/api/hotels"
                or path.startswith("/api/rooms/") or path.startswith("/api/room-types/")):
            return HOTEL_URL
        return BOOKING_URL

    def forward(self) -> None:
        if self.path.startswith("/api/availability/stream/"):
            self.send_response(503)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length) if length else None
        headers = {
            name: value for name, value in self.headers.items()
            if name.lower() in {"accept", "authorization", "content-type", "x-correlation-id"}
        }
        request = Request(self.target() + self.path, data=data, headers=headers, method=self.command)
        try:
            response = urlopen(request, timeout=30)
            status = response.status
            body = response.read()
            content_type = response.headers.get("Content-Type", "application/json")
        except HTTPError as error:
            status = error.code
            body = error.read()
            content_type = error.headers.get("Content-Type", "application/json")
        except URLError as error:
            status = 502
            body = json.dumps({"message": f"QA upstream unavailable: {error.reason}"}).encode()
            content_type = "application/json"
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    do_GET = forward
    do_POST = forward
    do_PUT = forward
    do_PATCH = forward
    do_DELETE = forward

    def log_message(self, _format: str, *_args: object) -> None:
        return


class ManagedProcess:
    def __init__(self, name: str, command: list[str], cwd: Path, env: dict[str, str]):
        self.name = name
        self.log_path = Path(f"{name}.log")
        self.log = self.log_path.open("w", encoding="utf-8")
        self.process = subprocess.Popen(
            command,
            cwd=cwd,
            env={**os.environ, **env},
            stdout=self.log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )

    def wait_url(self, url: str, timeout: int = 90) -> None:
        deadline = time.time() + timeout
        last_error = "process did not answer"
        while time.time() < deadline:
            if self.process.poll() is not None:
                raise AssertionError(f"{self.name} exited with {self.process.returncode}\n{self.tail()}")
            try:
                with urlopen(url, timeout=3) as response:
                    if response.status == 200:
                        return
            except (HTTPError, URLError) as error:
                last_error = str(error)
            time.sleep(1)
        raise AssertionError(f"{self.name} was not ready: {last_error}\n{self.tail()}")

    def tail(self, lines: int = 80) -> str:
        if not self.log.closed:
            self.log.flush()
        return "\n".join(self.log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:])

    def stop(self) -> None:
        if self.process.poll() is None:
            os.killpg(self.process.pid, signal.SIGTERM)
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid, signal.SIGKILL)
                self.process.wait(timeout=5)
        if not self.log.closed:
            self.log.close()


def iso(instant: datetime) -> str:
    return instant.isoformat().replace("+00:00", "Z")


def run(args: argparse.Namespace) -> None:
    secret = os.environ["JWT_SECRET"]
    customer_id = os.environ["QA_CUSTOMER_ID"]
    owner_id = os.environ["QA_OWNER_ID"]
    customer_token = jwt(secret, customer_id, "CUSTOMER")
    admin_token = jwt(secret, owner_id, "HOTEL_ADMIN")

    identity = ThreadingHTTPServer(("127.0.0.1", 18081), BrowserIdentityHandler)
    gateway = ThreadingHTTPServer(("127.0.0.1", 8080), QaGatewayHandler)
    threading.Thread(target=identity.serve_forever, daemon=True).start()
    threading.Thread(target=gateway.serve_forever, daemon=True).start()

    hotel = ServiceProcess("hotel-service-browser", args.hotel_jar, 18082, {
        "SERVER_PORT": "18082",
        "DB_URL": os.environ["HOTEL_DB_URL"],
        "DB_USERNAME": os.environ["DB_USERNAME"],
        "DB_PASSWORD": os.environ["DB_PASSWORD"],
        "JWT_SECRET": secret,
        "IDENTITY_SERVICE_URL": "http://127.0.0.1:18081",
        "NOTIFICATION_SERVICE_URL": "http://127.0.0.1:1",
        "NOMINATIM_ENABLED": "false",
        "JPA_SHOW_SQL": "false",
    })
    booking: ServiceProcess | None = None
    frontend: ManagedProcess | None = None
    try:
        hotel.wait_ready()
        state = setup_hotel(
            admin_token,
            os.environ["POSTGRES_CONTAINER_ID"],
            os.environ["DB_USERNAME"],
            os.environ["HOTEL_DB_NAME"],
        )
        booking = start_booking(args.booking_jar, {
            "DB_URL": os.environ["BOOKING_DB_URL"],
            "DB_USERNAME": os.environ["DB_USERNAME"],
            "DB_PASSWORD": os.environ["DB_PASSWORD"],
            "REDIS_HOST": "127.0.0.1",
            "REDIS_PORT": "6379",
            "JWT_SECRET": secret,
            "JPA_SHOW_SQL": "false",
        }, enabled=True)

        now = datetime.now(timezone.utc)
        promotion_code = "KEEP100"
        http("POST", f"{BOOKING_URL}/api/hotel-admin/promotions", {
            "code": promotion_code,
            "name": "QA browser promotion",
            "description": "Synthetic GitHub Actions data only",
            "hotelId": state["hotel"],
            "discountType": "FIXED",
            "discountValue": 100,
            "maxDiscount": None,
            "minBookingAmount": 0,
            "startAt": iso(now - timedelta(seconds=30)),
            "endAt": iso(now + timedelta(days=2)),
            "usageLimit": 5,
            "usagePerUser": 1,
        }, admin_token, (201,))

        frontend = ManagedProcess(
            "frontend-browser",
            ["npm", "run", "dev", "--", "--host", "127.0.0.1"],
            args.frontend_dir,
            {"VITE_API_BASE_URL": "/api"},
        )
        frontend.wait_url(FRONTEND_URL)

        qa_state = {
            "frontendUrl": FRONTEND_URL,
            "hotelUrl": HOTEL_URL,
            "bookingUrl": BOOKING_URL,
            "hotelId": state["hotel"],
            "roomTypeId": state["room_type"],
            "roomId": state["rooms"][0],
            "ruleId": state["rule"],
            "checkIn": CHECK_IN,
            "checkOut": CHECK_OUT,
            "calendarTo": CALENDAR_TO,
            "promotionCode": promotion_code,
            "customerToken": customer_token,
            "adminToken": admin_token,
        }
        result = subprocess.run(
            ["node", str(args.browser_script.resolve())],
            cwd=args.browser_script.parent,
            env={
                **os.environ,
                "QA_STATE_JSON": json.dumps(qa_state),
                "QA_ARTIFACT_DIR": str(args.artifact_dir.resolve()),
            },
            check=False,
        )
        if result.returncode != 0:
            raise AssertionError(f"browser scenario exited with {result.returncode}")
    except Exception:
        print("\n--- hotel-service-browser.log ---\n" + hotel.tail(), file=sys.stderr)
        if booking is not None:
            print("\n--- booking-service.log ---\n" + booking.tail(), file=sys.stderr)
        if frontend is not None:
            print("\n--- frontend-browser.log ---\n" + frontend.tail(), file=sys.stderr)
        raise
    finally:
        if frontend is not None:
            frontend.stop()
        if booking is not None:
            booking.stop()
        hotel.stop()
        gateway.shutdown()
        gateway.server_close()
        identity.shutdown()
        identity.server_close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hotel-jar", type=Path, required=True)
    parser.add_argument("--booking-jar", type=Path, required=True)
    parser.add_argument("--frontend-dir", type=Path, required=True)
    parser.add_argument("--browser-script", type=Path, required=True)
    parser.add_argument("--artifact-dir", type=Path, required=True)
    run(parser.parse_args())


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        message = str(exc).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error title=Browser QA environment failed::{message}", file=sys.stderr)
        raise

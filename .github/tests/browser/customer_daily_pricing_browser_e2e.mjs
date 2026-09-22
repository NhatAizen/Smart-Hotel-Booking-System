import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

const state = JSON.parse(process.env.QA_STATE_JSON ?? "{}");
const artifactDir = process.env.QA_ARTIFACT_DIR ?? ".github/test-artifacts";

async function jsonRequest(url, { method = "GET", token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${method} ${url} returned ${response.status}: ${text}`);
  return payload;
}

async function displayedMoney(locator) {
  const text = await locator.textContent();
  return Number(String(text ?? "").replace(/\D/g, ""));
}

async function waitForMoney(locator, expected) {
  await locator.waitFor({ state: "visible" });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await displayedMoney(locator) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await displayedMoney(locator), expected);
}

async function calendar() {
  return jsonRequest(
    `${state.bookingUrl}/api/hotel-admin/hotels/${state.hotelId}/availability-calendar`
      + `?from=${state.checkIn}&to=${state.calendarTo}`,
    { token: state.adminToken },
  );
}

let browser;
let page;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "vi-VN" });
  await context.addInitScript(({ token }) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("rememberMe", "true");
  }, { token: state.customerToken });
  page = await context.newPage();

  const bookingRequests = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/bookings/batch")) {
      bookingRequests.push(request.postDataJSON());
    }
  });

  const checkoutUrl = `${state.frontendUrl}/customer/checkout`
    + `?hotelId=${state.hotelId}&roomIds=${state.roomId}`
    + `&checkIn=${state.checkIn}&checkOut=${state.checkOut}&adults=1&children=0`;
  await page.goto(checkoutUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Hoàn tất thông tin của bạn" }).waitFor();
  await page.getByText("Phòng đang được giữ riêng cho bạn", { exact: true }).waitFor();

  const grandTotal = page.locator(".checkout-grand-total strong");
  await waitForMoney(grandTotal, 1470);
  console.log("PASS browser quote: actual frontend displays Hotel daily price with membership discount");

  const promotionInput = page.getByLabel("Mã giảm giá của khách sạn");
  await promotionInput.fill(state.promotionCode);
  await page.locator(".checkout-promo-box button.promo-secondary").click();
  await waitForMoney(grandTotal, 1370);
  assert.equal(await promotionInput.inputValue(), state.promotionCode);

  await page.locator('input[name="bookerLastName"]').fill("CI");
  await page.locator('input[name="bookerFirstName"]').fill("Customer");
  await page.locator('input[name="bookerEmail"]').fill("customer@example.test");
  await page.locator('input[name="bookerPhone"]').fill("0900000000");
  await page.locator('input[name="bookerDateOfBirth"]').fill("1990-01-01");
  await page.locator('input[name="ageConfirmed"]').check();
  await page.locator('input[name="termsAccepted"]').check();

  const submit = page.getByRole("button", { name: "Xác nhận đặt phòng" });
  await submit.waitFor({ state: "visible" });
  assert.equal(await submit.isEnabled(), true, "checkout submit should be enabled");

  const beforeChange = await calendar();
  assert.ok(
    beforeChange.holds.some((item) => item.roomId === state.roomId),
    "Calendar must expose the browser-created Redis Hold",
  );

  await jsonRequest(
    `${state.hotelUrl}/api/hotels/${state.hotelId}/daily-price-rules/${state.ruleId}`,
    {
      method: "PUT",
      token: state.adminToken,
      body: {
        roomTypeId: state.roomTypeId,
        startDate: state.checkIn,
        endDate: state.calendarTo,
        nightlyPrice: 800,
      },
    },
  );

  const changedResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/bookings/batch") && response.status() === 409,
  );
  await submit.click();
  const changedResponse = await changedResponsePromise;
  const changedPayload = await changedResponse.json();
  assert.equal(changedPayload.code, "PRICE_CHANGED");
  await page.getByText(
    "Giá phòng đã thay đổi. Vui lòng kiểm tra báo giá mới và xác nhận lại.",
    { exact: true },
  ).waitFor();
  await waitForMoney(grandTotal, 1468);
  assert.equal(await promotionInput.inputValue(), state.promotionCode);

  const afterPriceChanged = await calendar();
  assert.ok(
    afterPriceChanged.holds.some((item) => item.roomId === state.roomId),
    "PRICE_CHANGED must preserve the active Redis Hold",
  );
  assert.ok(
    !afterPriceChanged.bookings.some((item) => item.roomId === state.roomId),
    "PRICE_CHANGED must not persist a booking",
  );
  assert.equal(bookingRequests.length, 1);
  assert.equal(bookingRequests[0].hotelPromotionCode, state.promotionCode);
  assert.equal(Number(bookingRequests[0].expectedGrossAmount), 1500);
  assert.equal(Number(bookingRequests[0].expectedFinalAmount), 1370);
  console.log("PASS browser PRICE_CHANGED: message shown, promotion retained, Hold preserved");

  const createdResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/bookings/batch") && response.status() === 201,
  );
  await submit.click();
  const createdResponse = await createdResponsePromise;
  const created = await createdResponse.json();
  assert.equal(created.length, 1);
  await page.waitForURL(/\/customer\/booking-success\?bookingIds=/);
  await page.getByRole("heading", { name: "Phòng đã được xác nhận" }).waitFor();
  assert.equal(
    await displayedMoney(page.locator(".booking-success-totals > div").first().locator("strong")),
    1468,
  );

  assert.equal(bookingRequests.length, 2);
  assert.equal(bookingRequests[1].hotelPromotionCode, state.promotionCode);
  assert.equal(bookingRequests[1].holdToken, bookingRequests[0].holdToken);
  assert.equal(Number(bookingRequests[1].expectedGrossAmount), 1600);
  assert.equal(Number(bookingRequests[1].expectedFinalAmount), 1468);

  const saved = await jsonRequest(
    `${state.bookingUrl}/api/bookings/${created[0].id}`,
    { token: state.customerToken },
  );
  assert.equal(Number(saved.grossAmount), 1600);
  assert.equal(Number(saved.totalPrice), 1468);
  assert.equal(saved.hotelPromotionCode, state.promotionCode);

  const afterBooking = await calendar();
  assert.ok(
    !afterBooking.holds.some((item) => item.roomId === state.roomId),
    "Calendar must stop exposing the released Hold",
  );
  assert.ok(
    afterBooking.bookings.some(
      (item) => item.roomId === state.roomId && item.status === "CONFIRMED",
    ),
    "Calendar must expose the confirmed booking",
  );
  console.log("PASS browser confirmation: refreshed quote created one correctly priced booking");
} catch (error) {
  await fs.mkdir(artifactDir, { recursive: true });
  if (page) {
    await page.screenshot({
      path: path.join(artifactDir, "customer-daily-pricing-browser-failure.png"),
      fullPage: true,
    }).catch(() => {});
  }
  const message = String(error?.stack ?? error).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.error(`::error title=Customer daily pricing browser E2E failed::${message}`);
  throw error;
} finally {
  await browser?.close();
}

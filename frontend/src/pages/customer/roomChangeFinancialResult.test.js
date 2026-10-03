import test from "node:test";
import assert from "node:assert/strict";
import { roomChangeFinancialResult } from "./roomChangeFinancialResult.js";
const result = (status, due) => roomChangeFinancialResult({ financialReconciliationStatus: status, additionalPaymentDue: due }, x => `${Number(x).toLocaleString("vi-VN")} ₫`);
test("pending null or historical zero never claims no extra payment or confirmed credit", () => {
  for (const due of [null, 0]) {
    const actual = result("PENDING", due);
    assert.match(actual.description, /đang đối soát/);
    assert.doesNotMatch(actual.description, /không phát sinh|Ví|PayOS/i);
    assert.equal(actual.resolved, false);
    assert.equal(actual.dueText, "Chưa xác định");
  }
});
test("confirmed more-expensive change shows authoritative 300k", () => {
  assert.match(result("CONFIRMED", 300000).description, /300\.000 ₫/);
  assert.equal(result("CONFIRMED", 300000).resolved, true);
});
test("no additional wording requires confirmed zero", () => {
  assert.match(result("CONFIRMED", 0).description, /không phát sinh khoản thanh toán thêm/);
  for (const status of ["LEGACY", "NOT_REQUIRED", undefined, "CONFIRMED"]) {
    const actual = result(status, status === "CONFIRMED" ? null : 0);
    assert.doesNotMatch(actual.description, /không phát sinh/);
  }
});
test("unsafe position remains unresolved with manual wording", () => {
  const actual = result("RECONCILIATION_REQUIRED", null);
  assert.match(actual.description, /đối soát trước khi tiếp tục/);
  assert.equal(actual.resolved, false);
  assert.doesNotMatch(actual.description, /không phát sinh|cần thanh toán thêm/i);
});

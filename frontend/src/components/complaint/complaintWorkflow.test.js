import test from "node:test";
import assert from "node:assert/strict";
import { hotelActionsFor, adminActionsFor } from "./complaintWorkflow.js";

test("new complaint belongs to hotel and cannot be rejected by hotel", () => {
  const item = {status: "SUBMITTED", escalatedAt: null};
  assert.deepEqual(adminActionsFor(item), []);
  assert(hotelActionsFor(item).some(([action]) => action === "ESCALATE"));
  assert(!hotelActionsFor(item).some(([action]) => action === "REJECTED"));
});
test("system must issue a decision before it can close a complaint", () => {
  const item = {status: "ESCALATED", escalatedAt: "2026-09-03"};
  assert.deepEqual(hotelActionsFor(item), []);
  assert(!adminActionsFor(item).some(([action]) => action === "RESOLVED"));
  assert(adminActionsFor(item).some(([action]) => action === "REJECTED"));
});
test("only hotel can report execution, then system confirms or requests rework", () => {
  const item = {status: "HOTEL_ACTION_REQUIRED", escalatedAt: "2026-09-03"};
  assert.deepEqual(hotelActionsFor(item).map(([action]) => action), ["COMPLETE_REQUIRED_ACTION"]);
  assert.deepEqual(adminActionsFor(item), []);
  item.status = "AWAITING_SYSTEM_CONFIRMATION";
  assert.deepEqual(hotelActionsFor(item), []);
  assert.deepEqual(adminActionsFor(item).map(([action]) => action), ["RESOLVED", "HOTEL_ACTION_REQUIRED"]);
});
test("closed cases have no further decision actions", () => {
  for (const status of ["RESOLVED", "REJECTED", "CANCELLED"]) {
    assert.deepEqual(hotelActionsFor({status}), []);
    assert.deepEqual(adminActionsFor({status, escalatedAt: "2026-09-03"}), []);
  }
});

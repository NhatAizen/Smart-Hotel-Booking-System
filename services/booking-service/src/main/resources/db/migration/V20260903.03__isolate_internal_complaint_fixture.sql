ALTER TABLE complaints
    ADD COLUMN internal_test BOOLEAN NOT NULL DEFAULT FALSE;

-- Match the fixture created by scripts/qa-complaint-flow.mjs exactly.
-- Keep its evidence, timeline and financial references for audit; never rewrite
-- a test case to make it look like a customer's actual complaint.
UPDATE complaints
SET internal_test = TRUE
WHERE title = '[QA] Xác minh full flow Complaint'
  AND description = 'Case QA dùng booking thật để xác minh quyền, timeline, evidence và liên kết refund hiện hữu.';

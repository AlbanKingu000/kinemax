-- Admin dashboard (task 9 part B): revenue is computed from payments by the time they succeeded
-- and refunds by the time they were refunded, so both timestamps get an index.

-- CreateIndex
CREATE INDEX "DemoPayment_succeededAt_idx" ON "DemoPayment"("succeededAt");

-- CreateIndex
CREATE INDEX "DemoPayment_refundedAt_idx" ON "DemoPayment"("refundedAt");

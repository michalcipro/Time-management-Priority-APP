-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deferredUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_deferredUntil_idx" ON "Notification"("deferredUntil");

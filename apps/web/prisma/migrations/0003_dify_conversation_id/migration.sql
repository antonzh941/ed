-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN "difyConversationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudySession_difyConversationId_key" ON "StudySession"("difyConversationId");

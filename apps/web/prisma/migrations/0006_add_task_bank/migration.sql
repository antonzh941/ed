-- CreateEnum
CREATE TYPE "AnswerType" AS ENUM ('short', 'extended');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('draft', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SessionPhase" AS ENUM ('understanding', 'plan', 'steps', 'check', 'reflect');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "code" "SubjectType" NOT NULL,
    "labelRu" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodifierTopic" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "CodifierTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "subjectCode" "SubjectType" NOT NULL,
    "taskNumber" INTEGER NOT NULL,
    "topicId" TEXT,
    "sourceLabel" VARCHAR(64),
    "conditionMd" TEXT NOT NULL,
    "answerType" "AnswerType" NOT NULL,
    "canonicalAnswer" TEXT,
    "acceptedAnswers" TEXT[],
    "gradingCriteria" JSONB,
    "solutionHint" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolvingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "phase" "SessionPhase" NOT NULL DEFAULT 'understanding',
    "hintLevel" INTEGER NOT NULL DEFAULT 0,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolvingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "answerRaw" TEXT NOT NULL,
    "isCorrect" BOOLEAN,
    "score" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subject_code_key" ON "Subject"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CodifierTopic_subjectId_code_key" ON "CodifierTopic"("subjectId", "code");

-- CreateIndex
CREATE INDEX "CodifierTopic_subjectId_idx" ON "CodifierTopic"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_subjectCode_taskNumber_sourceLabel_key" ON "Task"("subjectCode", "taskNumber", "sourceLabel");

-- CreateIndex
CREATE INDEX "Task_subjectCode_taskNumber_idx" ON "Task"("subjectCode", "taskNumber");

-- CreateIndex
CREATE INDEX "Task_subjectCode_status_idx" ON "Task"("subjectCode", "status");

-- CreateIndex
CREATE INDEX "SolvingSession_userId_status_idx" ON "SolvingSession"("userId", "status");

-- CreateIndex
CREATE INDEX "SolvingSession_taskId_idx" ON "SolvingSession"("taskId");

-- CreateIndex
CREATE INDEX "Attempt_sessionId_idx" ON "Attempt"("sessionId");

-- AddForeignKey
ALTER TABLE "CodifierTopic" ADD CONSTRAINT "CodifierTopic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CodifierTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolvingSession" ADD CONSTRAINT "SolvingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolvingSession" ADD CONSTRAINT "SolvingSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SolvingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

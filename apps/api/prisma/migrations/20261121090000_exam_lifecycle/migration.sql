-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminRole" ADD VALUE 'OBSERVER';
ALTER TYPE "AdminRole" ADD VALUE 'AGENCY';
ALTER TYPE "AdminRole" ADD VALUE 'CENTRE_SUPERINTENDENT';
ALTER TYPE "AdminRole" ADD VALUE 'INTERVIEW_PANEL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaKind" ADD VALUE 'THUMB';
ALTER TYPE "MediaKind" ADD VALUE 'DECLARATION';

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "scope" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "AdmitCard" ADD COLUMN     "shiftId" UUID;

-- AlterTable
ALTER TABLE "CandidateProfile" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "interviewWeight" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "objectionFee" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "stages" TEXT[] DEFAULT ARRAY['TIER1']::TEXT[],
ADD COLUMN     "writtenWeight" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "ExamCentre" ADD COLUMN     "districtName" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "HelpdeskTicket" ADD COLUMN     "callerRef" TEXT,
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'WEB';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "objectionId" UUID,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'APPLICATION';

-- CreateTable
CREATE TABLE "ExamShift" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'TIER1',
    "code" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CBT',

    CONSTRAINT "ExamShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" UUID NOT NULL,
    "admitCardId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "faceCheck" TEXT,
    "markedById" UUID,
    "note" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObserverAssignment" (
    "id" UUID NOT NULL,
    "observerId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "centreId" UUID NOT NULL,
    "shiftId" UUID,
    "coiStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "coiNote" TEXT,
    "coiDeclaredAt" TIMESTAMP(3),
    "autoCoiFlags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObserverAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObserverReport" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "payload" JSONB NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObserverReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricAlert" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "admitCardId" UUID,
    "rollNo" TEXT NOT NULL,
    "centreId" UUID,
    "kind" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedById" UUID,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiometricAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyKey" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "examId" UUID,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencySubmission" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "keyId" UUID,
    "submittedById" UUID,
    "fileName" TEXT,
    "checksum" TEXT NOT NULL,
    "records" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "marksCorrect" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "marksWrong" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "provisionalKey" JSONB,
    "finalKey" JSONB,
    "provisionalPublishedAt" TIMESTAMP(3),
    "objectionDeadline" TIMESTAMP(3),
    "finalPublishedAt" TIMESTAMP(3),
    "dropped" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "changes" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseSheet" (
    "id" UUID NOT NULL,
    "admitCardId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "responses" JSONB NOT NULL,
    "timings" JSONB,
    "omrScanKey" TEXT,
    "carbonCopyKey" TEXT,
    "carbonUploadedAt" TIMESTAMP(3),
    "submissionId" UUID,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalException" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "shiftId" UUID,
    "centreId" UUID,
    "rollNos" TEXT[],
    "kind" TEXT NOT NULL,
    "minutesLost" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "reportedById" UUID,
    "reportedVia" TEXT NOT NULL DEFAULT 'DESK',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "compensationMinutes" INTEGER,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicalException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objection" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "qno" INTEGER NOT NULL,
    "claimedOptions" TEXT[],
    "reasoning" TEXT NOT NULL,
    "fee" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
    "paymentId" UUID,
    "aiReview" JSONB,
    "decisionNote" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Objection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultRun" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "cutoffs" JSONB NOT NULL DEFAULT '{}',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "anomalies" JSONB NOT NULL DEFAULT '[]',
    "computedById" UUID,
    "computedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreCard" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "raw" DOUBLE PRECISION NOT NULL,
    "normalised" DOUBLE PRECISION,
    "percentile" DOUBLE PRECISION,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "unattempted" INTEGER NOT NULL DEFAULT 0,
    "sectionScores" JSONB NOT NULL DEFAULT '{}',
    "rank" INTEGER,
    "categoryRank" INTEGER,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "withheld" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ScoreCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debarment" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "examId" UUID,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "untilDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "proposedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Debarment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageCall" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SHORTLISTED',
    "rollNo" TEXT,
    "shiftId" UUID,
    "centreId" UUID,
    "panelId" UUID,
    "slotAt" TIMESTAMP(3),
    "venue" TEXT,
    "letterReleasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPanel" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "memberIds" TEXT[],
    "date" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelMark" (
    "id" UUID NOT NULL,
    "panelId" UUID NOT NULL,
    "stageCallId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "marks" JSONB NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacancyRow" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "orgCode" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "VacancyRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllotmentPreference" (
    "applicationId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "prefs" TEXT[],
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllotmentPreference_pkey" PRIMARY KEY ("applicationId")
);

-- CreateTable
CREATE TABLE "Allotment" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "orgCode" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "meritRank" INTEGER NOT NULL,
    "prefNo" INTEGER NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PROVISIONAL',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allotment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DvSession" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "aiFindings" JSONB NOT NULL DEFAULT '[]',
    "officerId" UUID,
    "remarks" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DvSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" UUID NOT NULL,
    "candidateId" UUID,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "escalatedTicketId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IvrCall" (
    "id" UUID NOT NULL,
    "callerIdx" TEXT NOT NULL,
    "callerMasked" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "path" TEXT[],
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT,
    "ticketId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "IvrCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamShift_examId_code_key" ON "ExamShift"("examId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_admitCardId_key" ON "Attendance"("admitCardId");

-- CreateIndex
CREATE UNIQUE INDEX "ObserverAssignment_observerId_examId_centreId_key" ON "ObserverAssignment"("observerId", "examId", "centreId");

-- CreateIndex
CREATE UNIQUE INDEX "ObserverReport_clientId_key" ON "ObserverReport"("clientId");

-- CreateIndex
CREATE INDEX "BiometricAlert_examId_status_idx" ON "BiometricAlert"("examId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyKey_prefix_key" ON "AgencyKey"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "AgencySubmission_examId_kind_checksum_key" ON "AgencySubmission"("examId", "kind", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_shiftId_key" ON "ExamPaper"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseSheet_admitCardId_key" ON "ResponseSheet"("admitCardId");

-- CreateIndex
CREATE INDEX "TechnicalException_examId_status_idx" ON "TechnicalException"("examId", "status");

-- CreateIndex
CREATE INDEX "Objection_paperId_qno_idx" ON "Objection"("paperId", "qno");

-- CreateIndex
CREATE UNIQUE INDEX "Objection_applicationId_qno_key" ON "Objection"("applicationId", "qno");

-- CreateIndex
CREATE UNIQUE INDEX "ResultRun_examId_stage_key" ON "ResultRun"("examId", "stage");

-- CreateIndex
CREATE INDEX "ScoreCard_examId_stage_idx" ON "ScoreCard"("examId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreCard_applicationId_stage_key" ON "ScoreCard"("applicationId", "stage");

-- CreateIndex
CREATE INDEX "Debarment_candidateId_status_idx" ON "Debarment"("candidateId", "status");

-- CreateIndex
CREATE INDEX "StageCall_examId_stage_idx" ON "StageCall"("examId", "stage");

-- CreateIndex
CREATE INDEX "StageCall_panelId_idx" ON "StageCall"("panelId");

-- CreateIndex
CREATE UNIQUE INDEX "StageCall_applicationId_stage_key" ON "StageCall"("applicationId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "PanelMark_stageCallId_memberId_key" ON "PanelMark"("stageCallId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "VacancyRow_examId_postId_orgCode_category_key" ON "VacancyRow"("examId", "postId", "orgCode", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Allotment_applicationId_key" ON "Allotment"("applicationId");

-- CreateIndex
CREATE INDEX "Allotment_examId_status_idx" ON "Allotment"("examId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DvSession_applicationId_key" ON "DvSession"("applicationId");

-- CreateIndex
CREATE INDEX "DvSession_examId_date_idx" ON "DvSession"("examId", "date");

-- CreateIndex
CREATE INDEX "IvrCall_callerIdx_idx" ON "IvrCall"("callerIdx");

-- AddForeignKey
ALTER TABLE "AdmitCard" ADD CONSTRAINT "AdmitCard_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "ExamShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamShift" ADD CONSTRAINT "ExamShift_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_admitCardId_fkey" FOREIGN KEY ("admitCardId") REFERENCES "AdmitCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObserverReport" ADD CONSTRAINT "ObserverReport_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ObserverAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseSheet" ADD CONSTRAINT "ResponseSheet_admitCardId_fkey" FOREIGN KEY ("admitCardId") REFERENCES "AdmitCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCard" ADD CONSTRAINT "ScoreCard_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;


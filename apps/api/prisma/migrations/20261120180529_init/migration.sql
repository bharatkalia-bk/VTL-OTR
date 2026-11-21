-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'TRANSGENDER');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('GEN', 'EWS', 'OBC_NCL', 'SC', 'ST');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'EXAM_ADMIN', 'VERIFIER', 'HELPDESK_AGENT', 'AUDITOR');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PAYMENT_PENDING', 'PAID', 'FEE_EXEMPT', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUND_MARKED');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'CLEARED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" UUID NOT NULL,
    "otrId" TEXT,
    "otrSeq" INTEGER,
    "status" "CandidateStatus" NOT NULL DEFAULT 'DRAFT',
    "mobileEnc" TEXT NOT NULL,
    "mobileIdx" TEXT NOT NULL,
    "emailEnc" TEXT NOT NULL,
    "emailIdx" TEXT NOT NULL,
    "mobileVerifiedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "language" TEXT NOT NULL DEFAULT 'en',
    "dedupeKey" TEXT NOT NULL,
    "nameTokens" TEXT[],
    "blockedReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "candidateId" UUID NOT NULL,
    "fullNameEnc" TEXT,
    "fatherNameEnc" TEXT,
    "motherNameEnc" TEXT,
    "dobEnc" TEXT,
    "gender" "Gender",
    "nationality" TEXT,
    "maritalStatus" TEXT,
    "idMark1Enc" TEXT,
    "idMark2Enc" TEXT,
    "category" "Category",
    "pwd" BOOLEAN NOT NULL DEFAULT false,
    "pwdType" TEXT,
    "pwdPercent" INTEGER,
    "exServiceman" BOOLEAN NOT NULL DEFAULT false,
    "serviceYears" INTEGER,
    "domicileStateCode" TEXT,
    "categoryCertDocId" UUID,
    "pwdCertDocId" UUID,
    "exsmCertDocId" UUID,
    "permanentAddressEnc" TEXT,
    "correspondenceAddressEnc" TEXT,
    "sameAddress" BOOLEAN NOT NULL DEFAULT true,
    "stateCode" TEXT,
    "districtId" INTEGER,
    "declarationAt" TIMESTAMP(3),
    "declarationPlace" TEXT,
    "completedSteps" TEXT[],
    "aadhaarMasked" TEXT,
    "aadhaarRefToken" TEXT,
    "aadhaarVerifiedAt" TIMESTAMP(3),
    "apaarIdEnc" TEXT,
    "digilockerLinkedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("candidateId")
);

-- CreateTable
CREATE TABLE "Education" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "level" TEXT NOT NULL,
    "qualificationName" TEXT NOT NULL,
    "boardOrUniversity" TEXT NOT NULL,
    "yearOfPassing" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "resultType" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "maxMarks" DOUBLE PRECISION,
    "cgpaScale" DOUBLE PRECISION,
    "rollNoEnc" TEXT,
    "documentId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "candidateId" UUID,
    "kind" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'UPLOAD',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "livenessPassed" BOOLEAN,
    "livenessMethod" TEXT,
    "scores" JSONB,
    "attemptNo" INTEGER,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "duplicateFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoAttempt" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "scores" JSONB NOT NULL,
    "liveness" JSONB NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateFlag" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "candidateIds" TEXT[],
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "purposeCode" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "currentValueEnc" TEXT,
    "requestedValueEnc" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "documentId" UUID,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" "AdminRole"[],
    "totpSecretEnc" TEXT,
    "totpEnrolledAt" TIMESTAMP(3),
    "recoveryCodes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeEnc" TEXT,
    "afterEnc" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleHi" TEXT NOT NULL,
    "notificationNo" TEXT NOT NULL,
    "conductingBody" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionHi" TEXT NOT NULL DEFAULT '',
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "dates" JSONB NOT NULL,
    "ageCutoffDate" TEXT NOT NULL,
    "maxCentrePreferences" INTEGER NOT NULL DEFAULT 3,
    "customFields" JSONB NOT NULL DEFAULT '[]',
    "rollNoPrefix" TEXT NOT NULL DEFAULT 'VTL',
    "admitCardsReleasedAt" TIMESTAMP(3),
    "resultsPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleHi" TEXT NOT NULL,
    "vacancies" JSONB NOT NULL DEFAULT '{}',
    "eligibility" JSONB NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeRule" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "priority" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "FeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamCentreCity" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "cityName" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,

    CONSTRAINT "ExamCentreCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamCentre" (
    "id" UUID NOT NULL,
    "cityId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reportingTime" TEXT NOT NULL,
    "gateClosingTime" TEXT NOT NULL,

    CONSTRAINT "ExamCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "candidateId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "postIds" TEXT[],
    "centreCityIds" TEXT[],
    "customFieldValues" JSONB NOT NULL DEFAULT '{}',
    "eligibilitySnapshot" JSONB,
    "profileSnapshotEnc" TEXT,
    "photoKey" TEXT,
    "signatureKey" TEXT,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "feeRuleLabel" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "merchantTxnId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayTxnId" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "rawCallback" JSONB,
    "reconciledAt" TIMESTAMP(3),
    "reconciliationNote" TEXT,
    "manualVerifiedById" UUID,
    "refundMarkedAt" TIMESTAMP(3),
    "refundNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmitCard" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "rollNo" TEXT NOT NULL,
    "centreId" UUID,
    "allocationMethod" TEXT NOT NULL DEFAULT 'AUTO',
    "qrToken" TEXT,
    "pdfObjectKey" TEXT,
    "generatedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),

    CONSTRAINT "AdmitCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "rank" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpdeskTicket" (
    "id" UUID NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "candidateId" UUID,
    "contactEnc" TEXT,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpdeskTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT,
    "message" TEXT NOT NULL,
    "attachmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "titleKey" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "dltTemplateId" TEXT,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkCampaign" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BulkCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "targetIdx" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerRef" TEXT,
    "error" TEXT,
    "campaignId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportJob" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "params" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "objectKey" TEXT,
    "rowCount" INTEGER,
    "error" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameHi" TEXT NOT NULL,
    "isUT" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "State_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "District" (
    "id" SERIAL NOT NULL,
    "stateCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "stateCode" TEXT,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "University" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "stateCode" TEXT,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_otrId_key" ON "Candidate"("otrId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_mobileIdx_key" ON "Candidate"("mobileIdx");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_emailIdx_key" ON "Candidate"("emailIdx");

-- CreateIndex
CREATE INDEX "Candidate_dedupeKey_idx" ON "Candidate"("dedupeKey");

-- CreateIndex
CREATE INDEX "Candidate_status_createdAt_idx" ON "Candidate"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Candidate_nameTokens_idx" ON "Candidate" USING GIN ("nameTokens");

-- CreateIndex
CREATE INDEX "CandidateProfile_stateCode_idx" ON "CandidateProfile"("stateCode");

-- CreateIndex
CREATE INDEX "CandidateProfile_category_idx" ON "CandidateProfile"("category");

-- CreateIndex
CREATE INDEX "Education_candidateId_idx" ON "Education"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_objectKey_key" ON "Document"("objectKey");

-- CreateIndex
CREATE INDEX "Document_candidateId_kind_idx" ON "Document"("candidateId", "kind");

-- CreateIndex
CREATE INDEX "Document_verificationStatus_createdAt_idx" ON "Document"("verificationStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");

-- CreateIndex
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "MediaAsset_candidateId_kind_isCurrent_idx" ON "MediaAsset"("candidateId", "kind", "isCurrent");

-- CreateIndex
CREATE INDEX "PhotoAttempt_candidateId_idx" ON "PhotoAttempt"("candidateId");

-- CreateIndex
CREATE INDEX "DuplicateFlag_status_createdAt_idx" ON "DuplicateFlag"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateFlag_type_key_key" ON "DuplicateFlag"("type", "key");

-- CreateIndex
CREATE INDEX "Consent_candidateId_idx" ON "Consent"("candidateId");

-- CreateIndex
CREATE INDEX "CorrectionRequest_status_createdAt_idx" ON "CorrectionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CorrectionRequest_candidateId_idx" ON "CorrectionRequest"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_subjectType_subjectId_idx" ON "RefreshToken"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_at_idx" ON "AuditLog"("entity", "entityId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_at_idx" ON "AuditLog"("actorType", "actorId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_code_key" ON "Exam"("code");

-- CreateIndex
CREATE INDEX "Exam_status_idx" ON "Exam"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Post_examId_code_key" ON "Post"("examId", "code");

-- CreateIndex
CREATE INDEX "FeeRule_examId_idx" ON "FeeRule"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamCentreCity_examId_cityName_key" ON "ExamCentreCity"("examId", "cityName");

-- CreateIndex
CREATE UNIQUE INDEX "ExamCentre_cityId_code_key" ON "ExamCentre"("cityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Application_applicationNo_key" ON "Application"("applicationNo");

-- CreateIndex
CREATE INDEX "Application_examId_status_idx" ON "Application"("examId", "status");

-- CreateIndex
CREATE INDEX "Application_status_submittedAt_idx" ON "Application"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_examId_key" ON "Application"("candidateId", "examId");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_at_idx" ON "ApplicationEvent"("applicationId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_merchantTxnId_key" ON "Payment"("merchantTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayTxnId_key" ON "Payment"("gatewayTxnId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_applicationId_idx" ON "Payment"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_idempotencyKey_key" ON "PaymentEvent"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdmitCard_applicationId_key" ON "AdmitCard"("applicationId");

-- CreateIndex
CREATE INDEX "AdmitCard_centreId_idx" ON "AdmitCard"("centreId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmitCard_examId_rollNo_key" ON "AdmitCard"("examId", "rollNo");

-- CreateIndex
CREATE UNIQUE INDEX "Result_applicationId_key" ON "Result"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskTicket_ticketNo_key" ON "HelpdeskTicket"("ticketNo");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_status_createdAt_idx" ON "HelpdeskTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_candidateId_idx" ON "HelpdeskTicket"("candidateId");

-- CreateIndex
CREATE INDEX "Notification_candidateId_createdAt_idx" ON "Notification"("candidateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_code_channel_language_key" ON "MessageTemplate"("code", "channel", "language");

-- CreateIndex
CREATE INDEX "OutboundMessage_campaignId_idx" ON "OutboundMessage"("campaignId");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_createdAt_idx" ON "OutboundMessage"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "District_stateCode_name_key" ON "District"("stateCode", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Board_name_key" ON "Board"("name");

-- CreateIndex
CREATE UNIQUE INDEX "University_name_key" ON "University"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_level_name_key" ON "Qualification"("level", "name");

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoAttempt" ADD CONSTRAINT "PhotoAttempt_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamCentreCity" ADD CONSTRAINT "ExamCentreCity_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamCentre" ADD CONSTRAINT "ExamCentre_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "ExamCentreCity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmitCard" ADD CONSTRAINT "AdmitCard_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmitCard" ADD CONSTRAINT "AdmitCard_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "ExamCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HelpdeskTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_stateCode_fkey" FOREIGN KEY ("stateCode") REFERENCES "State"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit log is append-only: block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Sequences for human-facing identifiers.
CREATE SEQUENCE IF NOT EXISTS otr_seq START 1;
CREATE SEQUENCE IF NOT EXISTS application_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1;

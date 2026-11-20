export const CATEGORIES = ['GEN', 'EWS', 'OBC_NCL', 'SC', 'ST'] as const;
export type Category = (typeof CATEGORIES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'TRANSGENDER'] as const;
export type Gender = (typeof GENDERS)[number];

export const MARITAL_STATUSES = ['UNMARRIED', 'MARRIED', 'WIDOWED', 'DIVORCED', 'SEPARATED'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

/** Benchmark disabilities (RPwD Act 2016), grouped as most recruitment notices do. */
export const PWD_TYPES = ['VH', 'HH', 'OH', 'ID_MI', 'MD'] as const;
export type PwdType = (typeof PWD_TYPES)[number];

export const EDUCATION_LEVELS = ['CLASS_10', 'CLASS_12', 'DIPLOMA', 'GRADUATION', 'PG', 'OTHER'] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];
/** Rank used to compare "minimum qualification". OTHER is not ranked. */
export const EDUCATION_RANK: Record<EducationLevel, number> = {
  CLASS_10: 1, CLASS_12: 2, DIPLOMA: 2, GRADUATION: 3, PG: 4, OTHER: 0,
};

export const RESULT_TYPES = ['PERCENT', 'CGPA'] as const;
export type ResultType = (typeof RESULT_TYPES)[number];
export const EDUCATION_STATUSES = ['PASSED', 'APPEARING'] as const;
export type EducationStatus = (typeof EDUCATION_STATUSES)[number];

export const DOCUMENT_KINDS = [
  'CATEGORY_CERT', 'EWS_CERT', 'PWD_CERT', 'EXSM_CERT', 'DOMICILE_CERT',
  'EDU_CLASS_10', 'EDU_CLASS_12', 'EDU_DIPLOMA', 'EDU_GRADUATION', 'EDU_PG', 'EDU_OTHER',
  'CORRECTION_PROOF', 'HELPDESK_ATTACHMENT',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const CANDIDATE_STATUSES = ['DRAFT', 'SUBMITTED', 'BLOCKED'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const ADMIN_ROLES = ['SUPER_ADMIN', 'EXAM_ADMIN', 'VERIFIER', 'HELPDESK_AGENT', 'AUDITOR'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const EXAM_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const APPLICATION_STATUSES = [
  'DRAFT', 'SUBMITTED', 'PAYMENT_PENDING', 'PAID', 'FEE_EXEMPT', 'REJECTED', 'WITHDRAWN',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const PAYMENT_STATUSES = ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUND_MARKED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CORRECTION_FIELDS = [
  'FULL_NAME', 'FATHER_NAME', 'MOTHER_NAME', 'DOB', 'GENDER', 'CATEGORY', 'PHOTO', 'SIGNATURE', 'MOBILE',
] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

export const TICKET_CATEGORIES = [
  'REGISTRATION', 'OTP', 'PHOTO_SIGNATURE', 'PAYMENT', 'APPLICATION', 'ADMIT_CARD', 'DATA_PRIVACY', 'OTHER',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const OTP_PURPOSES = ['REGISTER', 'LOGIN', 'FORGOT_PASSWORD', 'FORGOT_OTR', 'CONTACT_CHANGE'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const LIVENESS_METHODS = ['BLINK', 'HEAD_TURN'] as const;
export type LivenessMethod = (typeof LIVENESS_METHODS)[number];

/** Wizard steps in order. */
export const WIZARD_STEPS = ['personal', 'category', 'address', 'education', 'photo', 'declaration'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

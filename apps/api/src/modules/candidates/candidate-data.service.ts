import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Candidate, CandidateProfile, Document, Education, MediaAsset } from '@prisma/client';
import type { AddressInput, EligibilityProfile, WizardStep } from '@vtl/shared';
import { WIZARD_STEPS } from '@vtl/shared';
import { PrismaService } from '../../infra/prisma.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { FieldCrypto } from '../../security/field-crypto';

export interface CandidateView {
  id: string;
  otrId: string | null;
  status: string;
  mobile: string;
  email: string;
  language: string;
  submittedAt: Date | null;
  createdAt: Date;
  blockedReason: string | null;
  personal: {
    fullName: string | null; fatherName: string | null; motherName: string | null; dob: string | null; gender: string | null;
    nationality: string | null; maritalStatus: string | null; identificationMark1: string | null; identificationMark2: string | null;
  };
  category: {
    category: string | null; pwd: boolean; pwdType: string | null; pwdPercent: number | null; exServiceman: boolean; serviceYears: number | null;
    domicileStateCode: string | null; categoryCertDocId: string | null; pwdCertDocId: string | null; exsmCertDocId: string | null;
  };
  address: AddressInput | null;
  education: Array<{
    id: string; level: string; qualificationName: string; boardOrUniversity: string; yearOfPassing: number; status: string; resultType: string;
    marks: number; maxMarks: number | null; cgpaScale: number | null; rollNo: string | null; documentId: string | null;
  }>;
  documents: Array<{ id: string; kind: string; fileName: string; sizeBytes: number; mime: string; verificationStatus: string; rejectionReason: string | null; createdAt: Date }>;
  photo: MediaSummary | null;
  signature: MediaSummary | null;
  identity: { aadhaarMasked: string | null; aadhaarVerifiedAt: Date | null; apaarId: string | null; digilockerLinkedAt: Date | null };
  declaration: { at: Date | null; place: string | null };
  completedSteps: WizardStep[];
  completion: number;
}
export interface MediaSummary { id: string; objectKey: string; sha256: string; width: number; height: number; sizeBytes: number; method: string; capturedAt: Date | null; createdAt: Date; livenessMethod: string | null; scores: unknown; attemptNo: number | null; duplicateFlag: boolean }

type Full = Candidate & { profile: CandidateProfile | null; education: Education[]; documents: Document[]; media: MediaAsset[] };

@Injectable()
export class CandidateDataService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: FieldCrypto, @Inject(STORAGE) private readonly storage: StorageAdapter) {}

  async load(candidateId: string): Promise<Full> {
    const c = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { profile: true, education: { orderBy: { sortOrder: 'asc' } }, documents: { orderBy: { createdAt: 'desc' } }, media: { where: { isCurrent: true } } },
    });
    if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Candidate not found.' });
    return c;
  }

  async view(candidateId: string): Promise<CandidateView> {
    return this.toView(await this.load(candidateId));
  }

  toView(c: Full): CandidateView {
    const p = c.profile;
    const d = (v: string | null | undefined) => this.crypto.decOpt(v);
    const perm = this.crypto.decJson<AddressInput['permanent']>(p?.permanentAddressEnc);
    const corr = this.crypto.decJson<AddressInput['permanent']>(p?.correspondenceAddressEnc);
    const media = (k: 'PHOTO' | 'SIGNATURE'): MediaSummary | null => {
      const m = c.media.find((x) => x.kind === k && x.isCurrent);
      return m ? { id: m.id, objectKey: m.objectKey, sha256: m.sha256, width: m.width, height: m.height, sizeBytes: m.sizeBytes, method: m.method, capturedAt: m.capturedAt, createdAt: m.createdAt, livenessMethod: m.livenessMethod, scores: m.scores, attemptNo: m.attemptNo, duplicateFlag: m.duplicateFlag } : null;
    };
    const completed = (p?.completedSteps ?? []).filter((s): s is WizardStep => (WIZARD_STEPS as readonly string[]).includes(s));
    return {
      id: c.id, otrId: c.otrId, status: c.status, mobile: this.crypto.decrypt(c.mobileEnc), email: this.crypto.decrypt(c.emailEnc), language: c.language,
      submittedAt: c.submittedAt, createdAt: c.createdAt, blockedReason: c.blockedReason,
      personal: {
        fullName: d(p?.fullNameEnc), fatherName: d(p?.fatherNameEnc), motherName: d(p?.motherNameEnc), dob: d(p?.dobEnc), gender: p?.gender ?? null,
        nationality: p?.nationality ?? null, maritalStatus: p?.maritalStatus ?? null, identificationMark1: d(p?.idMark1Enc), identificationMark2: d(p?.idMark2Enc),
      },
      category: {
        category: p?.category ?? null, pwd: p?.pwd ?? false, pwdType: p?.pwdType ?? null, pwdPercent: p?.pwdPercent ?? null, exServiceman: p?.exServiceman ?? false,
        serviceYears: p?.serviceYears ?? null, domicileStateCode: p?.domicileStateCode ?? null, categoryCertDocId: p?.categoryCertDocId ?? null,
        pwdCertDocId: p?.pwdCertDocId ?? null, exsmCertDocId: p?.exsmCertDocId ?? null,
      },
      address: perm ? { permanent: perm, correspondenceSameAsPermanent: p?.sameAddress ?? true, correspondence: corr ?? undefined } : null,
      education: c.education.map((e) => ({ id: e.id, level: e.level, qualificationName: e.qualificationName, boardOrUniversity: e.boardOrUniversity, yearOfPassing: e.yearOfPassing, status: e.status, resultType: e.resultType, marks: e.marks, maxMarks: e.maxMarks, cgpaScale: e.cgpaScale, rollNo: d(e.rollNoEnc), documentId: e.documentId })),
      documents: c.documents.map((x) => ({ id: x.id, kind: x.kind, fileName: x.fileName, sizeBytes: x.sizeBytes, mime: x.mime, verificationStatus: x.verificationStatus, rejectionReason: x.rejectionReason, createdAt: x.createdAt })),
      photo: media('PHOTO'),
      signature: media('SIGNATURE'),
      identity: { aadhaarMasked: p?.aadhaarMasked ?? null, aadhaarVerifiedAt: p?.aadhaarVerifiedAt ?? null, apaarId: d(p?.apaarIdEnc), digilockerLinkedAt: p?.digilockerLinkedAt ?? null },
      declaration: { at: p?.declarationAt ?? null, place: p?.declarationPlace ?? null },
      completedSteps: completed,
      completion: Math.round((completed.length / WIZARD_STEPS.length) * 100),
    };
  }

  /** Public JSON for the candidate (no storage keys). */
  async publicView(candidateId: string): Promise<Record<string, unknown>> {
    const v = await this.view(candidateId);
    const [photoUrl, sigUrl] = await Promise.all([
      v.photo ? this.storage.signedUrl(v.photo.objectKey, 600) : Promise.resolve(null),
      v.signature ? this.storage.signedUrl(v.signature.objectKey, 600) : Promise.resolve(null),
    ]);
    return {
      ...v,
      photo: v.photo ? { id: v.photo.id, width: v.photo.width, height: v.photo.height, sizeBytes: v.photo.sizeBytes, capturedAt: v.photo.capturedAt, url: photoUrl } : null,
      signature: v.signature ? { id: v.signature.id, width: v.signature.width, height: v.signature.height, sizeBytes: v.signature.sizeBytes, method: v.signature.method, url: sigUrl } : null,
    };
  }

  eligibilityProfile(v: CandidateView): EligibilityProfile | null {
    if (!v.personal.dob || !v.personal.gender || !v.category.category) return null;
    return {
      dob: v.personal.dob,
      gender: v.personal.gender as EligibilityProfile['gender'],
      category: v.category.category as EligibilityProfile['category'],
      pwd: v.category.pwd,
      exServiceman: v.category.exServiceman,
      serviceYears: v.category.serviceYears ?? undefined,
      domicileStateCode: v.category.domicileStateCode,
      nationality: v.personal.nationality ?? 'INDIAN',
      education: v.education.map((e) => ({ level: e.level as EligibilityProfile['education'][number]['level'], status: e.status as 'PASSED' | 'APPEARING', resultType: e.resultType as 'PERCENT' | 'CGPA', marks: e.marks, maxMarks: e.maxMarks, cgpaScale: e.cgpaScale })),
    };
  }
}

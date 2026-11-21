import { Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type { AddressLine } from '@vtl/shared';
import QRCode from 'qrcode';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma.service';
import { QueueService } from '../../infra/queue.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { FieldCrypto } from '../../security/field-crypto';
import { CandidateDataService, type CandidateView } from '../candidates/candidate-data.service';
import { NotifyService } from '../notify/notify.service';
import { PdfService } from './pdf.service';
import { QrSignerService } from './qr-signer.service';

const IST = (d: Date | string | null | undefined, withTime = true) =>
  d ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', ...(withTime && { hour: '2-digit', minute: '2-digit' }) }).format(new Date(d)) : '';
const dmy = (iso: string | null) => (iso ? iso.split('-').reverse().join('-') : '');
const fmtAddr = (a: AddressLine | undefined | null, states: Map<string, string>, districts: Map<number, string>) =>
  a ? [a.line1, a.line2, a.city, districts.get(a.districtId), states.get(a.stateCode), a.pin].filter(Boolean).join(', ') : '';

/** Directions link for the exam centre: coordinates when known, otherwise the address. */
export const mapsUrl = (c: { name: string; address: string; lat: number | null; lng: number | null; city?: { cityName: string } }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.lat !== null && c.lng !== null ? `${c.lat},${c.lng}` : `${c.name}, ${c.address}, ${c.city?.cityName ?? ''}`)}`;

/** Builds data for each PDF, renders, caches in object storage. */
@Injectable()
export class PdfDocsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly data: CandidateDataService,
    private readonly crypto: FieldCrypto,
    private readonly qr: QrSignerService,
    private readonly queue: QueueService,
    private readonly notify: NotifyService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queue.register('pdf', 'otr-slip', async (d) => {
      const key = await this.otrSlip(String(d.candidateId), true);
      if (d.notify) {
        const v = await this.data.view(String(d.candidateId));
        await this.notify.send({ templateCode: 'OTR_GENERATED', lang: v.language as 'en' | 'hi', mobile: v.mobile, email: v.email, params: { name: v.personal.fullName ?? '', otrId: v.otrId ?? '' }, attachmentKeys: [{ key, filename: `OTR-Slip-${v.otrId}.pdf` }] });
      }
      return key;
    });
    this.queue.register('pdf', 'admit-card', async (d) => this.admitCard(String(d.admitCardId), true));
  }

  private async geo() {
    const [states, districts] = await Promise.all([this.prisma.state.findMany(), this.prisma.district.findMany({ select: { id: true, name: true } })]);
    return { states: new Map(states.map((s) => [s.code, s.nameEn])), districts: new Map(districts.map((d) => [d.id, d.name])) };
  }

  private async dataUrl(key: string | null | undefined): Promise<string> {
    if (!key) return '';
    return `data:image/jpeg;base64,${(await this.storage.get(key)).toString('base64')}`;
  }

  private common(v: CandidateView) {
    return {
      p: { ...v.personal, dob: dmy(v.personal.dob) },
      c: v.category,
      generatedAt: IST(new Date()),
    };
  }

  async otrSlip(candidateId: string, force = false): Promise<string> {
    const key = `candidates/${candidateId}/pdf/otr-slip.pdf`;
    if (!force) {
      try { await this.storage.get(key); return key; } catch { /* render */ }
    }
    const v = await this.data.view(candidateId);
    if (!v.otrId) throw new NotFoundException({ code: 'NOT_SUBMITTED', message: 'OTR not submitted yet.' });
    const g = await this.geo();
    const buf = await this.pdf.render('otr-slip', {
      ...this.common(v),
      ref: v.otrId,
      otrId: v.otrId,
      submittedAt: IST(v.submittedAt),
      domicile: g.states.get(v.category.domicileStateCode ?? '') ?? '',
      mobile: v.mobile, email: v.email,
      aadhaar: v.identity.aadhaarMasked,
      photo: await this.dataUrl(v.photo?.objectKey), signature: await this.dataUrl(v.signature?.objectKey), photoCapturedAt: IST(v.photo?.capturedAt),
      addrPermanent: fmtAddr(v.address?.permanent, g.states, g.districts),
      addrCorrespondence: v.address?.correspondenceSameAsPermanent ? 'Same as permanent address' : fmtAddr(v.address?.correspondence, g.states, g.districts),
      education: v.education.map((e) => ({ ...e, result: e.status === 'APPEARING' ? 'Appearing' : e.resultType === 'CGPA' ? `${e.marks} / ${e.cgpaScale ?? 10} CGPA` : e.maxMarks ? `${e.marks} / ${e.maxMarks}` : `${e.marks}%` })),
      declarationPlace: v.declaration.place, declarationAt: IST(v.declaration.at, false),
    });
    await this.storage.put(key, buf, 'application/pdf');
    return key;
  }

  async applicationForm(applicationId: string): Promise<Buffer> {
    const app = await this.prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { exam: { include: { posts: true, centreCities: true } } } });
    const snap = this.crypto.decJson<CandidateView>(app.profileSnapshotEnc) ?? (await this.data.view(app.candidateId));
    const g = await this.geo();
    const custom = (app.exam.customFields as Array<{ key: string; labelEn: string }>).map((f) => ({ label: f.labelEn, value: String((app.customFieldValues as Record<string, unknown>)[f.key] ?? '') }));
    const elig = (app.eligibilitySnapshot as { results?: Array<{ postCode: string; criteria: Array<{ code: string; passed: boolean; reasonKey: string; params?: Record<string, unknown> }> }> } | null)?.results ?? [];
    return this.pdf.render('application-form', {
      ...this.common(snap), ref: app.applicationNo,
      applicationNo: app.applicationNo, otrId: snap.otrId, status: app.status.replace('_', ' '), statusTone: ['PAID', 'FEE_EXEMPT'].includes(app.status) ? 'ok' : app.status === 'REJECTED' ? 'bad' : 'pending',
      exam: { title: app.exam.titleEn, notificationNo: app.exam.notificationNo, body: app.exam.conductingBody },
      posts: app.postIds.map((id) => app.exam.posts.find((p) => p.id === id)?.titleEn ?? id),
      cities: app.centreCityIds.map((id) => app.exam.centreCities.find((c) => c.id === id)?.cityName ?? id),
      fee: app.feeAmount, feeRule: app.feeRuleLabel ?? '', submittedAt: IST(app.submittedAt),
      photo: await this.dataUrl(app.photoKey), signature: await this.dataUrl(app.signatureKey),
      addrPermanent: fmtAddr(snap.address?.permanent, g.states, g.districts),
      custom,
      eligibility: elig.flatMap((r) => r.criteria.map((c) => ({ code: `${r.postCode} · ${c.code}`, passed: c.passed, detail: Object.entries(c.params ?? {}).map(([k, val]) => `${k}: ${val}`).join(', ') }))),
    });
  }

  async receipt(paymentId: string): Promise<Buffer> {
    const pay = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { application: { include: { exam: true } } } });
    const v = await this.data.view(pay.application.candidateId);
    return this.pdf.render('receipt', {
      generatedAt: IST(new Date()), ref: pay.merchantTxnId,
      amount: pay.amount, status: pay.status, tone: pay.status === 'SUCCESS' ? 'ok' : pay.status === 'FAILED' ? 'bad' : 'pending',
      merchantTxnId: pay.merchantTxnId, gatewayTxnId: pay.gatewayTxnId ?? '-', gateway: pay.gateway.toUpperCase(), paidAt: IST(pay.updatedAt),
      exam: pay.application.exam.titleEn, applicationNo: pay.application.applicationNo, otrId: v.otrId, name: v.personal.fullName,
    });
  }

  async admitCard(admitCardId: string, force = false): Promise<string> {
    const ac = await this.prisma.admitCard.findUniqueOrThrow({ where: { id: admitCardId }, include: { shift: true, centre: { include: { city: true } }, application: { include: { exam: { include: { posts: true } } } } } });
    if (ac.pdfObjectKey && !force) return ac.pdfObjectKey;
    const app = ac.application;
    const snap = this.crypto.decJson<CandidateView>(app.profileSnapshotEnc) ?? (await this.data.view(app.candidateId));
    const photo = await this.prisma.mediaAsset.findFirst({ where: { objectKey: app.photoKey ?? '' } });
    const token = ac.qrToken ?? (await this.qr.sign({ e: app.exam.code, r: ac.rollNo, o: snap.otrId ?? '', a: app.applicationNo, p: (photo?.sha256 ?? '').slice(0, 16) }));
    const qrUrl = `${this.env.CANDIDATE_WEB_URL}/verify/${token}`;
    const qr = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', margin: 1, width: 300, color: { dark: '#07102D', light: '#FFFFFF' } });
    const dates = app.exam.dates as { examDate?: string };
    const buf = await this.pdf.render('admit-card', {
      ...this.common(snap), ref: ac.rollNo, rollNo: ac.rollNo, otrId: snap.otrId, applicationNo: app.applicationNo,
      exam: { title: app.exam.titleEn }, post: app.exam.posts.find((p) => p.id === app.postIds[0])?.titleEn ?? '',
      centre: ac.centre ? { name: ac.centre.name, code: ac.centre.code, address: ac.centre.address, city: ac.centre.city.cityName, reportingTime: ac.centre.reportingTime, gateClosingTime: ac.centre.gateClosingTime } : {},
      examDate: dmy(ac.shift?.date ?? dates.examDate ?? null),
      shift: ac.shift ? { code: ac.shift.code, time: `${ac.shift.startTime} to ${ac.shift.endTime}`, mode: ac.shift.mode === 'OMR' ? 'Pen and paper (OMR)' : 'Computer based test' } : null,
      mapQr: ac.centre ? await QRCode.toDataURL(mapsUrl(ac.centre), { errorCorrectionLevel: 'M', margin: 1, width: 200, color: { dark: '#07102D', light: '#FFFFFF' } }) : null,
      mapUrl: ac.centre ? mapsUrl(ac.centre) : null,
      photo: await this.dataUrl(app.photoKey), signature: await this.dataUrl(app.signatureKey), qr,
    });
    const key = `exams/${app.examId}/admit-cards/${ac.rollNo}.pdf`;
    await this.storage.put(key, buf, 'application/pdf');
    await this.prisma.admitCard.update({ where: { id: ac.id }, data: { pdfObjectKey: key, qrToken: token, generatedAt: new Date() } });
    return key;
  }
}

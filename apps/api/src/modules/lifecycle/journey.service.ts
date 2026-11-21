import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { notFound } from './common';

export interface JourneyEvent { at: Date; stage: string; title: string; detail?: string; tone?: 'success' | 'warning' | 'danger' | 'info' }

/** End-to-end trace of one candidate: registration to appointment, across every module. */
@Injectable()
export class JourneyService {
  constructor(private readonly prisma: PrismaService) {}

  async trace(term: string) {
    const t = term.trim();
    const c = await this.prisma.candidate.findFirst({ where: /^[0-9a-f-]{36}$/i.test(t) ? { id: t } : { otrId: t.toUpperCase() }, include: {
      profile: { select: { completedSteps: true, declarationAt: true, aadhaarVerifiedAt: true, digilockerLinkedAt: true } },
      documents: { select: { kind: true, createdAt: true, verificationStatus: true, verifiedAt: true } },
      media: { select: { kind: true, createdAt: true, method: true, livenessPassed: true, isCurrent: true } },
      corrections: { select: { field: true, status: true, createdAt: true, decidedAt: true } },
      tickets: { select: { ticketNo: true, channel: true, subject: true, status: true, createdAt: true } },
      applications: { include: { exam: { select: { code: true } }, events: true, payments: { select: { merchantTxnId: true, purpose: true, amount: true, status: true, createdAt: true, updatedAt: true } }, admitCard: { include: { attendance: true, responseSheet: { select: { source: true, receivedAt: true, carbonUploadedAt: true } }, shift: true } }, scoreCards: true } },
    } });
    if (!c) notFound('Candidate');
    const ev: JourneyEvent[] = [];
    ev.push({ at: c.createdAt, stage: 'Registration', title: 'Account created', tone: 'info' });
    if (c.mobileVerifiedAt) ev.push({ at: c.mobileVerifiedAt, stage: 'Registration', title: 'Mobile verified by OTP', tone: 'success' });
    if (c.emailVerifiedAt) ev.push({ at: c.emailVerifiedAt, stage: 'Registration', title: 'Email verified by OTP', tone: 'success' });
    if (c.profile?.aadhaarVerifiedAt) ev.push({ at: c.profile.aadhaarVerifiedAt, stage: 'Profile', title: 'Aadhaar e-KYC verified', tone: 'success' });
    if (c.profile?.digilockerLinkedAt) ev.push({ at: c.profile.digilockerLinkedAt, stage: 'Profile', title: 'DigiLocker linked', tone: 'info' });
    for (const m of c.media) ev.push({ at: m.createdAt, stage: 'Profile', title: `${m.kind.toLowerCase()} ${m.method === 'LIVE' ? 'captured live' : m.method.toLowerCase()}`, detail: m.kind === 'PHOTO' ? `Liveness ${m.livenessPassed ? 'passed' : 'not recorded'}${m.isCurrent ? '' : ' (superseded)'}` : undefined, tone: 'info' });
    for (const d of c.documents) {
      ev.push({ at: d.createdAt, stage: 'Documents', title: `${d.kind.replace(/_/g, ' ')} uploaded`, tone: 'info' });
      if (d.verifiedAt) ev.push({ at: d.verifiedAt, stage: 'Documents', title: `${d.kind.replace(/_/g, ' ')} ${d.verificationStatus.toLowerCase()}`, tone: d.verificationStatus === 'APPROVED' ? 'success' : 'danger' });
    }
    if (c.submittedAt) ev.push({ at: c.submittedAt, stage: 'OTR', title: `OTR submitted: ${c.otrId}`, tone: 'success' });
    for (const k of c.corrections) {
      ev.push({ at: k.createdAt, stage: 'Corrections', title: `Correction requested: ${k.field}`, tone: 'warning' });
      if (k.decidedAt) ev.push({ at: k.decidedAt, stage: 'Corrections', title: `Correction ${k.status.toLowerCase()}: ${k.field}`, tone: k.status === 'APPROVED' ? 'success' : 'danger' });
    }
    for (const a of c.applications) {
      const x = a.exam.code;
      for (const e of a.events) ev.push({ at: e.at, stage: `Application ${x}`, title: e.status.replace(/_/g, ' ').toLowerCase(), detail: e.note ?? undefined, tone: /FAIL|REJECT/.test(e.status) ? 'danger' : 'info' });
      for (const p of a.payments) ev.push({ at: p.updatedAt, stage: `Payment ${x}`, title: `${p.purpose === 'OBJECTION' ? 'Objection fee' : 'Fee'} ₹${p.amount}: ${p.status.toLowerCase()}`, detail: p.merchantTxnId, tone: p.status === 'SUCCESS' ? 'success' : p.status === 'FAILED' ? 'danger' : 'warning' });
      const ac = a.admitCard;
      if (ac?.generatedAt) ev.push({ at: ac.generatedAt, stage: `Exam ${x}`, title: `Admit card generated: roll ${ac.rollNo}`, detail: ac.shift ? `Shift ${ac.shift.code} ${ac.shift.date}` : undefined, tone: 'info' });
      if (ac?.releasedAt) ev.push({ at: ac.releasedAt, stage: `Exam ${x}`, title: 'Admit card released', tone: 'info' });
      if (ac?.downloadedAt) ev.push({ at: ac.downloadedAt, stage: `Exam ${x}`, title: 'Admit card downloaded', tone: 'success' });
      if (ac?.attendance) ev.push({ at: ac.attendance.markedAt, stage: `Exam ${x}`, title: `Attendance: ${ac.attendance.status.toLowerCase()}`, detail: `${ac.attendance.method}${ac.attendance.faceCheck ? `, face ${ac.attendance.faceCheck.toLowerCase()}` : ''}`, tone: ac.attendance.status === 'PRESENT' ? 'success' : 'danger' });
      if (ac?.responseSheet) ev.push({ at: ac.responseSheet.receivedAt, stage: `Exam ${x}`, title: `${ac.responseSheet.source} response sheet received`, tone: 'info' });
      if (ac?.responseSheet?.carbonUploadedAt) ev.push({ at: ac.responseSheet.carbonUploadedAt, stage: `Exam ${x}`, title: 'OMR carbon copy uploaded by candidate', tone: 'info' });
      for (const s of a.scoreCards) if (s.publishedAt) ev.push({ at: s.publishedAt, stage: `Result ${x}`, title: `${s.stage} result: ${s.withheld ? 'withheld' : s.qualified ? 'qualified' : 'not qualified'}`, detail: `Score ${s.normalised ?? s.raw}${s.rank ? `, rank ${s.rank}` : ''}`, tone: s.withheld ? 'warning' : s.qualified ? 'success' : 'danger' });
    }
    const appIds = c.applications.map((a) => a.id);
    const [objections, calls, allotments, dv, debarments, alerts, chats] = await Promise.all([
      this.prisma.objection.findMany({ where: { candidateId: c.id } }),
      this.prisma.stageCall.findMany({ where: { applicationId: { in: appIds } } }),
      this.prisma.allotment.findMany({ where: { applicationId: { in: appIds } } }),
      this.prisma.dvSession.findMany({ where: { applicationId: { in: appIds } } }),
      this.prisma.debarment.findMany({ where: { candidateId: c.id } }),
      this.prisma.biometricAlert.findMany({ where: { admitCardId: { in: c.applications.flatMap((a) => (a.admitCard ? [a.admitCard.id] : [])) } } }),
      this.prisma.chatSession.findMany({ where: { candidateId: c.id }, select: { createdAt: true, escalatedTicketId: true } }),
    ]);
    for (const o of objections) {
      ev.push({ at: o.createdAt, stage: 'Answer key', title: `Objection on Q${o.qno} (claims ${o.claimedOptions.join('+')})`, tone: 'info' });
      if (o.decidedAt) ev.push({ at: o.decidedAt, stage: 'Answer key', title: `Objection Q${o.qno} ${o.status.toLowerCase()}`, detail: o.decisionNote ?? undefined, tone: o.status === 'ACCEPTED' ? 'success' : 'danger' });
    }
    for (const a of alerts) ev.push({ at: a.createdAt, stage: 'Exam integrity', title: `Biometric alert: ${a.kind.replace(/_/g, ' ').toLowerCase()}`, detail: `Status ${a.status}`, tone: a.status === 'CONFIRMED' ? 'danger' : 'warning' });
    for (const s of calls) ev.push({ at: s.letterReleasedAt ?? s.createdAt, stage: 'Selection', title: `${s.stage} ${s.letterReleasedAt ? 'call letter issued' : 'shortlisted'}`, detail: s.status, tone: 'info' });
    for (const a of allotments) ev.push({ at: a.respondedAt ?? a.createdAt, stage: 'Allotment', title: `Allotted ${a.orgName} (preference ${a.prefNo}, ${a.category} seat)`, detail: a.status, tone: ['ACCEPTED', 'DV_CLEARED', 'APPOINTED'].includes(a.status) ? 'success' : a.status === 'PROVISIONAL' ? 'warning' : 'danger' });
    for (const d of dv) ev.push({ at: d.completedAt ?? d.createdAt, stage: 'Document verification', title: `DV ${d.status.toLowerCase()} (${d.date} ${d.slot})`, detail: d.remarks ?? undefined, tone: d.status === 'VERIFIED' ? 'success' : d.status === 'SCHEDULED' ? 'info' : 'danger' });
    for (const d of debarments) ev.push({ at: d.approvedAt ?? d.createdAt, stage: 'Debarment', title: `Debarment ${d.status.toLowerCase()}`, detail: d.reason, tone: d.status === 'ACTIVE' ? 'danger' : 'warning' });
    for (const t of c.tickets) ev.push({ at: t.createdAt, stage: 'Helpdesk', title: `Ticket ${t.ticketNo} via ${t.channel.toLowerCase()}: ${t.subject}`, detail: t.status, tone: 'info' });
    for (const s of chats) ev.push({ at: s.createdAt, stage: 'Helpdesk', title: `Chat assistant used${s.escalatedTicketId ? ' (escalated)' : ''}`, tone: 'info' });
    ev.sort((a, b) => a.at.getTime() - b.at.getTime());
    return { candidate: { id: c.id, otrId: c.otrId, status: c.status, createdAt: c.createdAt }, events: ev };
  }
}

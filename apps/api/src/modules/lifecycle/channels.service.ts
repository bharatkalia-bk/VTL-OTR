import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { chatMessageSchema, ivrStepSchema, maskMobile, phoneTicketSchema } from '@vtl/shared';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RateLimitService } from '../../infra/rate-limit.service';
import { FieldCrypto } from '../../security/field-crypto';
import { AiService } from './ai.service';
import { KB, searchKb } from './kb';

interface ChatMsg { role: 'user' | 'assistant'; content: string; at: string; sources?: string[] }
const ESCALATE = /\b(human|agent|person|officer|complain|complaint|ticket)\b|बात करनी|शिकायत/i;

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly ai: AiService, private readonly crypto: FieldCrypto, private readonly rl: RateLimitService) {}

  private async ticketNo() {
    return `TKT${new Date().getFullYear()}${String(await this.prisma.nextSeq('ticket_seq')).padStart(7, '0')}`;
  }

  // ── Chatbot ──
  async chat(candidateId: string | null, ip: string, body: unknown) {
    const x = parseOrThrow(chatMessageSchema, body);
    await this.rl.hit('chat', candidateId ?? ip, 30, 600);
    const s = x.sessionId ? await this.prisma.chatSession.findFirst({ where: { id: x.sessionId, candidateId } }) : null;
    const session = s ?? (await this.prisma.chatSession.create({ data: { candidateId, lang: x.lang } }));
    const history = (session.messages as unknown as ChatMsg[]) ?? [];
    if (history.length >= 40) throw new AppError('CHAT_LIMIT', 'This conversation is long. Start a new chat or raise a ticket.');

    const hits = searchKb(x.message, x.lang);
    let reply: string;
    let sources = hits.slice(0, 2).map((h) => h.entry.id);
    let provider: string = 'rules';
    const wantsHuman = ESCALATE.test(x.message);
    if (wantsHuman) {
      reply = x.lang === 'hi' ? 'मैं आपकी बातचीत हेल्पडेस्क टीम को भेज सकता हूँ। "टिकट बनाएँ" दबाएँ, एक अधिकारी जवाब देगा।' : 'I can pass this conversation to the helpdesk team. Tap "Create ticket" and an officer will reply.';
    } else {
      const context = candidateId ? await this.candidateContext(candidateId) : 'The user is not logged in.';
      const ai = await this.ai.complete(
        `You are the VTL OTR helpdesk assistant for a government recruitment registration portal run by Vensysco Technologies Limited. Answer in ${x.lang === 'hi' ? 'Hindi' : 'English'}, in at most 90 words, using only the knowledge base and candidate context below. If the answer is not there, say you are not sure and suggest raising a ticket. Never ask for passwords, OTPs or Aadhaar numbers. Plain text.\n\nKnowledge base:\n${KB.map((k) => `- ${k.q.en}: ${k.a.en}`).join('\n')}`,
        [...history.slice(-8).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: `Candidate context: ${context}\n\nQuestion: ${x.message}` }],
        { maxTokens: 600 },
      );
      if (ai?.text) { reply = ai.text; provider = ai.provider; }
      else if (hits[0]) reply = hits[0].entry.a[x.lang];
      else { reply = x.lang === 'hi' ? 'माफ़ कीजिए, मुझे इसका उत्तर नहीं पता। आप टिकट बना सकते हैं, हेल्पडेस्क टीम जवाब देगी।' : "Sorry, I'm not sure about that. You can create a ticket and the helpdesk team will reply."; sources = []; }
    }
    const now = new Date().toISOString();
    const messages = [...history, { role: 'user', content: x.message, at: now }, { role: 'assistant', content: reply, at: now, sources }] as ChatMsg[];
    await this.prisma.chatSession.update({ where: { id: session.id }, data: { messages: messages as unknown as Prisma.InputJsonValue } });
    return { sessionId: session.id, reply, provider, sources: sources.map((id) => { const e = KB.find((k) => k.id === id)!; return { id, title: e.q[x.lang], link: e.link ?? null }; }), suggestEscalation: wantsHuman || !hits.length, escalatedTicketId: session.escalatedTicketId };
  }

  private async candidateContext(candidateId: string): Promise<string> {
    const c = await this.prisma.candidate.findUnique({ where: { id: candidateId }, include: { applications: { include: { exam: { select: { code: true } }, admitCard: { select: { releasedAt: true } }, result: { select: { status: true } } }, take: 5, orderBy: { createdAt: 'desc' } } } });
    if (!c) return 'Unknown candidate.';
    const apps = c.applications.map((a) => `${a.exam.code}: ${a.status}${a.admitCard?.releasedAt ? ', admit card released' : ''}${a.result ? `, result ${a.result.status}` : ''}`).join('; ');
    return `OTR status ${c.status}${c.otrId ? ` (OTR ID issued)` : ''}. Applications: ${apps || 'none'}.`;
  }

  async escalate(candidateId: string | null, sessionId: string, contact?: { name?: string; mobile?: string; email?: string }) {
    const s = await this.prisma.chatSession.findFirst({ where: { id: sessionId, candidateId } });
    if (!s) throw new AppError('NOT_FOUND', 'Chat not found.', 404);
    if (s.escalatedTicketId) return { ticketId: s.escalatedTicketId };
    if (!candidateId && !contact?.mobile) throw new AppError('CONTACT_REQUIRED', 'Give a mobile number so the helpdesk can reach you.');
    const msgs = (s.messages as unknown as ChatMsg[]) ?? [];
    const transcript = msgs.map((m) => `${m.role === 'user' ? 'Candidate' : 'Assistant'}: ${m.content}`).join('\n');
    const t = await this.prisma.helpdeskTicket.create({ data: {
      ticketNo: await this.ticketNo(), candidateId, channel: 'CHAT', category: 'OTHER', subject: (msgs.find((m) => m.role === 'user')?.content ?? 'Chat escalation').slice(0, 140),
      contactEnc: contact ? this.crypto.encJson(contact) : null, messages: { create: { authorType: 'CANDIDATE', authorId: candidateId, message: `Escalated from chat assistant.\n\n${transcript}`.slice(0, 5000) } },
    } });
    await this.prisma.chatSession.update({ where: { id: s.id }, data: { escalatedTicketId: t.id } });
    return { ticketId: t.id, ticketNo: t.ticketNo };
  }

  // ── IVR (voice menu; the telephony provider calls this per keypress) ──
  private menu(lang: 'en' | 'hi') {
    return lang === 'hi'
      ? 'वीटीएल ओटीआर हेल्पलाइन में आपका स्वागत है। पंजीकरण स्थिति के लिए 1, आवेदन और भुगतान के लिए 2, प्रवेश पत्र के लिए 3, परिणाम के लिए 4, कॉलबैक के लिए 9 दबाएँ। अंग्रेज़ी के लिए 8 दबाएँ।'
      : 'Welcome to the VTL OTR helpline. For registration status press 1. For application and payment status press 2. For admit card press 3. For results press 4. To request a call back press 9. For Hindi press 8.';
  }

  async ivr(body: unknown) {
    const x = parseOrThrow(ivrStepSchema, body);
    const idx = this.crypto.blindIndex('mobile', x.from);
    let call = x.callId ? await this.prisma.ivrCall.findFirst({ where: { id: x.callId, callerIdx: idx, endedAt: null } }) : null;
    if (!call) call = await this.prisma.ivrCall.create({ data: { callerIdx: idx, callerMasked: maskMobile(x.from), lang: x.lang } });
    let lang = call.lang as 'en' | 'hi';
    const d = x.digits.slice(-1);
    const cand = await this.prisma.candidate.findUnique({ where: { mobileIdx: idx }, include: { applications: { include: { exam: { select: { code: true, titleEn: true } }, admitCard: { include: { centre: { include: { city: true } }, shift: true } }, result: true }, orderBy: { createdAt: 'desc' }, take: 3 } } });
    const hi = () => lang === 'hi';
    let say: string;
    let end = false;
    let outcome: string | null = null;
    let ticketId: string | null = null;
    if (!d || d === '0') say = this.menu(lang);
    else if (d === '8') { lang = lang === 'en' ? 'hi' : 'en'; say = this.menu(lang); }
    else if (!cand && ['1', '2', '3', '4'].includes(d)) say = hi() ? 'यह मोबाइल नंबर पंजीकृत नहीं है। पंजीकरण के लिए वेबसाइट देखें। मुख्य मेनू के लिए 0 दबाएँ।' : 'This mobile number is not registered. Please visit the website to register. Press 0 for the main menu.';
    else if (d === '1') { say = cand!.otrId ? (hi() ? `आपका ओटीआर पंजीकरण पूरा है। ओटीआर आईडी के अंतिम चार अंक ${cand!.otrId.slice(-4)} हैं।` : `Your OTR registration is complete. Your OTR ID ends with ${cand!.otrId.slice(-4).split('').join(' ')}.`) : (hi() ? 'आपकी प्रोफ़ाइल अभी अधूरी है। कृपया वेबसाइट पर पूरी करें।' : 'Your profile is not yet submitted. Please complete it on the website.'); outcome = 'STATUS_GIVEN'; }
    else if (d === '2') { const a = cand!.applications[0]; say = a ? (hi() ? `${a.exam.code} के लिए आपके आवेदन की स्थिति ${a.status} है।` : `Your application for ${a.exam.code} is ${a.status.replace(/_/g, ' ').toLowerCase()}.`) : (hi() ? 'आपका कोई आवेदन नहीं है।' : 'You have no applications.'); outcome = 'STATUS_GIVEN'; }
    else if (d === '3') { const a = cand!.applications.find((x2) => x2.admitCard?.releasedAt); say = a?.admitCard ? (hi() ? `आपका प्रवेश पत्र जारी है। केंद्र ${a.admitCard.centre?.city.cityName ?? ''}, पाली ${a.admitCard.shift?.code ?? ''}।` : `Your admit card for ${a.exam.code} is released. Centre city ${a.admitCard.centre?.city.cityName ?? 'to be announced'}${a.admitCard.shift ? `, shift ${a.admitCard.shift.code} on ${a.admitCard.shift.date}` : ''}. Download it from the website.`) : (hi() ? 'अभी कोई प्रवेश पत्र जारी नहीं हुआ है।' : 'No admit card has been released yet.'); outcome = 'STATUS_GIVEN'; }
    else if (d === '4') { const a = cand!.applications.find((x2) => x2.result); say = a?.result ? (hi() ? `${a.exam.code} का परिणाम: ${a.result.status}।` : `Result for ${a.exam.code}: ${a.result.status.replace(/_/g, ' ').toLowerCase()}. See the website for your score card.`) : (hi() ? 'अभी कोई परिणाम घोषित नहीं हुआ है।' : 'No result has been declared yet.'); outcome = 'STATUS_GIVEN'; }
    else if (d === '9') {
      const t = await this.prisma.helpdeskTicket.create({ data: { ticketNo: await this.ticketNo(), candidateId: cand?.id ?? null, channel: 'IVR', callerRef: call.callerMasked, category: 'OTHER', subject: 'Call back requested from IVR', contactEnc: this.crypto.encJson({ name: 'IVR caller', mobile: x.from, email: '' }), messages: { create: { authorType: 'CANDIDATE', authorId: cand?.id ?? null, message: `Caller ${call.callerMasked} asked for a call back. Menu path: ${[...call.path, d].join(' > ')}` } } } });
      ticketId = t.id;
      say = hi() ? `आपका अनुरोध दर्ज हो गया है। टिकट संख्या ${t.ticketNo.slice(-4)}। हमारी टीम 48 घंटे में कॉल करेगी। धन्यवाद।` : `Your request is registered. Ticket number ending ${t.ticketNo.slice(-4).split('').join(' ')}. Our team will call you within 48 hours. Thank you.`;
      end = true; outcome = 'CALLBACK_TICKET';
    } else say = hi() ? 'अमान्य विकल्प। ' + this.menu(lang) : 'Invalid option. ' + this.menu(lang);
    const transcript = [...((call.transcript as Array<{ d: string; say: string }>) ?? []), { d: d || '', say, at: new Date().toISOString() }];
    await this.prisma.ivrCall.update({ where: { id: call.id }, data: { lang, path: d ? { push: d } : undefined, transcript: transcript as Prisma.InputJsonValue, outcome: outcome ?? call.outcome, ticketId: ticketId ?? call.ticketId, ...(end && { endedAt: new Date() }) } });
    return { callId: call.id, lang, say, end, options: end ? [] : ['1', '2', '3', '4', '9', '8', '0'] };
  }

  async ivrCalls() {
    return this.prisma.ivrCall.findMany({ orderBy: { startedAt: 'desc' }, take: 100, select: { id: true, callerMasked: true, lang: true, path: true, outcome: true, ticketId: true, startedAt: true, endedAt: true, transcript: true } });
  }

  // ── Phone calls logged by agents ──
  async phoneTicket(agentId: string, body: unknown) {
    const x = parseOrThrow(phoneTicketSchema, body);
    const cand = x.otrId ? await this.prisma.candidate.findUnique({ where: { otrId: x.otrId.trim().toUpperCase() } }) : await this.prisma.candidate.findUnique({ where: { mobileIdx: this.crypto.blindIndex('mobile', x.mobile) } });
    const t = await this.prisma.helpdeskTicket.create({ data: {
      ticketNo: await this.ticketNo(), candidateId: cand?.id ?? null, channel: 'PHONE', callerRef: maskMobile(x.mobile), category: x.category, subject: x.subject,
      status: x.resolved ? 'RESOLVED' : 'IN_PROGRESS', assignedToId: agentId, contactEnc: this.crypto.encJson({ name: x.callerName, mobile: x.mobile, email: '' }),
      messages: { create: { authorType: 'ADMIN', authorId: agentId, message: `Phone call notes:\n${x.notes}` } },
    } });
    await this.audit.log({ action: 'PHONE_TICKET_LOGGED', entity: 'HelpdeskTicket', entityId: t.id, actorType: 'ADMIN', actorId: agentId, after: { category: x.category, resolved: x.resolved, linkedCandidate: !!cand } });
    return { ...t, linkedCandidate: !!cand };
  }
}

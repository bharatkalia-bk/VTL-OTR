/* eslint-disable no-console */
import { PrismaClient, type Prisma } from '@prisma/client';
import { DEFAULT_FEE_RULES, formatOtrId, normaliseName, type EligibilityRuleInput } from '@vtl/shared';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { authenticator } from 'otplib';
import { loadEnv } from '../../src/config/env';
import { createStorage } from '../../src/infra/storage';
import { buildSimplePdf } from '../../src/modules/pdf/simple-pdf';
import { FieldCrypto } from '../../src/security/field-crypto';
import { hashPassword } from '../../src/security/password';
import { BOARDS, FAQS, QUALIFICATIONS, STATES, UNIVERSITIES } from './masters';

const env = loadEnv();
const prisma = new PrismaClient();
const crypto = new FieldCrypto(env.PII_ENC_KEY, env.PII_INDEX_KEY);
const storage = createStorage(env);

/** Dev-only TOTP secret for seeded admins (documented in README). Never use in production. */
export const DEV_TOTP_SECRET = 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD';
export const DEV_ADMIN_PASSWORD = 'Admin@12345';
export const DEV_CANDIDATE_PASSWORD = 'Candidate@123';

let rngState = 20261120;
const rnd = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const blind = (p: string, v: string) => crypto.blindIndex(p, v);

const FIRST_M = ['RAVI', 'AMIT', 'SURESH', 'RAHUL', 'VIKAS', 'ANKIT', 'DEEPAK', 'MANOJ', 'SANJAY', 'ARJUN', 'KARAN', 'ROHIT', 'NITIN', 'PANKAJ', 'IMRAN', 'GURPREET', 'ABHISHEK', 'SAURABH'];
const FIRST_F = ['PRIYA', 'ANJALI', 'NEHA', 'POOJA', 'SUNITA', 'KAVITA', 'RITU', 'SNEHA', 'AARTI', 'DIVYA', 'MEENA', 'SHABANA', 'HARPREET', 'LAKSHMI', 'SWATI'];
const LAST = ['KUMAR', 'SHARMA', 'VERMA', 'SINGH', 'YADAV', 'GUPTA', 'MISHRA', 'PATEL', 'KHAN', 'REDDY', 'DAS', 'NAIR', 'JOSHI', 'CHAUHAN', 'PANDEY', 'MEENA'];
const FATHER = ['RAMESH', 'MAHESH', 'DINESH', 'RAJENDRA', 'SURENDRA', 'ASHOK', 'VINOD', 'MUKESH', 'ANIL', 'SUNIL'];
const MOTHER = ['SAVITRI', 'KAMLA', 'GEETA', 'USHA', 'SHANTI', 'REKHA', 'ASHA', 'MAYA'];

async function makePhoto(name: string, seed: number): Promise<Buffer> {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="350" height="450">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},25%,92%)"/><stop offset="1" stop-color="hsl(${hue},20%,80%)"/></linearGradient></defs>
    <rect width="350" height="450" fill="url(#g)"/>
    <ellipse cx="175" cy="175" rx="78" ry="98" fill="hsl(${(hue + 20) % 360},35%,${55 + (seed % 15)}%)"/>
    <path d="M40 450 Q175 250 310 450 Z" fill="hsl(${(hue + 180) % 360},30%,35%)"/>
    <ellipse cx="148" cy="165" rx="10" ry="6" fill="#222"/><ellipse cx="202" cy="165" rx="10" ry="6" fill="#222"/>
    <path d="M150 220 Q175 238 200 220" stroke="#5a2a2a" stroke-width="5" fill="none"/>
    <rect y="400" width="350" height="50" fill="#fff"/>
    <text x="175" y="422" font-family="Arial" font-size="17" font-weight="700" text-anchor="middle" fill="#000">${name.slice(0, 28)}</text>
    <text x="175" y="442" font-family="Arial" font-size="14" text-anchor="middle" fill="#000">15/11/2026</text></svg>`;
  const base = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  // add sensor-like noise so size lands in 20-50 KB
  const px = base.data;
  for (let i = 0; i < px.length; i++) px[i] = Math.max(0, Math.min(255, px[i]! + Math.round((rnd() - 0.5) * 22)));
  for (const q of [80, 70, 60, 50, 40, 30]) {
    const out = await sharp(px, { raw: base.info }).jpeg({ quality: q, chromaSubsampling: '4:2:0' }).toBuffer();
    if (out.length <= 50 * 1024 && out.length >= 20 * 1024) return out;
    if (out.length < 20 * 1024) return sharp(px, { raw: base.info }).jpeg({ quality: Math.min(95, q + 15) }).toBuffer();
  }
  return sharp(px, { raw: base.info }).jpeg({ quality: 25 }).toBuffer();
}

async function makeSignature(name: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60"><rect width="140" height="60" fill="#fff"/>
    <text x="70" y="38" font-family="cursive, serif" font-style="italic" font-size="22" text-anchor="middle" fill="#0a0a2a">${name.split(' ')[0]!.toLowerCase()}</text>
    <path d="M15 46 Q70 52 125 44" stroke="#0a0a2a" stroke-width="1.5" fill="none"/></svg>`;
  const base = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  const px = base.data;
  for (const amp of [40, 60, 80, 110]) {
    const copy = Buffer.from(px);
    for (let i = 0; i < copy.length; i++) copy[i] = Math.max(0, Math.min(255, copy[i]! + Math.round((rnd() - 0.5) * amp)));
    const out = await sharp(copy, { raw: base.info }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
    if (out.length >= 10 * 1024 && out.length <= 20 * 1024) return out;
  }
  return sharp(px, { raw: base.info }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
}

const age = (min: number, max: number) => {
  const y = 2026 - (min + Math.floor(rnd() * (max - min + 1)));
  return `${y}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
};

async function reset() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  for (const s of ['otr_seq', 'application_seq', 'ticket_seq']) await prisma.$executeRawUnsafe(`ALTER SEQUENCE ${s} RESTART WITH 1`);
}

async function seedMasters() {
  for (const s of STATES) {
    await prisma.state.create({ data: { code: s.code, nameEn: s.nameEn, nameHi: s.nameHi, isUT: !!s.isUT, districts: { create: s.districts.map((name) => ({ name })) } } });
  }
  await prisma.board.createMany({ data: BOARDS.map((name) => ({ name })) });
  await prisma.university.createMany({ data: UNIVERSITIES.map((name) => ({ name })) });
  await prisma.qualification.createMany({ data: QUALIFICATIONS.map(([level, name]) => ({ level, name })) });
  await prisma.systemSetting.create({ data: { key: 'faqs', value: FAQS } });
}

async function seedAdmins() {
  const pw = await hashPassword(DEV_ADMIN_PASSWORD);
  const totp = crypto.encrypt(DEV_TOTP_SECRET);
  const users: Array<[string, string, Prisma.AdminUserCreateInput['roles']]> = [
    ['Super Admin', 'superadmin@vtl-otr.local', ['SUPER_ADMIN']],
    ['Exam Admin', 'examadmin@vtl-otr.local', ['EXAM_ADMIN']],
    ['Verifier', 'verifier@vtl-otr.local', ['VERIFIER']],
    ['Helpdesk Agent', 'helpdesk@vtl-otr.local', ['HELPDESK_AGENT']],
    ['Auditor', 'auditor@vtl-otr.local', ['AUDITOR']],
  ];
  const created = [];
  for (const [name, email, roles] of users) {
    created.push(await prisma.adminUser.create({ data: { name, email, roles, passwordHash: pw, totpSecretEnc: totp, totpEnrolledAt: new Date(), recoveryCodes: [] } }));
  }
  // One admin without TOTP to demonstrate mandatory enrolment on first login.
  await prisma.adminUser.create({ data: { name: 'New Verifier', email: 'newverifier@vtl-otr.local', roles: ['VERIFIER'], passwordHash: pw } });
  return created;
}

const commonAge = { categoryRelaxation: { OBC_NCL: 3, SC: 5, ST: 5 }, pwdRelaxation: 10, exServicemanExtra: 3 };
const CITIES: Array<[string, string]> = [['Delhi', 'DL'], ['Lucknow', 'UP'], ['Patna', 'BR'], ['Jaipur', 'RJ'], ['Bhopal', 'MP']];

async function seedExams() {
  const centreTimes = { reportingTime: '08:30', gateClosingTime: '09:30' };
  const mkCities = (examCode: string, cities: Array<[string, string]>, capacity: number) =>
    cities.map(([cityName, stateCode], i) => ({
      cityName, stateCode,
      centres: { create: [1, 2].map((n) => ({ code: `${stateCode}${i + 1}${n}`, name: `${cityName} Exam Centre ${n} (${examCode})`, address: `Plot ${10 * n + i}, Institutional Area, ${cityName}`, capacity, ...centreTimes })) },
    }));

  const cgl = await prisma.exam.create({
    data: {
      code: 'VTL-CGL-2026', titleEn: 'Combined Graduate Level Examination 2026', titleHi: 'संयुक्त स्नातक स्तरीय परीक्षा 2026', notificationNo: 'VTL/CGL/2026/01', conductingBody: 'Staff Selection Board (demo)',
      descriptionEn: 'Recruitment to Group B and C posts in various ministries and departments.', descriptionHi: 'विभिन्न मंत्रालयों और विभागों में समूह ख और ग पदों पर भर्ती।',
      status: 'PUBLISHED', ageCutoffDate: '2027-01-01', rollNoPrefix: 'CGL', maxCentrePreferences: 3,
      dates: { notification: '2026-11-01', applyStart: '2026-11-01', applyEnd: '2027-01-31', feeLastDate: '2027-02-02', admitCardRelease: '2027-03-15', examDate: '2027-04-10' },
      customFields: [{ key: 'preferredLanguage', labelEn: 'Medium of question paper', labelHi: 'प्रश्न पत्र का माध्यम', type: 'select', required: true, options: [{ value: 'EN', labelEn: 'English', labelHi: 'अंग्रेज़ी' }, { value: 'HI', labelEn: 'Hindi', labelHi: 'हिंदी' }] }],
      posts: { create: [
        { code: 'ASO', titleEn: 'Assistant Section Officer', titleHi: 'सहायक अनुभाग अधिकारी', vacancies: { GEN: 120, OBC_NCL: 80, SC: 45, ST: 22, EWS: 30 }, eligibility: { age: { min: 20, max: 30, ...commonAge }, qualification: { minLevel: 'GRADUATION', allowAppearing: false } } satisfies EligibilityRuleInput },
        { code: 'TA', titleEn: 'Tax Assistant', titleHi: 'कर सहायक', vacancies: { GEN: 200, OBC_NCL: 130, SC: 75, ST: 37, EWS: 50 }, eligibility: { age: { min: 18, max: 27, ...commonAge }, qualification: { minLevel: 'GRADUATION', allowAppearing: true } } satisfies EligibilityRuleInput },
        { code: 'AUD', titleEn: 'Auditor', titleHi: 'लेखा परीक्षक', vacancies: { GEN: 60, OBC_NCL: 40, SC: 22, ST: 11, EWS: 15 }, eligibility: { age: { min: 18, max: 27, ...commonAge }, qualification: { minLevel: 'GRADUATION', minPercent: 50, minPercentReserved: 45, allowAppearing: false } } satisfies EligibilityRuleInput },
      ] },
      feeRules: { create: DEFAULT_FEE_RULES.map((r) => ({ priority: r.priority, label: r.label, amount: r.amount, conditions: r.conditions })) },
      centreCities: { create: mkCities('CGL', CITIES, 500) },
    },
  });

  const chsl = await prisma.exam.create({
    data: {
      code: 'VTL-CHSL-2026', titleEn: 'Combined Higher Secondary Level Examination 2026', titleHi: 'संयुक्त उच्चतर माध्यमिक स्तरीय परीक्षा 2026', notificationNo: 'VTL/CHSL/2026/02', conductingBody: 'Staff Selection Board (demo)',
      descriptionEn: 'Lower Division Clerk, Junior Secretariat Assistant and Data Entry Operator posts.', descriptionHi: 'अवर श्रेणी लिपिक, कनिष्ठ सचिवालय सहायक एवं डाटा एंट्री ऑपरेटर पद।',
      status: 'CLOSED', ageCutoffDate: '2026-08-01', rollNoPrefix: 'CHS', maxCentrePreferences: 3,
      dates: { notification: '2026-06-01', applyStart: '2026-06-01', applyEnd: '2026-07-15', feeLastDate: '2026-07-17', admitCardRelease: '2026-11-10', examDate: '2026-12-14' },
      posts: { create: [
        { code: 'LDC', titleEn: 'Lower Division Clerk / JSA', titleHi: 'अवर श्रेणी लिपिक / कनिष्ठ सचिवालय सहायक', vacancies: { GEN: 300 }, eligibility: { age: { min: 18, max: 27, ...commonAge }, qualification: { minLevel: 'CLASS_12', allowAppearing: false } } satisfies EligibilityRuleInput },
        { code: 'DEO', titleEn: 'Data Entry Operator', titleHi: 'डाटा एंट्री ऑपरेटर', vacancies: { GEN: 100 }, eligibility: { age: { min: 18, max: 27, ...commonAge }, qualification: { minLevel: 'CLASS_12', minPercent: 50, allowAppearing: false } } satisfies EligibilityRuleInput },
      ] },
      feeRules: { create: DEFAULT_FEE_RULES.map((r) => ({ priority: r.priority, label: r.label, amount: r.amount, conditions: r.conditions })) },
      centreCities: { create: mkCities('CHS', CITIES.slice(0, 3), 6) },
    },
  });

  const upw = await prisma.exam.create({
    data: {
      code: 'UP-WPC-2026', titleEn: 'Women Police Constable Recruitment 2026 (Uttar Pradesh)', titleHi: 'महिला पुलिस आरक्षी भर्ती 2026 (उत्तर प्रदेश)', notificationNo: 'UPPRB/WPC/2026/07', conductingBody: 'State Police Recruitment Board (demo)',
      descriptionEn: 'Direct recruitment of women constables. Open to women domiciled in Uttar Pradesh.', descriptionHi: 'महिला आरक्षियों की सीधी भर्ती। उत्तर प्रदेश की अधिवासी महिलाओं के लिए।',
      status: 'PUBLISHED', ageCutoffDate: '2027-01-01', rollNoPrefix: 'UPW', maxCentrePreferences: 2,
      dates: { notification: '2026-11-10', applyStart: '2026-11-10', applyEnd: '2027-01-10', feeLastDate: '2027-01-12', examDate: '2027-03-01' },
      customFields: [
        { key: 'heightCm', labelEn: 'Height (cm)', labelHi: 'ऊँचाई (सेमी)', type: 'number', required: true },
        { key: 'nccCertificate', labelEn: 'Holds NCC “B” certificate', labelHi: 'एनसीसी “बी” प्रमाणपत्र धारक', type: 'boolean', required: false },
      ],
      posts: { create: [
        { code: 'WPC', titleEn: 'Woman Police Constable', titleHi: 'महिला पुलिस आरक्षी', vacancies: { GEN: 900, OBC_NCL: 600, SC: 450, ST: 50, EWS: 200 }, eligibility: { age: { min: 18, max: 22, categoryRelaxation: { OBC_NCL: 5, SC: 5, ST: 5 }, pwdRelaxation: 0, exServicemanExtra: 3, domicileRelaxation: 0 }, qualification: { minLevel: 'CLASS_12', allowAppearing: false }, domicile: { stateCodes: ['UP'], mode: 'REQUIRED' }, genders: ['FEMALE'] } satisfies EligibilityRuleInput },
      ] },
      feeRules: { create: [
        { priority: 10, label: 'SC/ST', amount: 200, conditions: { categories: ['SC', 'ST'] } },
        { priority: 100, label: 'General/OBC/EWS', amount: 400, conditions: {} },
      ] },
      centreCities: { create: mkCities('UPW', [['Lucknow', 'UP'], ['Prayagraj', 'UP'], ['Agra', 'UP']], 400) },
    },
  });
  return { cgl, chsl, upw };
}

async function main() {
  console.log('Seeding VTL OTR…');
  await storage.ensureReady();
  await reset();
  await seedMasters();
  const admins = await seedAdmins();
  const verifier = admins[2]!;
  const exams = await seedExams();
  const districts = await prisma.district.findMany();
  const chslFull = await prisma.exam.findUniqueOrThrow({ where: { id: exams.chsl.id }, include: { posts: true, centreCities: true } });
  const cglFull = await prisma.exam.findUniqueOrThrow({ where: { id: exams.cgl.id }, include: { posts: true, centreCities: true } });
  const pw = await hashPassword(DEV_CANDIDATE_PASSWORD);
  let dupPhoto: Buffer | null = null;

  for (let i = 1; i <= 50; i++) {
    const female = i % 3 === 0;
    const first = pick(female ? FIRST_F : FIRST_M);
    const last = pick(LAST);
    const fullName = `${first} ${last}`;
    const fatherName = `${pick(FATHER)} ${last}`;
    const motherName = `${pick(MOTHER)} DEVI`;
    const mobile = String(9000000000 + i * 7919).slice(0, 10);
    const email = `candidate${String(i).padStart(2, '0')}@example.in`;
    const dob = i % 10 === 0 ? age(29, 33) : age(19, 26);
    const category = (['GEN', 'OBC_NCL', 'SC', 'ST', 'EWS', 'GEN', 'OBC_NCL'] as const)[i % 7]!;
    const stateCode = i % 4 === 0 ? 'UP' : pick(['DL', 'BR', 'RJ', 'MP', 'UP', 'HR']);
    const district = districts.find((d) => d.stateCode === stateCode)!;
    // State mix: 1-35 submitted, 36-45 draft at various steps, 46-48 blocked (submitted), 49-50 duplicate photo
    const status: 'SUBMITTED' | 'DRAFT' | 'BLOCKED' = i <= 35 || i >= 49 ? 'SUBMITTED' : i <= 45 ? 'DRAFT' : 'BLOCKED';
    const draftSteps = ['personal', 'category', 'address', 'education', 'photo'].slice(0, Math.max(0, i - 36));
    const steps = status === 'DRAFT' ? draftSteps : ['personal', 'category', 'address', 'education', 'photo', 'declaration'];
    const cand = await prisma.candidate.create({
      data: {
        mobileEnc: crypto.encrypt(mobile), mobileIdx: blind('mobile', mobile), emailEnc: crypto.encrypt(email), emailIdx: blind('email', email),
        mobileVerifiedAt: new Date(), emailVerifiedAt: new Date(), passwordHash: pw, language: i % 5 === 0 ? 'hi' : 'en',
        dedupeKey: blind('identity', `${normaliseName(fullName)}|${dob}|${normaliseName(fatherName)}`),
        nameTokens: normaliseName(fullName).split(' ').map((t) => blind('name', t)),
        status, blockedReason: status === 'BLOCKED' ? 'Suspected impersonation (seed data)' : null,
        createdAt: new Date(Date.now() - (50 - i) * 6 * 3600 * 1000),
        consents: { create: { purposeCode: 'OTR_REGISTRATION', noticeVersion: '2026.1', language: 'en' } },
      },
    });
    const perm = { line1: `House ${i}, Sector ${(i % 20) + 1}`, line2: 'Near Post Office', city: district.name, stateCode, districtId: district.id, pin: `${2 + (i % 7)}${String(10000 + i * 37).slice(0, 5)}` };
    const pdf = buildSimplePdf([`Certificate (seed) for ${fullName}`]);
    const docKey = async (kind: string) => {
      const key = `candidates/${cand.id}/docs/${randomUUID()}.pdf`;
      await storage.put(key, pdf, 'application/pdf');
      const vs = i % 6 === 0 ? 'PENDING' : i % 11 === 0 ? 'REJECTED' : 'APPROVED';
      return (await prisma.document.create({ data: { candidateId: cand.id, kind, objectKey: key, fileName: `${kind.toLowerCase()}.pdf`, mime: 'application/pdf', sizeBytes: pdf.length, sha256: sha(pdf), verificationStatus: status === 'SUBMITTED' ? (vs as never) : 'PENDING', verifiedById: vs !== 'PENDING' ? verifier.id : null, rejectionReason: vs === 'REJECTED' ? 'Certificate not legible' : null } })).id;
    };
    const has = (s: string) => steps.includes(s);
    const catDoc = has('category') && category !== 'GEN' ? await docKey('CATEGORY_CERT') : null;
    await prisma.candidateProfile.create({
      data: {
        candidateId: cand.id, fullNameEnc: crypto.encrypt(fullName), fatherNameEnc: crypto.encrypt(fatherName), dobEnc: crypto.encrypt(dob), gender: female ? 'FEMALE' : 'MALE', nationality: 'INDIAN',
        ...(has('personal') && { motherNameEnc: crypto.encrypt(motherName), maritalStatus: 'UNMARRIED', idMark1Enc: crypto.encrypt('Mole on right cheek') }),
        ...(has('category') && { category, pwd: i % 13 === 0, pwdType: i % 13 === 0 ? 'OH' : null, pwdPercent: i % 13 === 0 ? 45 : null, pwdCertDocId: i % 13 === 0 ? await docKey('PWD_CERT') : null, exServiceman: false, domicileStateCode: stateCode, categoryCertDocId: catDoc }),
        ...(has('address') && { permanentAddressEnc: crypto.encJson(perm), sameAddress: true, stateCode, districtId: district.id }),
        ...(has('declaration') && { declarationAt: new Date(), declarationPlace: district.name }),
        ...(i % 9 === 0 && { aadhaarMasked: `XXXX-XXXX-${String(1000 + i).slice(-4)}`, aadhaarRefToken: `UIDREF-SEED-${i}`, aadhaarVerifiedAt: new Date() }),
        completedSteps: steps,
      },
    });
    if (has('education')) {
      const ed: Prisma.EducationCreateManyInput[] = [
        { candidateId: cand.id, level: 'CLASS_10', qualificationName: 'Secondary (Class 10)', boardOrUniversity: pick(BOARDS), yearOfPassing: 2014 + (i % 5), status: 'PASSED', resultType: 'PERCENT', marks: 60 + (i % 35), documentId: await docKey('EDU_CLASS_10'), sortOrder: 0 },
        { candidateId: cand.id, level: 'CLASS_12', qualificationName: 'Senior Secondary (Class 12) - Science', boardOrUniversity: pick(BOARDS), yearOfPassing: 2016 + (i % 5), status: 'PASSED', resultType: 'PERCENT', marks: 55 + (i % 40), documentId: await docKey('EDU_CLASS_12'), sortOrder: 1 },
      ];
      if (i % 4 !== 1) ed.push({ candidateId: cand.id, level: 'GRADUATION', qualificationName: pick(['B.A.', 'B.Sc.', 'B.Com.', 'BCA']), boardOrUniversity: pick(UNIVERSITIES), yearOfPassing: 2020 + (i % 5), status: i % 8 === 0 ? 'APPEARING' : 'PASSED', resultType: i % 5 === 0 ? 'CGPA' : 'PERCENT', marks: i % 5 === 0 ? 6.5 + (i % 3) : 50 + (i % 40), cgpaScale: i % 5 === 0 ? 10 : null, documentId: i % 8 === 0 ? null : await docKey('EDU_GRADUATION'), sortOrder: 2 });
      await prisma.education.createMany({ data: ed });
    }
    if (has('photo') || (status === 'DRAFT' && draftSteps.length >= 4)) {
      let photo = await makePhoto(fullName, i);
      if (i === 49) dupPhoto = photo;
      if (i === 50 && dupPhoto) photo = dupPhoto;
      const pk = `candidates/${cand.id}/photo/${randomUUID()}.jpg`;
      await storage.put(pk, photo, 'image/jpeg');
      const scores = { faceConfidence: 0.9, centreOffset: 0.04, areaRatio: 0.12, luminance: 128 + (i % 30), blurVariance: 180 + i };
      await prisma.photoAttempt.createMany({ data: Array.from({ length: 1 + (i % 3) }, (_, k) => ({ candidateId: cand.id, attemptNo: k + 1, scores, liveness: { passed: true, method: i % 2 ? 'BLINK' : 'HEAD_TURN' }, accepted: k === i % 3 })) });
      await prisma.mediaAsset.create({ data: { candidateId: cand.id, kind: 'PHOTO', objectKey: pk, sha256: sha(photo), width: 350, height: 450, sizeBytes: photo.length, method: 'LIVE', capturedAt: new Date(), userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile (seed)', livenessPassed: true, livenessMethod: i % 2 ? 'BLINK' : 'HEAD_TURN', scores, attemptNo: 1 + (i % 3), duplicateFlag: i >= 49 } });
      const sig = await makeSignature(fullName);
      const sk = `candidates/${cand.id}/signature/${randomUUID()}.jpg`;
      await storage.put(sk, sig, 'image/jpeg');
      await prisma.mediaAsset.create({ data: { candidateId: cand.id, kind: 'SIGNATURE', objectKey: sk, sha256: sha(sig), width: 140, height: 60, sizeBytes: sig.length, method: i % 2 ? 'DRAWN' : 'UPLOADED' } });
    }
    if (status !== 'DRAFT') {
      const seq = Number((await prisma.$queryRawUnsafe<Array<{ v: bigint }>>(`SELECT nextval('otr_seq') AS v`))[0]!.v);
      await prisma.candidate.update({ where: { id: cand.id }, data: { otrId: formatOtrId(2026, seq), otrSeq: seq, submittedAt: new Date(Date.now() - (50 - i) * 3600 * 1000) } });
    }
    await prisma.auditLog.create({ data: { actorType: 'CANDIDATE', actorId: cand.id, action: 'CANDIDATE_REGISTERED', entity: 'Candidate', entityId: cand.id } });

    // Applications for submitted candidates
    if (status === 'SUBMITTED' && i <= 30) {
      const full = await prisma.candidate.findUniqueOrThrow({ where: { id: cand.id }, include: { media: true } });
      const photoKey = full.media.find((m) => m.kind === 'PHOTO')?.objectKey;
      const sigKey = full.media.find((m) => m.kind === 'SIGNATURE')?.objectKey;
      const exempt = female || category === 'SC' || category === 'ST' || i % 13 === 0;
      const fee = exempt ? 0 : 100;
      // CHSL (closed): paid/exempt; admit cards released later
      if (i <= 18) {
        const seqA = Number((await prisma.$queryRawUnsafe<Array<{ v: bigint }>>(`SELECT nextval('application_seq') AS v`))[0]!.v);
        const st = fee === 0 ? 'FEE_EXEMPT' : 'PAID';
        const app = await prisma.application.create({
          data: { applicationNo: `CHS26${String(seqA).padStart(8, '0')}`, candidateId: cand.id, examId: chslFull.id, postIds: [chslFull.posts[0]!.id], centreCityIds: [chslFull.centreCities[i % 3]!.id, chslFull.centreCities[(i + 1) % 3]!.id], feeAmount: fee, feeRuleLabel: exempt ? 'Exempt' : 'General/EWS/OBC', status: st, submittedAt: new Date('2026-07-01T10:00:00Z'), photoKey, signatureKey: sigKey,
            eligibilitySnapshot: { results: [{ postCode: 'LDC', eligible: true, criteria: [{ code: 'AGE', passed: true, reasonKey: 'eligibility.age.ok' }] }] },
            events: { create: [{ status: 'SUBMITTED', at: new Date('2026-07-01T10:00:00Z') }, { status: st, at: new Date('2026-07-01T10:05:00Z') }] } },
        });
        if (fee > 0) await prisma.payment.create({ data: { applicationId: app.id, merchantTxnId: `VTLP20260701SEED${String(i).padStart(4, '0')}`, gateway: 'mock', gatewayTxnId: `MPGSEED${i}`, amount: fee, status: 'SUCCESS', reconciledAt: new Date() } });
      }
      // CGL (open): mix of draft, pending payment, failed, paid
      if (i >= 10) {
        const seqA = Number((await prisma.$queryRawUnsafe<Array<{ v: bigint }>>(`SELECT nextval('application_seq') AS v`))[0]!.v);
        const mode = i % 4;
        const st = mode === 0 ? 'DRAFT' : fee === 0 ? 'FEE_EXEMPT' : mode === 1 ? 'PAYMENT_PENDING' : 'PAID';
        const app = await prisma.application.create({
          data: { applicationNo: `CGL26${String(seqA).padStart(8, '0')}`, candidateId: cand.id, examId: cglFull.id, postIds: [cglFull.posts[1]!.id], centreCityIds: [cglFull.centreCities[i % 5]!.id], customFieldValues: { preferredLanguage: i % 2 ? 'HI' : 'EN' }, feeAmount: fee, feeRuleLabel: exempt ? 'Exempt' : 'General/EWS/OBC', status: st, submittedAt: st === 'DRAFT' ? null : new Date(), photoKey, signatureKey: sigKey,
            events: { create: st === 'DRAFT' ? [{ status: 'DRAFT' }] : [{ status: 'SUBMITTED' }, { status: st }] } },
        });
        if (st === 'PAID') await prisma.payment.create({ data: { applicationId: app.id, merchantTxnId: `VTLP20261115SEED${String(i).padStart(4, '0')}`, gateway: 'mock', gatewayTxnId: `MPGCGL${i}`, amount: fee, status: 'SUCCESS', reconciledAt: new Date() } });
        if (st === 'PAYMENT_PENDING') await prisma.payment.create({ data: { applicationId: app.id, merchantTxnId: `VTLP20261116FAIL${String(i).padStart(4, '0')}`, gateway: 'mock', gatewayTxnId: `MPGF${i}`, amount: fee, status: 'FAILED' } });
      }
    }
    if (i === 12 || i === 22) {
      const proof = await docKey('CORRECTION_PROOF');
      await prisma.correctionRequest.create({ data: { candidateId: cand.id, field: i === 12 ? 'FATHER_NAME' : 'DOB', currentValueEnc: crypto.encrypt(i === 12 ? fatherName : dob), requestedValueEnc: crypto.encrypt(i === 12 ? `${pick(FATHER)} PRASAD ${last}` : '2001-05-14'), reason: 'Spelling as per Class 10 certificate differs from what was entered.', documentId: proof } });
    }
    if (i === 7 || i === 25) {
      const seqT = Number((await prisma.$queryRawUnsafe<Array<{ v: bigint }>>(`SELECT nextval('ticket_seq') AS v`))[0]!.v);
      await prisma.helpdeskTicket.create({ data: { ticketNo: `TKT2026${String(seqT).padStart(7, '0')}`, candidateId: cand.id, category: i === 7 ? 'PAYMENT' : 'PHOTO_SIGNATURE', subject: i === 7 ? 'Amount debited but application shows unpaid' : 'Camera not opening on my phone', messages: { create: { authorType: 'CANDIDATE', authorId: cand.id, message: 'Please help. I tried twice and it is still not working.' } } } });
    }
    process.stdout.write('.');
  }
  // Duplicate flag for the shared photo
  const dups = await prisma.mediaAsset.findMany({ where: { kind: 'PHOTO', duplicateFlag: true } });
  if (dups.length > 1) await prisma.duplicateFlag.create({ data: { type: 'PHOTO_HASH', key: dups[0]!.sha256, candidateIds: dups.map((d) => d.candidateId) } });

  // CHSL admit cards: allocate & release (centre capacity 6 per centre)
  const chslApps = await prisma.application.findMany({ where: { examId: chslFull.id }, orderBy: { applicationNo: 'asc' } });
  const centres = await prisma.examCentre.findMany({ where: { city: { examId: chslFull.id } }, include: { city: true }, orderBy: { code: 'asc' } });
  for (const [k, a] of chslApps.entries()) {
    const centre = centres[k % centres.length]!;
    const cityNo = chslFull.centreCities.findIndex((c) => c.id === centre.cityId) + 1;
    await prisma.admitCard.create({ data: { applicationId: a.id, examId: chslFull.id, rollNo: `CHS26${String(cityNo).padStart(2, '0')}${String(k + 1).padStart(5, '0')}`, centreId: centre.id, allocationMethod: 'AUTO', releasedAt: new Date() } });
    await prisma.notification.create({ data: { candidateId: a.candidateId, titleKey: 'notifications.admitCardReleased', params: { exam: chslFull.titleEn }, link: `/applications/${a.id}` } });
  }
  await prisma.exam.update({ where: { id: chslFull.id }, data: { admitCardsReleasedAt: new Date() } });

  console.log('\nSeed complete.');
  console.log(`  Admin logins (password ${DEV_ADMIN_PASSWORD}, TOTP secret ${DEV_TOTP_SECRET}, current code ${authenticator.generate(DEV_TOTP_SECRET)}):`);
  console.log('    superadmin@ examadmin@ verifier@ helpdesk@ auditor@ (vtl-otr.local); newverifier@ must enrol TOTP');
  console.log(`  Candidates: candidate01@example.in … candidate50@example.in (password ${DEV_CANDIDATE_PASSWORD})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

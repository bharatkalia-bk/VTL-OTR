/** Built-in default message templates (EN/HI). DB MessageTemplate rows override these per code/channel/language. */
export interface TemplateDef { subject: string; body: string; dlt?: string }
type Lang = 'en' | 'hi';
export const DEFAULT_TEMPLATES: Record<string, Partial<Record<'SMS' | 'EMAIL', Record<Lang, TemplateDef>>>> = {
  OTP: {
    SMS: {
      en: { subject: '', body: '{{otp}} is your VTL OTR verification code for {{purpose}}. Valid for 10 minutes. Do not share it with anyone. -VTL', dlt: '1007000000000000001' },
      hi: { subject: '', body: '{{otp}} आपका VTL OTR सत्यापन कोड है ({{purpose}})। 10 मिनट तक मान्य। इसे किसी से साझा न करें। -VTL', dlt: '1007000000000000002' },
    },
    EMAIL: {
      en: { subject: 'Your VTL OTR verification code', body: '<p>Your verification code for <b>{{purpose}}</b> is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">{{otp}}</p><p>It is valid for 10 minutes. Never share this code with anyone, including helpdesk staff.</p>' },
      hi: { subject: 'आपका VTL OTR सत्यापन कोड', body: '<p><b>{{purpose}}</b> के लिए आपका सत्यापन कोड:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">{{otp}}</p><p>यह 10 मिनट तक मान्य है। इसे किसी से भी साझा न करें।</p>' },
    },
  },
  OTR_GENERATED: {
    SMS: {
      en: { subject: '', body: 'Dear {{name}}, your One Time Registration is complete. Your OTR ID is {{otrId}}. Use it to apply for exams. -VTL', dlt: '1007000000000000003' },
      hi: { subject: '', body: 'प्रिय {{name}}, आपका एकबारीय पंजीकरण पूर्ण हुआ। आपकी OTR ID {{otrId}} है। -VTL', dlt: '1007000000000000004' },
    },
    EMAIL: {
      en: { subject: 'Your OTR ID: {{otrId}}', body: '<p>Dear {{name}},</p><p>Your One Time Registration has been submitted successfully.</p><p>Your OTR ID is <b style="font-size:20px">{{otrId}}</b></p><p>Your registration slip is attached. Keep your OTR ID safe; you will use it to apply for all exams.</p>' },
      hi: { subject: 'आपकी OTR ID: {{otrId}}', body: '<p>प्रिय {{name}},</p><p>आपका एकबारीय पंजीकरण सफलतापूर्वक जमा हो गया है।</p><p>आपकी OTR ID <b style="font-size:20px">{{otrId}}</b> है।</p><p>पंजीकरण पर्ची संलग्न है।</p>' },
    },
  },
  FORGOT_OTR: {
    SMS: { en: { subject: '', body: 'Your VTL OTR ID is {{otrId}}. -VTL', dlt: '1007000000000000005' }, hi: { subject: '', body: 'आपकी VTL OTR ID {{otrId}} है। -VTL', dlt: '1007000000000000006' } },
    EMAIL: { en: { subject: 'Your OTR ID', body: '<p>Your OTR ID is <b>{{otrId}}</b>.</p>' }, hi: { subject: 'आपकी OTR ID', body: '<p>आपकी OTR ID <b>{{otrId}}</b> है।</p>' } },
  },
  APPLICATION_SUBMITTED: {
    SMS: { en: { subject: '', body: 'Application {{applicationNo}} for {{exam}} submitted. {{feeNote}} -VTL', dlt: '1007000000000000007' }, hi: { subject: '', body: '{{exam}} हेतु आवेदन {{applicationNo}} जमा हुआ। {{feeNote}} -VTL', dlt: '1007000000000000008' } },
    EMAIL: { en: { subject: 'Application {{applicationNo}} submitted', body: '<p>Your application <b>{{applicationNo}}</b> for <b>{{exam}}</b> has been submitted.</p><p>{{feeNote}}</p>' }, hi: { subject: 'आवेदन {{applicationNo}} जमा', body: '<p><b>{{exam}}</b> हेतु आपका आवेदन <b>{{applicationNo}}</b> जमा हो गया है।</p><p>{{feeNote}}</p>' } },
  },
  PAYMENT_RESULT: {
    SMS: { en: { subject: '', body: 'Payment of Rs {{amount}} for application {{applicationNo}}: {{status}}. Ref {{txn}}. -VTL', dlt: '1007000000000000009' }, hi: { subject: '', body: 'आवेदन {{applicationNo}} हेतु रु {{amount}} का भुगतान: {{status}}। संदर्भ {{txn}}। -VTL', dlt: '1007000000000000010' } },
    EMAIL: { en: { subject: 'Payment {{status}}: {{applicationNo}}', body: '<p>Payment of <b>Rs {{amount}}</b> for application <b>{{applicationNo}}</b> is <b>{{status}}</b>.</p><p>Transaction reference: {{txn}}</p>' }, hi: { subject: 'भुगतान {{status}}: {{applicationNo}}', body: '<p>आवेदन <b>{{applicationNo}}</b> हेतु <b>रु {{amount}}</b> का भुगतान <b>{{status}}</b>।</p><p>संदर्भ: {{txn}}</p>' } },
  },
  ADMIT_CARD_RELEASED: {
    SMS: { en: { subject: '', body: 'Admit card for {{exam}} is released. Roll No {{rollNo}}. Download from your VTL OTR dashboard. -VTL', dlt: '1007000000000000011' }, hi: { subject: '', body: '{{exam}} का प्रवेश पत्र जारी। अनुक्रमांक {{rollNo}}। VTL OTR डैशबोर्ड से डाउनलोड करें। -VTL', dlt: '1007000000000000012' } },
    EMAIL: { en: { subject: 'Admit card released: {{exam}}', body: '<p>Your admit card for <b>{{exam}}</b> is now available. Roll No: <b>{{rollNo}}</b>.</p><p>Log in to your dashboard to download it.</p>' }, hi: { subject: 'प्रवेश पत्र जारी: {{exam}}', body: '<p><b>{{exam}}</b> का आपका प्रवेश पत्र उपलब्ध है। अनुक्रमांक: <b>{{rollNo}}</b>।</p>' } },
  },
  CORRECTION_DECIDED: {
    SMS: { en: { subject: '', body: 'Your correction request for {{field}} has been {{status}}. -VTL', dlt: '1007000000000000013' }, hi: { subject: '', body: '{{field}} हेतु आपका सुधार अनुरोध {{status}} हुआ। -VTL', dlt: '1007000000000000014' } },
    EMAIL: { en: { subject: 'Correction request {{status}}', body: '<p>Your correction request for <b>{{field}}</b> has been <b>{{status}}</b>.</p><p>{{reason}}</p>' }, hi: { subject: 'सुधार अनुरोध {{status}}', body: '<p><b>{{field}}</b> हेतु आपका सुधार अनुरोध <b>{{status}}</b> हुआ।</p><p>{{reason}}</p>' } },
  },
  TICKET_UPDATE: {
    EMAIL: { en: { subject: 'Ticket {{ticketNo}} updated', body: '<p>Your helpdesk ticket <b>{{ticketNo}}</b> has a new update: {{status}}.</p>' }, hi: { subject: 'टिकट {{ticketNo}} अद्यतन', body: '<p>आपके हेल्पडेस्क टिकट <b>{{ticketNo}}</b> में नया अद्यतन: {{status}}।</p>' } },
  },
};

export function emailLayout(bodyHtml: string, opts: { logoUrl: string; lang: Lang }): string {
  const footer = opts.lang === 'hi' ? 'वेन्सिस्को टेक्नोलॉजीज़ लिमिटेड का उत्पाद' : 'A product of Vensysco Technologies Limited';
  return `<!doctype html><html lang="${opts.lang}"><body style="margin:0;background:#F6F7FB;font-family:Inter,Arial,sans-serif;color:#07102D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7FB;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E3E6EF;border-radius:8px">
<tr><td style="padding:20px 24px;border-bottom:3px solid #EC4119"><img src="${opts.logoUrl}" alt="Vensysco Technologies Limited" height="36" style="display:block;height:36px"></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;background:#07102D;color:#fff;font-size:12px;border-radius:0 0 8px 8px">VTL OTR · ${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Helpdesk knowledge base. The chatbot answers from here (and only from here when AI is off). */
export interface KbEntry { id: string; keywords: string[]; q: { en: string; hi: string }; a: { en: string; hi: string }; link?: string }

export const KB: KbEntry[] = [
  { id: 'otr', keywords: ['otr', 'one time', 'registration', 'register', 'id', 'पंजीकरण'], link: '/register',
    q: { en: 'What is OTR and how do I register?', hi: 'ओटीआर क्या है और पंजीकरण कैसे करें?' },
    a: { en: 'One Time Registration (OTR) gives you a permanent OTR ID. Register with your mobile and email (both verified by OTP), complete the 6-step profile with a live photo, then submit. You can then apply for any exam without filling your details again.', hi: 'वन टाइम रजिस्ट्रेशन (OTR) से आपको स्थायी OTR आईडी मिलती है। मोबाइल और ईमेल (OTP से सत्यापित) से पंजीकरण करें, लाइव फ़ोटो के साथ 6 चरणों की प्रोफ़ाइल पूरी करें और सबमिट करें।' } },
  { id: 'forgot', keywords: ['forgot', 'password', 'lost', 'reset', 'भूल'], link: '/forgot-password',
    q: { en: 'I forgot my password or OTR ID', hi: 'मैं पासवर्ड या OTR आईडी भूल गया' },
    a: { en: 'Use "Forgot password" or "Forgot OTR ID" on the login page. An OTP is sent to your registered mobile number.', hi: 'लॉगिन पेज पर "पासवर्ड भूल गए" या "OTR आईडी भूल गए" का उपयोग करें। पंजीकृत मोबाइल पर OTP भेजा जाएगा।' } },
  { id: 'otp', keywords: ['otp', 'sms', 'code', 'not received', 'नहीं मिला'],
    q: { en: 'I did not receive the OTP', hi: 'मुझे OTP नहीं मिला' },
    a: { en: 'Wait 60 seconds and tap "Resend". Check DND settings and network. OTPs are valid for 10 minutes. After 5 wrong attempts, wait 15 minutes.', hi: '60 सेकंड रुककर "पुनः भेजें" दबाएँ। DND और नेटवर्क जाँचें। OTP 10 मिनट तक मान्य है।' } },
  { id: 'photo', keywords: ['photo', 'camera', 'selfie', 'face', 'picture', 'फ़ोटो', 'कैमरा'],
    q: { en: 'My photo is not getting captured', hi: 'मेरी फ़ोटो नहीं खिंच रही' },
    a: { en: 'The photo is taken only with your device camera; uploads are not allowed. Allow camera permission, face a light source, remove caps and dark glasses, keep only your face in the frame and follow the blink or head-turn prompt.', hi: 'फ़ोटो केवल कैमरे से ली जाती है, अपलोड की अनुमति नहीं है। कैमरा अनुमति दें, रोशनी की ओर मुँह करें, टोपी/काला चश्मा हटाएँ और निर्देश का पालन करें।' } },
  { id: 'fee', keywords: ['fee', 'payment', 'paid', 'deducted', 'refund', 'शुल्क', 'भुगतान'],
    q: { en: 'Money was deducted but payment shows pending', hi: 'पैसा कट गया पर भुगतान लंबित दिख रहा है' },
    a: { en: 'Do not pay again. Payments are reconciled with the bank automatically every few minutes; the status updates within 24 hours. If the payment fails at the bank, the amount is reversed by your bank in 5 to 7 working days.', hi: 'दोबारा भुगतान न करें। बैंक से मिलान स्वतः होता है; 24 घंटे में स्थिति अपडेट हो जाएगी।' } },
  { id: 'admit', keywords: ['admit', 'hall ticket', 'centre', 'center', 'प्रवेश पत्र', 'केंद्र'],
    q: { en: 'When will I get my admit card?', hi: 'प्रवेश पत्र कब मिलेगा?' },
    a: { en: 'Admit cards are released about 10 days before the exam. Download from "My applications". It shows your centre, shift, reporting time and a map link to the centre.', hi: 'प्रवेश पत्र परीक्षा से लगभग 10 दिन पहले जारी होते हैं। "मेरे आवेदन" से डाउनलोड करें।' } },
  { id: 'correction', keywords: ['correction', 'change', 'wrong', 'mistake', 'name', 'dob', 'सुधार'], link: '/corrections',
    q: { en: 'How do I correct my name or date of birth?', hi: 'नाम या जन्मतिथि कैसे सुधारें?' },
    a: { en: 'After OTR submission, raise a correction request with proof under "Corrections". A verifier reviews it; approved changes apply to future applications.', hi: 'OTR सबमिट करने के बाद "सुधार" में प्रमाण सहित अनुरोध करें। सत्यापनकर्ता इसकी समीक्षा करेगा।' } },
  { id: 'key', keywords: ['answer key', 'objection', 'challenge', 'response sheet', 'उत्तर कुंजी', 'आपत्ति'], link: '/results',
    q: { en: 'How do I challenge the answer key?', hi: 'उत्तर कुंजी को चुनौती कैसे दें?' },
    a: { en: 'When the provisional key is published, open "Results and answer key", view your response sheet and raise an objection per question with reasons, during the objection window. A fee applies per question and is refunded if your objection is accepted.', hi: 'अनंतिम कुंजी प्रकाशित होने पर "परिणाम और उत्तर कुंजी" में प्रति प्रश्न कारण सहित आपत्ति दर्ज करें। स्वीकृत होने पर शुल्क वापस होगा।' } },
  { id: 'result', keywords: ['result', 'score', 'marks', 'cut off', 'cutoff', 'percentile', 'normalised', 'परिणाम'], link: '/results',
    q: { en: 'How are scores normalised?', hi: 'अंकों का सामान्यीकरण कैसे होता है?' },
    a: { en: 'When an exam runs in several shifts, raw scores are converted using equipercentile normalisation, so a candidate in a harder shift is not disadvantaged. Your score card shows raw score, normalised score and percentile.', hi: 'कई पालियों वाली परीक्षा में समपर्सेंटाइल पद्धति से अंक सामान्यीकृत किए जाते हैं ताकि कठिन पाली के उम्मीदवार को नुकसान न हो।' } },
  { id: 'dv', keywords: ['document verification', 'dv', 'allotment', 'preference', 'interview', 'सत्यापन', 'आवंटन'],
    q: { en: 'What happens after the final result?', hi: 'अंतिम परिणाम के बाद क्या होता है?' },
    a: { en: 'Qualified candidates submit preferences, get an allotment by merit and preference, accept it, and attend document verification with originals on the scheduled date.', hi: 'योग्य उम्मीदवार वरीयता भरते हैं, मेरिट और वरीयता से आवंटन मिलता है, उसे स्वीकार कर निर्धारित तिथि पर मूल दस्तावेज़ों के साथ सत्यापन में आते हैं।' } },
];

export function searchKb(text: string, lang: 'en' | 'hi'): Array<{ entry: KbEntry; score: number }> {
  const t = text.toLowerCase();
  return KB.map((e) => ({ entry: e, score: e.keywords.reduce((s, k) => s + (t.includes(k.toLowerCase()) ? (k.includes(' ') ? 3 : 2) : 0), 0) + (t.includes(e.q[lang].toLowerCase().slice(0, 12)) ? 1 : 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}

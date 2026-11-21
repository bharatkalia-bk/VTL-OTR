/** States/UTs with Hindi names and principal districts. Full LGD district master can be imported via admin masters. */
export const STATES: Array<{ code: string; nameEn: string; nameHi: string; isUT?: boolean; districts: string[] }> = [
  { code: 'AN', nameEn: 'Andaman and Nicobar Islands', nameHi: 'अंडमान और निकोबार द्वीपसमूह', isUT: true, districts: ['South Andaman', 'North and Middle Andaman', 'Nicobar'] },
  { code: 'AP', nameEn: 'Andhra Pradesh', nameHi: 'आंध्र प्रदेश', districts: ['Visakhapatnam', 'Guntur', 'Krishna', 'Chittoor', 'Kurnool', 'Anantapur', 'Nellore'] },
  { code: 'AR', nameEn: 'Arunachal Pradesh', nameHi: 'अरुणाचल प्रदेश', districts: ['Papum Pare', 'Tawang', 'West Kameng', 'Lohit', 'East Siang'] },
  { code: 'AS', nameEn: 'Assam', nameHi: 'असम', districts: ['Kamrup Metropolitan', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Cachar', 'Sonitpur'] },
  { code: 'BR', nameEn: 'Bihar', nameHi: 'बिहार', districts: ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Darbhanga', 'Purnia', 'Nalanda'] },
  { code: 'CH', nameEn: 'Chandigarh', nameHi: 'चंडीगढ़', isUT: true, districts: ['Chandigarh'] },
  { code: 'CG', nameEn: 'Chhattisgarh', nameHi: 'छत्तीसगढ़', districts: ['Raipur', 'Bilaspur', 'Durg', 'Bastar', 'Korba', 'Raigarh'] },
  { code: 'DH', nameEn: 'Dadra and Nagar Haveli and Daman and Diu', nameHi: 'दादरा और नगर हवेली और दमन और दीव', isUT: true, districts: ['Dadra and Nagar Haveli', 'Daman', 'Diu'] },
  { code: 'DL', nameEn: 'Delhi', nameHi: 'दिल्ली', isUT: true, districts: ['New Delhi', 'Central Delhi', 'South Delhi', 'North Delhi', 'East Delhi', 'West Delhi', 'Shahdara'] },
  { code: 'GA', nameEn: 'Goa', nameHi: 'गोवा', districts: ['North Goa', 'South Goa'] },
  { code: 'GJ', nameEn: 'Gujarat', nameHi: 'गुजरात', districts: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Bhavnagar', 'Jamnagar'] },
  { code: 'HR', nameEn: 'Haryana', nameHi: 'हरियाणा', districts: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Hisar', 'Rohtak', 'Karnal'] },
  { code: 'HP', nameEn: 'Himachal Pradesh', nameHi: 'हिमाचल प्रदेश', districts: ['Shimla', 'Kangra', 'Mandi', 'Solan', 'Kullu', 'Hamirpur'] },
  { code: 'JK', nameEn: 'Jammu and Kashmir', nameHi: 'जम्मू और कश्मीर', isUT: true, districts: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Udhampur', 'Kathua'] },
  { code: 'JH', nameEn: 'Jharkhand', nameHi: 'झारखंड', districts: ['Ranchi', 'Dhanbad', 'East Singhbhum', 'Bokaro', 'Hazaribagh', 'Deoghar'] },
  { code: 'KA', nameEn: 'Karnataka', nameHi: 'कर्नाटक', districts: ['Bengaluru Urban', 'Mysuru', 'Belagavi', 'Dakshina Kannada', 'Kalaburagi', 'Dharwad', 'Ballari'] },
  { code: 'KL', nameEn: 'Kerala', nameHi: 'केरल', districts: ['Thiruvananthapuram', 'Ernakulam', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Palakkad'] },
  { code: 'LA', nameEn: 'Ladakh', nameHi: 'लद्दाख', isUT: true, districts: ['Leh', 'Kargil'] },
  { code: 'LD', nameEn: 'Lakshadweep', nameHi: 'लक्षद्वीप', isUT: true, districts: ['Lakshadweep'] },
  { code: 'MP', nameEn: 'Madhya Pradesh', nameHi: 'मध्य प्रदेश', districts: ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Rewa'] },
  { code: 'MH', nameEn: 'Maharashtra', nameHi: 'महाराष्ट्र', districts: ['Mumbai City', 'Mumbai Suburban', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad'] },
  { code: 'MN', nameEn: 'Manipur', nameHi: 'मणिपुर', districts: ['Imphal West', 'Imphal East', 'Thoubal', 'Bishnupur', 'Churachandpur'] },
  { code: 'ML', nameEn: 'Meghalaya', nameHi: 'मेघालय', districts: ['East Khasi Hills', 'West Garo Hills', 'Jaintia Hills', 'Ri Bhoi'] },
  { code: 'MZ', nameEn: 'Mizoram', nameHi: 'मिज़ोरम', districts: ['Aizawl', 'Lunglei', 'Champhai', 'Kolasib'] },
  { code: 'NL', nameEn: 'Nagaland', nameHi: 'नागालैंड', districts: ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang'] },
  { code: 'OD', nameEn: 'Odisha', nameHi: 'ओडिशा', districts: ['Khordha', 'Cuttack', 'Ganjam', 'Sundargarh', 'Balasore', 'Puri', 'Sambalpur'] },
  { code: 'PY', nameEn: 'Puducherry', nameHi: 'पुदुचेरी', isUT: true, districts: ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'] },
  { code: 'PB', nameEn: 'Punjab', nameHi: 'पंजाब', districts: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali'] },
  { code: 'RJ', nameEn: 'Rajasthan', nameHi: 'राजस्थान', districts: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Alwar'] },
  { code: 'SK', nameEn: 'Sikkim', nameHi: 'सिक्किम', districts: ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan'] },
  { code: 'TN', nameEn: 'Tamil Nadu', nameHi: 'तमिलनाडु', districts: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Vellore'] },
  { code: 'TS', nameEn: 'Telangana', nameHi: 'तेलंगाना', districts: ['Hyderabad', 'Rangareddy', 'Warangal', 'Karimnagar', 'Nizamabad', 'Khammam'] },
  { code: 'TR', nameEn: 'Tripura', nameHi: 'त्रिपुरा', districts: ['West Tripura', 'South Tripura', 'Dhalai', 'North Tripura'] },
  { code: 'UP', nameEn: 'Uttar Pradesh', nameHi: 'उत्तर प्रदेश', districts: ['Lucknow', 'Kanpur Nagar', 'Prayagraj', 'Varanasi', 'Agra', 'Ghaziabad', 'Gautam Buddha Nagar', 'Gorakhpur', 'Meerut', 'Bareilly'] },
  { code: 'UK', nameEn: 'Uttarakhand', nameHi: 'उत्तराखंड', districts: ['Dehradun', 'Haridwar', 'Nainital', 'Udham Singh Nagar', 'Almora', 'Pauri Garhwal'] },
  { code: 'WB', nameEn: 'West Bengal', nameHi: 'पश्चिम बंगाल', districts: ['Kolkata', 'North 24 Parganas', 'South 24 Parganas', 'Howrah', 'Hooghly', 'Darjeeling', 'Paschim Bardhaman'] },
];

export const BOARDS = [
  'Central Board of Secondary Education (CBSE)', 'Council for the Indian School Certificate Examinations (CISCE)', 'National Institute of Open Schooling (NIOS)',
  'Board of High School and Intermediate Education, Uttar Pradesh', 'Bihar School Examination Board', 'Board of Secondary Education, Rajasthan',
  'Maharashtra State Board of Secondary and Higher Secondary Education', 'Board of Secondary Education, Madhya Pradesh', 'West Bengal Board of Secondary Education',
  'Tamil Nadu State Board', 'Karnataka Secondary Education Examination Board', 'Kerala Board of Public Examinations', 'Gujarat Secondary and Higher Secondary Education Board',
  'Haryana Board of School Education', 'Punjab School Education Board', 'Jharkhand Academic Council', 'Board of Secondary Education, Odisha', 'Telangana State Board of Intermediate Education',
];
export const UNIVERSITIES = [
  'University of Delhi', 'Jawaharlal Nehru University', 'Banaras Hindu University', 'Aligarh Muslim University', 'University of Lucknow', 'Patna University',
  'University of Rajasthan', 'University of Mumbai', 'Savitribai Phule Pune University', 'University of Calcutta', 'University of Madras', 'Bangalore University',
  'Osmania University', 'Panjab University', 'Indira Gandhi National Open University (IGNOU)', 'Dr. A.P.J. Abdul Kalam Technical University', 'Barkatullah University', 'Gauhati University',
];
export const QUALIFICATIONS: Array<[string, string]> = [
  ['CLASS_10', 'Secondary (Class 10)'], ['CLASS_12', 'Senior Secondary (Class 12) - Science'], ['CLASS_12', 'Senior Secondary (Class 12) - Commerce'], ['CLASS_12', 'Senior Secondary (Class 12) - Arts'],
  ['DIPLOMA', 'Diploma in Engineering'], ['DIPLOMA', 'Diploma in Computer Applications'],
  ['GRADUATION', 'B.A.'], ['GRADUATION', 'B.Sc.'], ['GRADUATION', 'B.Com.'], ['GRADUATION', 'B.Tech / B.E.'], ['GRADUATION', 'BCA'], ['GRADUATION', 'BBA'],
  ['PG', 'M.A.'], ['PG', 'M.Sc.'], ['PG', 'M.Com.'], ['PG', 'MBA'], ['PG', 'MCA'], ['PG', 'M.Tech'],
];

export const FAQS = [
  { qEn: 'What is One Time Registration (OTR)?', qHi: 'एकबारीय पंजीकरण (OTR) क्या है?', aEn: 'OTR lets you register once with verified details, photograph and documents. You get a permanent OTR ID and can apply for any exam on this platform without re-entering your data.', aHi: 'OTR से आप एक बार सत्यापित विवरण, फ़ोटो और दस्तावेज़ों के साथ पंजीकरण करते हैं। आपको स्थायी OTR ID मिलती है जिससे आप बिना दोबारा विवरण भरे किसी भी परीक्षा के लिए आवेदन कर सकते हैं।' },
  { qEn: 'Can I upload my photograph from the gallery?', qHi: 'क्या मैं गैलरी से फ़ोटो अपलोड कर सकता/सकती हूँ?', aEn: 'No. Your photograph must be captured live using your device camera within the portal. This prevents impersonation.', aHi: 'नहीं। आपकी फ़ोटो पोर्टल के भीतर डिवाइस कैमरे से लाइव ली जानी चाहिए। इससे प्रतिरूपण रोका जाता है।' },
  { qEn: 'How do I change my name or date of birth after submission?', qHi: 'जमा करने के बाद नाम या जन्मतिथि कैसे बदलें?', aEn: 'Core details are locked after submission. Raise a correction request from your dashboard with a supporting document; it will be reviewed by the verification team.', aHi: 'जमा करने के बाद मुख्य विवरण लॉक हो जाते हैं। डैशबोर्ड से सहायक दस्तावेज़ के साथ सुधार अनुरोध करें; सत्यापन टीम इसकी समीक्षा करेगी।' },
  { qEn: 'I forgot my OTR ID. What should I do?', qHi: 'मैं अपनी OTR ID भूल गया/गई हूँ। क्या करूँ?', aEn: 'Use “Forgot OTR ID” on the login page with your registered mobile or email and date of birth. The OTR ID will be sent to your registered mobile and email.', aHi: 'लॉगिन पेज पर “OTR ID भूल गए” का उपयोग करें। आपकी OTR ID पंजीकृत मोबाइल और ईमेल पर भेज दी जाएगी।' },
  { qEn: 'Is my data safe?', qHi: 'क्या मेरा डेटा सुरक्षित है?', aEn: 'Personal data is encrypted at rest, used only for examination purposes as stated in the privacy notice, and handled as per the Digital Personal Data Protection Act, 2023.', aHi: 'व्यक्तिगत डेटा एन्क्रिप्टेड रूप में संग्रहीत है, केवल गोपनीयता सूचना में बताए परीक्षा उद्देश्यों के लिए उपयोग होता है और डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 के अनुसार संभाला जाता है।' },
];

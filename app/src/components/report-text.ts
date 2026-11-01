import { STATUS_LABELS } from '@domain/lifecycle';
import type { Language } from '@domain/types';
import { REPORT_TYPES } from '@/lib/reports';
import { REPORT_HI } from './ReportsRail';

/**
 * Report wording in the reader's language, applied when a report is shown.
 *
 * A report is stored as a snapshot of what was built (lib/reports.ts), with its labels, section
 * titles, notes and caveats in English. Those stay the record, and the exports use them. On
 * screen, a Hindi reader sees them translated here, so a snapshot saved before this file existed
 * reads in Hindi too. Names, ids and figures inside are data and pass through unchanged; a piece
 * of text this file does not know is shown as stored.
 */

const EXACT: Record<string, string> = {
  // summary figures
  'Cases actioned': 'कार्यवाही वाले प्रकरण',
  'Closed on a verified gain': 'पुष्ट सुधार पर बंद',
  'Delivered, awaiting next round': 'काम पूरा, अगले दौर की प्रतीक्षा',
  'With overdue tasks': 'विलंबित काम वाले',
  'Outcome checks': 'परिणाम जाँच',
  'Gain confirmed (interval above zero)': 'सुधार पुष्ट (अंतराल शून्य से ऊपर)',
  'Gain indicative only': 'सुधार केवल संकेत',
  'No gain / below target / worse': 'सुधार नहीं / लक्ष्य से कम / गिरावट',
  'Inconclusive': 'अनिर्णायक',
  'Overdue tasks': 'विलंबित काम',
  'Escalated': 'ऊपर भेजे गए',
  'Proof sent back (period)': 'लौटाए गए सबूत (अवधि में)',
  'Cases reopened': 'फिर खुले प्रकरण',
  'Open blockers': 'खुली बाधाएँ',
  'Open cases': 'खुले प्रकरण',
  'Critical': 'अति गंभीर',
  'Awaiting approval': 'स्वीकृति की प्रतीक्षा',
  'Closed on verified gain': 'पुष्ट सुधार पर बंद',
  'Reopened': 'फिर खुले',
  'Areas': 'क्षेत्र',
  'Critical / significant decline': 'गंभीर / उल्लेखनीय गिरावट',
  'Improving': 'सुधार',
  'Insufficient data': 'अपर्याप्त डेटा',
  'Interventions used': 'प्रयुक्त हस्तक्षेप',
  'Declines blocked by data quality': 'डेटा गुणवत्ता से रुकी गिरावटें',
  'Import batches': 'आयात बैच',
  'Rows rejected on import': 'आयात में अस्वीकृत पंक्तियाँ',
  // section titles
  'Cases actioned in the period': 'अवधि में कार्यवाही वाले प्रकरण',
  'Pre-registered outcome checks': 'पूर्व-निर्धारित परिणाम जाँच',
  'Proof sent back': 'लौटाए गए सबूत',
  'Reopened cases': 'फिर खुले प्रकरण',
  'Decisions and actions needed': 'आवश्यक निर्णय और कार्य',
  'Outcome checks to date': 'अब तक की परिणाम जाँच',
  'Results by intervention': 'हस्तक्षेप के अनुसार परिणाम',
  'Candidate declines not assessed': 'संभावित गिरावटें जिनका आकलन नहीं हुआ',
  // section notes
  'Completion is the task ledger; outcome is the pre-registered check. A completed action is not reported as a success unless the outcome check shows a gain.':
    'प्रगति काम के खाते से है; परिणाम पूर्व-निर्धारित जाँच से। पूरा हुआ काम तभी सफल माना जाता है जब परिणाम जाँच में सुधार दिखे।',
  'Effect = (treated after − before) − (comparison after − before). “Confirmed” requires the 95% interval to exclude zero; “indicative” means the point estimate passed but the interval does not rule out no effect.':
    'प्रभाव = (हस्तक्षेप वाले बाद − पहले) − (तुलना वाले बाद − पहले)। “पुष्ट” के लिए 95% अंतराल में शून्य नहीं होना चाहिए; “संकेत” का अर्थ है अनुमान सीमा पार कर गया, पर अंतराल “कोई प्रभाव नहीं” को खारिज नहीं करता।',
  'Change relative to the district; severity needs both a material drop and a clear z-score.':
    'बदलाव ज़िले की तुलना में; गंभीरता के लिए बड़ी गिरावट और स्पष्ट z-स्कोर, दोनों ज़रूरी।',
  'Counts from this ledger only. These are not causal estimates of the intervention in general: cases differ, and many cards make no effect-size claim at all.':
    'गिनती केवल इसी खाते से। ये हस्तक्षेप के सामान्य कारण-प्रभाव अनुमान नहीं हैं: प्रकरण अलग-अलग हैं, और कई हस्तक्षेप कोई प्रभाव-आकार दावा नहीं करते।',
  'Each failed a participation or coverage gate. They are unknowns, not evidence that learning is fine.':
    'हर एक भागीदारी या कवरेज की शर्त पर अटका। ये अज्ञात हैं, इसका प्रमाण नहीं कि अधिगम ठीक है।',
  // column headings
  'Case': 'प्रकरण', 'Original finding': 'मूल निष्कर्ष', 'Owner': 'ज़िम्मेदार', 'Approved action': 'स्वीकृत कार्य', 'Due': 'नियत तिथि',
  'Tasks verified': 'सत्यापित काम', 'Proof status': 'सबूत की स्थिति', 'Delivery verification': 'काम का सत्यापन', 'Learning outcome': 'अधिगम परिणाम',
  'Outstanding': 'बाकी', 'Target': 'लक्ष्य', 'Intervention': 'हस्तक्षेप', 'Treated before → after': 'हस्तक्षेप वाले: पहले → बाद',
  'Comparison before → after': 'तुलना वाले: पहले → बाद', 'Effect (95% CI)': 'प्रभाव (95% CI)', 'Threshold': 'सीमा', 'Participation': 'भागीदारी',
  'Result': 'परिणाम', 'Task': 'काम', 'Owner role': 'ज़िम्मेदार भूमिका', 'Days overdue': 'विलंब (दिन)', 'Blocker': 'बाधा', 'Type': 'प्रकार',
  'Responsible': 'ज़िम्मेदार स्तर', 'Description': 'विवरण', 'Evidence': 'सबूत', 'Reason': 'कारण', 'When': 'कब', 'Times reopened': 'कितनी बार खुला',
  'Now': 'अब', 'Priority': 'प्राथमिकता', 'Item': 'विषय', 'Age': 'कब से', 'Area': 'क्षेत्र', 'Severity': 'गंभीरता', 'vs district': 'ज़िले की तुलना में',
  'Cases': 'प्रकरण', 'Before': 'पहले', 'After': 'बाद', 'Plans': 'योजनाएँ', 'Evaluated': 'जाँचे गए', 'Confirmed gain': 'पुष्ट सुधार',
  'Indicative': 'संकेत', 'No gain': 'सुधार नहीं', 'Mean effect': 'औसत प्रभाव', 'Finding': 'निष्कर्ष', 'Round': 'दौर', 'Cluster': 'संकुल',
  'Schools reporting': 'रिपोर्ट करने वाले विद्यालय', 'Batch': 'बैच', 'File': 'फ़ाइल', 'Status': 'स्थिति', 'Rows': 'पंक्तियाँ', 'Rejected': 'अस्वीकृत',
  'Uploaded': 'अपलोड', 'district': 'ज़िला', 'block': 'खंड', 'cluster': 'संकुल', 'school': 'विद्यालय', 'state': 'राज्य',
  // caveats
  'All records are fictional demo data generated for this prototype.': 'सभी अभिलेख इस प्रोटोटाइप के लिए बना काल्पनिक डेमो डेटा हैं।',
  'Costs are illustrative, not PAB unit costs.': 'लागत उदाहरण हेतु है, PAB इकाई लागत नहीं।',
  '“Delivery verification” means proof was accepted by someone other than its submitter; it is not evidence of learning improvement.':
    '“काम का सत्यापन” का अर्थ है सबूत जमा करने वाले के अलावा किसी और ने उसे स्वीकारा; यह अधिगम सुधार का प्रमाण नहीं है।',
  'Difference-in-differences assumes the treated and comparison schools would have moved in parallel without the intervention. That assumption cannot be tested from two rounds.':
    'अंतर-में-अंतर विधि मानती है कि हस्तक्षेप के बिना हस्तक्षेप वाले और तुलना वाले विद्यालय साथ-साथ चलते। दो दौरों से इस मान्यता को जाँचा नहीं जा सकता।',
  'Schools are selected because they fell; some recovery is expected from regression to the mean alone.':
    'विद्यालय गिरावट के कारण चुने गए हैं; औसत की ओर लौटने से ही कुछ सुधार अपेक्षित है।',
  'Areas with too few assessed students are reported as “insufficient data”, not as stable.':
    'बहुत कम आकलित विद्यार्थियों वाले क्षेत्र “अपर्याप्त डेटा” बताए जाते हैं, स्थिर नहीं।',
  'A mean effect over few cases is unstable; read it alongside the number evaluated.':
    'कुछ ही प्रकरणों का औसत प्रभाव अस्थिर होता है; इसे जाँचे गए प्रकरणों की संख्या के साथ पढ़ें।',
  // cell values the builder writes
  'Officer-raised': 'अधिकारी द्वारा उठाया', 'Awaiting next round': 'अगले दौर की प्रतीक्षा', 'Not yet evaluated': 'अभी जाँच नहीं हुई',
  'None — closed': 'कुछ नहीं — बंद', 'Yes': 'हाँ', 'No': 'नहीं', 'Submitted today': 'आज जमा', 'You': 'आप', 'Open': 'खुली',
  critical: 'अति गंभीर', high: 'उच्च', medium: 'मध्यम', significant: 'उल्लेखनीय गिरावट', moderate: 'मध्यम चिंता', stable: 'स्थिर',
  improving: 'सुधार', insufficient: 'अपर्याप्त डेटा',
  'verified': 'सत्यापित', 'partially verified': 'आंशिक सत्यापित', 'not started': 'शुरू नहीं', 'pending': 'लंबित',
  'improved confirmed': 'सुधार पुष्ट', 'improved indicative': 'सुधार के संकेत', 'below target': 'लक्ष्य से कम', 'no change': 'कोई बदलाव नहीं',
  'worsened': 'और गिरावट', 'inconclusive': 'अनिर्णायक',
  'committed': 'दर्ज', 'failed': 'विफल', 'committed_with_rejections': 'दर्ज, कुछ अस्वीकृत',
  // blocker types (blockers.ts)
  'Staff unavailable': 'कर्मचारी उपलब्ध नहीं', 'Budget unavailable': 'बजट उपलब्ध नहीं', 'Teaching materials unavailable': 'शिक्षण सामग्री उपलब्ध नहीं',
  'Training incomplete': 'प्रशिक्षण अधूरा', 'School closure': 'विद्यालय बंद', 'Low attendance': 'कम उपस्थिति', 'Connectivity issues': 'नेटवर्क की समस्या',
  'Administrative approval pending': 'प्रशासनिक स्वीकृति लंबित', 'Unreasonable deadline': 'अव्यावहारिक समय-सीमा', 'External dependency': 'बाहरी निर्भरता',
  // the demo disclaimer stored on every report
  'DEMO MODE — FICTIONAL SEED DATA — NOT ACTUAL GOVERNMENT STATISTICS': 'डेमो मोड — काल्पनिक डेटा — वास्तविक सरकारी आँकड़े नहीं',
  // older saved reports keep their figures under these keys
  disclaimer: 'अस्वीकरण', status_counts_at_end: 'अवधि के अंत में स्थिति', cases_actioned: 'कार्यवाही वाले प्रकरण', case_id: 'प्रकरण',
  title: 'शीर्षक', status_at_period_end: 'अवधि के अंत में स्थिति', owner_user_id: 'ज़िम्मेदार', actions: 'कार्य', closures: 'बंद हुए',
  reopened: 'फिर खुले', escalated_tasks: 'ऊपर भेजे गए काम', overdue_tasks_at_end: 'अंत में विलंबित काम', data_provenance: 'डेटा का स्रोत',
  open_cases: 'खुले प्रकरण', decisions_due: 'लंबित निर्णय', overdue_tasks: 'विलंबित काम', by_block: 'खंड के अनुसार', block_id: 'खंड',
  escalated: 'ऊपर भेजे गए', overdue_at_end: 'अंत में विलंबित', pab_referrals_open: 'PAB को भेजे, खुले', overdue_task_ids: 'विलंबित काम की आईडी',
  count: 'संख्या', evaluations: 'जाँच', by_category: 'श्रेणी के अनुसार', median_did_pp: 'माध्य प्रभाव (pp)', note: 'टिप्पणी', rows: 'पंक्तियाँ',
  schools_missing: 'छूटे विद्यालय', low_participation_rows: 'कम भागीदारी वाली पंक्तियाँ', suspicious_rows: 'संदिग्ध पंक्तियाँ',
  rejected_rows: 'अस्वीकृत पंक्तियाँ', metrics: 'मापदंड', verified_closures_to_date: 'अब तक पुष्ट बंद', reopened_to_date: 'अब तक फिर खुले',
  median_days_detection_to_approval_90d: 'पहचान से स्वीकृति तक माध्य दिन (90 दिन)', on_time_task_rate_30d: 'समय पर काम की दर (30 दिन)',
  escalations_last_7d: 'पिछले 7 दिन में ऊपर भेजे', narrative: 'विवरण', synthetic_demo: 'काल्पनिक डेमो डेटा',
  improved_confirmed: 'सुधार पुष्ट', improved_indicative: 'सुधार के संकेत', below_target: 'लक्ष्य से कम', no_change: 'कोई बदलाव नहीं',
};
// Case statuses, in both the raw form older reports store and the label newer ones show.
for (const [k, v] of Object.entries(STATUS_LABELS)) { EXACT[k] ??= v.hi; EXACT[v.en] ??= v.hi; }
// Report type names, as titles begin with them.
const TYPE_HI = new Map<string, string>(REPORT_TYPES.map((t) => [t.label, REPORT_HI[t.key]?.label ?? t.label]));
// The seed's older reports name themselves a little differently.
for (const [en, hi] of [['Monthly review pack', 'मासिक समीक्षा संकलन'], ['District escalation report', 'ज़िला एस्केलेशन रिपोर्ट'], ['Overdue tasks', 'विलंबित काम'],
  ['Learning outcome report', 'अधिगम परिणाम रिपोर्ट'], ['Data-quality report', 'डेटा गुणवत्ता रिपोर्ट'], ['Executive brief', 'कार्यकारी सार']] as const) TYPE_HI.set(en, hi);
for (const [en, hi] of TYPE_HI) EXACT[en] ??= hi;

const LEVEL_HI: Record<string, string> = { district: 'ज़िला', block: 'खंड', cluster: 'संकुल', school: 'विद्यालय', state: 'राज्य' };
const COMP_HI: Record<string, string> = {
  'letter recognition': 'अक्षर पहचान', 'word reading': 'शब्द पठन', 'reading with comprehension': 'समझ के साथ पढ़ना',
  'number recognition': 'संख्या पहचान', addition: 'जोड़', subtraction: 'घटाव',
};

const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^(.+?) — (.+)$/, (all, a, b) => (TYPE_HI.has(a) ? `${TYPE_HI.get(a)} — ${b}` : all)],
  [/^Learning hotspots \((.*)\)$/, (_, x) => `अधिगम हॉटस्पॉट (${x === 'n/a' ? '—' : x})`],
  [/^By (district|block|cluster|school) \((.*)\)$/, (_, l, x) => `${LEVEL_HI[l]} के अनुसार (${x})`],
  [/^Areas with insufficient data \((\w+)\)$/, (_, l) => `अपर्याप्त डेटा वाले क्षेत्र (${LEVEL_HI[l] ?? l})`],
  [/^Waiting (\d+) days?$/, (_, n) => `${n} दिन से प्रतीक्षा`],
  [/^Oldest waiting (\d+) days?$/, (_, n) => `सबसे पुराना ${n} दिन से`],
  [/^Oldest (\d+) days overdue$/, (_, n) => `सबसे पुराना ${n} दिन विलंबित`],
  [/^No update for (\d+) days$/, (_, n) => `${n} दिन से कोई अद्यतन नहीं`],
  [/^Evaluated (\d+) days ago$/, (_, n) => `${n} दिन पहले जाँचा गया`],
  [/^(\d+) pending · (\d+) sent back$/, (_, a, b) => `${a} लंबित · ${b} लौटाए`],
  [/^(improved confirmed|improved indicative|below target|no change|worsened|inconclusive) \((.+)\)$/, (_, c, x) => `${EXACT[c]} (${x})`],
  [/^Class (\d) (.+)$/, (all, g, c) => (COMP_HI[c.toLowerCase()] ? `कक्षा ${g} ${COMP_HI[c.toLowerCase()]}` : all)],
];

/** One piece of report text, as a Hindi reader should see it. */
function one(text: string): string {
  const t = text.trim();
  if (EXACT[t]) return EXACT[t];
  // "2 task(s) overdue; 1 proof pending; <blocker typed by someone>"
  if (t.includes('; ')) {
    const parts = t.split('; ');
    if (parts.some((p) => /^\d+ (task\(s\) overdue|proof pending)$/.test(p))) {
      return parts.map((p) => p.replace(/^(\d+) task\(s\) overdue$/, '$1 काम विलंबित').replace(/^(\d+) proof pending$/, '$1 सबूत लंबित')).join('; ');
    }
  }
  for (const [re, f] of PATTERNS) { const m = re.exec(t); if (m) return f(...m); }
  return text;
}

/** A translator for report text in this language: identity in English. */
export function reportText(lang: Language): (text: string) => string {
  return lang === 'hi' ? one : (text) => text;
}

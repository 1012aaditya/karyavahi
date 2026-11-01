import type { Language } from '@domain/types';

/**
 * Notifications in the reader's language.
 *
 * A notification is stored once, in English, when it is raised (write.ts notify(), the reminder
 * sweep, the seed). That stored text stays the record. A Hindi reader sees it translated here at
 * display time: the kind gets a Hindi name, and the title is matched against the shapes the code
 * writes, with its ids, names and numbers carried across. Record text inside (a task or case
 * title, a reason someone typed) is data and is left as stored. A title of a shape this file does
 * not know falls back to the stored English, so nothing is ever lost.
 */

/** The kind's own name, shown on the chip beside each notification. */
export const KIND_HI: Record<string, string> = {
  approval_request: 'स्वीकृति अनुरोध',
  assignment: 'नया काम',
  acknowledgement: 'काम स्वीकारा',
  deadline_upcoming: 'समय-सीमा निकट',
  task_overdue: 'काम विलंबित',
  escalation: 'ऊपर भेजा गया',
  evidence_submitted: 'सबूत जमा',
  evidence_rejected: 'सबूत लौटाया',
  outcome_available: 'परिणाम तैयार',
  case_closed: 'प्रकरण बंद',
  case_reopened: 'प्रकरण फिर खुला',
  import_succeeded: 'आयात सफल',
  import_failed: 'आयात विफल',
  report_generated: 'रिपोर्ट तैयार',
  complaint_assigned: 'नई शिकायत',
  complaint_update: 'शिकायत अद्यतन',
  complaint_escalated: 'शिकायत ऊपर भेजी',
  registration: 'खाता अनुरोध',
  delegation: 'कार्यभार',
  mention: 'उल्लेख',
  case_comment: 'टिप्पणी',
  decision_recorded: 'निर्णय दर्ज',
};

/** Complaint statuses as the complaint pages name them in Hindi. */
const COMPLAINT_STATUS_HI: Record<string, string> = {
  'Draft': 'मसौदा', 'Acknowledgement pending': 'पावती लंबित', 'Acknowledged': 'पावती दी गई', 'Assigned': 'सौंपी गई',
  'Under investigation': 'जाँच जारी', 'Information requested': 'जानकारी माँगी गई', 'Resolution proposed': 'समाधान प्रस्तावित',
  'Awaiting verification': 'सत्यापन प्रतीक्षित', 'Escalated': 'आगे बढ़ाई गई', 'Reopened': 'फिर खोली गई',
  'Resolved': 'हल हुई', 'Rejected with reason': 'कारण सहित अस्वीकृत', 'Closed': 'बंद',
};

type Rule = [RegExp, (...m: string[]) => string];

/** Every title shape the app and the seed write, in Hindi. The first match wins. */
const TITLES: Rule[] = [
  // tasks and the reminder sweep
  [/^New task assigned( to you)?$/, () => 'आपको नया काम सौंपा गया'],
  [/^Task reassigned to you$/, () => 'काम आपको सौंपा गया'],
  [/^A task has moved to someone else$/, () => 'आपका काम किसी और को सौंपा गया'],
  [/^Headmaster acknowledged a task$/, () => 'प्रधानाध्यापक ने काम स्वीकारा'],
  [/^Due in (\d+) days$/, (_, n) => `${n} दिन में नियत`],
  [/^Due tomorrow$/, () => 'कल तक नियत'],
  [/^Due today$/, () => 'आज नियत'],
  [/^Task overdue$/, () => 'काम विलंबित'],
  [/^Overdue in your block$/, () => 'आपके खंड में विलंबित काम'],
  [/^Escalation: task (\d+) days overdue$/, (_, n) => `ज़िले को भेजा: काम ${n} दिन से विलंबित`],
  [/^Escalated to (DEO|BEO|State)$/, (_, r) => `${r === 'State' ? 'राज्य' : r} को भेजा गया`],
  // proof
  [/^Proof (waiting for your check|to check)$/, () => 'सबूत आपकी जाँच की प्रतीक्षा में'],
  [/^Proof sent back$/, () => 'सबूत लौटाया गया'],
  // cases and plans
  [/^New case in your queue$/, () => 'आपकी सूची में नया प्रकरण'],
  [/^Plan waiting for your decision$/, () => 'योजना आपके निर्णय की प्रतीक्षा में'],
  [/^Plan approved$/, () => 'योजना स्वीकृत'],
  [/^Plan sent back for changes$/, () => 'योजना बदलाव के लिए लौटाई गई'],
  [/^Outcome check ready$/, () => 'परिणाम जाँच तैयार'],
  [/^Case closed on (a )?verified outcome$/, () => 'पुष्ट परिणाम पर प्रकरण बंद'],
  [/^Case closed in your district$/, () => 'आपके ज़िले में प्रकरण बंद'],
  [/^Case reopened in your district$/, () => 'आपके ज़िले में प्रकरण फिर खुला'],
  [/^Case reopened$/, () => 'प्रकरण फिर खुला'],
  [/^ATR ready$/, () => 'कार्यवाही रिपोर्ट (ATR) तैयार'],
  // case threads
  [/^(.+) mentioned you on ([A-Z]+-\d+)$/, (_, who, id) => `${who} ने ${id} पर आपका उल्लेख किया`],
  [/^(.+) commented on ([A-Z]+-\d+)$/, (_, who, id) => `${who} ने ${id} पर टिप्पणी की`],
  [/^Decision recorded on ([A-Z]+-\d+)$/, (_, id) => `${id} पर निर्णय दर्ज`],
  // data imports
  [/^Import committed with rejected rows$/, () => 'आयात दर्ज, कुछ पंक्तियाँ अस्वीकृत'],
  [/^Import committed$/, () => 'आयात दर्ज'],
  [/^Import failed$/, () => 'आयात विफल'],
  // complaints
  [/^New complaint ([A-Z]+-\d+): (.+)$/, (_, id, t) => `नई शिकायत ${id}: ${t}`],
  [/^Escalated to you: ([A-Z]+-\d+)$/, (_, id) => `आपको भेजी गई: ${id}`],
  [/^([A-Z]+-\d+) escalated$/, (_, id) => `${id} आगे बढ़ाई गई`],
  [/^([A-Z]+-\d+): (.+)$/, (all, id, st) => (COMPLAINT_STATUS_HI[st] ? `${id}: ${COMPLAINT_STATUS_HI[st]}` : all)],
  // accounts and acting charge
  [/^Account request ([A-Z]+-[\w-]+) reassigned to you$/, (_, id) => `खाता अनुरोध ${id} आपको सौंपा गया`],
  [/^Account request ([A-Z]+-[\w-]+): (.+)$/, (_, id, who) => `खाता अनुरोध ${id}: ${who}`],
  [/^Change request ([A-Z]+-[\w-]+): (.+)$/, (_, id, who) => `बदलाव अनुरोध ${id}: ${who}`],
  [/^Your request ([A-Z]+-[\w-]+): rejected$/, (_, id) => `आपका अनुरोध ${id}: अस्वीकृत`],
  [/^Your request ([A-Z]+-[\w-]+): more information needed$/, (_, id) => `आपका अनुरोध ${id}: और जानकारी चाहिए`],
  [/^Acting charge: (.+)$/, (_, what) => `कार्यवाहक प्रभार: ${what}`],
];

/** The few bodies the code writes itself (the rest is record text and stays as stored). */
const OUTCOME_HI: Record<string, string> = {
  'improved confirmed': 'सुधार पुष्ट', 'improved indicative': 'सुधार के संकेत', 'below target': 'लक्ष्य से कम',
  'no change': 'कोई बदलाव नहीं', 'worsened': 'और गिरावट', 'inconclusive': 'अनिर्णायक',
};
const BODIES: Rule[] = [
  [/^Action Taken Report for (\d{4}-\d{2})$/, (_, m) => `${m} की कार्यवाही रिपोर्ट`],
  [/^Acknowledge by (\S+)\.$/, (_, d) => `${d} तक पावती दें।`],
  [/^Now with (.+)\.$/, (_, who) => `अब ${who} के पास।`],
  [/^([A-Z]+) for (\S+)\. Awaiting your approval\.$/, (_, r, sc) => `${sc} के लिए ${r}। आपकी स्वीकृति की प्रतीक्षा।`],
  [/^Wants ([A-Z]+) at (\S+)\.$/, (_, r, sc) => `${sc} पर ${r} चाहते हैं।`],
  [/^(.+\.csv): (\d+) rows accepted, (\d+) rejected$/, (_, f, a, r) => `${f}: ${a} पंक्तियाँ स्वीकृत, ${r} अस्वीकृत`],
  [/^(.+\.csv): (\d+) rows accepted$/, (_, f, a) => `${f}: ${a} पंक्तियाँ स्वीकृत`],
  [/^(.+): (improved confirmed|improved indicative|below target|no change|worsened|inconclusive)$/, (_, t, c) => `${t}: ${OUTCOME_HI[c]}`],
  [/^(.+) · due (\d{4}-\d{2}-\d{2})$/, (_, rest, d) => `${rest} · नियत तिथि ${d}`],
  [/^(.+), due (\d{4}-\d{2}-\d{2})$/, (_, rest, d) => `${rest}, नियत तिथि ${d}`],
];

const apply = (rules: Rule[], text: string): string | null => {
  for (const [re, fn] of rules) {
    const m = re.exec(text);
    if (m) return fn(...m);
  }
  return null;
};

export interface NotificationText { kind: string; title: string; body: string }

/**
 * What a reader sees for one notification. `taskTitleHi` is the task's own Hindi title when the
 * notification is about a task: a body that quotes the English title shows the Hindi one instead.
 */
export function notificationText(
  n: { kind: string; title: string; body: string },
  lang: Language,
  taskTitle?: { en: string; hi: string | null },
): NotificationText {
  if (lang !== 'hi') return { kind: n.kind.replace(/_/g, ' '), title: n.title, body: n.body };
  let body = n.body;
  if (taskTitle?.hi && body.startsWith(taskTitle.en)) body = taskTitle.hi + body.slice(taskTitle.en.length);
  return {
    kind: KIND_HI[n.kind] ?? n.kind.replace(/_/g, ' '),
    title: apply(TITLES, n.title) ?? n.title,
    body: apply(BODIES, body) ?? body,
  };
}

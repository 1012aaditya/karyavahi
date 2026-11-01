/**
 * The words of a priority item (overview.ts priorityActions) in Hindi.
 *
 * The English is built once, in priorityActions, and reports quote it in their snapshots. A
 * Hindi reader sees it translated at display time: the plain brief on the home page and the
 * "Decisions and actions needed" table in a review pack both come through here. Record text
 * inside (a task, case or complaint title) stays as stored; a shape not listed here stays in
 * English, so nothing is ever lost.
 */

const ACTION_HI: Record<string, string> = {
  'Review plan': 'योजना देखें', 'Open task': 'काम खोलें', 'Open case work': 'प्रकरण का काम खोलें', 'Check proof': 'सबूत जाँचें',
  'Review outcome': 'परिणाम देखें', 'Continue diagnosis': 'निदान जारी रखें', 'See findings': 'निष्कर्ष देखें', 'Acknowledge': 'पावती दें', 'Respond': 'जवाब दें',
};

const TITLE_HI: [RegExp, (...m: string[]) => string][] = [
  [/^Decide the plan for (CASE-\d+)$/, (_, id) => `${id} की योजना पर निर्णय लें`],
  [/^(CASE-\d+): (\d+) tasks overdue$/, (_, id, n) => `${id}: ${n} काम विलंबित`],
  [/^Verify (\d+) proof submissions? for (CASE-\d+)$/, (_, n, id) => `${id} के ${n} सबूत जाँचें`],
  [/^(CASE-\d+): work delivered, gain not demonstrated$/, (_, id) => `${id}: काम पूरा, पर सुधार नहीं दिखा`],
  [/^(CASE-\d+) has been under investigation for (\d+) days$/, (_, id, n) => `${id} ${n} दिन से जाँच में है`],
  [/^(\d+) possible declines? blocked by data quality in (.+)$/, (_, n, code) => `${code} में ${n} संभावित गिरावटें डेटा गुणवत्ता के कारण रुकीं`],
];

const OUTCOME_HI: Record<string, string> = {
  'improved confirmed': 'सुधार — पुष्ट', 'improved indicative': 'सुधार — संकेतात्मक', 'below target': 'लक्ष्य से कम',
  'no change': 'कोई बदलाव नहीं', worsened: 'और बिगड़ा', inconclusive: 'अनिर्णीत',
};
const COMPLAINT_STATUS_HI: Record<string, string> = {
  'Acknowledgement pending': 'पावती लंबित', 'Acknowledged': 'पावती दी गई', 'Assigned': 'सौंपी गई', 'Under investigation': 'जाँच जारी',
  'Information requested': 'जानकारी माँगी गई', 'Resolution proposed': 'समाधान प्रस्तावित', 'Awaiting verification': 'सत्यापन प्रतीक्षित',
  'Escalated': 'आगे बढ़ाई गई', 'Reopened': 'फिर खोली गई',
};

/** The detail line under a priority. */
const DETAIL_HI: [RegExp, (...m: string[]) => string][] = [
  [/^Escalated to the district\.$/, () => 'ज़िले को भेजा गया।'],
  [/^Past the 7-day escalation line\.$/, () => '7 दिन की सीमा पार।'],
  [/^Delivery cannot count until someone other than the submitter accepts it\.$/, () => 'जब तक जमा करने वाले के अलावा कोई और न स्वीकारे, काम नहीं गिना जाता।'],
  [/^Outcome check: ([a-z ]+)(, ([+-]?[\d.]+) pp vs comparison)?\. Review and decide whether to reopen\.$/,
    (_, c, __, pp) => `परिणाम जाँच: ${OUTCOME_HI[c] ?? c}${pp ? `, तुलना की अपेक्षा ${pp} pp` : ''}। देखें और तय करें कि फिर खोलना है या नहीं।`],
  [/^Low participation or too few schools reporting\. These are unknowns, not “no problem”\.$/, () => 'कम भागीदारी या बहुत कम विद्यालयों की रिपोर्ट। ये अज्ञात हैं, “कोई समस्या नहीं” नहीं।'],
  [/^([A-Z]+-\d+) · complaint · (.+)$/, (_, id, st) => `${id} · शिकायत · ${COMPLAINT_STATUS_HI[st] ?? st}`],
  // "<task>; <task> and 3 more. 5 escalated to the district." — task titles stay as stored.
  [/^([\s\S]+?)( and (\d+) more)?\.( (\d+) escalated to the district\.)?$/,
    (all, list, _m, more, _e, esc) => (more || esc ? `${list}${more ? ` और ${more} अन्य` : ''}।${esc ? ` ${esc} ज़िले को भेजे गए।` : ''}` : all)],
];

/** Who a priority waits on. */
const OWNER_HI: Record<string, string> = { 'You': 'आप', 'Data team': 'डेटा दल', 'State': 'राज्य', 'HEADMASTER': 'प्रधानाध्यापक' };

/** When: the age or deadline of a priority. */
const WHEN_HI: [RegExp, (...m: string[]) => string][] = [
  [/^Submitted today$/, () => 'आज जमा'],
  [/^Waiting (\d+) days?$/, (_, n) => `${n} दिन से प्रतीक्षा`],
  [/^Oldest waiting (\d+) days?$/, (_, n) => `सबसे पुराना ${n} दिन से`],
  [/^Oldest (\d+) days overdue$/, (_, n) => `सबसे पुराना ${n} दिन विलंबित`],
  [/^Evaluated (\d+) days ago$/, (_, n) => `${n} दिन पहले जाँचा गया`],
  [/^No update for (\d+) days$/, (_, n) => `${n} दिन से कोई अद्यतन नहीं`],
  [/^(\d+)d overdue to (acknowledge|resolve)$/, (_, n, w) => `${w === 'acknowledge' ? 'पावती' : 'समाधान'} में ${n} दिन विलंब`],
  [/^(\d+)d to (acknowledge|resolve)$/, (_, n, w) => `${w === 'acknowledge' ? 'पावती' : 'समाधान'} हेतु ${n} दिन`],
  [/^(acknowledge|resolve) (today|tomorrow)$/, (_, w, d) => `${w === 'acknowledge' ? 'पावती' : 'समाधान'} ${d === 'today' ? 'आज' : 'कल'} तक`],
  [/^Open$/, () => 'खुली'],
];

const first = (rules: [RegExp, (...m: string[]) => string][], text: string): string | null => {
  for (const [re, f] of rules) { const m = re.exec(text); if (m) return f(...m); }
  return null;
};

export const priorityTitleHi = (t: string): string => first(TITLE_HI, t) ?? t;
export const priorityActionHi = (a: string): string => ACTION_HI[a] ?? a;
export const priorityDetailHi = (d: string): string => first(DETAIL_HI, d) ?? d;
export const priorityWhenHi = (w: string): string | null => first(WHEN_HI, w);
/** "BEO / BRC", "Data team / BEO", "HEADMASTER, CRC": each part translated where it has a Hindi name. */
export const priorityOwnerHi = (o: string): string | null => {
  const parts = o.split(/( \/ |, )/);
  const out = parts.map((p) => OWNER_HI[p] ?? p).join('');
  return out === o ? null : out;
};

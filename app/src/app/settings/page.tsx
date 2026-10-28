import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { settingVersions, userNames } from '@/lib/repo';
import { may } from '@/lib/guard';
import { pick } from '@/lib/i18n';
import { Card, CardHead, PageHead, Callout, Facts, Field, Mono, fmtDate } from '@/components/ui';
import { Pill } from '@/components/labels';
import { ActionForm, ReasonBox } from '@/components/ActionForm';
import { saveSettingsAction } from '@/lib/actions';
import { currentSettings } from '@/lib/settings';
import { today } from '@/lib/clock';
import { ACTIONS, MATRIX, ROLE_LABELS } from '@domain/permissions';
import type { RoleCode } from '@domain/types';

/**
 * The thresholds, kept as versions.
 *
 * These numbers decide what becomes a case and what counts as success, so changing them
 * silently would make every historical judgement unreadable. Each version records what changed,
 * who changed it and when it took effect, and every finding and outcome evaluation stores the
 * version it was judged under.
 */

const GRANT_LABEL: Record<string, { en: string; hi: string; tone: 'good' | 'warn' | 'neutral' | 'active' }> = {
  yes: { en: 'yes', hi: 'हाँ', tone: 'good' },
  own: { en: 'own only', hi: 'केवल अपना', tone: 'active' },
  spot: { en: 'spot-check', hi: 'त्वरित जाँच', tone: 'active' },
  propose: { en: 'may propose', hi: 'प्रस्ताव', tone: 'warn' },
  raise: { en: 'may raise', hi: 'चिंता दर्ज', tone: 'warn' },
  no: { en: '—', hi: '—', tone: 'neutral' },
};

/** One number box. The thresholds are all numbers, so the editor is twenty of these and a reason. */
function Num({ name, label, value, step = 'any', suffix }: {
  name: string; label: string; value: number; step?: string; suffix?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input type="number" name={name} defaultValue={value} step={step} required className="input tnum w-28" />
        {suffix ? <span className="text-[12.5px] text-ink-faint">{suffix}</span> : null}
      </span>
    </label>
  );
}

export default async function SettingsPage() {
  const session = await pageSession();
  const lang = await getLanguage();
  const versions = settingVersions();
  const users = userNames(versions.map((v) => v.changed_by));
  const roles = Object.keys(ROLE_LABELS) as RoleCode[];
  const canConfigure = may(session, 'settings.configure');
  const curr = currentSettings();

  return (
    <div className="space-y-4">
      <PageHead
        title={pick(lang, 'Settings', 'सेटिंग')}
        sub={pick(
          lang,
          'Thresholds and permissions. Every finding and every outcome evaluation records which version of these it was judged under.',
          'सीमाएँ और अनुमतियाँ। हर निष्कर्ष और परिणाम जाँच अपने संस्करण सहित दर्ज है।',
        )}
      />

      {!canConfigure ? (
        <Callout tone="method">
          {pick(
            lang,
            'You can read the configuration but not change it. Only the state programme team configures thresholds, because a change here alters what every block is measured by.',
            'आप सेटिंग पढ़ सकते हैं, बदल नहीं सकते। केवल राज्य दल सीमाएँ तय करता है।',
          )}
        </Callout>
      ) : (
        <Callout tone="warn" title={pick(lang, 'Changing these changes everybody\'s workload', 'इन्हें बदलने से सबका काम बदलता है')}>
          {pick(
            lang,
            'Lowering the materiality threshold opens more cases; raising the minimum cluster size opens fewer but trusts each one more. Historical findings keep the version they were judged under, so past decisions stay readable.',
            'सीमा घटाने पर अधिक प्रकरण खुलेंगे; न्यूनतम संख्या बढ़ाने पर कम, पर अधिक विश्वसनीय। पुराने निष्कर्ष अपने संस्करण पर बने रहते हैं।',
          )}
        </Callout>
      )}

      {canConfigure ? (
        <Card>
          <CardHead
            title={pick(lang, 'Change the thresholds', 'सीमाएँ बदलें')}
            hint={pick(lang, 'Saves a new version; nothing existing is altered', 'नया संस्करण बनेगा; पुराना वैसा ही रहेगा')}
          />
          <Callout tone="method" title={pick(lang, 'What saving does', 'सहेजने पर क्या होगा')}>
            {pick(
              lang,
              `This writes a new version, in force from ${fmtDate(today())} — the demo date, not the one on your computer. ${curr.id} and every version before it stay exactly as they are, and each finding, plan and outcome evaluation already on the record keeps the version it was judged under. Resetting the demo discards it along with everything else.`,
              `यह ${fmtDate(today())} से प्रभावी नया संस्करण बनाता है। ${curr.id} और उससे पुराने संस्करण वैसे ही रहेंगे, और पुराने निष्कर्ष अपने संस्करण पर बने रहेंगे। डेमो रीसेट करने पर यह भी हट जाएगा।`,
            )}
          </Callout>

          <ActionForm action={saveSettingsAction} label={pick(lang, 'Save as a new version', 'नया संस्करण सहेजें')}>
            <div className="mb-3 mt-3 space-y-4">
              <section>
                <h3 className="label mb-2">{pick(lang, 'Opening a case', 'प्रकरण खोलना')}</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Num name="materiality_pp" label={pick(lang, 'Materiality', 'सामग्रीता')} value={curr.detection.materiality_pp} suffix="pp" />
                  <Num name="z_threshold" label={pick(lang, 'z threshold', 'z सीमा')} value={curr.detection.z_threshold} />
                  <Num name="min_cluster_assessed" label={pick(lang, 'Minimum children assessed', 'न्यूनतम आकलित छात्र')} value={curr.detection.min_cluster_assessed} step="1" />
                  <Num name="min_school_reporting_share" label={pick(lang, 'Minimum schools reporting', 'न्यूनतम विद्यालय')} value={curr.detection.min_school_reporting_share} suffix={pick(lang, 'share 0-1', 'अनुपात 0-1')} />
                  <Num name="det_min_participation" label={pick(lang, 'Minimum participation', 'न्यूनतम सहभागिता')} value={curr.detection.min_participation} suffix={pick(lang, 'share 0-1', 'अनुपात 0-1')} />
                  <Num name="driver_cumulative_share" label={pick(lang, 'Driver schools covered', 'चिन्हित विद्यालय कवरेज')} value={curr.detection.driver_cumulative_share} suffix={pick(lang, 'share 0-1', 'अनुपात 0-1')} />
                  <Num name="max_driver_schools" label={pick(lang, 'At most driver schools', 'अधिकतम चिन्हित विद्यालय')} value={curr.detection.max_driver_schools} step="1" />
                  <Num name="severity_critical_pp" label={pick(lang, 'Critical at', 'गंभीर')} value={curr.detection.severity_critical_pp} suffix="pp" />
                  <Num name="severity_high_pp" label={pick(lang, 'High at', 'उच्च')} value={curr.detection.severity_high_pp} suffix="pp" />
                </div>
              </section>

              <section>
                <h3 className="label mb-2">{pick(lang, 'Judging the outcome', 'परिणाम जाँच')}</h3>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Num name="success_threshold_pp" label={pick(lang, 'Must gain at least', 'न्यूनतम सुधार')} value={curr.outcome.success_threshold_pp} suffix="pp" />
                  <Num name="participation_floor_ratio" label={pick(lang, 'Participation floor', 'सहभागिता न्यूनतम')} value={curr.outcome.participation_floor_ratio} suffix={pick(lang, 'of baseline', 'आधार का')} />
                  <Num name="out_min_participation" label={pick(lang, 'Absolute participation floor', 'पूर्ण न्यूनतम सहभागिता')} value={curr.outcome.min_participation} suffix={pick(lang, 'share 0-1', 'अनुपात 0-1')} />
                  <Num name="comparison_schools_per_treated" label={pick(lang, 'Comparison schools each', 'प्रति विद्यालय तुलना')} value={curr.outcome.comparison_schools_per_treated} step="1" />
                </div>
              </section>

              <section>
                <h3 className="label mb-2">{pick(lang, 'Diagnosis thresholds', 'निदान सीमाएँ')}</h3>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Num name="visit_gap_days" label={pick(lang, 'Visit gap', 'भ्रमण अंतराल')} value={curr.diagnosis.visit_gap_days} step="1" suffix={pick(lang, 'days', 'दिन')} />
                  <Num name="attendance_drop_pp" label={pick(lang, 'Attendance drop', 'उपस्थिति गिरावट')} value={curr.diagnosis.attendance_drop_pp} suffix="pp" />
                  <Num name="teacher_transfer_window_days" label={pick(lang, 'Teacher transfer window', 'शिक्षक स्थानांतरण अवधि')} value={curr.diagnosis.teacher_transfer_window_days} step="1" suffix={pick(lang, 'days', 'दिन')} />
                  <Num name="ptr_threshold" label={pick(lang, 'High pupil-teacher ratio', 'उच्च छात्र-शिक्षक अनुपात')} value={curr.diagnosis.ptr_threshold} step="1" />
                </div>
              </section>

              <section>
                <h3 className="label mb-2">{pick(lang, 'Reminders', 'स्मरण')}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Num name="reminder_days_before_due" label={pick(lang, 'Reminder before the deadline', 'नियत तिथि से पहले स्मरण')} value={curr.reminders.reminder_days_before_due} step="1" suffix={pick(lang, 'days', 'दिन')} />
                  <Num name="escalation_days_overdue" label={pick(lang, 'Escalate after', 'उच्चाधिकारी को')} value={curr.reminders.escalation_days_overdue} step="1" suffix={pick(lang, 'days overdue', 'दिन बाद')} />
                </div>
              </section>

              <label className="block">
                <span className="label">{pick(lang, 'A case may only close when', 'प्रकरण तभी बंद हो')}</span>
                <textarea
                  name="closure_rules" rows={5} required
                  defaultValue={curr.closure_rules.join('\n')}
                  className="input mt-1 resize-y"
                />
                <span className="mt-1 block text-[12.5px] text-ink-faint">{pick(lang, 'One condition per line.', 'हर पंक्ति में एक शर्त।')}</span>
              </label>

              <ReasonBox
                name="change_note" required
                label={pick(lang, 'Why this change', 'यह बदलाव क्यों')}
                placeholder={pick(lang, 'What prompted it, and what you expect it to do to the caseload.', 'कारण, और प्रकरणों पर क्या असर अपेक्षित है।')}
              />
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {[...versions].reverse().map((v, idx) => (
        <Card key={v.id}>
          <CardHead
            title={`${pick(lang, 'Version', 'संस्करण')} ${v.version}`}
            hint={`${pick(lang, 'in force from', 'प्रभावी')} ${fmtDate(v.effective_from)} · ${pick(lang, 'set by', 'द्वारा')} ${users.get(v.changed_by) ?? v.changed_by} ${fmtDate(v.created_at)}`}
            right={idx === 0 ? <Pill tone="good">{pick(lang, 'current', 'वर्तमान')}</Pill> : <Pill>{pick(lang, 'superseded', 'अधिक्रमित')}</Pill>}
          />
          <div className="card-pad space-y-4">
            <Callout tone="method" title={pick(lang, 'Why it changed', 'क्यों बदला')}>{v.change_note}</Callout>

            <div>
              <h3 className="h-section mb-2">{pick(lang, 'Opening a case', 'प्रकरण खोलना')}</h3>
              <Facts cols={4}>
                <Field label={pick(lang, 'Materiality', 'न्यूनतम अंतर')} hint={pick(lang, 'drop beyond the district', 'ज़िले से अधिक गिरावट')}>
                  <span className="tnum">{v.detection.materiality_pp} pp</span>
                </Field>
                <Field label={pick(lang, 'z threshold', 'z सीमा')}><span className="tnum">−{v.detection.z_threshold}</span></Field>
                <Field label={pick(lang, 'Minimum children assessed', 'न्यूनतम आकलित बच्चे')}><span className="tnum">{v.detection.min_cluster_assessed}</span></Field>
                <Field label={pick(lang, 'Minimum schools reporting', 'न्यूनतम रिपोर्टिंग')}><span className="tnum">{Math.round(v.detection.min_school_reporting_share * 100)}%</span></Field>
                <Field label={pick(lang, 'Minimum participation', 'न्यूनतम भागीदारी')}><span className="tnum">{Math.round(v.detection.min_participation * 100)}%</span></Field>
                <Field label={pick(lang, 'Driver schools covered', 'चिन्हित विद्यालय')}><span className="tnum">{Math.round(v.detection.driver_cumulative_share * 100)}%</span></Field>
                <Field label={pick(lang, 'At most driver schools', 'अधिकतम विद्यालय')}><span className="tnum">{v.detection.max_driver_schools}</span></Field>
                <Field label={pick(lang, 'Critical / high at', 'अति गंभीर / गंभीर')}>
                  <span className="tnum">{v.detection.severity_critical_pp} / {v.detection.severity_high_pp} pp</span>
                </Field>
              </Facts>
            </div>

            <div>
              <h3 className="h-section mb-2">{pick(lang, 'Judging the outcome', 'परिणाम का निर्णय')}</h3>
              <Facts cols={4}>
                <Field label={pick(lang, 'Must gain at least', 'न्यूनतम सुधार')}><span className="tnum">+{v.outcome.success_threshold_pp} pp</span></Field>
                <Field label={pick(lang, 'Participation floor', 'भागीदारी न्यूनतम')} hint={pick(lang, 'share of the baseline', 'आधार का अनुपात')}>
                  <span className="tnum">{Math.round(v.outcome.participation_floor_ratio * 100)}%</span>
                </Field>
                <Field label={pick(lang, 'Absolute participation floor', 'पूर्ण न्यूनतम भागीदारी')}><span className="tnum">{Math.round(v.outcome.min_participation * 100)}%</span></Field>
                <Field label={pick(lang, 'Comparison schools each', 'प्रति विद्यालय तुलना')}><span className="tnum">{v.outcome.comparison_schools_per_treated}</span></Field>
              </Facts>
            </div>

            <div>
              <h3 className="h-section mb-2">{pick(lang, 'Diagnosis thresholds', 'निदान सीमाएँ')}</h3>
              <Facts cols={4}>
                <Field label={pick(lang, 'Visit gap', 'भ्रमण अंतराल')}><span className="tnum">{v.diagnosis.visit_gap_days} {pick(lang, 'days', 'दिन')}</span></Field>
                <Field label={pick(lang, 'Attendance drop', 'उपस्थिति गिरावट')}><span className="tnum">{v.diagnosis.attendance_drop_pp} pp</span></Field>
                <Field label={pick(lang, 'Teacher transfer window', 'स्थानांतरण अवधि')}><span className="tnum">{v.diagnosis.teacher_transfer_window_days} {pick(lang, 'days', 'दिन')}</span></Field>
                <Field label={pick(lang, 'High pupil–teacher ratio', 'उच्च अनुपात')}><span className="tnum">{v.diagnosis.ptr_threshold}</span></Field>
              </Facts>
            </div>

            <div>
              <h3 className="h-section mb-2">{pick(lang, 'Reminders', 'स्मरण')}</h3>
              <Facts cols={2}>
                <Field label={pick(lang, 'Reminder before the deadline', 'नियत तिथि से पहले')}>
                  <span className="tnum">{v.reminders.reminder_days_before_due} {pick(lang, 'days', 'दिन')}</span>
                </Field>
                <Field label={pick(lang, 'Escalate after', 'उच्चाधिकारी को')}>
                  <span className="tnum">{v.reminders.escalation_days_overdue} {pick(lang, 'days overdue', 'दिन विलंब')}</span>
                </Field>
              </Facts>
            </div>

            <div>
              <h3 className="h-section mb-1.5">{pick(lang, 'A case may only close when', 'प्रकरण तभी बंद हो सकता है जब')}</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink">
                {v.closure_rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>

            <p className="text-[12px] text-ink-faint"><Mono>{v.id}</Mono></p>
          </div>
        </Card>
      ))}

      <Card>
        <CardHead
          title={pick(lang, 'Who may do what', 'कौन क्या कर सकता है')}
          hint={pick(
            lang,
            'The full permission matrix. The server checks this on every write, and the navigation is built from it, so a role never sees a link to something it would be refused.',
            'पूरी अनुमति तालिका। सर्वर हर लेखन पर जाँचता है, और नेविगेशन इसी से बनता है।',
          )}
        />
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{pick(lang, 'Action', 'कार्य')}</th>
                {roles.map((r) => (
                  <th key={r} scope="col" className="whitespace-nowrap">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a}>
                  <td className="whitespace-nowrap"><Mono>{a}</Mono></td>
                  {roles.map((r) => {
                    const g = MATRIX[a][r];
                    const l = GRANT_LABEL[g];
                    return (
                      <td key={r}>
                        {g === 'no'
                          ? <span className="text-ink-faint">—</span>
                          : <Pill tone={l.tone}>{pick(lang, l.en, l.hi)}</Pill>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-ink-soft sm:px-5">
          {pick(
            lang,
            '"own only" means records assigned to or submitted by that user. "spot-check" means verifying other people\'s proof by going and looking. "may propose" and "may raise" mean the role can put something forward that a block officer then decides.',
            '"केवल अपना" का अर्थ उस उपयोगकर्ता के रिकॉर्ड। "त्वरित जाँच" का अर्थ जाकर देखकर दूसरों का सबूत जाँचना। "प्रस्ताव" और "चिंता दर्ज" का अर्थ खंड अधिकारी निर्णय लेंगे।',
          )}
        </div>
      </Card>
    </div>
  );
}

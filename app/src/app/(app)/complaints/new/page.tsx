import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { categories, routeFor, routeHi, CATEGORY_HI } from '@/lib/complaints';
import { can } from '@/lib/authz';
import { pathOf, chainAbove, managerOf, type ScopeType } from '@/lib/org';
import { all } from '@/lib/db';
import { schoolsPred } from '@/lib/scope';
import { userNames } from '@/lib/repo';
import { pick } from '@/lib/i18n';
import { PageHead, Callout } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ActionForm } from '@/components/ActionForm';
import { NoteMic } from '@/components/voice';
import { createComplaintAction } from '@/lib/actions';

/**
 * Raise a complaint. Before submitting, the officer sees exactly who each category will go to
 * — computed with the same routing rules the server applies on submit.
 */

const LEVEL_HI: Record<string, string> = { school: 'विद्यालय', cluster: 'संकुल', block: 'खंड', district: 'ज़िला', state: 'राज्य' };

export default async function NewComplaint({ searchParams }: { searchParams: Promise<{ category?: string; case?: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;
  const L = (en: string, hi: string) => pick(lang, en, hi);
  const hi = lang === 'hi';
  if (!can(session, 'create_complaint')) {
    return <div className="mx-auto max-w-2xl"><PageHead title={L('Raise a complaint', 'शिकायत दर्ज करें')} /><Callout tone="warn">{L('Your role cannot raise complaints here.', 'आपकी भूमिका यहाँ शिकायत दर्ज नहीं कर सकती।')}</Callout></div>;
  }
  const cats = categories();
  const cat = cats.find((c) => c.key === sp.category) ?? null;
  const path = pathOf(session.scope_type as ScopeType, session.scope_id);
  const geo = { state_id: path?.state ?? null, district_id: path?.district ?? null, block_id: path?.block ?? null, cluster_id: path?.cluster ?? null };
  const chain = [managerOf(session.user_id), ...chainAbove(session.user_id)].filter((x): x is string => !!x);
  const names = userNames(chain);
  const routes = new Map(cats.map((c) => [c.key, routeFor(session.user_id, c.key, 'medium', geo, c.confidential_default ? chain[0] ?? null : null)]));
  const routeNames = userNames([...routes.values()].map((r) => r.assignee ?? ''));
  const roleOf = (id: string | null) => (id ? all<{ role: string }>('select role from user_roles where user_id = ? limit 1', id)[0]?.role?.toUpperCase() ?? '' : '');
  const schoolOptions = session.scope_type === 'school' ? [] : (() => {
    const p = schoolsPred(session, 'sc');
    return all<{ id: string; name: string }>(`select sc.id, sc.name from schools sc where ${p.sql} order by sc.name limit 400`, ...p.params);
  })();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHead
        breadcrumb={<Link href="/complaints" className="link">{pick(lang, 'Complaints', 'शिकायतें')}</Link>}
        title={pick(lang, 'Raise a complaint', 'शिकायत दर्ज करें')}
        sub={pick(lang, 'Choose what it is about. You will see who it goes to before you submit.', 'विषय चुनें। जमा करने से पहले आप देखेंगे कि यह किसे जाएगी।')}
      />

      <section aria-label={L('Category', 'श्रेणी')}>
        <h2 className="h-section mb-2">1 · {L('What is it about?', 'शिकायत किस बारे में है?')}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {cats.map((c) => {
            const r = routes.get(c.key)!;
            const on = c.key === cat?.key;
            return (
              <li key={c.key}>
                <Link href={`/complaints/new?category=${c.key}${sp.case ? `&case=${sp.case}` : ''}`} aria-current={on ? 'true' : undefined}
                  className={`flex h-full flex-col rounded-xl border bg-white p-3.5 shadow-card transition-all hover:shadow-lift ${on ? 'border-brand ring-2 ring-brand/25' : 'border-line'}`}>
                  <span className="flex items-center gap-2 text-base font-semibold text-ink">{c.confidential_default ? <Icon name="lock" size={14} className="text-crit" /> : null}{(hi ? CATEGORY_HI[c.key]?.label : undefined) ?? c.label}</span>
                  <span className="mt-0.5 text-sm leading-snug text-ink-soft">{(hi ? CATEGORY_HI[c.key]?.description : undefined) ?? c.description}</span>
                  <span className="mt-2 text-xs text-ink-faint"><Icon name="arrow-right" size={12} className="mr-1 inline" />{L('Goes to', 'किसे जाएगी:')} <strong className="font-medium text-ink-soft">{routeNames.get(r.assignee ?? '') ?? L('no authority configured', 'कोई अधिकारी तय नहीं')}</strong> {r.assignee ? `(${roleOf(r.assignee)})` : ''}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {cat ? (
        <section aria-label={L('Details', 'विवरण')} className="card p-5">
          <h2 className="h-section mb-3">2 · {L('Details', 'विवरण')}</h2>
          <ActionForm action={createComplaintAction} hidden={{ category: cat.key, ...(sp.case ? { case_id: sp.case } : {}) }} label={pick(lang, 'Submit complaint', 'शिकायत जमा करें')}>
            <div className="space-y-3">
              <label className="block"><span className="text-sm font-medium text-ink">{L('Title', 'शीर्षक')}</span>
                <input name="title" required minLength={6} maxLength={160} className="input mt-1" placeholder={L('One line: what is wrong', 'एक पंक्ति में: क्या गलत है')} /></label>
              <label className="block"><span className="text-sm font-medium text-ink">{L('What is happening', 'क्या हो रहा है')}</span>
                <textarea name="description" required minLength={15} rows={5} className="input mt-1 resize-y" placeholder={L('What happened, since when, and what it is stopping.', 'क्या हुआ, कब से, और इससे क्या रुक रहा है।')} /></label>
              <NoteMic field="description" lang={lang} className="!mb-0" />
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block"><span className="text-sm font-medium text-ink">{L('Priority', 'प्राथमिकता')}</span>
                  <select name="priority" defaultValue="medium" className="input mt-1">
                    <option value="low">{L('Low — can wait', 'कम — रुक सकती है')}</option><option value="medium">{L('Medium', 'मध्यम')}</option><option value="high">{L('High — work is stopped', 'अधिक — काम रुका है')}</option><option value="critical">{L('Critical — children affected today', 'अति गंभीर — आज बच्चे प्रभावित')}</option>
                  </select></label>
                <label className="block"><span className="text-sm font-medium text-ink">{L('Severity', 'गंभीरता')}</span>
                  <select name="severity" defaultValue="moderate" className="input mt-1">
                    <option value="low">{L('Low', 'कम')}</option><option value="moderate">{L('Moderate', 'मध्यम')}</option><option value="high">{L('High', 'अधिक')}</option><option value="critical">{L('Critical', 'अति गंभीर')}</option>
                  </select></label>
                {schoolOptions.length ? (
                  <label className="block"><span className="text-sm font-medium text-ink">{L('School (optional)', 'विद्यालय (वैकल्पिक)')}</span>
                    <select name="school_id" defaultValue="" className="input mt-1">
                      <option value="">{hi ? `मेरा पूरा ${LEVEL_HI[session.scope_type] ?? session.scope_type}` : `My whole ${session.scope_type}`}</option>
                      {schoolOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></label>
                ) : <input type="hidden" name="school_id" value={session.scope_id} />}
              </div>
              {cat.confidential_default ? (
                <div className="rounded-lg border border-crit/25 bg-crit-light/50 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-crit"><Icon name="lock" size={14} />{L('Restricted complaint', 'प्रतिबंधित शिकायत')}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{L('Visible only to you, the authority it is routed to, anyone it is later escalated to, and the state auditor. Never to the officer it concerns.', 'केवल आपको, जिस अधिकारी को भेजी गई उसे, बाद में जिसे ऊपर भेजी जाए उसे, और राज्य लेखा परीक्षक को दिखती है। संबंधित अधिकारी को कभी नहीं।')}</p>
                  <label className="mt-2 block"><span className="text-sm font-medium text-ink">{L('Which officer does it concern?', 'यह किस अधिकारी के बारे में है?')}</span>
                    <select name="accused_user_id" className="input mt-1" defaultValue={chain[0] ?? ''}>
                      {chain.map((u) => <option key={u} value={u}>{names.get(u) ?? u} ({roleOf(u)})</option>)}
                    </select></label>
                  <input type="hidden" name="restricted" value="1" />
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="restricted" value="1" className="h-4 w-4 accent-brand" />{L('Mark as restricted (sensitive; limits who can see it)', 'प्रतिबंधित करें (संवेदनशील; कौन देख सकता है यह सीमित होता है)')}</label>
              )}
              <p className="rounded-lg bg-paper-sunk px-3 py-2 text-sm text-ink-soft">
                <Icon name="arrow-right" size={13} className="mr-1 inline text-brand" />
                {hi ? (
                  <>{routes.get(cat.key)?.explicit ? routeHi(routes.get(cat.key)!.explicit!) : 'आपके निर्धारित अधिकारी को जाएगी।'} प्राप्तकर्ता: <strong className="text-ink">{routeNames.get(routes.get(cat.key)?.assignee ?? '') ?? '—'}</strong>।
                  {' '}अति गंभीर प्राथमिकता वाली स्टाफ़ और अवसंरचना की शिकायतें सीधे ज़िले को जा सकती हैं।</>
                ) : (
                  <>{routes.get(cat.key)?.explicit ?? 'Goes to your designated authority.'} Recipient: <strong className="text-ink">{routeNames.get(routes.get(cat.key)?.assignee ?? '') ?? '—'}</strong>.
                {' '}Critical priority may route directly to the district for staffing and infrastructure.</>
                )}
              </p>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}

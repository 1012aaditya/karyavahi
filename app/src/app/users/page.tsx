import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { listUsers, countUsers, userRoleCounts, roleAssignments, scopeName } from '@/lib/repo';
import { may } from '@/lib/guard';
import { pick } from '@/lib/i18n';
import { setUserStatusAction } from '@/lib/actions';
import { Card, CardHead, PageHead, Callout, Toolbar, Empty, Mono, Grid, Stat, fmtInt } from '@/components/ui';
import { Pill } from '@/components/labels';
import { ActionForm, Disclose, ReasonBox } from '@/components/ActionForm';
import { ROLE_LABELS } from '@domain/permissions';
import type { RoleCode } from '@domain/types';

/**
 * People and what they are allowed to reach.
 *
 * Authority in this app comes from a user's role rows, never from their cookie, so this page is
 * where that authority is actually visible: who holds which role, over which block or cluster, and
 * whether their account still works. Switching an account off takes effect immediately — the next
 * request they make has no session — which is why the control asks for a reason and sits behind a
 * second click.
 */

const PER_PAGE = 50;

export default async function UsersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  if (!may(session, 'users.manage')) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHead title={pick(lang, 'People', 'उपयोगकर्ता')} />
        <Callout tone="warn">
          {pick(
            lang,
            'Only the state programme team and the demo administrator can manage accounts.',
            'केवल राज्य कार्यक्रम दल और डेमो प्रशासक खाते प्रबंधित कर सकते हैं।',
          )}
        </Callout>
      </div>
    );
  }

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filter = { q: sp.q || undefined, role: sp.role || undefined, status: sp.status || undefined };
  const total = countUsers(session, filter);
  const users = listUsers(session, { ...filter, limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const assignments = roleAssignments(users.map((u) => u.id));
  const roleCounts = userRoleCounts(session, { q: filter.q, status: filter.status });
  const activeCount = countUsers(session, { ...filter, status: 'active' });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (over: Record<string, string>) =>
    new URLSearchParams({ ...(sp as Record<string, string>), ...over }).toString();

  return (
    <div className="space-y-4">
      <PageHead
        title={pick(lang, 'People', 'उपयोगकर्ता')}
        sub={pick(
          lang,
          'Every account, the role it holds and the block, cluster or school that role covers. Authority comes from these rows, not from the sign-in.',
          'हर खाता, उसकी भूमिका और उसका दायरा। अधिकार इन्हीं पंक्तियों से आते हैं, साइन-इन से नहीं।',
        )}
      />

      <Callout tone="warn" title={pick(lang, 'Switching an account off stops it working at once', 'खाता बंद करते ही वह तुरंत काम करना बंद कर देता है')}>
        {pick(
          lang,
          'A deactivated account cannot sign in and disappears from the demo sign-in list. You cannot switch off your own account, nor the last active holder of a role that administers the system — there would be no way back short of rebuilding the database. Resetting the demo undoes any change made here.',
          'बंद किया गया खाता साइन इन नहीं कर सकता और डेमो सूची से हट जाता है। आप अपना खाता या किसी प्रशासनिक भूमिका का अंतिम सक्रिय खाता बंद नहीं कर सकते। डेमो रीसेट करने पर यहाँ किए बदलाव हट जाएँगे।',
        )}
      </Callout>

      <Grid cols={3}>
        <Stat label={pick(lang, 'Accounts shown', 'दिखाए गए खाते')} value={fmtInt(total)} />
        <Stat label={pick(lang, 'Active', 'सक्रिय')} value={fmtInt(activeCount)} tone="good" />
        <Stat
          label={pick(lang, 'Switched off', 'बंद')}
          value={fmtInt(total - activeCount)}
          tone={total - activeCount > 0 ? 'warn' : undefined}
        />
      </Grid>

      <Card>
        <CardHead
          title={pick(lang, 'Accounts', 'खाते')}
          hint={`${fmtInt(total)} ${pick(lang, 'matching', 'मिले')} · ${pick(lang, 'page', 'पृष्ठ')} ${page} / ${pages}`}
          right={
            <form method="get" action="/users" className="flex flex-wrap gap-2">
              <input
                type="search" name="q" defaultValue={sp.q ?? ''}
                placeholder={pick(lang, 'Name, email or id', 'नाम, ईमेल या आईडी')}
                className="input w-52 py-1 text-[13px]"
              />
              <select name="role" defaultValue={sp.role ?? ''} className="input py-1 text-[13px]">
                <option value="">{pick(lang, 'Every role', 'सभी भूमिकाएँ')}</option>
                {roleCounts.map((r) => (
                  <option key={r.role} value={r.role}>
                    {pick(lang, ROLE_LABELS[r.role as RoleCode]?.en ?? r.role, ROLE_LABELS[r.role as RoleCode]?.hi ?? r.role)} ({r.c})
                  </option>
                ))}
              </select>
              <select name="status" defaultValue={sp.status ?? ''} className="input py-1 text-[13px]">
                <option value="">{pick(lang, 'Any status', 'कोई भी स्थिति')}</option>
                <option value="active">{pick(lang, 'Active', 'सक्रिय')}</option>
                <option value="inactive">{pick(lang, 'Switched off', 'बंद')}</option>
              </select>
              <button type="submit" className="btn-quiet">{pick(lang, 'Search', 'खोजें')}</button>
            </form>
          }
        />

        {users.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{pick(lang, 'Name', 'नाम')}</th>
                  <th>{pick(lang, 'Role and scope', 'भूमिका और दायरा')}</th>
                  <th>{pick(lang, 'Reached by', 'संपर्क')}</th>
                  <th>{pick(lang, 'Status', 'स्थिति')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const mine = u.id === session.user_id;
                  const off = u.status !== 'active';
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="font-medium text-ink">{u.full_name}</div>
                        <div className="text-[12.5px] text-ink-faint">{u.email}</div>
                        <Mono>{u.id}</Mono>
                      </td>
                      <td>
                        {(assignments.get(u.id) ?? []).map((a) => (
                          <div key={`${a.role}-${a.scope_id}`} className="mb-1 last:mb-0">
                            <Pill tone="active">
                              {pick(lang, ROLE_LABELS[a.role as RoleCode]?.en ?? a.role, ROLE_LABELS[a.role as RoleCode]?.hi ?? a.role)}
                            </Pill>{' '}
                            <span className="text-[12.5px] text-ink-soft">{scopeName(a.scope_type, a.scope_id)}</span>
                          </div>
                        ))}
                      </td>
                      <td className="text-[12.5px] text-ink-soft">
                        {u.preferred_channel}
                        <span className="text-ink-faint"> · {u.preferred_language === 'hi' ? 'हिंदी' : 'English'}</span>
                      </td>
                      <td>
                        <Pill tone={off ? 'warn' : 'good'}>
                          {off ? pick(lang, 'switched off', 'बंद') : pick(lang, 'active', 'सक्रिय')}
                        </Pill>
                      </td>
                      <td>
                        {mine ? (
                          <span className="text-[12.5px] text-ink-faint">{pick(lang, 'this is you', 'यह आप हैं')}</span>
                        ) : (
                          <Disclose
                            tone={off ? 'quiet' : 'danger'}
                            label={off ? pick(lang, 'Switch on…', 'चालू करें…') : pick(lang, 'Switch off…', 'बंद करें…')}
                          >
                            <ActionForm
                              action={setUserStatusAction}
                              tone={off ? 'good' : 'danger'}
                              label={off ? pick(lang, 'Switch the account on', 'खाता चालू करें') : pick(lang, 'Switch the account off', 'खाता बंद करें')}
                              hidden={{ user_id: u.id, status: off ? 'active' : 'inactive' }}
                            >
                              <ReasonBox
                                name="reason" required rows={2}
                                label={pick(lang, 'Why', 'कारण')}
                                placeholder={pick(lang, 'Transferred out, left the service, account created in error…', 'स्थानांतरण, सेवा से अलग, गलती से बना खाता…')}
                              />
                            </ActionForm>
                          </Disclose>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 ? (
          <nav className="mt-3 flex items-center justify-between text-[13px]">
            {page > 1 ? (
              <Link href={`/users?${qs({ page: String(page - 1) })}`} className="link">
                ← {pick(lang, 'Previous', 'पिछला')}
              </Link>
            ) : <span />}
            <span className="tnum text-ink-faint">{page} / {pages}</span>
            {page < pages ? (
              <Link href={`/users?${qs({ page: String(page + 1) })}`} className="link">
                {pick(lang, 'Next', 'अगला')} →
              </Link>
            ) : <span />}
          </nav>
        ) : null}
      </Card>
    </div>
  );
}

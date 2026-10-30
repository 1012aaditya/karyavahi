import Link from 'next/link';
import type { ReactNode } from 'react';
import { getLanguage, getSession, type Session } from '@/lib/session';
import { navFor, homeFor } from '@/lib/nav';
import { t, pick } from '@/lib/i18n';
import { nowIso, today } from '@/lib/clock';
import { countUnread } from '@/lib/feed';
import { countEvidenceToCheck, countTasks, approvalQueue } from '@/lib/cases';
import { scopeName } from '@/lib/repo';
import { ROLE_LABELS } from '@domain/permissions';
import { DISCLAIMER } from '@domain/catalog';
import { NavLink, LanguageToggle, MobileNav } from './Chrome';
import { fmtDate } from './ui';
import type { Language } from '@domain/types';

/**
 * The application frame. Two things are deliberately impossible to miss: the demo disclaimer
 * and the demo date. Every number in this app is fictional, and most of the queues only make
 * sense relative to "today", which here is the demo clock, not the wall clock.
 */

function Banner({ lang }: { lang: Language }) {
  return (
    <div className="bg-warn-light text-center" role="note">
      <p className="mx-auto max-w-7xl px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-warn">
        {lang === 'hi' ? t('hi', 'demoBanner') : DISCLAIMER}
      </p>
    </div>
  );
}

function Nav({ session, lang, badges }: {
  session: Session; lang: Language;
  badges: { approvals: number; evidence: number; tasks: number; notifications: number };
}) {
  return (
    <nav aria-label={pick(lang, 'Main', 'मुख्य')} className="space-y-5">
      {navFor(session).map((g) => (
        <div key={g.label.en}>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {pick(lang, g.label.en, g.label.hi)}
          </p>
          <div className="space-y-0.5">
            {g.items.map((i) => (
              <NavLink
                key={i.href}
                href={i.href}
                label={t(lang, i.key)}
                exact={i.href === homeFor(session)}
                badge={i.badge ? badges[i.badge] : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default async function Shell({ children }: { children: ReactNode }) {
  const session = await getSession();
  const lang = await getLanguage();

  if (!session) {
    return (
      <div className="min-h-screen">
        <Banner lang={lang} />
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      </div>
    );
  }

  const role = ROLE_LABELS[session.role];
  const badges = {
    approvals: approvalQueue(session, { limit: 200 }).length,
    evidence: countEvidenceToCheck(session),
    tasks: countTasks(session, { ownerUserId: session.user_id, status: ['assigned', 'acknowledged', 'in_progress', 'sent_back'] }),
    notifications: countUnread(session),
  };
  const navEl = <Nav session={session} lang={lang} badges={badges} />;

  return (
    <div className="min-h-screen">
      <Banner lang={lang} />

      <header className="relative border-b border-line bg-white no-print">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <MobileNav>{navEl}</MobileNav>

          <Link href={homeFor(session)} className="flex items-baseline gap-2">
            <span className="text-[17px] font-bold tracking-tight text-brand">
              {pick(lang, 'Karyavahi', 'कार्यवाही')}
            </span>
            <span className="hidden text-[12px] text-ink-faint sm:inline">{t(lang, 'tagline')}</span>
          </Link>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5 sm:gap-x-3">
            <span
              className="hidden items-center gap-1.5 rounded border border-line-strong bg-paper-sunk px-2 py-1 text-[11.5px] text-ink-soft sm:flex"
              title={`The demo clock. Everything date-dependent is measured from here (${nowIso()}).`}
            >
              <span className="label">{t(lang, 'demoClock')}</span>
              <span className="tnum font-medium text-ink">{fmtDate(today())}</span>
            </span>

            <Link
              href="/notifications"
              className="relative rounded-md px-2 py-1 text-[13px] text-ink-soft hover:bg-paper-sunk hover:text-ink"
            >
              <span className="hidden sm:inline">{t(lang, 'navNotifications')}</span>
              <span className="sm:hidden" aria-hidden>●</span>
              <span className="sr-only sm:hidden">{t(lang, 'navNotifications')}</span>
              {badges.notifications > 0 ? (
                <span className="tnum ml-1 rounded-full bg-crit px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
                  {badges.notifications > 99 ? '99+' : badges.notifications}
                </span>
              ) : null}
            </Link>

            <LanguageToggle current={lang} />

            <div className="flex items-center gap-2 border-l border-line pl-2 sm:pl-3">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-[13px] font-medium text-ink">{session.full_name}</p>
                <p className="text-[11px] text-ink-faint">
                  {pick(lang, role?.en ?? session.role, role?.hi ?? session.role)}
                  {' · '}
                  {scopeName(session.scope_type, session.scope_id)}
                </p>
              </div>
              <form action="/api/sign-out" method="post">
                <button type="submit" className="btn-quiet px-2 py-1 text-[12px]">{t(lang, 'signOut')}</button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5">
        <aside className="hidden w-52 shrink-0 lg:block no-print">
          <div className="sticky top-4">{navEl}</div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}

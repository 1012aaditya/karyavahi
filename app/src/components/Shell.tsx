import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { getLanguage, getSession } from '@/lib/session';
import { navFor, homeFor, type BadgeKey } from '@/lib/nav';
import { t, pick } from '@/lib/i18n';
import { nowIso, today } from '@/lib/clock';
import { countUnread } from '@/lib/feed';
import { countEvidenceToCheck, countTasks, approvalQueue } from '@/lib/cases';
import { scopeName } from '@/lib/repo';
import { ROLE_LABELS } from '@domain/permissions';
import { SidebarNav, HeaderTitle, MobileDrawer, UserMenu, LanguageToggle, type ClientNavSection } from './Chrome';
import { Icon } from './Icon';
import { Logo } from './Brand';
import { fmtDate } from './ui';
import { AssistantDrawer } from './Chat';
import { may } from '@/lib/guard';
import { aiStatus } from '@/lib/ai/config';

/**
 * The application frame: a navy sidebar with the eight sections, and a light header with the
 * page title, search, the assistant, notifications and the user menu.
 *
 * Two things stay impossible to miss: the demo disclosure (a slim strip above every page) and
 * the demo date. Every number here is fictional, and most queues only make sense relative to
 * "today", which is the demo clock, not the wall clock.
 */

export default async function Shell({ children }: { children: ReactNode }) {
  const session = await getSession();
  const lang = await getLanguage();

  // Signed-out pages (landing, sign-in, demo personas) draw their own full-bleed layout.
  if (!session) return <>{children}</>;

  const role = ROLE_LABELS[session.role];
  const roleLabel = pick(lang, role?.en ?? session.role, role?.hi ?? session.role);
  const scope = scopeName(session.scope_type, session.scope_id);
  const badges: Record<BadgeKey, number> = {
    approvals: approvalQueue(session, { limit: 200 }).length,
    evidence: countEvidenceToCheck(session),
    tasks: countTasks(session, { ownerUserId: session.user_id, status: ['assigned', 'acknowledged', 'in_progress', 'sent_back'] }),
    notifications: countUnread(session),
  };
  const sections: ClientNavSection[] = navFor(session).map((s) => ({
    href: s.href, icon: s.icon, label: t(lang, s.key), badge: s.badge ? badges[s.badge] : undefined,
    children: s.children.map((c) => ({ href: c.href, label: t(lang, c.key), badge: c.badge ? badges[c.badge] : undefined })),
  }));

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href={homeFor(session)} className="flex items-center gap-2.5 px-2 pb-5 pt-1">
        <Logo size={32} />
        <span className="leading-tight">
          <span className="block font-display text-[17px] font-semibold tracking-tight text-white">{pick(lang, 'Karyavahi', 'कार्यवाही')}</span>
          <span className="block text-[11px] text-navy-300">{t(lang, 'tagline')}</span>
        </span>
      </Link>

      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-navy-300">{pick(lang, 'Your scope', 'आपका दायरा')}</p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-white" title={scope}>{scope}</p>
        <p className="truncate text-[11.5px] text-navy-300">{roleLabel}</p>
      </div>

      <div className="-mx-1 flex-1 overflow-y-auto px-1 pb-4">
        <SidebarNav sections={sections} label={pick(lang, 'Main', 'मुख्य')} />
      </div>

      <div className="mt-auto space-y-2 border-t border-white/10 pt-3 text-[11.5px] text-navy-300">
        <p className="flex items-center gap-1.5" title={`The demo clock. Everything date-dependent is measured from here (${nowIso()}).`}>
          <Icon name="calendar" size={14} />
          {t(lang, 'demoClock')}: <span className="tnum font-medium text-white">{fmtDate(today())}</span>
        </p>
        <p className="flex items-start gap-1.5 leading-snug">
          <Icon name="info" size={14} className="mt-px" />
          {pick(lang, 'Fictional demo data. Not government statistics.', 'काल्पनिक डेमो डेटा। सरकारी आँकड़े नहीं।')}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-[264px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] bg-navy px-4 py-5 no-print lg:block">
        {sidebar}
      </aside>

      <header className="sticky top-0 z-20 border-b border-line bg-ivory/90 backdrop-blur no-print">
        <div className="bg-warn-light/80 px-4 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-warn" role="note">
          {t(lang, 'demoBanner')}
        </div>
        <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <MobileDrawer label={pick(lang, 'Open navigation', 'नेविगेशन खोलें')}>{sidebar}</MobileDrawer>
          <div className="min-w-0 flex-1"><HeaderTitle sections={sections} /></div>

          <form action="/search" method="get" role="search" className="relative hidden md:block">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="search" name="q" aria-label={pick(lang, 'Search cases, schools, interventions', 'प्रकरण, विद्यालय, हस्तक्षेप खोजें')}
              placeholder={pick(lang, 'Search cases, schools, interventions…', 'प्रकरण, विद्यालय खोजें…')}
              className="h-9 w-64 rounded-lg border border-line-strong bg-white pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 xl:w-80"
            />
          </form>
          <Link href="/search" className="btn-ghost px-2 md:hidden"><Icon name="search" size={19} label={t(lang, 'navSearch')} /></Link>

          <Link href="/assistant" className="btn-ghost hidden gap-1.5 px-2.5 text-brand sm:inline-flex" title={pick(lang, 'Ask Karyavahi AI', 'कार्यवाही AI से पूछें')}>
            <Icon name="sparkles" size={18} />
            <span className="hidden text-[13px] font-medium lg:inline">{pick(lang, 'Ask AI', 'AI से पूछें')}</span>
          </Link>

          <Link href="/notifications" className="btn-ghost relative px-2" title={t(lang, 'navNotifications')}>
            <Icon name="bell" size={19} label={t(lang, 'navNotifications')} />
            {badges.notifications > 0 ? (
              <span className="tnum absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-crit px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
                {badges.notifications > 99 ? '99+' : badges.notifications}
              </span>
            ) : null}
          </Link>

          <div className="hidden sm:block"><LanguageToggle current={lang} /></div>

          <UserMenu name={session.full_name} role={roleLabel} scope={scope} email={session.email}>
            <Link href="/notifications" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-soft hover:bg-paper-sunk hover:text-ink">
              <Icon name="bell" size={16} />{t(lang, 'navNotifications')}
              {badges.notifications > 0 ? <span className="tnum ml-auto text-[12px] text-ink-faint">{badges.notifications}</span> : null}
            </Link>
            <div className="sm:hidden"><LanguageToggle current={lang} compact /></div>
            <form action="/api/sign-out" method="post">
              <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-soft hover:bg-crit-light hover:text-crit">
                <Icon name="logout" size={16} />{t(lang, 'signOut')}
              </button>
            </form>
          </UserMenu>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 print-full">{children}</main>
      {may(session, 'ai.assistant') ? <Suspense fallback={null}><AssistantDrawer configured={aiStatus().configured} /></Suspense> : null}
    </div>
  );
}

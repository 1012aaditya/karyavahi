'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Language } from '@domain/types';
import { Icon } from './Icon';

/**
 * Client-side chrome: the sidebar with active-section highlighting, the mobile drawer, the
 * user menu, the header's page title and the language switch. Everything here receives
 * already-translated, already-authorised data from the server-rendered Shell.
 */

export interface ClientNavItem { href: string; label: string; badge?: number }
export interface ClientNavSection extends ClientNavItem { icon: string; children: ClientNavItem[] }

const matches = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The most specific nav entry for the current path (so /admin/jobs beats /admin). */
function activeHref(path: string, sections: ClientNavSection[]): string | null {
  let best: string | null = null;
  for (const s of sections) {
    for (const h of [s.href, ...s.children.map((c) => c.href)]) {
      if (matches(path, h) && (!best || h.length > best.length)) best = h;
    }
  }
  return best;
}

function Badge({ n, active }: { n?: number; active?: boolean }) {
  if (!n || n <= 0) return null;
  return (
    <span className={`tnum ml-auto shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold ${
      active ? 'bg-white text-navy' : 'bg-white/10 text-navy-100'
    }`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function SidebarNav({ sections, label }: { sections: ClientNavSection[]; label: string }) {
  const path = usePathname();
  const active = activeHref(path, sections);
  return (
    <nav aria-label={label} className="space-y-0.5">
      {sections.map((s) => {
        const inSection = active === s.href || s.children.some((c) => c.href === active);
        const selfActive = active === s.href;
        const childBadge = s.children.reduce((n, c) => n + (c.badge ?? 0), 0);
        return (
          <div key={s.href}>
            <Link
              href={s.href}
              aria-current={selfActive ? 'page' : undefined}
              className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
                inSection ? 'bg-white/[0.09] font-semibold text-white' : 'text-navy-200 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Icon name={s.icon} size={18} className={inSection ? 'text-brand-soft' : 'text-navy-300 group-hover:text-navy-100'} />
              <span className="truncate">{s.label}</span>
              {!inSection ? <Badge n={(s.badge ?? 0) + childBadge} /> : <Badge n={s.badge} active />}
            </Link>
            {inSection && s.children.length > 0 ? (
              <div className="mb-1 ml-[21px] mt-0.5 space-y-px border-l border-white/10 pl-3">
                {s.children.map((c) => {
                  const on = active === c.href;
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      aria-current={on ? 'page' : undefined}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        on ? 'bg-white/[0.08] font-medium text-white' : 'text-navy-300 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{c.label}</span>
                      <Badge n={c.badge} active={on} />
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/** The page title in the header, taken from the navigation so it always matches the sidebar. */
export function HeaderTitle({ sections }: { sections: ClientNavSection[] }) {
  const path = usePathname();
  const active = activeHref(path, sections);
  const sec = sections.find((s) => s.href === active || s.children.some((c) => c.href === active));
  const child = sec?.children.find((c) => c.href === active);
  if (!sec) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
      <Link href={sec.href} className={`truncate ${child ? 'text-ink-faint hover:text-ink' : 'font-semibold text-ink'}`}>
        {sec.label}
      </Link>
      {child ? (
        <>
          <Icon name="chevron-right" size={14} className="text-ink-faint" />
          <span className="truncate font-semibold text-ink">{child.label}</span>
        </>
      ) : null}
    </div>
  );
}

export function MobileDrawer({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="btn-ghost -ml-2 px-2 lg:hidden" aria-expanded={open} aria-controls="mobile-nav"
      >
        <Icon name="menu" size={20} label={label} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-navy-950/50 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="absolute inset-y-0 left-0 flex w-[290px] max-w-[85vw] animate-fade-in flex-col overflow-y-auto bg-navy p-4 shadow-pop">
            <button type="button" onClick={() => setOpen(false)} className="mb-2 self-end rounded-md p-1.5 text-navy-200 hover:bg-white/10 hover:text-white">
              <Icon name="x" size={20} label="Close menu" />
            </button>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function UserMenu({
  name, role, scope, email, children,
}: { name: string; role: string; scope: string; email: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 text-left hover:bg-paper-deep"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-navy text-[12px] font-semibold text-white">{initials}</span>
        <span className="hidden leading-tight xl:block">
          <span className="block max-w-[160px] truncate text-[13px] font-medium text-ink">{name}</span>
          <span className="block max-w-[160px] truncate text-[11px] text-ink-faint">{role}</span>
        </span>
        <Icon name="chevron-down" size={14} className="hidden text-ink-faint xl:block" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-72 animate-fade-in overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="border-b border-line bg-paper-sunk px-4 py-3">
            <p className="text-sm font-semibold text-ink">{name}</p>
            <p className="text-[12px] text-ink-faint">{email}</p>
            <p className="mt-2 text-[12px] text-ink-soft"><span className="font-medium text-ink">{role}</span> · {scope}</p>
          </div>
          <div className="p-1.5">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export function LanguageToggle({ current, compact = false }: { current: Language; compact?: boolean }) {
  return (
    <form action="/api/language" method="post">
      <input type="hidden" name="to" value={current === 'en' ? 'hi' : 'en'} />
      <button
        type="submit"
        className={compact ? 'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-soft hover:bg-paper-sunk hover:text-ink' : 'btn-ghost btn-sm'}
        aria-label={current === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
        title={current === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
      >
        <Icon name="globe" size={16} />
        {current === 'en' ? 'हिंदी' : 'English'}
      </button>
    </form>
  );
}

/** A details/summary section that remembers nothing — used for long optional panels. */
export function Expand({ summary, children, count }: { summary: string; children: React.ReactNode; count?: number }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink sm:px-5">
        <span className="transition-transform group-open:rotate-90" aria-hidden>›</span>
        {summary}
        {count !== undefined ? <span className="tnum text-ink-faint">({count})</span> : null}
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}

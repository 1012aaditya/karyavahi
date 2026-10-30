'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { Language } from '@domain/types';

/** Client-side chrome: active-link highlighting, the mobile nav toggle, the language switch. */

export function NavLink({
  href, label, badge, exact = false,
}: { href: string; label: string; badge?: number; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors ${
        active ? 'bg-brand-light font-semibold text-brand' : 'text-ink-soft hover:bg-paper-sunk hover:text-ink'
      }`}
    >
      <span className="truncate">{label}</span>
      {badge && badge > 0 ? (
        <span className={`tnum shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
          active ? 'bg-brand text-white' : 'bg-paper-deep text-ink-soft'
        }`}>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function LanguageToggle({ current }: { current: Language }) {
  return (
    <form action="/api/language" method="post" className="flex items-center gap-1">
      <input type="hidden" name="to" value={current === 'en' ? 'hi' : 'en'} />
      <button
        type="submit"
        className="btn-quiet px-2 py-1 text-[12px]"
        aria-label={current === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
        title={current === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
      >
        {current === 'en' ? 'हिंदी' : 'English'}
      </button>
    </form>
  );
}

export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // Close on navigation.
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); if (open) setOpen(false); }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-quiet lg:hidden"
        aria-expanded={open}
        aria-controls="mobile-nav"
      >
        <span aria-hidden>☰</span> Menu
      </button>
      {open ? (
        <div id="mobile-nav" className="absolute left-0 right-0 top-full z-30 border-b border-line bg-white p-4 shadow-lg lg:hidden">
          {children}
        </div>
      ) : null}
    </>
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

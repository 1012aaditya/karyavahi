import Link from 'next/link';
import type { PriorityItem, ActivityItem } from '@/lib/overview';
import type { HotspotUnit, HotspotSeverity } from '@/lib/hotspots';
import { Icon } from './Icon';
import { fmtDate } from './ui';

/** Presentation for the overview. Pure: every value arrives computed from the server. */

const PRIORITY_STYLE = {
  critical: { dot: 'bg-crit', chip: 'border-crit/30 bg-crit-light text-crit', label: 'Critical' },
  high: { dot: 'bg-warn', chip: 'border-warn/30 bg-warn-light text-warn', label: 'High' },
  medium: { dot: 'bg-navy-300', chip: 'border-line-strong bg-paper-sunk text-ink-soft', label: 'Medium' },
} as const;

const KIND_ICON: Record<PriorityItem['kind'], string> = {
  approval: 'shield', overdue: 'clock', evidence: 'check-circle', no_gain: 'refresh', data_quality: 'database', investigation: 'search',
};

export function PriorityList({ items, empty }: { items: PriorityItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-good-light text-good"><Icon name="check" size={22} /></span>
        <p className="mt-3 text-[14px] font-medium text-ink">{empty}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => {
        const st = PRIORITY_STYLE[it.priority];
        return (
          <li key={it.id} className="group flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-paper-sunk/70 sm:px-5">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper-deep text-ink-soft">
              <Icon name={KIND_ICON[it.kind]} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`chip ${st.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />{st.label}</span>
                <Link href={it.href} className="text-[14px] font-semibold text-ink hover:text-brand">{it.title}</Link>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{it.detail}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-faint">
                <span className="inline-flex items-center gap-1"><Icon name="clock" size={13} />{it.when}</span>
                <span className="inline-flex items-center gap-1"><Icon name="user" size={13} />{it.owner}</span>
                {it.scope ? <span className="inline-flex items-center gap-1"><Icon name="pin" size={13} />{it.scope}</span> : null}
              </p>
            </div>
            <Link href={it.href} className="btn-quiet btn-sm mt-0.5 hidden shrink-0 sm:inline-flex">
              {it.action}<Icon name="arrow-right" size={14} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export const HOTSPOT_STYLE: Record<HotspotSeverity, { fill: string; text: string; label: string; ring: string; hex: string }> = {
  critical: { fill: 'bg-crit', text: 'text-white', label: 'Critical decline', ring: 'ring-crit/40', hex: '#b42318' },
  significant: { fill: 'bg-[#e0763c]', text: 'text-white', label: 'Significant decline', ring: 'ring-[#e0763c]/40', hex: '#e0763c' },
  moderate: { fill: 'bg-[#f2c14e]', text: 'text-ink', label: 'Moderate concern', ring: 'ring-[#f2c14e]/50', hex: '#f2c14e' },
  stable: { fill: 'bg-[#dfe6ee]', text: 'text-ink', label: 'Stable', ring: 'ring-navy-200', hex: '#dfe6ee' },
  improving: { fill: 'bg-brand', text: 'text-white', label: 'Improving', ring: 'ring-brand/40', hex: '#0f766e' },
  insufficient: { fill: 'bg-white bg-[repeating-linear-gradient(45deg,#efebe2_0_4px,#fff_4px_8px)]', text: 'text-ink-soft', label: 'Insufficient data', ring: 'ring-line-strong', hex: '#efebe2' },
};

export function HotspotPreview({ units, levelLabel }: { units: HotspotUnit[]; levelLabel: string }) {
  const worst = units.filter((u) => ['critical', 'significant', 'moderate'].includes(u.severity)).slice(0, 5);
  const tiles = units.slice(0, 24);
  return (
    <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[1fr_1.1fr]">
      <div>
        <div className="grid grid-cols-6 gap-1.5" role="list" aria-label={`${levelLabel} by learning trend`}>
          {tiles.map((u) => {
            const st = HOTSPOT_STYLE[u.severity];
            return (
              <Link
                key={u.id} role="listitem" href={`/hotspots?level=${u.level}&selected=${u.id}`}
                title={`${u.name}: ${st.label}${u.relPp !== null ? ` (${u.relPp > 0 ? '+' : ''}${u.relPp} pp vs district)` : ''}`}
                className={`aspect-square rounded-md ${st.fill} ring-1 ${st.ring} transition-transform hover:scale-105`}
              >
                <span className="sr-only">{u.name}: {st.label}</span>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-faint">Each tile is one {levelLabel.toLowerCase().replace(/s$/, '')}. Schematic, not a map.</p>
      </div>
      <div>
        {worst.length === 0 ? (
          <p className="text-[13.5px] text-ink-soft">No statistically clear declines in the latest round.</p>
        ) : (
          <ol className="space-y-2">
            {worst.map((u) => {
              const st = HOTSPOT_STYLE[u.severity];
              return (
                <li key={u.id}>
                  <Link href={`/hotspots?level=${u.level}&selected=${u.id}`} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 hover:border-line-strong hover:bg-paper-sunk">
                    <span className={`h-3 w-3 shrink-0 rounded-sm ${st.fill}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{u.name}</span>
                    <span className="tnum text-[13px] font-semibold text-crit">{u.relPp !== null ? `${u.relPp > 0 ? '+' : '−'}${Math.abs(u.relPp).toFixed(1)} pp` : '—'}</span>
                    <span className="sr-only">{st.label}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

const TONE_DOT = { good: 'bg-good', warn: 'bg-warn', crit: 'bg-crit', neutral: 'bg-navy-300', brand: 'bg-brand' } as const;

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <p className="px-5 py-8 text-center text-[13.5px] text-ink-faint">No activity yet.</p>;
  return (
    <ol className="relative px-4 py-3 sm:px-5">
      {items.map((a, i) => (
        <li key={a.id} className="relative flex gap-3 pb-4 last:pb-1">
          {i < items.length - 1 ? <span className="absolute left-[4px] top-3 h-full w-px bg-line" aria-hidden /> : null}
          <span className={`relative mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full ring-2 ring-white ${TONE_DOT[a.tone]}`} aria-hidden />
          <div className="min-w-0">
            <Link href={`/cases/${a.caseId}`} className="text-[13.5px] leading-snug text-ink hover:text-brand">{a.text}</Link>
            <p className="text-[12px] text-ink-faint">{a.actor} · {fmtDate(a.ts, true)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function StackedBar({ parts, label }: { parts: { label: string; value: number; className: string }[]; label: string }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-paper-deep" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
        {total > 0 ? parts.map((p) => (p.value > 0 ? <span key={p.label} className={p.className} style={{ width: `${(100 * p.value) / total}%` }} /> : null)) : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-ink-soft">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${p.className}`} aria-hidden />
            <span className="flex-1 truncate">{p.label}</span>
            <span className="tnum font-medium text-ink">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBarList({ rows, href }: { rows: { key: string; label: string; value: number; tone?: string }[]; href?: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="w-40 shrink-0 truncate text-[13px] text-ink-soft">{r.label}</span>
            <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
              <span className={`absolute inset-y-0 left-0 rounded-full ${r.tone ?? 'bg-navy-600'}`} style={{ width: `${(100 * r.value) / max}%` }} />
            </span>
            <span className="tnum w-8 text-right text-[13px] font-semibold text-ink">{r.value}</span>
          </>
        );
        return (
          <li key={r.key}>
            {href ? <Link href={href(r.key)} className="flex items-center gap-3 rounded-md hover:bg-paper-sunk">{inner}</Link> : <div className="flex items-center gap-3">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

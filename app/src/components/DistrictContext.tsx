import Link from 'next/link';
import type { Language } from '@domain/types';
import { pick } from '@/lib/i18n';
import { districtFigures, figures, pgidGrade, pmshriByDistrict, reconciliation } from '@/lib/sources';
import { Pill } from './labels';
import { Icon } from './Icon';

/**
 * Published figures about a district, shown beside the learning picture: ASER 2024 (rural) and a
 * few NFHS-5 indicators, PRS 2024 Class 3 next to the demo's calibrated Class 3 average, the
 * PGI-D grade (latest year, with the Outcomes category), Census 2011 literacy and SC/ST shares,
 * PM SHRI counts, and, where the district has one, its NITI aspirational block.
 * Labelled "context, not cause": none of these explains a particular cluster's drop.
 */
export function DistrictContext({ districtIds, lang }: { districtIds: string[]; lang: Language }) {
  const ds = districtIds.map((id) => ({ id, f: districtFigures(id) })).filter((x) => x.f);
  if (!ds.length) return null;
  const recon = reconciliation();
  const meta = figures();
  const pmDemo = pmshriByDistrict();
  const L = (en: string, hi: string) => pick(lang, en, hi);
  const grade = (key: string | undefined) => { const g = key ? pgidGrade(key) : null; return g ? `${pick(lang, g.en, g.hi)} (${g.band === 'up to 10%' ? L('up to 10%', '10% तक') : g.band})` : '—'; };
  // shares under 1% (e.g. Scheduled Tribes in Rampur, 0.02%) keep two decimals so they do not read as zero
  const pct2 = (v: number | undefined) => (v === undefined ? '—' : `${v.toFixed(v > 0 && v < 1 ? 2 : 1)}%`);
  return (
    <section className="card" aria-labelledby="district-context-title" data-testid="district-context">
      <header className="card-head">
        <div className="min-w-0">
          <h2 id="district-context-title" className="text-md font-semibold tracking-tight text-ink">
            {ds.length === 1 ? L(`${ds[0].f!.name}: district context`, `${ds[0].f!.name}: ज़िला संदर्भ`) : L('District context', 'ज़िला संदर्भ')}
          </h2>
          <p className="mt-0.5 text-sm leading-snug text-ink-soft">{L('Published figures for the district as a whole. They describe the setting; they do not explain any one cluster’s drop.', 'पूरे ज़िले के प्रकाशित आँकड़े। ये परिस्थिति बताते हैं; किसी एक संकुल की गिरावट का कारण नहीं।')}</p>
        </div>
        <div className="shrink-0"><Pill tone="warn" title={L('Observed at district level; not linked to any finding', 'ज़िला स्तर पर; किसी निष्कर्ष से जुड़ा नहीं')}>{L('Context, not cause', 'संदर्भ, कारण नहीं')}</Pill></div>
      </header>
      <div className={`grid divide-y divide-line ${ds.length > 1 ? 'lg:grid-cols-3 lg:divide-x lg:divide-y-0' : ''}`}>
        {ds.map(({ id, f }) => {
          const lang3 = recon.find((r) => r.districtId === id && r.subject === 'language');
          const math3 = recon.find((r) => r.districtId === id && r.subject === 'mathematics');
          const nf = f!.nfhs;
          const rows: [string, string, number | null][] = [
            [L('Std III–V who can read a Std II text', 'कक्षा 3–5: कक्षा 2 का पाठ पढ़ सकते हैं'), 'ASER 2024', f!.aser.std3_5_read_std2],
            [L('Std III–V who can do at least subtraction', 'कक्षा 3–5: कम से कम घटाव कर सकते हैं'), 'ASER 2024', f!.aser.std3_5_subtraction],
            [L('Children 6–14 in government schools', '6–14 वर्ष के बच्चे सरकारी विद्यालयों में'), 'ASER 2024', f!.aser.govt_school_enrolment_6_14],
            [L('Children 6–14 not in school', '6–14 वर्ष के बच्चे विद्यालय से बाहर'), 'ASER 2024', f!.aser.not_in_school_6_14],
            ...Object.values(nf).map((v) => [pick(lang, v.en, v.hi), 'NFHS-5', v.nfhs5] as [string, string, number | null]),
          ];
          const census = f!.census;
          const pg = f!.pgid?.years.at(-1);
          const abp = f!.aspirational?.blocks ?? [];
          const ind = meta?.aspirational?.indicators ?? {};
          return (
            <div key={id} className="p-4 sm:p-5">
              {ds.length > 1 ? <p className="mb-2 text-sm font-semibold text-ink">{f!.name}</p> : null}
              <dl className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-line bg-paper-sunk/60 px-3 py-2">
                  <dt className="text-2xs text-ink-faint">{L('PRS 2024 · Class 3 language', 'परख 2024 · कक्षा 3 भाषा')}</dt>
                  <dd className="tnum text-lg font-semibold text-ink">{f!.prs.language}%</dd>
                  {lang3?.simulated != null ? <dd className="text-2xs text-ink-faint">{L('demo R0', 'डेमो R0')} {lang3.simulated.toFixed(1)}%</dd> : null}
                </div>
                <div className="rounded-lg border border-line bg-paper-sunk/60 px-3 py-2">
                  <dt className="text-2xs text-ink-faint">{L('PRS 2024 · Class 3 maths', 'परख 2024 · कक्षा 3 गणित')}</dt>
                  <dd className="tnum text-lg font-semibold text-ink">{f!.prs.mathematics}%</dd>
                  {math3?.simulated != null ? <dd className="text-2xs text-ink-faint">{L('demo R0', 'डेमो R0')} {math3.simulated.toFixed(1)}%</dd> : null}
                </div>
              </dl>
              <ul className="mt-3 divide-y divide-line text-sm">
                {rows.map(([label, src, v]) => (
                  <li key={label} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0 text-ink-soft">{label} <span className="text-2xs text-ink-faint">· {src}</span></span>
                    <span className="tnum shrink-0 font-medium text-ink">{v === null ? '—' : `${v.toFixed(1)}%`}</span>
                  </li>
                ))}
              </ul>
              {pg ? (
                <div className="mt-3 rounded-lg border border-line px-3 py-2" data-testid="pgid">
                  <p className="text-2xs text-ink-faint">PGI-D {pg.year} · {L('district grade, Ministry of Education', 'ज़िला ग्रेड, शिक्षा मंत्रालय')}</p>
                  <p className="text-sm font-semibold text-ink">{grade(pg.overall)}</p>
                  <p className="text-xs text-ink-soft">{L('Outcomes category', 'परिणाम श्रेणी')}: <span className="font-medium text-ink">{grade(pg.domains.outcomes)}</span></p>
                  <p className="mt-0.5 text-2xs text-ink-faint">{f!.pgid!.years.map((y) => `${y.year} ${pgidGrade(y.overall) ? pick(lang, pgidGrade(y.overall)!.en, pgidGrade(y.overall)!.hi) : y.overall}`).join(' → ')}</p>
                </div>
              ) : null}
              {census ? (
                <ul className="mt-3 divide-y divide-line text-sm" data-testid="census">
                  {([
                    [L('Literacy rate (age 7+)', 'साक्षरता दर (7+ वर्ष)'), census.literacy_rate, meta?.census?.state.literacy_rate],
                    [L('Female literacy rate', 'महिला साक्षरता दर'), census.female_literacy_rate, meta?.census?.state.female_literacy_rate],
                    [L('Scheduled Castes / Scheduled Tribes, share of population', 'अनुसूचित जाति / जनजाति, जनसंख्या में हिस्सा'), null, null],
                    [L('Rural share of population', 'जनसंख्या में ग्रामीण हिस्सा'), census.rural_share, meta?.census?.state.rural_share],
                  ] as [string, number | null, number | undefined | null][]).map(([label, v, up]) => (
                    <li key={label} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0 text-ink-soft">{label} <span className="text-2xs text-ink-faint">· {L('Census 2011', 'जनगणना 2011')}</span></span>
                      <span className="tnum shrink-0 font-medium text-ink">
                        {v === null ? `${pct2(census.sc_share)} / ${pct2(census.st_share)}` : pct2(v)}
                        {up != null ? <span className="ml-1 text-2xs font-normal text-ink-faint">({L('UP', 'उ.प्र.')} {pct2(up)})</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {f!.pmshri ? (
                <p className="mt-2 text-xs leading-snug text-ink-soft" data-testid="pmshri-count">
                  {L(`PM SHRI schools in the district: ${f!.pmshri.total} (${f!.pmshri.kvs} Kendriya, ${f!.pmshri.nvs} Navodaya); ${pmDemo[id] ?? 0} of the demo’s schools are one.`,
                    `ज़िले में पीएम श्री विद्यालय: ${f!.pmshri.total} (${f!.pmshri.kvs} केंद्रीय, ${f!.pmshri.nvs} नवोदय); डेमो के ${pmDemo[id] ?? 0} विद्यालय इनमें से हैं।`)}
                </p>
              ) : null}
              {abp.map((b) => (
                <div key={b.lgd_block} className="mt-3 rounded-lg border border-pend/30 bg-pend-light/60 px-3 py-2" data-testid="aspirational-block">
                  <p className="text-sm font-semibold text-ink">{L(`NITI Aspirational Block in this district: ${b.name}`, `इस ज़िले में नीति आकांक्षी ब्लॉक: ${b.name_hi ?? b.name}`)}</p>
                  <p className="mt-0.5 text-xs leading-snug text-ink-soft">
                    {L(`Education indicators for ${f!.aspirational!.period} (latest quarter), with the median of UP’s ${meta?.aspirational?.niti_blocks_up ?? 68} NITI blocks in brackets. The demo’s blocks are rebuilt groupings of real schools, not real blocks, so this is shown for the district, not on any demo block.`,
                      `${f!.aspirational!.period_hi ?? f!.aspirational!.period} (नवीनतम तिमाही) के शिक्षा संकेतक, कोष्ठक में उ.प्र. के ${meta?.aspirational?.niti_blocks_up ?? 68} नीति ब्लॉकों की माध्यिका। डेमो के ब्लॉक वास्तविक विद्यालयों के पुनर्गठित समूह हैं, वास्तविक ब्लॉक नहीं, इसलिए यह ज़िले के लिए दिखाया गया है, किसी डेमो ब्लॉक पर नहीं।`)}
                  </p>
                  <details className="mt-1.5" open={ds.length === 1}>
                    <summary className="cursor-pointer text-xs font-medium text-brand">{L(`${b.education.length} education indicators`, `${b.education.length} शिक्षा संकेतक`)}</summary>
                    <ul className="mt-1 divide-y divide-pend/20 text-xs">
                      {b.education.map((e) => (
                        <li key={e.code} className="flex items-baseline justify-between gap-3 py-1" title={lang === 'en' ? ind[e.code]?.official : undefined}>
                          <span className="min-w-0 text-ink-soft"><span className="font-mono text-2xs text-ink-faint">{e.code}</span> {ind[e.code] ? pick(lang, ind[e.code].en, ind[e.code].hi) : e.code}</span>
                          <span className="tnum shrink-0 font-medium text-ink">{e.value === null ? '—' : `${e.value.toFixed(1)}%`}{ind[e.code]?.median_up68 != null ? <span className="ml-1 font-normal text-ink-faint">({ind[e.code].median_up68!.toFixed(1)})</span> : null}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="flex items-start gap-1.5 border-t border-line px-4 py-2.5 text-xs leading-snug text-ink-faint sm:px-5">
        <Icon name="info" size={13} className="mt-0.5 shrink-0" />
        <span>{L('ASER 2024: rural households, government and private schools. NFHS-5: 2019-21. PRS 2024: average % correct, which the demo’s Class 3 results are calibrated to. PGI-D: the Ministry of Education’s district grade (bands of the total score). Census 2011: Primary Census Abstract. NITI aspirational block data: UP Planning Department.', 'असर 2024: ग्रामीण परिवार, सरकारी व निजी विद्यालय। NFHS-5: 2019-21। परख 2024: औसत % सही, जिससे डेमो के कक्षा 3 परिणाम अंशांकित हैं। PGI-D: शिक्षा मंत्रालय का ज़िला ग्रेड (कुल अंकों के खंड)। जनगणना 2011: प्राथमिक जनगणना सार। नीति आकांक्षी ब्लॉक आँकड़े: उ.प्र. नियोजन विभाग।')}{' '}
          <Link href="/sources" className="link">{L('Sources', 'स्रोत')}</Link></span>
      </p>
    </section>
  );
}

/** The demo districts a scope covers: all three for the state, otherwise the one the scope sits in. */
export function districtsForScope(scopeType: string, scopeId: string, lookup: (sql: string, id: string) => string | null): string[] {
  if (scopeType === 'state') return ['DST-01', 'DST-02', 'DST-03'];
  if (scopeType === 'district') return [scopeId];
  const sql = scopeType === 'block' ? 'select district_id d from blocks where id = ?'
    : scopeType === 'cluster' ? 'select district_id d from clusters where id = ?'
      : 'select district_id d from schools where id = ?';
  const d = lookup(sql, scopeId);
  return d ? [d] : [];
}

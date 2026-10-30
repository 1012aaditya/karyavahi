import { getSession } from '@/lib/session';
import { may } from '@/lib/guard';
import { getReport } from '@/lib/feed';
import { reportToCsv, type BuiltReport } from '@/lib/reports';
import { buildXlsx, type Sheet } from '@/lib/xlsx';
import { DISCLAIMER } from '@domain/catalog';

/**
 * Export a saved report as CSV or Excel. Reads the stored snapshot through the same scope
 * check as the report page, so an export never contains anything its page would not show.
 * Older seeded reports (a different content shape) are flattened generically.
 */
export const runtime = 'nodejs';

function legacySheets(title: string, content: Record<string, unknown>): Sheet[] {
  const summary: Sheet = { name: 'Summary', rows: [[title], [DISCLAIMER], []] };
  const sheets: Sheet[] = [summary];
  for (const [k, v] of Object.entries(content)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] !== null) {
      const cols = Object.keys(v[0] as Record<string, unknown>);
      sheets.push({ name: k.replace(/_/g, ' '), rows: [cols, ...(v as Record<string, unknown>[]).map((r) => cols.map((c) => cell(r[c])))] });
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) summary.rows.push([`${k} · ${kk}`, cell(vv)]);
    } else {
      summary.rows.push([k.replace(/_/g, ' '), cell(v)]);
    }
  }
  return sheets;
}
const cell = (v: unknown): string | number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response('Sign in first.', { status: 401 });
  if (!may(s, 'report.export')) return new Response('Your role cannot export reports.', { status: 403 });
  const { id } = await params;
  const r = getReport(s, id);
  if (!r) return new Response('Report not found or outside your scope.', { status: 404 });
  const format = new URL(req.url).searchParams.get('format');
  const v2 = (r.content as { builder?: string }).builder === 'v2' ? (r.content as unknown as BuiltReport) : null;
  const base = `${r.id}-${r.report_type}`;

  if (format === 'csv') {
    let csv: string;
    if (v2) csv = reportToCsv(v2);
    else {
      const sheets = legacySheets(r.title, r.content);
      csv = '﻿' + sheets.flatMap((sh) => [[sh.name], ...sh.rows, []]).map((row) => row.map((c) => {
        const t = c === null ? '' : String(c);
        return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      }).join(',')).join('\r\n');
    }
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${base}.csv"` } });
  }

  if (format === 'xlsx') {
    const sheets: Sheet[] = v2
      ? [
          { name: 'Summary', rows: [[v2.title], [`Scope: ${v2.scope}`], [`Period: ${v2.period.from} to ${v2.period.to}`], [`Generated ${v2.generatedAt} by ${v2.generatedBy}`], [v2.disclaimer], [], ['Measure', 'Value'], ...v2.summary.map((x) => [x.label, x.value]), [], ['Caveats'], ...v2.caveats.map((c) => [c])] },
          ...v2.sections.map((sec) => ({ name: sec.title, rows: [sec.columns.map((c) => c.label), ...sec.rows.map((row) => sec.columns.map((c) => row[c.key] ?? null))] })),
        ]
      : legacySheets(r.title, r.content);
    const buf = buildXlsx(sheets);
    return new Response(new Uint8Array(buf), {
      headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${base}.xlsx"` },
    });
  }
  return new Response('Use ?format=csv or ?format=xlsx', { status: 400 });
}

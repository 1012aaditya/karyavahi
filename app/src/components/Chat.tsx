'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { SourceChip } from './AiBriefing';

/**
 * Karyavahi AI conversation UI. Streams from /api/ai/chat, shows which tools ran, renders
 * citations as links, and keeps the conversation in sessionStorage so the full page and the
 * drawer share it. Starter questions are optional — any question can be typed.
 */

interface ToolStep { id: string; label: string; status: 'running' | 'done' | 'failed'; records?: number }
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolStep[];
  sources?: string[];
  unverified?: string[];
  followUps?: string[];
  error?: { message: string; retryable: boolean };
  model?: string;
  streaming?: boolean;
}
export interface ChatContext { path?: string; caseId?: string; area?: { level: string; id: string }; reportId?: string; label?: string }

const STORE = 'kv_ai_chat_v1';
const ID_RE = /\b(CASE-\d{4}|TSK-\d{5}|EVD-\d{6}|FND-\d{5}|PLN-\d{5}|APR-\d{5}|OUT-\d{4}|DGN-\d{5}|CEV-\d{6}|VIS-\d{6}|IMP-\d{4}|INT-\d{2}|CMP-\d{4}|BLKR-\d{5}|RPT-\d{5}|SCH-\d{5}|CLU-\d{3}|BLK-\d{2}|DST-\d{2})\b/;

// ---------------------------------------------------------------- minimal, safe markdown
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[(?:[A-Z]+-[A-Z0-9-]+)(?:,\s*[A-Z]+-[A-Z0-9-]+)*\]|\b(?:CASE-\d{4}|TSK-\d{5}|INT-\d{2}|OUT-\d{4}|FND-\d{5}|SCH-\d{5})\b)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k} className="rounded bg-paper-deep px-1 font-mono text-[12px]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) out.push(<span key={k} className="inline-flex flex-wrap gap-1 align-baseline">{tok.slice(1, -1).split(/,\s*/).map((id) => (ID_RE.test(id) ? <SourceChip key={id} id={id} /> : <span key={id}>{id}</span>))}</span>);
    else out.push(<SourceChip key={k} id={tok} />);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim())); i++; }
      blocks.push(
        <div key={`t${i}`} className="my-2 overflow-x-auto rounded-lg border border-line">
          <table className="table text-[12.5px]"><thead><tr>{head.map((h, j) => <th key={j}>{inline(h, `th${i}${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `td${i}${ri}${ci}`)}</td>)}</tr>)}</tbody></table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, '')); i++; }
      blocks.push(<ul key={`u${i}`} className="my-1.5 space-y-1 pl-1">{items.map((it, j) => <li key={j} className="flex gap-2"><span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-navy-300" /><span>{inline(it, `u${i}${j}`)}</span></li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      blocks.push(<ol key={`o${i}`} className="my-1.5 space-y-1">{items.map((it, j) => <li key={j} className="flex gap-2"><span className="tnum w-4 shrink-0 text-right font-semibold text-ink-faint">{j + 1}.</span><span>{inline(it, `o${i}${j}`)}</span></li>)}</ol>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push(<p key={`h${i}`} className="mb-1 mt-3 text-[14px] font-semibold text-ink first:mt-0">{inline(h[2], `h${i}`)}</p>); i++; continue; }
    if (line.trim() === '') { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !/^\s*\|/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={`p${i}`} className="my-1.5 first:mt-0">{inline(para.join(' '), `p${i}`)}</p>);
  }
  return <>{blocks}</>;
}

// ---------------------------------------------------------------- the panel
export function ChatPanel({ context, starters, compact = false, configured = true }: { context?: ChatContext; starters: string[]; compact?: boolean; configured?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { const raw = sessionStorage.getItem(STORE); if (raw) setMsgs((JSON.parse(raw) as Msg[]).map((m) => ({ ...m, streaming: false }))); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30))); } catch { /* quota */ }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((xs) => (xs.length ? [...xs.slice(0, -1), fn(xs[xs.length - 1])] : xs));

  const send = useCallback(async (question: string, base?: Msg[]) => {
    const q = question.trim();
    if (!q || busy) return;
    const prior = (base ?? msgs).filter((m) => !m.error && m.content.trim());
    const next: Msg[] = [...prior, { role: 'user', content: q }, { role: 'assistant', content: '', tools: [], streaming: true }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ messages: next.slice(0, -1).map(({ role, content }) => ({ role, content })), context }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        patchLast((m) => ({ ...m, streaming: false, error: { message: j.error ?? `Request failed (${res.status}).`, retryable: res.status === 429 || res.status >= 500 } }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line);
          if (e.type === 'meta') patchLast((m) => ({ ...m, model: e.model }));
          else if (e.type === 'text') patchLast((m) => ({ ...m, content: m.content + e.delta }));
          else if (e.type === 'tool_start') patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), { id: e.id, label: e.label, status: 'running' }] }));
          else if (e.type === 'tool_end') patchLast((m) => ({ ...m, tools: (m.tools ?? []).map((t) => (t.id === e.id ? { ...t, status: e.ok ? 'done' : 'failed', records: e.records } : t)) }));
          else if (e.type === 'done') patchLast((m) => ({ ...m, streaming: false, sources: e.sources, unverified: e.citedNotRetrieved, followUps: e.followUps }));
          else if (e.type === 'error') patchLast((m) => ({ ...m, streaming: false, error: { message: e.message, retryable: e.retryable } }));
        }
      }
      patchLast((m) => ({ ...m, streaming: false }));
    } catch (err) {
      if ((err as Error).name === 'AbortError') patchLast((m) => ({ ...m, streaming: false, content: m.content || '', error: m.content ? undefined : { message: 'Stopped.', retryable: true } }));
      else patchLast((m) => ({ ...m, streaming: false, error: { message: 'Connection lost before the answer finished.', retryable: true } }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      taRef.current?.focus();
    }
  }, [busy, msgs, context]);

  const retry = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const idx = msgs.lastIndexOf(lastUser);
    void send(lastUser.content, msgs.slice(0, idx));
  };

  const copy = async (i: number) => {
    try { await navigator.clipboard.writeText(msgs[i].content); setCopied(i); setTimeout(() => setCopied(null), 1500); } catch { /* blocked */ }
  };

  return (
    <div className={`flex min-h-0 flex-col ${compact ? 'h-full' : 'h-[calc(100vh-190px)] min-h-[520px]'}`}>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="mx-auto max-w-2xl pt-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-light text-brand"><Icon name="sparkles" size={24} /></span>
            <p className="mt-4 font-display text-xl font-semibold text-ink">Ask anything about your cases, schools and outcomes</p>
            <p className="mx-auto mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-ink-soft">
              Answers are built from records you are allowed to see, with the record ids cited. The assistant advises — it cannot approve, assign or close anything.
            </p>
            {!configured ? (
              <p className="mx-auto mt-4 max-w-md rounded-lg border border-warn/30 bg-warn-light px-3 py-2 text-[13px] text-warn">AI is not connected: no model API key is configured on the server.</p>
            ) : null}
            <div className={`mx-auto mt-6 grid gap-2 text-left ${compact ? '' : 'sm:grid-cols-2'}`}>
              {starters.map((q) => (
                <button key={q} type="button" onClick={() => send(q)} disabled={!configured}
                  className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13.5px] text-ink-soft shadow-card transition-colors hover:border-brand/40 hover:text-ink disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {msgs.map((m, i) => (
              <Fragment key={i}>
                {m.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-[14px] leading-relaxed text-white">{m.content}</div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-white"><Icon name="sparkles" size={15} /></span>
                    <div className="min-w-0 flex-1">
                      {m.tools && m.tools.length > 0 ? (
                        <ul className="mb-2 flex flex-wrap gap-1.5">
                          {m.tools.map((t) => (
                            <li key={t.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] ${t.status === 'failed' ? 'border-crit/30 bg-crit-light text-crit' : 'border-line bg-paper-sunk text-ink-soft'}`}>
                              {t.status === 'running' ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-brand border-t-transparent" /> : <Icon name={t.status === 'done' ? 'check' : 'alert'} size={12} />}
                              {t.label}{t.status === 'done' && t.records ? ` · ${t.records}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {m.content ? (
                        <div className="text-[14px] leading-relaxed text-ink-soft"><Markdown text={m.content} />{m.streaming ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand align-middle" /> : null}</div>
                      ) : m.streaming && !(m.tools?.length) ? (
                        <p className="flex items-center gap-2 text-[13px] text-ink-faint"><span className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:240ms]" /></span>Thinking…</p>
                      ) : null}
                      {m.error ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-crit/30 bg-crit-light px-3 py-2 text-[13px] text-crit" role="alert">
                          <Icon name="alert" size={15} />{m.error.message}
                          {m.error.retryable && i === msgs.length - 1 ? <button type="button" onClick={retry} className="btn-quiet btn-sm ml-auto">Retry</button> : null}
                        </div>
                      ) : null}
                      {!m.streaming && !m.error && m.content ? (
                        <div className="mt-2.5 space-y-2">
                          {m.sources && m.sources.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-faint">
                              <span className="font-medium">Sources:</span>{m.sources.slice(0, 14).map((id) => <SourceChip key={id} id={id} />)}
                            </div>
                          ) : (
                            <p className="text-[11.5px] text-ink-faint">No record ids were cited in this answer.</p>
                          )}
                          {m.unverified && m.unverified.length > 0 ? (
                            <p className="flex items-center gap-1.5 text-[11.5px] text-warn"><Icon name="alert" size={13} />Mentioned but not retrieved in this answer — check before relying on: {m.unverified.join(', ')}</p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button type="button" onClick={() => copy(i)} className="btn-ghost btn-sm px-2 text-[12px]"><Icon name={copied === i ? 'check' : 'copy'} size={13} />{copied === i ? 'Copied' : 'Copy'}</button>
                            {m.model ? <span className="text-[11px] text-ink-faint">{m.model} · AI-generated, verify before acting</span> : null}
                          </div>
                          {i === msgs.length - 1 && m.followUps && m.followUps.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {m.followUps.map((f) => (
                                <button key={f} type="button" onClick={() => send(f)} className="rounded-full border border-brand/25 bg-white px-3 py-1 text-[12.5px] text-brand hover:bg-brand-light">{f}</button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </Fragment>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="border-t border-line bg-ivory/80 pt-3">
        {context?.label ? (
          <p className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-faint"><Icon name="target" size={13} />Context: <span className="font-medium text-ink-soft">{context.label}</span></p>
        ) : null}
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-white p-2 shadow-card focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <textarea
            ref={taRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            placeholder={configured ? 'Ask a question… (Enter to send, Shift+Enter for a new line)' : 'AI is not connected'}
            disabled={!configured}
            aria-label="Ask Karyavahi AI"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="btn-quiet h-10 px-3" aria-label="Stop generating"><Icon name="stop" size={15} />Stop</button>
          ) : (
            <button type="submit" disabled={!input.trim() || !configured} className="btn-primary h-10 px-3" aria-label="Send"><Icon name="send" size={16} /></button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-faint">
          <span>Scoped to your records · fictional demo data</span>
          {msgs.length > 0 ? <button type="button" onClick={() => { abortRef.current?.abort(); setMsgs([]); }} className="hover:text-ink">Clear conversation</button> : null}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- the drawer
function useChatContext(): ChatContext {
  const path = usePathname();
  const sp = useSearchParams();
  const ctx: ChatContext = { path };
  const caseMatch = path.match(/^\/cases\/(CASE-\d{4})/);
  if (caseMatch) { ctx.caseId = caseMatch[1]; ctx.label = `Case ${caseMatch[1]}`; }
  if (path.startsWith('/hotspots')) {
    const sel = sp.get('selected');
    const level = sp.get('level');
    if (sel && level) { ctx.area = { level, id: sel }; ctx.label = `Selected ${level} ${sel}`; }
    else ctx.label = 'Learning hotspots';
  }
  const rep = path.match(/^\/reports\/(RPT-\d{5})/);
  if (rep) { ctx.reportId = rep[1]; ctx.label = `Report ${rep[1]}`; }
  if (!ctx.label) ctx.label = undefined;
  return ctx;
}

const STARTERS_FOR = (ctx: ChatContext): string[] =>
  ctx.caseId ? ['Explain this case in simple terms', 'What is missing before this case can close?', 'Why was this intervention selected, and what are the alternatives?', 'Have similar cases worked before?']
  : ctx.area ? ['Why is learning falling in this area?', 'Which schools contribute most here?', 'Are there open cases for this area?']
  : ctx.reportId ? ['Summarise this report', 'What decisions does this report call for?']
  : ['What should I prioritise this week?', 'Which cases need my approval?', 'Why are tasks overdue, and what is blocking them?', 'Prepare an agenda for tomorrow’s review meeting'];

export function AssistantDrawer({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const ctx = useChatContext();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (path.startsWith('/assistant')) return null;

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-navy py-2.5 pl-3 pr-4 text-[13.5px] font-medium text-white shadow-pop transition-transform hover:-translate-y-0.5 no-print sm:bottom-6 sm:right-6"
        aria-haspopup="dialog" aria-expanded={open}
      >
        <Icon name="sparkles" size={17} className="text-brand-soft" />
        <span className="hidden sm:inline">Ask Karyavahi AI</span><span className="sm:hidden">AI</span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 no-print" role="dialog" aria-modal="true" aria-label="Karyavahi AI">
          <button type="button" aria-label="Close assistant" className="absolute inset-0 bg-navy-950/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[520px] animate-fade-in flex-col bg-ivory shadow-pop">
            <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><Icon name="sparkles" size={16} /></span>
                <div><p className="text-[14.5px] font-semibold text-ink">Karyavahi AI</p><p className="text-[11.5px] text-ink-faint">Grounded in your records</p></div>
              </div>
              <div className="flex items-center gap-1">
                <Link href="/assistant" className="btn-ghost btn-sm" title="Open full page"><Icon name="arrow-up-right" size={15} /></Link>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm" aria-label="Close"><Icon name="x" size={17} /></button>
              </div>
            </header>
            <div className="min-h-0 flex-1 px-4 pb-3 pt-3">
              <ChatPanel compact context={ctx} starters={STARTERS_FOR(ctx)} configured={configured} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

import { getSession } from '@/lib/session';
import { may } from '@/lib/guard';
import { runChat, sanitizeHistory, type ChatEvent, type PageContext } from '@/lib/ai/chat';
import { rateLimited, logAi } from '@/lib/ai/client';
import { aiStatus } from '@/lib/ai/config';

/**
 * Karyavahi AI chat endpoint. Authenticates from the session cookie (never from the request
 * body), checks the ai.assistant grant, rate-limits per user, and streams newline-delimited
 * JSON events back. Aborting the fetch aborts the model call.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (!may(s, 'ai.assistant')) return Response.json({ error: 'Your role cannot use the assistant.' }, { status: 403 });

  const text = await req.text();
  if (text.length > 60_000) return Response.json({ error: 'Request too large.' }, { status: 413 });
  let body: { messages?: unknown; context?: PageContext };
  try { body = JSON.parse(text); } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const history = sanitizeHistory(body.messages);
  if (!history) return Response.json({ error: 'The conversation must end with a question.' }, { status: 400 });

  if (rateLimited(s.user_id, 'chat', 20, 5 * 60_000)) {
    logAi(s, { kind: 'ask', model: aiStatus().model, question: history.at(-1)!.content, tools: [], referencedIds: [], status: 'rate_limited' });
    return Response.json({ error: 'Too many questions in a short time. Wait a few minutes and try again.' }, { status: 429 });
  }

  const ctx: PageContext | undefined = body.context && typeof body.context === 'object' ? {
    path: typeof body.context.path === 'string' ? body.context.path : undefined,
    caseId: typeof body.context.caseId === 'string' ? body.context.caseId.toUpperCase().slice(0, 12) : undefined,
    area: body.context.area && typeof body.context.area.level === 'string' && typeof body.context.area.id === 'string'
      ? { level: body.context.area.level, id: body.context.area.id.slice(0, 16) } : undefined,
    reportId: typeof body.context.reportId === 'string' ? body.context.reportId.slice(0, 12) : undefined,
    label: typeof body.context.label === 'string' ? body.context.label.slice(0, 80) : undefined,
  } : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`)); } catch { /* client gone */ }
      };
      try {
        await runChat(s, history, ctx, emit, req.signal);
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}

/** Status probe for the UI: is a model configured? (Never returns the key.) */
export async function GET() {
  const s = await getSession();
  if (!s) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const st = aiStatus();
  return Response.json({ configured: st.configured, model: st.model, reason: st.reason ?? null });
}

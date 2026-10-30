import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { QUESTIONS, answer } from '@/lib/assistant';
import { may } from '@/lib/guard';
import { pick } from '@/lib/i18n';
import { Card, CardHead, PageHead, Callout, Empty, Mono } from '@/components/ui';
import { Pill } from '@/components/labels';
import { SIM_MODEL } from '@domain/catalog';

/**
 * Ask the record a question.
 *
 * Each answer is computed from rows the signed-in user can already read, and lists the ids it
 * came from. Nothing is generated: the page is honest that this is a fixed set of questions the
 * system can answer exactly, rather than a chat window that would sound more capable than it is.
 */

export default async function AssistantPage({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  if (!may(session, 'ai.assistant')) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHead title={pick(lang, 'Assistant', 'सहायक')} />
        <Callout tone="warn">{pick(lang, 'Not available to your role.', 'आपकी भूमिका के लिए उपलब्ध नहीं।')}</Callout>
      </div>
    );
  }

  const a = sp.q ? answer(session, sp.q, lang) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHead
        title={pick(lang, 'Ask the record', 'रिकॉर्ड से पूछें')}
        sub={pick(
          lang,
          'Questions the system can answer exactly, from the rows you are allowed to read. Each answer lists the records it was built from so you can check it.',
          'वे प्रश्न जिनका उत्तर प्रणाली ठीक-ठीक दे सकती है, आपके पठनीय रिकॉर्ड से। हर उत्तर अपने स्रोत रिकॉर्ड बताता है।',
        )}
      />

      <Callout tone="method" title={pick(lang, 'What this is, and what it is not', 'यह क्या है और क्या नहीं')}>
        {pick(
          lang,
          `No language model is called here. These answers are computed from the database, which is why each one can show the record ids behind it. A generated-text version would have to work the same way — answer only from cited rows and refuse to state a figure that is not in one — and every draft would be logged in the AI log as "${SIM_MODEL}" rows are. A chat box that sounded more capable than this would be the dishonest option, not the better one.`,
          `यहाँ कोई भाषा मॉडल नहीं चलता। ये उत्तर डेटाबेस से गणना किए जाते हैं, इसलिए हर उत्तर अपने स्रोत रिकॉर्ड दिखा सकता है।`,
        )}
      </Callout>

      <Card>
        <CardHead title={pick(lang, 'Questions', 'प्रश्न')} />
        <ul className="card-pad flex flex-wrap gap-2">
          {QUESTIONS.map((q) => (
            <li key={q.id}>
              <Link
                href={`/assistant?q=${q.id}`}
                className={`chip ${sp.q === q.id ? 'border-brand bg-brand text-white' : 'border-line-strong bg-white text-ink-soft hover:bg-paper-sunk'}`}
              >
                {pick(lang, q.label.en, q.label.hi)}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {a ? (
        <Card>
          <CardHead
            title={a.question}
            right={<Pill tone="neutral">{pick(lang, 'computed from records', 'रिकॉर्ड से गणना')}</Pill>}
          />
          <div className="card-pad space-y-3">
            <p className="text-[14px] leading-relaxed text-ink">{a.summary}</p>

            {a.rows.length > 0 ? (
              <ul className="divide-y divide-line rounded-md border border-line">
                {a.rows.map((r, i) => (
                  <li key={`${r.label}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 text-[13px] text-ink">
                      {r.href ? <Link href={r.href} className="link">{r.label}</Link> : r.label}
                    </span>
                    <span className="tnum shrink-0 text-[13px] font-medium text-ink-soft">{r.value}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty />}

            {a.caveat ? <Callout tone="warn" title={pick(lang, 'How to read this', 'इसे कैसे पढ़ें')}>{a.caveat}</Callout> : null}

            {a.citations.length > 0 ? (
              <div>
                <h3 className="h-section mb-1">{pick(lang, 'Built from these records', 'इन रिकॉर्ड से')}</h3>
                <p className="text-[12px] leading-relaxed text-ink-faint">
                  {a.citations.slice(0, 30).map((c) => <Mono key={c}>{c} </Mono>)}
                  {a.citations.length > 30 ? `+${a.citations.length - 30}` : null}
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <Empty>{pick(lang, 'Pick a question above.', 'ऊपर से कोई प्रश्न चुनें।')}</Empty>
        </Card>
      )}
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { getLanguage, getSession } from '@/lib/session';
import { homeFor } from '@/lib/nav';
import { pick } from '@/lib/i18n';
import { AuthFrame } from '@/components/Brand';

export const metadata: Metadata = { title: 'Privacy · Karyavahi' };
export const dynamic = 'force-dynamic';

/**
 * The privacy policy and data-deletion instructions for the hosted demo (also the address given to
 * Meta for the WhatsApp app). Public, in English and Hindi, and limited to what the code actually
 * does: fictional accounts, no student records, what reaches Claude and WhatsApp, and the resets.
 */
export default async function PrivacyPage() {
  const lang = await getLanguage();
  const session = await getSession();
  const L = (en: string, hi: string) => pick(lang, en, hi);

  const SECTIONS: { id: string; title: string; body: string[] }[] = [
    {
      id: 'what', title: L('What this is', 'यह क्या है'),
      body: [
        L('Karyavahi is a demonstration built for a hackathon. The people, accounts, cases, tasks and learning results in it are fictional. Schools, enrolment, teacher counts and locations come from public government data, with school names and codes withheld (see Sources).',
          'कार्यवाही एक हैकथॉन के लिए बना प्रदर्शन (डेमो) है। इसमें लोग, खाते, प्रकरण, काम और अधिगम परिणाम काल्पनिक हैं। विद्यालय, नामांकन, शिक्षक संख्या और स्थान सार्वजनिक सरकारी आँकड़ों से हैं, विद्यालयों के नाम और कोड छिपाकर (स्रोत देखें)।'),
        L('It holds no student-level records, by design.', 'डिज़ाइन से इसमें कोई छात्र-स्तरीय रिकॉर्ड नहीं है।'),
      ],
    },
    {
      id: 'collect', title: L('What the demo stores', 'डेमो क्या सहेजता है'),
      body: [
        L('Sign-in uses fictional demo accounts without passwords. Cookies keep you signed in (a random session token), remember your language, and, during an account request, the request reference.',
          'साइन-इन बिना पासवर्ड वाले काल्पनिक डेमो खातों से होता है। कुकीज़ आपको साइन-इन रखती हैं (एक यादृच्छिक सत्र टोकन), आपकी भाषा याद रखती हैं, और खाता-अनुरोध के दौरान अनुरोध संदर्भ।'),
        L('What you do in the demo is stored like real work would be: actions on cases and tasks, comments, uploaded proof photos and the location attached to proof (only at the moment proof is handed in), feedback ratings and comments, and an audit trail of every change.',
          'डेमो में आप जो करते हैं वह असली काम की तरह सहेजा जाता है: प्रकरणों और कामों पर कार्रवाई, टिप्पणियाँ, अपलोड किए सबूत-फ़ोटो और सबूत के साथ स्थान (केवल सबूत देते समय), प्रतिक्रिया-रेटिंग और टिप्पणियाँ, और हर बदलाव का लेखा-परीक्षा रिकॉर्ड।'),
      ],
    },
    {
      id: 'claude', title: L('Claude (AI)', 'Claude (AI)'),
      body: [
        L('When you ask Claude a question or for a draft, your question and the records needed to answer it (only records your demo account may see) are sent to Anthropic\'s API to produce the answer. The app logs the model, the tools used, the record ids cited, token counts and a short excerpt of the question, not whole conversations.',
          'जब आप Claude से प्रश्न या मसौदा माँगते हैं, तो आपका प्रश्न और उत्तर के लिए ज़रूरी रिकॉर्ड (केवल वे जो आपका डेमो खाता देख सकता है) उत्तर बनाने के लिए Anthropic के API को भेजे जाते हैं। ऐप मॉडल, उपयोग किए टूल, उद्धृत रिकॉर्ड आईडी, टोकन संख्या और प्रश्न का छोटा अंश दर्ज करता है, पूरी बातचीत नहीं।'),
      ],
    },
    {
      id: 'whatsapp', title: L('WhatsApp (test recipients only)', 'व्हाट्सऐप (केवल परीक्षण प्राप्तकर्ता)'),
      body: [
        L('Real WhatsApp messages are sent only to a few phone numbers the team has added as testers on Meta\'s test number. Those numbers are kept in the server\'s private configuration, not in the database; message ids from WhatsApp are stored only as one-way hashes, and numbers are shown masked on the admin page.',
          'असली व्हाट्सऐप संदेश केवल उन कुछ नंबरों पर भेजे जाते हैं जिन्हें टीम ने Meta के परीक्षण नंबर पर परीक्षक के रूप में जोड़ा है। ये नंबर सर्वर की निजी सेटिंग में रहते हैं, डेटाबेस में नहीं; व्हाट्सऐप संदेश आईडी केवल एकतरफ़ा हैश के रूप में रखी जाती हैं, और एडमिन पृष्ठ पर नंबर छिपाकर दिखते हैं।'),
        L('When a tester replies, the app reads the reply to act on that demo task (seen, started, or a photo as proof). Photos sent this way are stored as proof like any other. Messages also pass through Meta under WhatsApp\'s own terms.',
          'परीक्षक के उत्तर देने पर ऐप उसे पढ़कर उस डेमो काम पर कार्रवाई करता है (देखा, शुरू किया, या सबूत के रूप में फ़ोटो)। इस तरह भेजी फ़ोटो किसी भी सबूत की तरह सहेजी जाती है। संदेश व्हाट्सऐप की अपनी शर्तों के अंतर्गत Meta से होकर भी जाते हैं।'),
      ],
    },
    {
      id: 'retention', title: L('How long data is kept', 'डेटा कितने समय रहता है'),
      body: [
        L('The hosted demo goes back to its starting data every night at 03:00 India time and whenever the server restarts. Everything done in the demo, including uploaded photos and WhatsApp replies, is discarded then. Nothing is sold or shared for advertising.',
          'होस्ट किया डेमो हर रात 03:00 बजे (भारतीय समय) और सर्वर के हर पुनरारंभ पर अपने प्रारंभिक डेटा पर लौट जाता है। तब डेमो में किया सब कुछ, अपलोड की गई फ़ोटो और व्हाट्सऐप उत्तर सहित, हटा दिया जाता है। कुछ भी बेचा या विज्ञापन के लिए साझा नहीं किया जाता।'),
      ],
    },
    {
      id: 'deletion', title: L('Deleting your data', 'अपना डेटा हटाना'),
      body: [
        L('Demo activity is deleted automatically at the next nightly reset. If you are a WhatsApp tester and want your number removed sooner, or have any privacy question, contact the Karyavahi team through the contact listed in the hackathon submission; the team removes the number from the server configuration, which stops all messages to it.',
          'डेमो गतिविधि अगले रात्रिकालीन रीसेट पर अपने-आप हट जाती है। यदि आप व्हाट्सऐप परीक्षक हैं और अपना नंबर पहले हटवाना चाहते हैं, या गोपनीयता से जुड़ा कोई प्रश्न है, तो हैकथॉन प्रविष्टि में दिए संपर्क से कार्यवाही टीम से संपर्क करें; टीम नंबर को सर्वर सेटिंग से हटा देती है, जिससे उस पर सभी संदेश बंद हो जाते हैं।'),
      ],
    },
  ];

  return (
    <AuthFrame
      right={
        <>
          <form action="/api/language" method="post">
            <input type="hidden" name="to" value={lang === 'hi' ? 'en' : 'hi'} />
            <button type="submit" className="btn-ghost">{lang === 'hi' ? 'English' : 'हिंदी'}</button>
          </form>
          {session ? <Link href={homeFor(session)} className="btn-navy">{L('Back to the app', 'ऐप पर लौटें')}</Link> : <Link href="/demo" className="btn-navy">{L('Explore demo', 'डेमो देखें')}</Link>}
        </>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-5 sm:py-10">
        <header>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">{L('Privacy', 'गोपनीयता')}</h1>
          <p className="mt-2 text-sm text-ink-faint">{L('Applies to the hosted Karyavahi demo. Last updated 1 November 2026.', 'होस्ट किए गए कार्यवाही डेमो पर लागू। अंतिम अद्यतन 1 नवंबर 2026।')}</p>
        </header>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20 rounded-2xl border border-line bg-white p-5">
            <h2 className="text-lg font-semibold text-ink">{s.title}</h2>
            {s.body.map((p, i) => <p key={i} className="mt-2 text-base leading-relaxed text-ink-soft">{p}</p>)}
          </section>
        ))}
        <p className="text-xs text-ink-faint">
          {L('See also', 'यह भी देखें')}: <Link href="/sources" className="link">{L('Sources and credits', 'स्रोत और श्रेय')}</Link> · <Link href="/roadmap" className="link">{L('Roadmap', 'आगे की राह')}</Link>
        </p>
      </div>
    </AuthFrame>
  );
}

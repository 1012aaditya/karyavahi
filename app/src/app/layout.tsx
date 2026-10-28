import type { Metadata } from 'next';
import './globals.css';
import Shell from '@/components/Shell';
import { getLanguage } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Karyavahi — data to action (demo)',
  description:
    'A demo of the Karyavahi case ledger: a learning drop is detected from assessment data, diagnosed from context, planned, assigned, verified with proof, and closed only on a measured gain. All data is fictional.',
  robots: { index: false, follow: false },
};

/** Rendering is per-request: every page reads the signed-in user's scope and the demo clock. */
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLanguage();
  return (
    <html lang={lang}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        <div id="main">
          <Shell>{children}</Shell>
        </div>
      </body>
    </html>
  );
}

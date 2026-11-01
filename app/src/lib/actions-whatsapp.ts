'use server';

import { revalidatePath } from 'next/cache';
import { requireSession, getLanguage } from './session';
import { Refused } from './guard';
import { pick } from './i18n';
import { queueTestMessage } from './whatsapp/admin';

type State = { error?: string; ok?: string };

/** The outbox page's "Send a test message to my WhatsApp" button (demo admin only). */
export async function whatsappTestAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const lang = await getLanguage();
  try {
    const id = queueTestMessage(s, String(form.get('user_id') ?? '').trim());
    revalidatePath('/admin/outbox');
    return {
      ok: pick(
        lang,
        `Queued as ${id}. Refresh in a few seconds to see whether it was sent or is waiting for a reply.`,
        `${id} के रूप में कतार में। कुछ सेकंड बाद पेज ताज़ा करें: भेजा गया या जवाब की प्रतीक्षा में।`,
      ),
    };
  } catch (e) {
    if (e instanceof Refused) return { error: e.message };
    return { error: pick(lang, 'The test message could not be queued.', 'परीक्षण संदेश कतार में नहीं जुड़ सका।') };
  }
}

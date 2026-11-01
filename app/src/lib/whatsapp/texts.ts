import { pick } from '../i18n';
import { spokenDate } from '../reminders';
import type { ReplyButton } from './send';

/**
 * The words the WhatsApp channel sends, in the persona's own language (users.preferred_language).
 * The reminder and escalation texts themselves come from reminders.ts (messageFor), unchanged;
 * this file adds the reply buttons, the numbered menu and the confirmations.
 */

export type Lang = 'en' | 'hi';

/** Reply-button ids carry the action and the task: "ack:TSK-00895". */
export type ButtonAction = 'ack' | 'start' | 'proof';
export const ACTIONS: ButtonAction[] = ['ack', 'start', 'proof'];

export function taskButtons(lang: Lang, taskId: string): ReplyButton[] {
  return [
    { id: `ack:${taskId}`, title: pick(lang, 'Seen ✅', 'देख लिया ✅') },
    { id: `start:${taskId}`, title: pick(lang, 'Started', 'शुरू किया') },
    { id: `proof:${taskId}`, title: pick(lang, 'Send proof', 'सबूत भेजें') },
  ];
}

/** Under a task message: how to answer without the buttons. */
export function taskFooter(lang: Lang, taskId: string): string {
  return pick(
    lang,
    `Tap a button, or reply 1 = Seen, 2 = Started, 3 = Send proof. (${taskId})`,
    `बटन दबाएँ, या जवाब में भेजें: 1 = देख लिया, 2 = शुरू किया, 3 = सबूत भेजें। (${taskId})`,
  );
}

export interface MenuTask { id: string; title_en: string; title_hi: string | null; due_date: string }

const titleOf = (lang: Lang, t: { title_en: string; title_hi: string | null }) => (lang === 'hi' && t.title_hi ? t.title_hi : t.title_en);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function menuText(lang: Lang, name: string, tasks: MenuTask[]): string {
  if (tasks.length === 0) {
    return pick(
      lang,
      `Namaste ${name}. You have no open tasks right now. We will message you here when a task is given to you.`,
      `नमस्ते ${name}। अभी आपके पास कोई खुला काम नहीं है। कोई काम मिलने पर हम यहीं संदेश भेजेंगे।`,
    );
  }
  const lines = tasks.map((t, i) => `${i + 1}. ${clip(titleOf(lang, t), 70)} — ${pick(lang, 'due', 'अंतिम तिथि')} ${spokenDate(t.due_date, lang)} (${t.id})`);
  return [
    pick(lang, `Namaste ${name}. Your open tasks:`, `नमस्ते ${name}। आपके खुले काम:`),
    ...lines,
    '',
    pick(lang, 'Reply with a task\'s number to choose it.', 'किसी काम को चुनने के लिए उसका नंबर लिखकर भेजें।'),
  ].join('\n');
}

/** A task chosen from the menu, shown with its buttons. */
export function taskCard(lang: Lang, t: MenuTask & { status: string }): string {
  return [
    `${titleOf(lang, t)}`,
    `${pick(lang, 'Due', 'अंतिम तिथि')}: ${spokenDate(t.due_date, lang)}`,
    '',
    taskFooter(lang, t.id),
  ].join('\n');
}

export const W = {
  testMessage: (lang: Lang) => pick(
    lang,
    'Karyavahi test message: WhatsApp is connected. Send "hi" to see your open tasks.',
    'कार्यवाही परीक्षण संदेश: व्हाट्सऐप जुड़ गया है। अपने खुले काम देखने के लिए "hi" भेजें।',
  ),
  acknowledged: (lang: Lang, title: string) => pick(
    lang,
    `Noted: you have seen "${title}". Reply 2 when you start it.`,
    `दर्ज हुआ: आपने "${title}" देख लिया। काम शुरू करने पर 2 भेजें।`,
  ),
  started: (lang: Lang, title: string) => pick(
    lang,
    `Noted: "${title}" is started. When it is done, send a photo of the proof here.`,
    `दर्ज हुआ: "${title}" शुरू हो गया। काम पूरा होने पर सबूत की फ़ोटो यहीं भेजें।`,
  ),
  proofPrompt: (lang: Lang, title: string) => pick(
    lang,
    `Send a photo of the proof for "${title}" here. You can write a short note as the caption.`,
    `"${title}" के सबूत की फ़ोटो यहीं भेजें। चाहें तो फ़ोटो के साथ छोटा नोट लिखें।`,
  ),
  proofReceived: (lang: Lang, title: string, evidenceId: string) => pick(
    lang,
    `Proof received for "${title}" (${evidenceId}). Your officer will check it. Location: not available from WhatsApp.`,
    `"${title}" का सबूत मिल गया (${evidenceId})। आपके अधिकारी इसे जाँचेंगे। स्थान: व्हाट्सऐप से उपलब्ध नहीं।`,
  ),
  proofAlready: (lang: Lang, title: string, evidenceId: string) => pick(
    lang,
    `This photo was already received for "${title}" (${evidenceId}).`,
    `यह फ़ोटो "${title}" के लिए पहले ही मिल चुकी है (${evidenceId})।`,
  ),
  whichTask: (lang: Lang) => pick(
    lang,
    'Which task is this photo for? Send it again with the task number in the caption, for example TSK-00895.',
    'यह फ़ोटो किस काम की है? फ़ोटो दोबारा भेजें और कैप्शन में काम का नंबर लिखें, जैसे TSK-00895।',
  ),
  photoNote: (lang: Lang) => pick(lang, 'Photo sent on WhatsApp', 'व्हाट्सऐप पर भेजी गई फ़ोटो'),
  badPhoto: (lang: Lang) => pick(
    lang,
    'Only a JPEG, PNG or WebP photo of up to 5 MB can be proof. Please send a smaller photo.',
    'सबूत के लिए 5 MB तक की JPEG, PNG या WebP फ़ोटो ही भेजें। कृपया छोटी फ़ोटो भेजें।',
  ),
  downloadFailed: (lang: Lang) => pick(
    lang,
    'The photo could not be downloaded. Please send it again.',
    'फ़ोटो डाउनलोड नहीं हो सकी। कृपया दोबारा भेजें।',
  ),
  unsupported: (lang: Lang) => pick(
    lang,
    'I can read text, button taps and photos. Send "hi" to see your tasks.',
    'मैं लिखा हुआ संदेश, बटन और फ़ोटो पढ़ सकता हूँ। अपने काम देखने के लिए "hi" भेजें।',
  ),
  /** A refusal from the write layer, by its code, in the persona's language. */
  refused: (lang: Lang, code: string) => {
    switch (code) {
      case 'not_owner': return pick(lang, 'This task is not assigned to you.', 'यह काम आपको नहीं सौंपा गया है।');
      case 'not_found': return pick(lang, 'No such task was found.', 'यह काम नहीं मिला।');
      case 'wrong_status': return pick(
        lang,
        'This step is already done for this task, or the task has moved on.',
        'इस काम के लिए यह कदम पहले ही हो चुका है, या काम आगे बढ़ गया है।',
      );
      case 'duplicate_photo': return pick(
        lang,
        'This exact photo was already sent as proof. Take a new photo of this work.',
        'यही फ़ोटो पहले सबूत के रूप में भेजी जा चुकी है। इस काम की नई फ़ोटो लें।',
      );
      case 'bad_photo': case 'not_image': case 'too_large': return W.badPhoto(lang);
      case 'role': return pick(lang, 'Your role cannot hand in proof for this task.', 'आपकी भूमिका से इस काम का सबूत नहीं भेजा जा सकता।');
      default: return pick(lang, 'That could not be done. Please try again in the app.', 'यह नहीं हो सका। कृपया ऐप में दोबारा कोशिश करें।');
    }
  },
};

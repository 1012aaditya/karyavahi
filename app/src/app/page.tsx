import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { homeFor } from '@/lib/nav';

export default async function Index() {
  const s = await getSession();
  redirect(s ? homeFor(s) : '/login');
}

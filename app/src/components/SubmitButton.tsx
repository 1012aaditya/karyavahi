'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/** A submit button that shows a pending state while its form is in flight. */
export function SubmitButton({
  children, pendingLabel = 'Working…', className = 'btn-primary',
}: { children: ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {pendingLabel}
        </>
      ) : children}
    </button>
  );
}

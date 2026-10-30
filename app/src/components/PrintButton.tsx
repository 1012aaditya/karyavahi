'use client';

import { Icon } from './Icon';

/** Opens the browser's print dialog, from which the report can be printed or saved as PDF. */
export function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-quiet btn-sm">
      <Icon name="printer" size={14} />{label}
    </button>
  );
}

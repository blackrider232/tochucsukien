'use client';

import { PrintPage, RichHtml } from '@/components/ui';
import { useSettings } from '@/core/auth';
import type { IsoDate } from '@/core/brand';
import type { SceEvent } from '@/features/progress';
import type { DocumentTemplate } from '../contract';
import { renderTemplate } from '../domain/merge-tags';

/**
 * One template on A4 with NĐ 30 margins, merged with an event when given. It prints
 * through the (print) route, never the app screen, so the shell stays out (m3 B19).
 * Missing values print as dots; the document carries its own letterhead.
 */
export function PrintTemplate({ template, event, today }: { template: DocumentTemplate; event: SceEvent | null; today: IsoDate }) {
  const settings = useSettings();
  const html = event ? renderTemplate(template, { event, settings, today }) : template.content;
  return (
    <PrintPage size="A4" orientation="portrait" margins="nd30">
      <RichHtml html={html} />
    </PrintPage>
  );
}

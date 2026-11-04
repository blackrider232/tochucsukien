import type { SanitizedHtml } from '@/core/brand';

/** The only place raw HTML is rendered, and only a SanitizedHtml (output of sanitizeRichHtml). */
export function RichHtml({ html, className }: { html: SanitizedHtml; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

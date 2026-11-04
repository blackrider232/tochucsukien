// The daily report as Word HTML (.doc, decision 14), from the same document
// model as the print page. The NĐ30 header and the signature are tables with
// inline styles, because Word ignores CSS classes (m6 BUG-16). Every value is
// escaped by the html tag.

import type { SanitizedHtml } from '@/core/brand';
import { formatNd30Date } from '@/core/dates';
import type { OrgIdentity } from '@/core/settings';
import { fileNameStem, html } from '@/core/text';
import type { DailyReportDocument } from './report';

const P = 'margin:0;';

/**
 * The one table of NĐ30 type sizes, on the A4 sheet and in the Word file alike:
 * Times New Roman, the body at 14 pt, the legacy templates' size (the decree
 * allows 13 to 14). Inferred, not yet confirmed by the user (status, change
 * request 2). The print page sets these over the kit's px sizes; the Word file
 * writes them inline.
 */
export const ND30_PT = {
  body: 14,
  /** The letterhead: agency lines, Quốc hiệu, date. */
  header: 13,
  /** The signer's title, the "(Ký, ghi rõ họ tên)" line and the name. */
  signer: 14,
  /** "Nơi nhận:". */
  recipientsHeading: 12,
  /** The list of copies. */
  copies: 11,
} as const;

export function dailyReportWordBody(doc: DailyReportDocument, org: OrgIdentity): SanitizedHtml {
  const sections = doc.sections.map(
    (s) => html`<p style="margin:12pt 0 4pt 0;"><b>${s.heading}</b></p>${s.paragraphs.map((p) => html`<p style="margin:0 0 4pt 0;text-indent:1cm;text-align:justify;">${p}</p>`)}`,
  );
  return html`<div style="font-family:'Times New Roman',Times,serif;font-size:${ND30_PT.body}pt;"><table style="width:100%;border-collapse:collapse;border:none;">
<tr>
<td style="width:45%;text-align:center;vertical-align:top;font-size:${ND30_PT.header}pt;">
<p style="${P}">${org.parentAgency}</p>
<p style="${P}"><b>${org.agencyName}</b></p>
<p style="${P}">${doc.documentNumber}</p>
</td>
<td style="width:55%;text-align:center;vertical-align:top;font-size:${ND30_PT.header}pt;">
<p style="${P}"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b></p>
<p style="${P}"><b><u>Độc lập - Tự do - Hạnh phúc</u></b></p>
<p style="margin:6pt 0 0 0;"><i>${org.city}, ${formatNd30Date(doc.date)}</i></p>
</td>
</tr>
</table>
<p style="margin:18pt 0 0 0;text-align:center;"><b>${doc.title}</b></p>
<p style="${P}text-align:center;"><b>${doc.subject}</b></p>
<p style="margin:0 0 12pt 0;text-align:center;"><i>${doc.milestone}</i></p>
<p style="${P}text-align:center;">Kính gửi:</p>
${doc.recipients.map((r) => html`<p style="${P}margin-left:4cm;">- ${r}</p>`)}
${sections}
<table style="width:100%;border-collapse:collapse;border:none;margin-top:18pt;">
<tr>
<td style="width:50%;vertical-align:top;">
<p style="${P}font-size:${ND30_PT.recipientsHeading}pt;"><b><i>Nơi nhận:</i></b></p>
${doc.copies.map((c) => html`<p style="${P}font-size:${ND30_PT.copies}pt;">- ${c}</p>`)}
</td>
<td style="width:50%;text-align:center;vertical-align:top;font-size:${ND30_PT.signer}pt;">
<p style="${P}"><b>${doc.signer.title}</b></p>
<p style="${P}"><i>(Ký, ghi rõ họ tên)</i></p>
<p style="margin:60pt 0 0 0;"><b>${doc.signer.name}</b></p>
</td>
</tr>
</table></div>`;
}

/** 'BaoCaoHangNgay_Hoi_nghi_Xuc_tien_Dau_tu_2026_2026-12-08.doc': tone marks folded, never stripped to '_' (BUG-16). */
export function dailyReportFileName(eventName: string, reportDate: string): string {
  return `BaoCaoHangNgay_${fileNameStem(eventName, 40)}_${reportDate}.doc`;
}

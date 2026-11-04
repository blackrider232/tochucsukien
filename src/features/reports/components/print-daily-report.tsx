'use client';

// The daily report on A4 in the NĐ30 form (m6 §1.3.4, BUG-07/08/13/17/19/44):
// rendered from one issued snapshot, or from today's figures as a marked
// preview. Only the (print) route renders this.

import { Nd30Header, PrintPage, SignatureBlock, useSettings } from '@/components/ui';
import { orgIdentity } from '@/core/settings';
import { dailyReportDocument, type IssuedReport } from '../domain/report';
import { ND30_BODY_PT } from '../domain/word';

// The kit's paper uses the generic serif at 14 px, so this sheet names the face and the Word file's size itself.
const ND30_TYPE = `.nd30-report { font-family: "Times New Roman", Times, serif; font-size: ${ND30_BODY_PT}pt; line-height: 1.5; }
.nd30-report .nd30-small { font-size: 11pt; }`;

export function PrintDailyReport({ report, preview }: { report: IssuedReport; preview: boolean }) {
  const settings = useSettings();
  const doc = dailyReportDocument(report, orgIdentity(settings));
  return (
    <PrintPage size="A4" orientation="portrait" margins="nd30">
      <style>{ND30_TYPE}</style>
      <article className="nd30-report">
        {preview && <p className="mb-3 border border-paper-ink p-1 text-center font-bold">BẢN XEM TRƯỚC: CHƯA PHÁT HÀNH, SỐ LIỆU TẠI THỜI ĐIỂM XEM</p>}
        <Nd30Header issuer="trung_tam" documentNumber={doc.documentNumber} date={doc.date} />
        <div className="mt-4 text-center">
          <p className="font-bold">{doc.title}</p>
          <p className="font-bold">{doc.subject}</p>
          <p className="italic">{doc.milestone}</p>
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <p>Kính gửi:</p>
          <ul>
            {doc.recipients.map((r) => <li key={r}>- {r}</li>)}
          </ul>
        </div>
        {doc.sections.map((s) => (
          <section key={s.heading} className="mt-3">
            <h2 className="font-bold">{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i} className="indent-8 text-justify">{p}</p>)}
          </section>
        ))}
        <div className="nd30-small">
          <SignatureBlock right={{ title: doc.signer.title, note: '(Ký, ghi rõ họ tên)', name: doc.signer.name || undefined }} recipients={doc.copies} />
        </div>
      </article>
    </PrintPage>
  );
}

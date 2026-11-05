'use client';

import { createContext, useContext } from 'react';
import type { Nd30HeaderProps, PrintLinkProps, PrintPageProps, SignatureBlockProps } from './kit.types';
import { formatNd30Date } from '@/core/dates';
import { orgIdentity } from '@/core/settings';
import { useSettings } from '@/core/auth';
import { Button } from './button';
import { cn } from './cn';

/** The type scale of the PrintPage around a header or signature block. */
const PrintTypeContext = createContext<PrintPageProps['type']>(undefined);

const PAPER = {
  A4: { portrait: ['210mm', '297mm'], landscape: ['297mm', '210mm'] },
  A5: { portrait: ['148mm', '210mm'], landscape: ['210mm', '148mm'] },
} as const;

/** NĐ 30/2020 margins: top 20, bottom 20, left 30, right 15 (mm). Cards print edge to edge. */
const MARGIN = { nd30: '20mm 15mm 20mm 30mm', none: '0' } as const;

/** The @page rule printed for one PrintPage. Exported so tests and print routes can assert it. */
export function pageCss({ size, orientation, margins }: Pick<PrintPageProps, 'size' | 'orientation' | 'margins'>): string {
  return `@page { size: ${size} ${orientation}; margin: ${MARGIN[margins]}; }`;
}

/**
 * A sheet of paper. On screen it is a preview at true size; when printing, the @page rule sets
 * the size and margins and the sheet padding disappears. Use one PrintPage size per document.
 */
export function PrintPage({ size, orientation, margins, type, children }: PrintPageProps) {
  const [width, height] = PAPER[size][orientation];
  const css = `${pageCss({ size, orientation, margins })}
@media screen { .print-page { width: ${width}; min-height: ${height}; padding: ${MARGIN[margins]}; } }
@media print { .print-page { width: auto; min-height: 0; padding: 0; } }`;
  return (
    <>
      <style>{css}</style>
      <div
        data-print-page={`${size}-${orientation}`}
        className={cn(
          'print-page mx-auto my-4 box-border max-w-none bg-paper text-paper-ink shadow-pop',
          type === 'nd30' ? 'font-print text-nd30 leading-normal' : 'font-serif text-print-base leading-snug',
        )}
      >
        <PrintTypeContext.Provider value={type}>{children}</PrintTypeContext.Provider>
      </div>
    </>
  );
}

type Org = ReturnType<typeof orgIdentity>;

// NĐ30 letterhead: the direct parent agency in regular capitals, then the issuing body in bold.
// The Center and Sở Tài chính names come from settings (commit aff2037); UBND has no parent line.
const ISSUER_LINES: Record<Nd30HeaderProps['issuer'], (o: Org) => { parent: string | null; name: ReadonlyArray<string> }> = {
  ubnd: (o) => ({ parent: null, name: ['ỦY BAN NHÂN DÂN', `THÀNH PHỐ ${o.city.toUpperCase()}`] }),
  so_tai_chinh: (o) => ({ parent: `ỦY BAN NHÂN DÂN THÀNH PHỐ ${o.city.toUpperCase()}`, name: [o.parentAgency] }),
  trung_tam: (o) => ({ parent: o.parentAgency, name: [o.agencyName] }),
};

/** Quốc hiệu và Tiêu ngữ on the right, issuing body and document number on the left. */
export function Nd30Header({ issuer, documentNumber, date }: Nd30HeaderProps) {
  const settings = useSettings();
  const org = orgIdentity(settings);
  const lines = ISSUER_LINES[issuer](org);
  const nd30 = useContext(PrintTypeContext) === 'nd30';
  return (
    <header className={cn('mb-4 grid grid-cols-[1fr_1.15fr] gap-4 text-center', nd30 ? 'text-nd30-header' : 'text-print-sm')}>
      <div>
        {lines.parent && <p className="uppercase">{lines.parent}</p>}
        {lines.name.map((line) => <p key={line} className="font-bold uppercase">{line}</p>)}
        <p aria-hidden="true" className="mx-auto mt-0.5 h-px w-20 bg-paper-ink" />
        <p className="mt-2">{documentNumber ?? `Số: ..... /${org.agencyShortName}`}</p>
      </div>
      <div>
        <p className="font-bold uppercase">Cộng hòa xã hội chủ nghĩa Việt Nam</p>
        <p className="font-bold">Độc lập - Tự do - Hạnh phúc</p>
        <p aria-hidden="true" className="mx-auto mt-0.5 h-px w-40 bg-paper-ink" />
        <p className="mt-2 italic">
          {org.city}, {date ? formatNd30Date(date) : 'ngày ..... tháng ..... năm .....'}
        </p>
      </div>
    </header>
  );
}

function Signatory({ title, note, name }: { title: string; note?: string; name?: string }) {
  return (
    <div className="text-center">
      <p className="font-bold uppercase">{title}</p>
      <p className="italic">{note ?? '(Ký, ghi rõ họ tên)'}</p>
      <div className="h-20" />
      {name && <p className="font-bold">{name}</p>}
    </div>
  );
}

/** Signatories at the bottom, with the "Nơi nhận" list on the left when given. */
export function SignatureBlock({ left, right, recipients }: SignatureBlockProps) {
  const nd30 = useContext(PrintTypeContext) === 'nd30';
  return (
    <footer className={cn('mt-6 break-inside-avoid', nd30 ? 'text-nd30' : 'text-print-sm')}>
      <div className="grid grid-cols-2 gap-4">
        <div>{left && <Signatory {...left} />}</div>
        <Signatory {...right} />
      </div>
      {recipients && recipients.length > 0 && (
        <div className="mt-4">
          <p className={cn('font-bold italic', nd30 && 'text-nd30-note')}>Nơi nhận:</p>
          <ul className={nd30 ? 'text-nd30-copies' : 'text-print-xs'}>
            {recipients.map((r) => (
              <li key={r}>- {r}</li>
            ))}
          </ul>
        </div>
      )}
    </footer>
  );
}

/** Opens a (print) route in a new tab. The route prints itself; this never prints the app shell. */
export function PrintLink({ href, label = 'In' }: PrintLinkProps) {
  return <Button href={href} newTab variant="secondary" icon="printer">{label}</Button>;
}

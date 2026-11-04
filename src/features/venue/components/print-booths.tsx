'use client';

import { PrintPage } from '@/components/ui';
import { formatVNDate } from '@/core/dates';
import { BOOTH_STATUS, boothsByRow } from '../domain/booths';
import type { BoothsScreenData } from './screen-types';

const cell = 'border border-paper-ink px-1 py-0.5 align-top';

/** A4 landscape floorplan by row, then the full list (m4b BUG-27). */
export function PrintBooths({ data }: { data: BoothsScreenData }) {
  const { event, booths, today } = data;
  return (
    <PrintPage size="A4" orientation="landscape" margins="nd30">
      <h1 className="text-center text-print-lg font-bold uppercase">Sơ đồ mặt bằng gian hàng hội chợ</h1>
      <p className="text-center font-bold">{event.name}</p>
      <p className="mb-3 text-center text-print-sm italic">Ngày tổ chức {formatVNDate(event.eventDate)} • {booths.length} gian 3m x 3m • In ngày {formatVNDate(today)}</p>
      {booths.length === 0 && <p className="text-center">Chưa có gian hàng.</p>}
      {boothsByRow(booths).map(({ row, booths: list }) => (
        <section key={row} className="mb-3 break-inside-avoid-page">
          <h2 className="font-bold">Dãy {row}</h2>
          <table className="mt-1 w-full table-fixed border-collapse text-print-xs">
            <tbody>
              {Array.from({ length: Math.ceil(list.length / 8) }, (_, r) => (
                <tr key={r} className="break-inside-avoid">
                  {list.slice(r * 8, r * 8 + 8).map((b) => (
                    <td key={b.id} className={cell}>
                      <span className="font-bold">{b.code}</span> · {b.subsidyPercent}%<br />
                      {b.company || 'Chưa có doanh nghiệp'}<br />
                      <span className="italic">{BOOTH_STATUS[b.status].short}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {booths.length > 0 && (
        <table className="mt-4 w-full border-collapse text-print-xs">
          <thead>
            <tr>
              {['Mã gian', 'Doanh nghiệp / HTX', 'Sản phẩm', 'Quy cách', 'Hỗ trợ', 'Trạng thái', 'Đại diện & hotline', 'Cán bộ SCE trực'].map((h) => <th key={h} className={`${cell} text-left font-bold`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {boothsByRow(booths).flatMap((r) => r.booths).map((b) => (
              <tr key={b.id} className="break-inside-avoid">
                <td className={cell}>{b.code}</td>
                <td className={cell}>{b.company}</td>
                <td className={cell}>{b.products}</td>
                <td className={cell}>{b.size}</td>
                <td className={cell}>{b.subsidyPercent}%</td>
                <td className={cell}>{BOOTH_STATUS[b.status].label}</td>
                <td className={cell}>{b.contact}</td>
                <td className={cell}>{b.staff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintPage>
  );
}

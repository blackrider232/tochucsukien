'use client';

// VIP car passes (m5 §1.7, §3.7, decision 9): A5 landscape, one per page, for
// each VIP who has not declined, with the agency names from settings and the
// legacy fields only (no plate or driver). Its own print route, not a print of
// the app (BUG-32).

import { PrintPage, useSettings } from '@/components/ui';
import { orgIdentity } from '@/core/settings';
import { carPassGuests } from '../domain/desk';
import type { LiveScreenData } from '../domain/screen';

export function CarPassPrint({ data }: { data: LiveScreenData }) {
  const org = orgIdentity(useSettings());
  const guests = carPassGuests(data.roster);
  if (guests.length === 0) {
    return (
      <PrintPage size="A5" orientation="landscape" margins="none">
        <p className="p-8 text-center">Chưa có đại biểu VIP để tạo thẻ xe.</p>
      </PrintPage>
    );
  }
  return (
    <>
      {guests.map((g) => (
        <PrintPage key={g.id} size="A5" orientation="landscape" margins="none">
          <article className="m-3 flex flex-col gap-3 border-4 border-double border-paper-ink p-5 break-after-page" aria-label={`Thẻ xe ưu tiên của ${g.name}`}>
            <header className="text-center">
              <p className="text-print-sm uppercase">{org.parentAgency}</p>
              <p className="text-print-sm font-bold uppercase">{org.agencyName}</p>
            </header>
            <h1 className="text-center text-print-lg font-black uppercase">Xe ưu tiên sự kiện</h1>
            <p className="text-center text-print-sm font-semibold uppercase">VIP car pass • Sảnh đón chính</p>
            <p className="text-center font-bold uppercase">{data.event.name}</p>
            <div className="grid grid-cols-2 gap-4 border-t border-paper-ink pt-3">
              <div>
                <p className="text-print-xs">Phương tiện phục vụ:</p>
                <p className="font-bold uppercase">{g.title || 'Lãnh đạo VIP'}</p>
                <p className="font-bold">{g.name}</p>
                {g.organization && <p className="text-print-sm">{g.organization}</p>}
              </div>
              <div className="text-right">
                <p className="text-print-xs">Khu vực dừng đỗ:</p>
                <p className="font-bold uppercase">Cổng VIP - Sảnh A</p>
                <p className="text-print-sm">Lối đón tiếp dành riêng</p>
              </div>
            </div>
            <p className="text-print-xs italic">* Yêu cầu lái xe dán thẻ tại góc dưới bên phải kính chắn gió trước. Lực lượng an ninh tạo điều kiện cho xe vào sảnh đón.</p>
          </article>
        </PrintPage>
      ))}
    </>
  );
}

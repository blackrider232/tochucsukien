'use client';

import { PrintPage } from '@/components/ui';
import { formatVNDate } from '@/core/dates';
import { formatCount, hallCapacity, seatCodes } from '../domain/halls';
import type { SeatingScreenData } from './screen-types';
import { hallTitle } from './seating-view';

const cell = 'border border-paper-ink px-1 py-0.5 align-top';

/** A4 landscape seating chart with the event and hall header, not a print of the app (m4b BUG-27). */
export function PrintSeating({ data }: { data: SeatingScreenData }) {
  const { event, hall, templates, seats, guests, today } = data;
  const names = new Map(guests.ready ? guests.value.map((g) => [g.id, g.name]) : []);
  const occupant = new Map(seats.map((s) => [s.seatCode, s.guestId]));
  return (
    <PrintPage size="A4" orientation="landscape" margins="nd30">
      <h1 className="text-center text-print-lg font-bold uppercase">Sơ đồ chỗ ngồi hội trường</h1>
      <p className="text-center font-bold">{event.name}</p>
      {hall ? (
        <>
          <p className="mb-3 text-center text-print-sm italic">
            {hallTitle(hall, templates).name} • Tổng {formatCount(hallCapacity(hall.zones))} ghế ({hall.zones.length} khu) • Ngày tổ chức {formatVNDate(event.eventDate)} • In ngày {formatVNDate(today)}
          </p>
          <p className="mb-2 border border-paper-ink py-1 text-center text-print-sm font-bold">Sân khấu chính</p>
          {hall.zones.map((zone) => (
            <section key={zone.key} className="mb-3 break-inside-avoid-page">
              <h2 className="font-bold">{zone.name}{zone.vipZone ? ' (khu VIP)' : ''}</h2>
              <table className="mt-1 w-full table-fixed border-collapse text-print-xs">
                <tbody>
                  {Array.from({ length: Math.ceil(zone.seatCount / 8) }, (_, row) => (
                    <tr key={row} className="break-inside-avoid">
                      {seatCodes(zone).slice(row * 8, row * 8 + 8).map((code) => {
                        const guestId = occupant.get(code);
                        return (
                          <td key={code} className={cell}>
                            <span className="font-bold">{code}</span>
                            <br />
                            {guestId ? names.get(guestId) ?? 'Đã xếp' : 'Trống'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {!guests.ready && <p className="text-print-xs italic">Danh sách khách mời chưa sẵn sàng: bản in chỉ có mã ghế đã xếp.</p>}
        </>
      ) : (
        <p className="mt-4 text-center">Sự kiện chưa chọn hội trường.</p>
      )}
    </PrintPage>
  );
}

// The seating screen in the dev memory runtime before feature guests lands:
// the event's real hall and templates, fake guests, and fake seats that live
// only in this page's props. Saving still goes through the real commands,
// which answer "chưa sẵn sàng" until the roster exists.

import type { RequestContext } from '@/core/auth';
import type { GuestId, SeatCode } from '@/core/brand';
import { assertDevMemory } from '@/core/dev/mode';
import type { GuestGroup, RsvpStatus } from '@/core/vocab';
import type { SceEvent } from '@/features/progress';
import type { SeatGuestView, SeatingScreenData } from '../components/screen-types';
import { seatingScreen } from './screen-data';

const FAKE: ReadonlyArray<[name: string, organization: string, group: GuestGroup, rsvp: RsvpStatus, seat: string | null]> = [
  ['[DEV] Nguyễn Văn Khách', 'UBND Thành phố (giả)', 'VIP', 'confirmed', 'A-01'],
  ['[DEV] Trần Thị Khách', 'Bộ Kế hoạch (giả)', 'VIP', 'substituted', 'A-02'],
  ['[DEV] Lê Văn Sở', 'Sở Tài chính (giả)', 'SoNganh', 'confirmed', 'B-01'],
  ['[DEV] Phạm Thị Ngành', 'Sở Công Thương (giả)', 'SoNganh', 'confirmed', null],
  ['[DEV] Hoàng Văn Quận', 'UBND Quận (giả)', 'SoNganh', 'pending', null],
  ['[DEV] Kim Min-ji', 'Đại sứ quán (giả)', 'QuocTe', 'confirmed', 'C-03'],
  ['[DEV] Công ty Mẫu A', 'Doanh nghiệp giả A', 'DoanhNghiep', 'confirmed', null],
  ['[DEV] Công ty Mẫu B', 'Doanh nghiệp giả B', 'DoanhNghiep', 'confirmed', 'Z-09'],
  ['[DEV] Phóng viên Mẫu', 'Báo giả', 'BaoChi', 'confirmed', null],
  ['[DEV] Người Báo Vắng', 'Cơ quan giả', 'DoanhNghiep', 'declined', null],
  ['<img src=x onerror=alert(1)> [DEV] Tên có thẻ', '"><script>alert(1)</script>', 'DoanhNghiep', 'confirmed', 'C-05'],
];

export async function seatingHarness(ctx: RequestContext, event: SceEvent): Promise<SeatingScreenData> {
  assertDevMemory();
  const base = await seatingScreen(ctx, event);
  const guests: SeatGuestView[] = FAKE.map(([name, organization, group, rsvpStatus], i) => ({
    id: `0000dead-0000-4000-8000-${String(i + 1).padStart(12, '0')}` as GuestId, name, title: '', organization, group, rsvpStatus,
  }));
  const seats = FAKE.flatMap(([, , , , seat], i) => (seat ? [{ eventId: event.id, seatCode: seat as SeatCode, guestId: guests[i]!.id }] : []));
  return { ...base, guests: { ready: true, value: guests }, seats: [...base.seats, ...seats] };
}

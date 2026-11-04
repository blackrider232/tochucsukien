'use client';

// The reception desk's actions and their feedback, shared by the table, the
// scanner and the walk-in dialog: one check-in path (declined confirm, sound,
// vibration, VIP alert queue), one scan path, one place that words results.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Dialog, useBeep, useDialogs, useToast } from '@/components/ui';
import type { EventId, Instant } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { nowInstant } from '@/core/dates';
import type { RosterEntry } from '@/features/guests';
import type { EventHall } from '@/features/venue';
import type { ScanOutcome } from '../contract';
import { formatAt, seatLabel } from '../domain/desk';

/** What the arrival feedback shows; a walk-in has no roster entry on the client yet. */
type Arrived = Pick<RosterEntry, 'name' | 'group' | 'title' | 'organization' | 'seatCode'>;
type Arrival = { guest: Arrived; at: Instant };

/** What a check-in attempt really did. A server refusal and a failed request both read as 'failed': useCommand does not say which. */
export type CheckInDone = 'checked_in' | 'already' | 'skipped_by_staff' | 'failed';
export type ScanDone = { outcome: ScanOutcome; checkIn: CheckInDone | null };

export interface DeskActions {
  checkIn(g: RosterEntry): Promise<CheckInDone>;
  /** Resolves what was scanned or typed, checks in on a single match and says what happened. */
  scan(raw: string): Promise<ScanDone | null>;
  cancel(g: RosterEntry): Promise<void>;
  setGift(g: RosterEntry, given: boolean): Promise<void>;
  /** Feedback for a guest who just arrived by another path (walk-in, substitute). */
  arrived(guest: Arrived, at: Instant): void;
}

const Ctx = createContext<DeskActions | null>(null);

export function useDesk(): DeskActions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDesk outside DeskProvider');
  return ctx;
}

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
};

const OFFLINE = 'Ngoại tuyến: chưa check-in được. Chờ có mạng lại rồi quét lại.';

export function DeskProvider({ eventId, hall, online, children }: { eventId: EventId; hall: EventHall | null; online: boolean; children: ReactNode }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const toast = useToast();
  const beep = useBeep();
  const [alerts, setAlerts] = useState<ReadonlyArray<Arrival>>([]);
  const [choices, setChoices] = useState<ReadonlyArray<RosterEntry> | null>(null);

  const feedbackOn = beep.enabled;
  const fail = useCallback(() => {
    beep.error();
    if (feedbackOn) vibrate([90, 60, 90]);
  }, [beep, feedbackOn]);

  const arrived = useCallback((guest: Arrived, at: Instant) => {
    beep.ok();
    if (feedbackOn) vibrate(60);
    if (guest.group === 'VIP') setAlerts((q) => [...q, { guest, at }]);
    else toast.success(`Check-in: ${guest.name}${guest.seatCode ? ` (ghế ${guest.seatCode})` : ''}`);
  }, [beep, feedbackOn, toast]);

  const already = useCallback((g: RosterEntry, at: Instant): CheckInDone => {
    fail();
    toast.warning(`${g.name} đã check-in lúc ${formatAt(at, nowInstant())}. Không thay đổi.`);
    return 'already';
  }, [fail, toast]);

  const checkIn = useCallback(async (g: RosterEntry): Promise<CheckInDone> => {
    if (g.checkedInAt) return already(g, g.checkedInAt);
    if (!online) {
      fail();
      toast.error(OFFLINE);
      return 'failed';
    }
    let command: 'live.checkIn' | 'live.checkInDeclined' = 'live.checkIn';
    if (g.rsvpStatus === 'declined') {
      const ok = await dialogs.confirm({
        title: 'Đại biểu đã từ chối. Vẫn check-in?',
        text: `${g.name} đã báo vắng. Việc check-in đại biểu này sẽ được ghi vào nhật ký.`,
        confirmLabel: 'Vẫn check-in',
        cancelLabel: 'Không check-in',
        tone: 'warning',
      });
      if (!ok) return 'skipped_by_staff';
      command = 'live.checkInDeclined';
    }
    const r = await run(command, { eventId, guestId: g.id, desk: null });
    if (!r) {
      fail();
      return 'failed';
    }
    if (r.already) return already(g, r.checkIn.checkedInAt!);
    arrived(g, r.checkIn.checkedInAt!);
    return 'checked_in';
  }, [already, arrived, dialogs, eventId, fail, online, run, toast]);

  const scan = useCallback(async (raw: string): Promise<ScanDone | null> => {
    const code = raw.trim();
    if (!code) return null;
    const outcome = await run('live.scan', { eventId, raw: code }, { undoable: false });
    if (!outcome) {
      fail();
      return null;
    }
    switch (outcome.kind) {
      case 'ok':
        return { outcome, checkIn: await checkIn(outcome.guest) };
      case 'already':
        already(outcome.guest, outcome.at);
        break;
      case 'ambiguous':
        fail();
        setChoices(outcome.candidates);
        break;
      case 'other_event':
        fail();
        toast.error(`Mã thuộc sự kiện khác${outcome.eventName ? ` (${outcome.eventName})` : ''}. Kiểm tra lại thẻ của đại biểu.`);
        break;
      case 'not_found':
        fail();
        toast.error(`Không tìm thấy đại biểu khớp với mã quét: "${code}"`);
        break;
    }
    return { outcome, checkIn: null };
  }, [already, checkIn, eventId, fail, run, toast]);

  const cancel = useCallback(async (g: RosterEntry) => {
    const ok = await dialogs.confirm({
      title: `Hủy check-in của ${g.name}?`,
      text: 'Đại biểu trở về trạng thái chưa đến; ghi nhận phát quà (nếu có) cũng bị bỏ. Có thể hoàn tác ngay sau đó.',
      confirmLabel: 'Hủy check-in',
      cancelLabel: 'Không',
      tone: 'danger',
    });
    if (ok) await run('live.cancelCheckIn', { eventId, guestId: g.id }, { success: `Đã hủy check-in: ${g.name}` });
  }, [dialogs, eventId, run]);

  const setGift = useCallback(async (g: RosterEntry, given: boolean) => {
    await run('live.setGift', { eventId, guestId: g.id, given }, { success: given ? `Đã phát túi quà & tài liệu: ${g.name}` : `Đã bỏ ghi nhận phát quà: ${g.name}` });
  }, [eventId, run]);

  const value = useMemo(() => ({ checkIn, scan, cancel, setGift, arrived }), [checkIn, scan, cancel, setGift, arrived]);
  const pick = async (g: RosterEntry) => {
    setChoices(null);
    await checkIn(g);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <VipAlert queue={alerts} hall={hall} onDone={() => setAlerts((q) => q.slice(1))} />
      <Dialog open={choices !== null} onClose={() => setChoices(null)} title="Có nhiều đại biểu khớp mã" subtitle="Chọn đúng đại biểu trước mặt để check-in" icon="users">
        <ul className="divide-y divide-line">
          {(choices ?? []).map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{g.name}</span>
                <span className="block text-xs text-ink-muted">{[g.title, g.organization, g.phone].filter(Boolean).join(' • ')}</span>
              </span>
              <Button variant="secondary" icon="check" onClick={() => void pick(g)}>Check-in</Button>
            </li>
          ))}
        </ul>
      </Dialog>
    </Ctx.Provider>
  );
}

/** One VIP arrival at a time, queued when two arrive back to back (m5 §3.6, BUG-21, BUG-23): every line comes from data. */
function VipAlert({ queue, hall, onDone }: { queue: ReadonlyArray<Arrival>; hall: EventHall | null; onDone: () => void }) {
  const current = queue[0];
  if (!current) return null;
  const { guest, at } = current;
  const more = queue.length - 1;
  return (
    <Dialog
      open
      onClose={onDone}
      size="md"
      icon="star"
      title="Đại biểu VIP đã đến"
      subtitle={more > 0 ? `Còn ${more} thông báo VIP đang chờ` : 'Thông báo lễ tân'}
      footer={<Button accent="emerald" icon="check" onClick={onDone}>Đã tiếp nhận, bắt đầu đón tiếp</Button>}
    >
      <div className="space-y-3 text-center">
        <Badge tone="amber" icon="star">VIP</Badge>
        <p className="text-xl font-bold break-words text-ink">Đồng chí {guest.name}</p>
        <p className="text-sm text-ink-2">{[guest.title || 'Lãnh đạo', guest.organization].filter(Boolean).join(' - ')}</p>
        <dl className="grid grid-cols-1 gap-2 text-left text-sm sm:grid-cols-2">
          <div className="rounded-control bg-surface-2 p-3">
            <dt className="text-xs text-ink-muted">Thời gian đến</dt>
            <dd className="font-semibold text-ink">{formatAt(at, nowInstant())}</dd>
          </div>
          <div className="rounded-control bg-surface-2 p-3">
            <dt className="text-xs text-ink-muted">Vị trí ghế</dt>
            <dd className="font-semibold break-words text-ink">{guest.seatCode ? seatLabel(hall, guest.seatCode) : 'Chưa xếp ghế'}</dd>
          </div>
        </dl>
        <p className="text-sm text-ink-2">Báo Trưởng ban tổ chức ra đón và hướng dẫn đại biểu vào vị trí.</p>
      </div>
    </Dialog>
  );
}

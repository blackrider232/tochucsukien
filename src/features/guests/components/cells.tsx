'use client';

import { useState } from 'react';
import { Badge, Button, Icon, StatusBadge, downloadBlob, useToast } from '@/components/ui';
import { useAppContext } from '@/core/auth';
import { nowInstant } from '@/core/dates';
import { GUEST_GROUPS, RSVP, enumOptions } from '@/core/vocab';
import type { RosterEntry } from '../contract';
import { guestListFileName, guestListXlsx } from '../domain/export';
import { isBanquetGuest, titleOrDefault } from '../domain/roster';
import type { GuestScreenData } from '../domain/screen';

export const GROUP_FILTER = [{ value: 'all', label: 'Tất cả nhóm khách' }, ...enumOptions(GUEST_GROUPS).map((o) => ({ value: o.value, label: o.label }))];
export const RSVP_FILTER = [{ value: 'all', label: 'Tất cả trạng thái RSVP' }, ...enumOptions(RSVP).map((o) => ({ value: o.value, label: o.label }))];

/** Every value is React text: markup in a name or an organisation shows as typed (m4a B01-B06, B09). */
export function NameCell({ g, contact = true }: { g: RosterEntry; contact?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="flex items-center gap-1 font-semibold text-ink">
        {g.group === 'VIP' && <Icon name="star" size={14} />}
        <span className="break-words">{g.name}</span>
      </p>
      {g.rsvpStatus === 'substituted' && g.substituteName && <p className="text-xs italic text-warning-ink">Người thay: {g.substituteName}</p>}
      {contact && (g.phone || g.email) && (
        <p className="flex flex-wrap gap-x-3 text-xs text-ink-muted">
          {g.phone && <span className="inline-flex items-center gap-1"><Icon name="phone" size={12} />{g.phone}</span>}
          {g.email && <span className="inline-flex items-center gap-1 break-all"><Icon name="mail" size={12} />{g.email}</span>}
        </p>
      )}
    </div>
  );
}

export function OrgCell({ g, notes = false }: { g: RosterEntry; notes?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      <p className="font-medium text-ink-2">{titleOrDefault(g)}</p>
      <p className="text-ink-muted">{g.organization}</p>
      {notes && g.notes && <p className="flex items-start gap-1 text-xs text-ink-muted"><Icon name="info" size={12} />{g.notes}</p>}
    </div>
  );
}

export const GroupCell = ({ g }: { g: RosterEntry }) => <StatusBadge registry={GUEST_GROUPS} value={g.group} size="sm" />;
export const RsvpCell = ({ g }: { g: RosterEntry }) => <StatusBadge registry={RSVP} value={g.rsvpStatus} size="sm" />;

export function BanquetCell({ g }: { g: RosterEntry }) {
  if (!g.hasBanquet) return <span className="text-sm text-ink-muted">Không</span>;
  return isBanquetGuest(g) ? <Badge tone="amber">Có</Badge> : <span className="text-sm text-ink-muted">Có (đã báo vắng)</span>;
}

export function SeatCell({ g, empty = 'Chưa xếp' }: { g: RosterEntry; empty?: string }) {
  return g.seatCode ? <span className="font-mono text-sm font-semibold text-ink">{g.seatCode}</span> : <span className="text-sm text-ink-muted">{empty}</span>;
}

/** The styled guest-list workbook (m4c §1.6), built in the browser from the roster on screen. */
export function ExportButton({ data, variant = 'secondary' }: { data: GuestScreenData; variant?: 'secondary' | 'ghost' }) {
  const { profile, settings } = useAppContext();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const exportList = async () => {
    if (data.roster.length === 0) {
      toast.info('Chưa có đại biểu nào trong sự kiện này để xuất file.');
      return;
    }
    setBusy(true);
    try {
      const now = nowInstant();
      const blob = await guestListXlsx({ event: data.event, roster: data.roster, settings, author: { fullname: profile.fullname, department: profile.department }, now });
      downloadBlob(blob, guestListFileName(data.event.name, now));
      toast.success('Đã xuất file Excel (.xlsx)');
    } catch {
      toast.error('Không tạo được file Excel. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };
  return <Button variant={variant} icon="file-spreadsheet" loading={busy} onClick={() => void exportList()}>Xuất Excel</Button>;
}

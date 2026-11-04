'use client';

import { useState } from 'react';
import { Badge, Button, EmptyState, Icon, KpiCard, RowMenu, SectionCard, useDialogs } from '@/components/ui';
import { useCommand } from '@/core/commands';
import type { HallTemplate } from '../contract';
import { formatCount, hallCapacity } from '../domain/halls';
import { HallTemplateDialog } from './hall-template-dialog';
import { ZoneBadge } from './zone-badge';

/** "Quản trị Hội trường": the hall catalog, admin only (m4b §1.1, BUG-16). One list renderer (m4b BUG-28). */
export function AdminHalls({ templates, usage }: { templates: ReadonlyArray<HallTemplate>; usage: Readonly<Record<string, number>> }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<HallTemplate | 'new' | null>(null);
  const seats = templates.reduce((sum, t) => sum + hallCapacity(t.zones), 0);
  const zones = templates.flatMap((t) => t.zones);
  const names = templates.map((t) => t.name);

  const restore = async () => {
    const ok = await dialogs.confirm({
      title: 'Khôi phục hội trường mẫu?',
      text: 'Ba hội trường mẫu ban hành (NCC, Hội trường tầng 3 UBND Thành phố, Tầng 2 SCE) trở về nội dung gốc. Các hội trường mẫu tự tạo được giữ nguyên.',
      confirmLabel: 'Khôi phục ngay',
      cancelLabel: 'Hủy',
    });
    if (ok) await run('venue.restoreDefaultHallTemplates', {}, { success: 'Đã khôi phục hội trường mẫu ban hành' });
  };
  const remove = async (t: HallTemplate) => {
    const used = usage[t.id] ?? 0;
    const ok = await dialogs.confirm({
      title: `Xóa hội trường "${t.name}"?`,
      text: used > 0
        ? `${used} sự kiện đang dùng mẫu này và giữ nguyên sơ đồ đã sao chép. Hội trường mẫu sẽ bị xóa khỏi danh sách chọn của hệ thống.`
        : 'Hội trường mẫu này sẽ bị xóa khỏi danh sách chọn của hệ thống.',
      confirmLabel: 'Đồng ý xóa',
      cancelLabel: 'Hủy',
      tone: 'danger',
    });
    if (ok) await run('venue.deleteHallTemplate', { id: t.id, version: t.version }, { success: `Đã xóa hội trường mẫu: ${t.name}` });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Hội trường mẫu chuẩn hóa" value={templates.length} icon="building" accent="indigo"
          caption={names.length > 3 ? `${names.slice(0, 3).join(', ')} và ${names.length - 3} mẫu khác` : names.join(', ') || 'Chưa có hội trường mẫu'} />
        <KpiCard label="Tổng sức chứa thiết kế" value={`${formatCount(seats)} ghế`} icon="armchair" accent="indigo" caption="Sức chứa phục vụ đại biểu" />
        <KpiCard label="Phân khu chuẩn hóa" value={`${zones.length} phân khu`} icon="layers" accent="indigo" caption={`${zones.filter((z) => z.vipZone).length} khu VIP in biển tên chữ A`} />
      </div>

      <SectionCard title="Quản trị danh mục hội trường mẫu & sơ đồ phân khu" icon="building"
        subtitle="Sự kiện sao chép phân khu khi chọn hội trường; sửa mẫu không thay đổi sơ đồ của sự kiện đã chọn."
        actions={
          <>
            <Button variant="secondary" icon="refresh" onClick={() => void restore()}>Khôi phục mặc định</Button>
            <Button icon="plus" onClick={() => setEditing('new')}>Thêm hội trường mới</Button>
          </>
        }>
        {templates.length === 0 ? (
          <EmptyState icon="building" title="Chưa có hội trường mẫu" text="Khôi phục ba hội trường ban hành hoặc thêm hội trường mới."
            action={<Button variant="secondary" icon="refresh" onClick={() => void restore()}>Khôi phục mặc định</Button>} />
        ) : (
          <ol className="divide-y divide-line">
            {templates.map((t, i) => (
              <li key={t.id} className="py-4 first:pt-0 last:pb-0">
                <article aria-labelledby={`hall-${t.id}`} className="space-y-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-bold text-ink-2">{i + 1}</span>
                    <div className="min-w-0 flex-1 basis-60 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 id={`hall-${t.id}`} className="font-bold text-ink">{t.name}</h3>
                        <Badge tone="indigo">{formatCount(hallCapacity(t.zones))} ghế</Badge>
                        {(usage[t.id] ?? 0) > 0 && <Badge tone="slate">{usage[t.id]} sự kiện đang dùng</Badge>}
                      </div>
                      <p className="flex items-center gap-1 text-sm text-ink-2"><Icon name="map-pin" size={14} />{t.location || 'Chưa cập nhật địa điểm'}</p>
                      <p className="text-sm italic text-ink-muted">{t.description || 'Chưa có mô tả chi tiết.'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="secondary" icon="pencil" onClick={() => setEditing(t)}>Chỉnh sửa</Button>
                      <RowMenu label={`Thao tác với ${t.name}`} items={[
                        { id: 'delete', label: 'Xóa hội trường mẫu', icon: 'trash', tone: 'danger', disabled: templates.length <= 1, onSelect: () => void remove(t) },
                      ]} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold text-ink-muted">Cấu trúc các phân khu chỗ ngồi ({t.zones.length} khu):</p>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {t.zones.map((z) => (
                        <li key={z.key} className="space-y-1 rounded-control border border-line bg-surface-2 p-2">
                          <ZoneBadge zone={z} />
                          <p className="text-xs text-ink-2">Tiền tố: <span className="font-mono font-semibold">{z.prefix}</span> · {z.seatCount} ghế{z.vipZone ? ' · Khu VIP' : ''}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
      {editing && <HallTemplateDialog template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

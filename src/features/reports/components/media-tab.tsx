'use client';

// "Truyền thông và thông cáo báo chí" (m6 §1.5): clippings with add, edit and
// delete behind a confirm (BUG-27/28), links only http(s) and opened safely
// (BUG-25), VN dates (BUG-31/48); press releases saved per event (BUG-23/24).

import { useState } from 'react';
import { Button, DataTable, DateInput, Dialog, Form, FormField, RowMenu, SectionCard, Select, Textarea, TextInput, useDialogs, useZodForm, type Column } from '@/components/ui';
import { newId, type EventId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { formatVNDate } from '@/core/dates';
import { foldVi } from '@/core/text';
import type { MediaClipping, PressRelease } from '../contract';
import {
  clippingFields, MEDIA_TYPE_LABEL, MEDIA_TYPES, PRESS_TIMING_LABEL, PRESS_TIMINGS, pressReleaseFields,
  type ClippingDraft, type PressReleaseDraft,
} from '../domain/schemas';
import type { ReportsScreenData } from '../domain/screen';

export function MediaTab({ data }: { data: ReportsScreenData }) {
  const { event, can } = data;
  const run = useCommand();
  const dialogs = useDialogs();
  const [clipping, setClipping] = useState<MediaClipping | 'new' | null>(null);
  const [press, setPress] = useState<PressRelease | 'new' | null>(null);

  const removeClipping = async (c: MediaClipping) => {
    const ok = await dialogs.confirm({ title: `Xóa tin bài "${c.title}"?`, text: 'Có thể hoàn tác ngay sau khi xóa.', confirmLabel: 'Xóa tin bài', tone: 'danger' });
    if (ok) await run('reports.deleteClipping', { eventId: event.id, id: c.id, version: c.version }, { success: `Đã xóa tin bài: ${c.title}` });
  };
  const removePress = async (p: PressRelease) => {
    const ok = await dialogs.confirm({ title: `Xóa thông cáo "${p.title}"?`, text: 'Có thể hoàn tác ngay sau khi xóa.', confirmLabel: 'Xóa thông cáo', tone: 'danger' });
    if (ok) await run('reports.deletePressRelease', { eventId: event.id, id: p.id, version: p.version }, { success: `Đã xóa thông cáo: ${p.title}` });
  };

  const clippingColumns: Column<MediaClipping>[] = [
    {
      id: 'title', header: 'Tin bài / phóng sự', sortValue: (c) => foldVi(c.title),
      cell: (c) => (
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold break-words text-ink">{c.title}</p>
          <p className="text-xs break-words text-ink-muted">{c.outlet} • {formatVNDate(c.publishedOn)} • {MEDIA_TYPE_LABEL[c.mediaType]}</p>
          {c.author && <p className="text-xs break-words text-ink-muted">Phóng viên: {c.author}</p>}
        </div>
      ),
    },
    { id: 'date', header: 'Ngày đăng', hideOnMobile: true, sortValue: (c) => c.publishedOn, cell: (c) => <span className="text-sm tabular-nums text-ink-2">{formatVNDate(c.publishedOn)}</span> },
    {
      id: 'link', header: 'Liên kết', hideOnMobile: true,
      cell: (c) => (c.url ? <Button variant="ghost" icon="external-link" href={c.url} newTab>Xem bài viết</Button> : <span className="text-sm italic text-ink-muted">Không có liên kết</span>),
    },
    ...(can.write
      ? [{
          id: 'action', header: 'Thao tác', align: 'right' as const,
          cell: (c: MediaClipping) => (
            <RowMenu label={`Thao tác với tin bài ${c.title}`} items={[
              ...(c.url ? [{ id: 'open', label: 'Mở bài viết', icon: 'external-link' as const, href: c.url }] : []),
              { id: 'edit', label: 'Sửa tin bài', icon: 'pencil', onSelect: () => setClipping(c) },
              { id: 'delete', label: 'Xóa tin bài', icon: 'trash', tone: 'danger', onSelect: () => void removeClipping(c) },
            ]} />
          ),
        }]
      : []),
  ];

  const pressColumns: Column<PressRelease>[] = [
    {
      id: 'title', header: 'Thông cáo báo chí', sortValue: (p) => foldVi(p.title),
      cell: (p) => (
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold break-words text-ink">{p.title}</p>
          <p className="text-xs text-ink-muted">{PRESS_TIMING_LABEL[p.timing]}{p.contact ? ` • Đầu mối: ${p.contact}` : ''}</p>
        </div>
      ),
    },
    { id: 'content', header: 'Nội dung', hideOnMobile: true, cell: (p) => <p className="line-clamp-2 text-sm break-words text-ink-2">{p.content}</p> },
    ...(can.write
      ? [{
          id: 'action', header: 'Thao tác', align: 'right' as const,
          cell: (p: PressRelease) => (
            <RowMenu label={`Thao tác với thông cáo ${p.title}`} items={[
              { id: 'edit', label: 'Sửa thông cáo', icon: 'pencil', onSelect: () => setPress(p) },
              { id: 'delete', label: 'Xóa thông cáo', icon: 'trash', tone: 'danger', onSelect: () => void removePress(p) },
            ]} />
          ),
        }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Điểm tin truyền thông"
        subtitle={`${data.clippings.length} tin bài và phóng sự đã ghi nhận`}
        icon="newspaper"
        actions={can.write ? <Button icon="plus" onClick={() => setClipping('new')}>Thêm tin bài</Button> : undefined}
      >
        <DataTable
          rows={data.clippings}
          columns={clippingColumns}
          rowKey={(c) => c.id}
          empty={{ icon: 'newspaper', title: 'Chưa có tin bài nào được ghi nhận', text: can.write ? 'Bấm "Thêm tin bài" để ghi nhận bài viết hoặc phóng sự về sự kiện.' : undefined }}
        />
      </SectionCard>
      <SectionCard
        title="Thông cáo báo chí"
        subtitle="Lưu theo sự kiện; nội dung gửi cơ quan báo chí do cán bộ phụ trách gửi"
        icon="file-text"
        actions={can.write ? <Button variant="secondary" icon="pencil" onClick={() => setPress('new')}>Soạn thông cáo</Button> : undefined}
      >
        <DataTable
          rows={data.pressReleases}
          columns={pressColumns}
          rowKey={(p) => p.id}
          empty={{ icon: 'file-text', title: 'Chưa có thông cáo báo chí' }}
        />
      </SectionCard>
      {clipping && <ClippingDialog eventId={event.id} today={data.today} clipping={clipping === 'new' ? null : clipping} onClose={() => setClipping(null)} />}
      {press && <PressDialog data={data} release={press === 'new' ? null : press} onClose={() => setPress(null)} />}
    </div>
  );
}

const TYPE_OPTIONS = MEDIA_TYPES.map((t) => ({ value: t, label: MEDIA_TYPE_LABEL[t] }));

function ClippingDialog({ eventId, today, clipping, onClose }: { eventId: EventId; today: string; clipping: MediaClipping | null; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(clippingFields, {
    defaultValues: clipping
      ? { outlet: clipping.outlet, title: clipping.title, publishedOn: clipping.publishedOn, mediaType: clipping.mediaType, url: clipping.url ?? '', author: clipping.author }
      : { outlet: '', title: '', publishedOn: today, mediaType: 'Báo điện tử', url: '', author: '' },
  });
  const submit = async (draft: ClippingDraft) => {
    const done = clipping
      ? await run('reports.updateClipping', { eventId, id: clipping.id, version: clipping.version, draft }, { success: 'Đã cập nhật tin bài' })
      : await run('reports.createClipping', { eventId, id: newId<'MediaClipping'>(), draft }, { success: 'Đã lưu tin bài truyền thông' });
    if (done) onClose();
  };
  return (
    <Dialog open onClose={onClose} icon="newspaper" title={clipping ? 'Sửa tin bài / phóng sự' : 'Thêm tin bài / phóng sự'} dirty={form.formState.isDirty}>
      <Form form={form} onSubmit={submit} className="grid gap-4">
        <FormField label="Cơ quan báo chí / kênh truyền hình" name="outlet" required>
          <TextInput name="outlet" placeholder="Ví dụ: Báo Hà Nội Mới" />
        </FormField>
        <FormField label="Tiêu đề bài viết / phóng sự" name="title" required>
          <TextInput name="title" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Ngày đăng / phát sóng" name="publishedOn" required>
            <DateInput name="publishedOn" />
          </FormField>
          <FormField label="Loại hình" name="mediaType" required>
            <Select name="mediaType" options={TYPE_OPTIONS} />
          </FormField>
        </div>
        <FormField label="Đường dẫn bài viết" name="url" hint="Bắt đầu bằng http:// hoặc https://; để trống với báo in">
          <TextInput name="url" type="url" placeholder="https://" />
        </FormField>
        <FormField label="Phóng viên / tác giả" name="author">
          <TextInput name="author" />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu tin bài</Button>
        </div>
      </Form>
    </Dialog>
  );
}

const TIMING_OPTIONS = PRESS_TIMINGS.map((t) => ({ value: t, label: PRESS_TIMING_LABEL[t] }));

/** A new release starts from the event's own facts, never from invented ones (BUG-24). */
function pressDefaults(data: ReportsScreenData): PressReleaseDraft {
  const e = data.event;
  return {
    title: `Thông cáo báo chí: ${e.name}`,
    timing: 'before',
    contact: '',
    content: `${e.name} diễn ra lúc ${e.eventTime} ngày ${formatVNDate(e.eventDate)}${e.location ? ` tại ${e.location}` : ''}, dự kiến ${e.targetGuests} đại biểu.\n\nTrân trọng kính mời các cơ quan thông tấn, báo chí tham dự và đưa tin.`,
  };
}

function PressDialog({ data, release, onClose }: { data: ReportsScreenData; release: PressRelease | null; onClose: () => void }) {
  const run = useCommand();
  const eventId = data.event.id;
  const form = useZodForm(pressReleaseFields, {
    defaultValues: release ? { title: release.title, timing: release.timing, contact: release.contact, content: release.content } : pressDefaults(data),
  });
  const submit = async (draft: PressReleaseDraft) => {
    const done = release
      ? await run('reports.updatePressRelease', { eventId, id: release.id, version: release.version, draft }, { success: 'Đã cập nhật thông cáo báo chí' })
      : await run('reports.createPressRelease', { eventId, id: newId<'PressRelease'>(), draft }, { success: 'Đã lưu thông cáo báo chí' });
    if (done) onClose();
  };
  return (
    <Dialog open onClose={onClose} icon="file-text" size="lg" title={release ? 'Sửa thông cáo báo chí' : 'Soạn thông cáo báo chí'} subtitle="Lưu theo sự kiện. Hệ thống không tự gửi thông cáo." dirty={form.formState.isDirty}>
      <Form form={form} onSubmit={submit} className="grid gap-4">
        <FormField label="Tiêu đề thông cáo" name="title" required>
          <TextInput name="title" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Thời điểm phát hành" name="timing" required>
            <Select name="timing" options={TIMING_OPTIONS} />
          </FormField>
          <FormField label="Người đầu mối báo chí" name="contact">
            <TextInput name="contact" placeholder="Họ tên, điện thoại, thư điện tử" />
          </FormField>
        </div>
        <FormField label="Nội dung thông cáo" name="content" required>
          <Textarea name="content" rows={8} />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu thông cáo</Button>
        </div>
      </Form>
    </Dialog>
  );
}

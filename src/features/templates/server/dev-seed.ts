// SCE_DEV_MEMORY=1 only (docs/rewrite/dev-runtime.md): one edited built-in and
// one admin-created template, both plainly fake, so the admin screen shows
// every status chip. Never runs in production.

import type { DevSeed } from '@/core/dev/runtime';
import { sanitizeRichHtml } from '@/core/text';
import { builtinById } from '../domain/builtin-templates';
import { overrideRowId } from './ids';
import { templatesTable } from './tables';

export const DEV_OVERRIDE_ID = 'form_giaymoi_vip';
export const DEV_CUSTOM_TITLE = '[DEV] Biểu mẫu thử của Admin (dữ liệu giả)';

export const devSeed: DevSeed = async (db, { id }) => {
  const builtin = builtinById(DEV_OVERRIDE_ID)!;
  await db.table(templatesTable).insert({
    id: overrideRowId(DEV_OVERRIDE_ID),
    templateKey: DEV_OVERRIDE_ID,
    baseBuiltinKey: DEV_OVERRIDE_ID,
    level: builtin.level,
    code: builtin.code,
    title: `${builtin.title} [DEV đã sửa]`,
    kind: builtin.kind,
    description: builtin.description,
    contentHtml: sanitizeRichHtml(`<p style="text-align: center;"><strong>[DEV] Bản sửa thử của Admin</strong></p>${builtin.content}`),
  });
  const custom = id('Template', 'templates-dev-custom');
  await db.table(templatesTable).insert({
    id: custom,
    templateKey: custom,
    baseBuiltinKey: null,
    level: 'cap_trungtam',
    code: 'DEV-01',
    title: DEV_CUSTOM_TITLE,
    kind: 'doc',
    description: 'Biểu mẫu giả để kiểm thử giao diện. Có thể xóa.',
    contentHtml: sanitizeRichHtml('<p style="text-align: center;"><strong>BIỂU MẪU THỬ</strong></p><p>Chương trình: <strong>{{TEN_SU_KIEN}}</strong>, ngày {{NGAY_TO_CHUC}} tại {{DIA_DIEM}}.</p><p>Phụ trách: {{CAN_BO_PHU_TRACH}}. Kinh phí: {{KINH_PHI_DU_TOAN}} VNĐ.</p>'),
  });
};

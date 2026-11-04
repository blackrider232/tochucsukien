// Imports legacy appData.systemTemplates into sce_tcsk_templates. The legacy
// array is a full frozen copy of the catalog (m3 B10), so only entries that
// differ from the built-in are kept: edited built-ins become overrides, entries
// with an unknown id become custom templates. Pure and deterministic.

import { parseInstant } from '@/core/dates';
import { isDemoLegacyId, type ImportIssue, type LegacyImporter } from '@/core/legacy';
import { sanitizeRichHtml } from '@/core/text';
import { builtinById } from '../domain/builtin-templates';
import { sameAsBuiltin } from '../domain/catalog';
import { MAX_CONTENT_CHARS } from '../domain/schemas';
import { TEMPLATE_KIND_VALUES, TEMPLATE_LEVEL_VALUES } from '../domain/levels';
import type { TemplateKind, TemplateLevel } from '../contract';
import { overrideRowId } from './ids';
import { LEGACY_BUILTIN_FINGERPRINTS } from './legacy-builtin-fingerprints';
import { legacyFingerprint } from './legacy-fingerprint';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const oneOf = <T extends string>(values: ReadonlyArray<T>, v: unknown): T | null => (values.includes(v as T) ? (v as T) : null);
const DANGEROUS = /<script|javascript:|\bon[a-z]+\s*=/i;

export const legacyImporter: LegacyImporter = {
  feature: 'templates',
  dependsOn: ['core'],
  plan(blob, ctx) {
    const issues: ImportIssue[] = [];
    const entries = blob.systemTemplates;
    if (!Array.isArray(entries) || entries.length === 0) return { batches: [], issues };

    const issue = (severity: ImportIssue['severity'], legacyId: string | null, message: string) => issues.push({ severity, blobKey: 'systemTemplates', legacyId, message });
    const rows: Obj[] = [];
    const seen = new Set<string>();

    entries.forEach((raw: unknown, i: number) => {
      if (!isObj(raw)) return issue('dropped_invalid', null, `Mục thứ ${i + 1} của kho biểu mẫu không hợp lệ.`);
      const legacyId = str(raw.id);
      if (!legacyId) return issue('dropped_invalid', null, `Biểu mẫu thứ ${i + 1} không có mã.`);
      if (seen.has(legacyId)) return issue('dropped_invalid', legacyId, `Mã biểu mẫu "${legacyId}" bị trùng; chỉ giữ bản đầu tiên.`);
      seen.add(legacyId);
      if (!ctx.includeDemo && isDemoLegacyId(legacyId)) return issue('skipped_demo', legacyId, `Biểu mẫu mẫu "${legacyId}" không được nhập.`);

      const builtin = builtinById(legacyId);
      const title = str(raw.title);
      const content = typeof raw.content === 'string' ? raw.content : '';
      if (!title || !content.trim()) return issue('dropped_invalid', legacyId, `Biểu mẫu "${legacyId}" thiếu tên hoặc nội dung; đã bỏ.`);
      if (content.length > MAX_CONTENT_CHARS) return issue('dropped_invalid', legacyId, `Nội dung biểu mẫu "${title}" quá dài; đã bỏ.`);

      if (builtin && LEGACY_BUILTIN_FINGERPRINTS[legacyId] === legacyFingerprint(raw)) return;

      const level: TemplateLevel = oneOf(TEMPLATE_LEVEL_VALUES, raw.group) ?? builtin?.level ?? 'cap_trungtam';
      if (level !== raw.group) issue('coerced', legacyId, `Nhóm quy trình "${str(raw.group)}" của "${title}" không hợp lệ; đặt ${level}.`);
      const kind: TemplateKind = oneOf(TEMPLATE_KIND_VALUES, raw.type) ?? builtin?.kind ?? 'doc';
      const code = str(raw.code).slice(0, 40);
      const description = str(raw.description).slice(0, 500);
      const draft = { level, code, title: title.slice(0, 300), kind, description, content };
      if (DANGEROUS.test(content)) issue('coerced', legacyId, `Biểu mẫu "${title}" chứa mã script hoặc sự kiện; đã loại bỏ khi nhập.`);

      if (builtin && sameAsBuiltin(legacyId, draft)) return;
      const updatedAt = parseInstant(raw.updatedAt);
      const id = builtin ? overrideRowId(legacyId) : ctx.ids.idFor('Template', legacyId);
      issue('coerced', legacyId, builtin
        ? `Biểu mẫu gốc "${title}" khác mẫu gốc hiện hành; nhập như bản sửa của Admin (có thể là bản đóng băng từ phiên bản cũ, dùng "Khôi phục mẫu gốc" nếu không cần).`
        : `Biểu mẫu do Admin tạo "${title}" được nhập như biểu mẫu mới.`);
      rows.push({
        id,
        template_key: builtin ? legacyId : id,
        base_builtin_key: builtin ? legacyId : null,
        level, code, title: draft.title, kind, description,
        content_html: sanitizeRichHtml(content),
        legacy_id: legacyId,
        ...(updatedAt ? { updated_at: updatedAt } : {}),
      });
    });

    return { batches: rows.length > 0 ? [{ table: 'sce_tcsk_templates', rows }] : [], issues };
  },
};

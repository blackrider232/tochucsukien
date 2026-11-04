// Imports legacy appData.masterGuestDb into sce_tcsk_master_contacts. Pure and
// deterministic: every id is a uuid v5 of the legacy id. The 41 records the
// legacy app seeded itself (m4c B29) are skipped unless --include-demo; one an
// admin later edited carries updatedAt and is kept. Duplicates by the guests
// identity rule keep their first record, and values the new rules reject are
// cleared and kept in the notes, so nothing a person typed is lost silently.

import { parseInstant } from '@/core/dates';
import type { ImportIssue, LegacyImporter } from '@/core/legacy';
import { parseEmail } from '@/core/text';
import { GUEST_GROUPS, type GuestGroup } from '@/core/vocab';
import { guestIdentityKey } from '@/features/guests';
import { contactFields, GROUP_VALUES, type ContactDraft } from '../domain/schemas';
import { searchTextOf } from '../domain/search';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const BLOB_KEY = 'masterGuestDb';

/** DEFAULT_MASTER_GUEST_DB ids are mdb_<grp>_NN; the ones a person added end in Date.now(). */
const SEED_ID = /^mdb_(?:vip|sn|dn|qt|bc)_\d{2}$/;

export const legacyImporter: LegacyImporter = {
  feature: 'directory',
  dependsOn: ['core'],
  plan(blob, ctx) {
    const issues: ImportIssue[] = [];
    const entries = blob[BLOB_KEY];
    if (!Array.isArray(entries) || entries.length === 0) return { batches: [], issues };
    const issue = (severity: ImportIssue['severity'], legacyId: string | null, message: string) => issues.push({ severity, blobKey: BLOB_KEY, legacyId, message });
    const rows: Record<string, unknown>[] = [];
    const seenIds = new Set<string>();
    const seenKeys = new Map<string, string>();

    entries.forEach((raw: unknown, i: number) => {
      if (!isObj(raw)) return issue('dropped_invalid', null, `Mục thứ ${i + 1} của CSDL khách mời không hợp lệ.`);
      const legacyId = str(raw.id);
      if (!legacyId) return issue('dropped_invalid', null, `Đối tượng thứ ${i + 1} không có mã.`);
      if (seenIds.has(legacyId)) return issue('dropped_invalid', legacyId, `Mã "${legacyId}" bị trùng; chỉ giữ bản đầu tiên.`);
      seenIds.add(legacyId);
      const updatedAt = parseInstant(raw.updatedAt);
      if (SEED_ID.test(legacyId)) {
        if (!updatedAt && !ctx.includeDemo) return issue('skipped_demo', legacyId, `Đối tượng mẫu "${str(raw.name)}" của bản cũ không được nhập.`);
        if (updatedAt) issue('coerced', legacyId, `Đối tượng mẫu "${str(raw.name)}" đã được Admin chỉnh sửa; giữ lại như một đối tượng thường.`);
      }

      const name = str(raw.name);
      const organization = str(raw.organization);
      if (!name || !organization) return issue('dropped_invalid', legacyId, `Đối tượng "${name || legacyId}" thiếu ${name ? 'cơ quan' : 'họ tên'}; đã bỏ.`);

      const notes: string[] = [str(raw.notes)];
      let group: GuestGroup = 'DoanhNghiep';
      if (GROUP_VALUES.includes(raw.group as GuestGroup)) group = raw.group as GuestGroup;
      else issue('coerced', legacyId, `Nhóm "${str(raw.group)}" của "${name}" không có trong danh mục; gán ${GUEST_GROUPS[group].short}.`);

      let email: string | null = null;
      if (str(raw.email)) {
        email = parseEmail(raw.email);
        if (!email) {
          notes.push(`Email gốc: ${str(raw.email)}`);
          issue('coerced', legacyId, `Email "${str(raw.email)}" của "${name}" không hợp lệ; bỏ trống và ghi vào ghi chú.`);
        }
      }
      let phone = str(raw.phone);
      if (phone && !contactFields.shape.phone.safeParse(phone).success) {
        notes.push(`Điện thoại gốc: ${phone}`);
        issue('coerced', legacyId, `Số điện thoại "${phone}" của "${name}" không đọc được; bỏ trống và ghi vào ghi chú.`);
        phone = '';
      }
      const hasBanquet = typeof raw.hasBanquet === 'boolean' ? raw.hasBanquet : false;
      const draft = {
        name, group, title: str(raw.title), organization, phone, email, address: str(raw.address), taxCode: str(raw.taxCode),
        notes: notes.filter(Boolean).join('\n'), hasBanquet,
      };
      const checked = contactFields.safeParse(draft);
      if (!checked.success) return issue('dropped_invalid', legacyId, `Đối tượng "${name}" có giá trị không hợp lệ (${checked.error.issues[0]?.message ?? 'không rõ'}); đã bỏ.`);
      const clean: ContactDraft = checked.data;

      const key = guestIdentityKey(clean);
      const first = seenKeys.get(key);
      if (first) return issue('dropped_invalid', legacyId, `"${name}" trùng với đối tượng ${first} (cùng email, số điện thoại hoặc họ tên và cơ quan); chỉ giữ bản đầu tiên.`);
      seenKeys.set(key, legacyId);

      rows.push({
        id: ctx.ids.idFor('MasterContact', legacyId),
        legacy_id: legacyId,
        name: clean.name, guest_group: clean.group, title: clean.title, organization: clean.organization, phone: clean.phone,
        email: clean.email, address: clean.address, tax_code: clean.taxCode, notes: clean.notes, has_banquet: clean.hasBanquet,
        search_text: searchTextOf(clean),
        ...(updatedAt ? { updated_at: updatedAt } : {}),
      });
    });
    return { batches: rows.length > 0 ? [{ table: 'sce_tcsk_master_contacts', rows }] : [], issues };
  },
};

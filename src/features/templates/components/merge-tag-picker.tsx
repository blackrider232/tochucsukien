'use client';

import { Combobox, FormField } from '@/components/ui';
import { MERGE_TAGS, tagToken, type MergeTag } from '../domain/merge-tags';

const tagSearch = async (q: string): Promise<ReadonlyArray<MergeTag>> => {
  const needle = q.trim().toLowerCase();
  return MERGE_TAGS.filter((t) => !needle || t.label.toLowerCase().includes(needle) || t.tag.toLowerCase().includes(needle));
};

/** Search the merge tags and hand the token of the one picked to the editor. */
export function MergeTagPicker({ onPick }: { onPick: (token: string) => void }) {
  return (
    <div className="max-w-md">
      <FormField label="Chèn thẻ trộn {{…}}" name="mergeTag" hint="Gõ để tìm. Thẻ được thay bằng dữ liệu của sự kiện khi dùng biểu mẫu.">
        <Combobox
          name="mergeTag"
          search={tagSearch}
          itemKey={(t) => t.tag}
          itemLabel={(t) => `${t.label} — ${tagToken(t.tag)}`}
          onPick={(t) => onPick(tagToken(t.tag))}
        />
      </FormField>
    </div>
  );
}

// @vitest-environment node
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkUi, emojiAndSpelling, exportedValues, galleryGaps } from './check-ui';

describe('check-ui', () => {
  it('passes on the repository', () => {
    expect(checkUi(join(import.meta.dirname, '..'))).toEqual([]);
  });

  it('G4 fails on an emoji used as an icon or status', () => {
    const errors = emojiAndSpelling([{ path: 'src/features/live/components/x.tsx', text: 'export const A = () => <p>🔴 KHẨN CẤP</p>;' }]);
    expect(errors).toEqual([expect.stringContaining('src/features/live/components/x.tsx:1 emoji "🔴"')]);
  });

  it('G4 allows only the listed legacy vocabulary emoji, and skips tests', () => {
    expect(emojiAndSpelling([{ path: 'src/core/vocab.ts', text: "icon: '⭐'" }])).toEqual([]);
    expect(emojiAndSpelling([{ path: 'src/core/vocab.ts', text: "icon: '🚨'" }])).toHaveLength(1);
    expect(emojiAndSpelling([{ path: 'src/features/x/__tests__/a.test.ts', text: "'🎉'" }])).toEqual([]);
  });

  it('G11 fails on the new-style tone marks as words, not inside other words', () => {
    const errors = emojiAndSpelling([{ path: 'src/app/x.tsx', text: "const a = 'Xoá dữ liệu'; const b = 'Hoàn thành'; const c = 'huỷ';" }]);
    expect(errors).toEqual([
      expect.stringContaining('"Xoá": write "xóa"'),
      expect.stringContaining('"huỷ": write "hủy"'),
    ]);
  });

  it('G12 fails when a kit export has no /dev/kit specimen', () => {
    const index = "export { Button, IconButton } from './button';\nexport { Alert } from './alert';\nexport { cn } from './cn';\nexport type * from './kit.types';";
    expect(exportedValues(index)).toEqual(['Button', 'IconButton', 'Alert', 'cn']);
    expect(galleryGaps(index, '<Spec kit="Button IconButton" />')).toEqual([expect.stringMatching(/^Alert is exported/)]);
    expect(galleryGaps(index, '<Spec kit="Button IconButton" /><Spec kit="Alert" />')).toEqual([]);
  });
});

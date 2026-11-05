// @vitest-environment node
import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';

// dispatch is the app's one server action, so this limit caps every command's input.
const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
const LIMIT_BYTES = 2 * 1024 * 1024;
// The largest command inputs, from their owners' internals: guests' MAX_BATCH and directory's MAX_CHUNK_BYTES.
const GUESTS_MAX_BATCH = 2000;
const DIRECTORY_MAX_CHUNK_BYTES = 600_000;
const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

describe('server action body limit', () => {
  it('is the stated 2 MB, not Next’s 1 MB default', () => {
    expect(limit).toBe('2mb');
  });

  it('a full guests batch of typical rows overflows the 1 MB default and fits 2 MB with headroom, as does directory’s largest chunk', () => {
    const item = {
      id: '0b9f4c1e-6a51-4f7e-9a0c-2d4b8e7f1a23',
      draft: {
        name: 'Nguyễn Thị Phương Thảo',
        group: 'DN',
        title: 'Phó Tổng Giám đốc phụ trách kinh doanh',
        organization: 'Công ty Cổ phần Đầu tư và Phát triển Hạ tầng Hà Nội',
        phone: '0913.210.001',
        email: 'thao.nguyen@hatanghanoi.com.vn',
        sendMethod: 'email',
        inviteStatus: 'not_sent',
        rsvpStatus: 'pending',
        rsvpSource: 'import',
        substituteName: '',
        hasBanquet: false,
        notes: 'Liên hệ qua thư ký trước 2 ngày',
        masterContactId: '5e2a7c90-1d3b-4f6a-8b2c-9e0d1f4a7b65',
      },
    };
    const batch = size({ eventId: item.id, items: Array.from({ length: GUESTS_MAX_BATCH }, () => item) });
    expect(batch).toBeGreaterThan(1024 * 1024);
    expect(batch).toBeLessThan(LIMIT_BYTES * 0.6);
    expect(LIMIT_BYTES).toBeGreaterThanOrEqual(3 * DIRECTORY_MAX_CHUNK_BYTES);
  });
});

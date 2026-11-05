'use client';

import { Badge } from '@/components/ui/badge';
import { useOnline } from '@/components/ui/use-online';

/** Visible whenever the browser reports no network. Writes need the network (core Q11). */
export function OfflineIndicator() {
  const online = useOnline();
  return (
    <div role="status" aria-live="polite">
      {!online && (
        <span title="Mất kết nối mạng. Cần có mạng để lưu thay đổi.">
          <Badge tone="amber" icon="cloud">Ngoại tuyến</Badge>
        </span>
      )}
    </div>
  );
}

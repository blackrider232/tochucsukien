// Commands and permissions of feature `core` beyond its frozen contract.

import type { BackupId } from '@/core/brand';
import type { Sig } from '@/core/commands';

declare module '@/core/commands' {
  interface CommandMap {
    /** The snapshot JSON of one backup, for "Tải về"; the SQL function audits the download. */
    'core.backups.download': Sig<{ id: BackupId }, { fileName: string; data: unknown }>;
  }
}
declare module '@/core/permissions' {
  interface PermissionMap {
    'core.profile.edit': true;
  }
}

export {};

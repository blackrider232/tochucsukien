// Commands and permissions of feature `core` beyond its frozen contract.

import type { BackupId } from '@/core/brand';
import type { Holiday } from '@/core/dates';
import type { Sig } from '@/core/commands';

declare module '@/core/commands' {
  interface CommandMap {
    /** The snapshot JSON of one backup, for "Tải về"; the SQL function audits the download. */
    'core.backups.download': Sig<{ id: BackupId }, { fileName: string; data: unknown }>;
    /**
     * Replaces one year's holidays when the year still holds `expected`, the list the editor (or the
     * undo) saw; otherwise a conflict. The guarded form of the contract's replaceYear, which now only
     * fills an empty year.
     */
    'core.holidays.saveYear': Sig<{ year: number; expected: ReadonlyArray<Holiday>; holidays: ReadonlyArray<Holiday> }, null>;
  }
}
declare module '@/core/permissions' {
  interface PermissionMap {
    'core.profile.edit': true;
  }
}

export {};

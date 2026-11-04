// Public entry of the shared UI kit. Feature code imports everything from '@/components/ui'.
// Contract types come from kit.types.ts; values come from the files below.
// useEventChanges is still the contract stub until core ships the realtime hook.
export type * from './kit.types';
export { useEventChanges } from './kit.types';

export { Button, IconButton } from './button';
export { Icon, ICON_NAMES } from './icons';
export { Dialog } from './dialog';
export { DialogsProvider, useDialogs } from './dialogs';
export { ToastProvider, useToast } from './toast';
export { UiProviders, SkipLink } from './providers';
export { SectionCard } from './section-card';
export { KpiCard } from './kpi-card';
export { Tabs, LinkTabs } from './tabs';
export { ProgressBar } from './progress-bar';
export { Badge, StatusBadge } from './badge';
export { EmptyState } from './empty-state';
export { DataTable } from './data-table';
export { FilterBar } from './filter-bar';
export { Form, FormField, useZodForm } from './form';
export { TextInput, NumberInput, MoneyInput, DateInput, TimeInput, Select, Checkbox } from './controls';
export { Combobox } from './combobox';
export { PrintPage, Nd30Header, SignatureBlock, PrintLink } from './print';
export { QrCode, qrPngDataUrl } from './qr';
export { RichHtml } from './rich-html';
export { downloadBlob, downloadXlsx, downloadWordHtml, xlsxSheet } from './files';
export { useBeep } from './beep';
export { ThemeToggle, useTheme } from './theme';
export { AppEnvProvider, useSettings, useCalendar } from './app-env';

// Hooks that read app context, commands and undo are implemented in core.
export { useAppContext } from '@/core/auth';
export { useCommand, useUndo } from '@/core/commands';

// Public entry of the shared UI kit. Feature code imports everything from '@/components/ui'.
// Contract types come from kit.types.ts; values come from the files below.
export type * from './kit.types';

export { Button, IconButton } from './button';
export { Icon, ICON_NAMES } from './icons';
export { Dialog } from './dialog';
export { DialogsProvider, useDialogs } from './dialogs';
export { ToastProvider, useToast } from './toast';
export { UiProviders, SkipLink } from './providers';
export { SectionCard } from './section-card';
export { KpiCard } from './kpi-card';
export { Tabs, LinkTabs } from './tabs';
export { useSubTabCount } from './sub-tab-counts';
export { ProgressBar } from './progress-bar';
export { Badge, StatusBadge } from './badge';
export { EmptyState } from './empty-state';
export { DataTable } from './data-table';
export { FilterBar } from './filter-bar';
export { Form, FormField, useZodForm } from './form';
export { TextInput, NumberInput, MoneyInput, DateInput, TimeInput, Select, Textarea, Checkbox, RadioGroup, Switch } from './controls';
export { Alert } from './alert';
export { RowMenu } from './row-menu';
export { Combobox } from './combobox';
export { CodeScanner } from './code-scanner';
export { PrintPage, Nd30Header, SignatureBlock, PrintLink } from './print';
export { QrCode, qrPngDataUrl } from './qr';
export { RichHtml } from './rich-html';
export { downloadBlob, downloadXlsx, downloadWordHtml, xlsxSheet } from './files';
export { useBeep } from './beep';
export { useOnline } from './use-online';
export { ThemeToggle, useTheme } from './theme';
export { cn } from './cn';

// Hooks that read app context, realtime, commands and undo are implemented in core.
export { useAppContext, useSettings, useCalendar, useEventChanges } from '@/core/auth';
export { useCommand, useUndo } from '@/core/commands';

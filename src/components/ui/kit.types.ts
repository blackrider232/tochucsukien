// Shared UI kit, src/components/ui/*, foundation-owned and frozen for module
// workers. Prop signatures only. In the app ReactNode is React's; here it is a
// stand-in so the sketch type-checks without node_modules.
// Rules every primitive enforces: labels bound to controls, Esc/backdrop close,
// focus trap and return, role="dialog", aria-label on icon-only buttons, text
// content rendered as React text (no HTML strings), 44px touch targets.

import type { HHmm, IsoDate, SanitizedHtml } from '@/core/brand';
import type { EnumRegistry, Tone } from '@/core/vocab';

export type ReactNode = unknown;
export type Component<P> = (props: P) => ReactNode | Promise<ReactNode>;

/** Per-tab accent, from the legacy sidebar table (core §1.4). */
export type Accent = 'blue' | 'purple' | 'amber' | 'emerald' | 'teal' | 'rose' | 'slate' | 'cyan' | 'indigo';
/** lucide-react icon names used in the app; the kit maps them, features never import icon packs. */
export type IconName =
  | 'calendar-check' | 'file-signature' | 'users' | 'store' | 'smartphone' | 'chart-line' | 'settings'
  | 'user-cog' | 'layout-template' | 'building' | 'contact' | 'bell' | 'printer' | 'cloud' | 'download'
  | 'undo' | 'redo' | 'moon' | 'sun' | 'plus' | 'pencil' | 'trash' | 'search' | 'x' | 'check' | 'qr-code'
  | 'mail' | 'file-spreadsheet' | 'file-text' | 'alert-triangle' | 'clock' | 'lock' | 'unlock' | 'shield'
  | 'log-out' | 'chevron-down' | 'chevron-right' | 'copy' | 'external-link' | 'upload' | 'map' | 'armchair';

// ---------- actions ----------
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  accent?: Accent;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  children: ReactNode;
}
export interface IconButtonProps {
  icon: IconName;
  /** Required: becomes aria-label and tooltip. */
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: Tone;
}

// ---------- overlays ----------
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
  accent?: Accent;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '3xl' | 'full';
  /** When true, closing asks "Đóng mà không lưu?" first (m3 B21). */
  dirty?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}
export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'success' | 'warning';
}
export interface PromptOptions extends ConfirmOptions {
  label: string;
  defaultValue?: string;
  required?: boolean;
}
export interface Dialogs {
  confirm(o: ConfirmOptions): Promise<boolean>;
  prompt(o: PromptOptions): Promise<string | null>;
  alert(o: Omit<ConfirmOptions, 'cancelLabel'>): Promise<void>;
}
export function useDialogs(): Dialogs {
  throw new Error('not implemented');
}
/** Top-end, 2 s, plain text only (core B29). */
export interface Toast {
  success(text: string): void;
  info(text: string): void;
  warning(text: string): void;
  error(text: string): void;
}
export function useToast(): Toast {
  throw new Error('not implemented');
}

// ---------- layout and display ----------
export interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  accent?: Accent;
  actions?: ReactNode;
  children: ReactNode;
}
export interface KpiCardProps {
  label: string;
  value: string | number;
  icon: IconName;
  accent: Accent;
  /** '/ 150' style denominator. */
  ofTotal?: number;
  caption?: string;
  progress?: { value: number; max: number };
  badge?: { text: string; tone: Tone; pulse?: boolean };
  highlight?: boolean;
  /** Clickable cards open a dialog or link; rendered as button or anchor accordingly. */
  onClick?: () => void;
  href?: string;
}
export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: IconName;
}
/** URL-driven: each tab is a link, so state survives reload and is shareable. */
export interface LinkTabsProps {
  items: ReadonlyArray<TabItem & { href: string }>;
  activeId: string;
  variant?: 'pill' | 'underline';
}
export interface TabsProps {
  items: ReadonlyArray<TabItem>;
  value: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'underline' | 'segmented';
}
export interface ProgressBarProps {
  value: number;
  max: number;
  /** Defaults: blue, emerald at 100%. */
  tone?: Tone;
  label?: string;
}
export interface BadgeProps {
  tone: Tone;
  pulse?: boolean;
  icon?: IconName;
  children: ReactNode;
}
/** Label and tone come from the registry; one look for a status everywhere. */
export interface StatusBadgeProps<K extends string> {
  registry: EnumRegistry<K>;
  value: K;
  size?: 'sm' | 'md';
  pulse?: boolean;
}
export interface EmptyStateProps {
  icon: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}

export interface Column<Row> {
  id: string;
  header: string;
  cell: (row: Row, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  /** Present => sortable header. */
  sortValue?: (row: Row) => string | number;
  /** Hidden below md; the row still shows it in the stacked mobile layout. */
  hideOnMobile?: boolean;
}
export interface DataTableProps<Row> {
  rows: ReadonlyArray<Row>;
  columns: ReadonlyArray<Column<Row>>;
  rowKey: (row: Row) => string;
  empty: EmptyStateProps;
  /** STT column 1..n. */
  numbered?: boolean;
  stickyHeader?: boolean;
  maxHeight?: string;
  minWidth?: string;
  rowTone?: (row: Row) => Tone | null;
  selection?: { selected: ReadonlySet<string>; onChange: (next: ReadonlySet<string>) => void };
  toolbar?: ReactNode;
}
export interface FilterBarProps {
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  filters?: ReadonlyArray<{ id: string; label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (v: string) => void }>;
  trailing?: ReactNode;
}

// ---------- forms ----------
/**
 * Forms are react-hook-form + zod through one hook; the schema is the same one
 * the command parses on the server, so client and server validation agree.
 */
export interface FormFieldProps {
  label: string;
  name: string;
  required?: boolean;
  hint?: string;
  /** Unit after the control, e.g. 'ngày trước sự kiện'. */
  suffix?: string;
  children: ReactNode;
}
export interface TextInputProps { name: string; placeholder?: string; type?: 'text' | 'email' | 'tel' | 'url' | 'password'; autoComplete?: string }
export interface NumberInputProps { name: string; min?: number; max?: number; step?: number }
export interface MoneyInputProps { name: string }
export interface DateInputProps {
  name: string;
  min?: IsoDate;
  max?: IsoDate;
  /** Marks holidays from AppContext and shows 'Ngày nghỉ lễ' under the field. */
  showHolidays?: boolean;
}
export interface TimeInputProps { name: string; defaultValue?: HHmm }
export interface SelectProps<K extends string> {
  name: string;
  options: ReadonlyArray<{ value: K; label: string }>;
  placeholder?: string;
}
export interface ComboboxProps<T> {
  name: string;
  /** Server-backed search via useQuery; results ranked by matchesQuery. */
  search: (q: string) => Promise<ReadonlyArray<T>>;
  itemKey: (t: T) => string;
  itemLabel: (t: T) => string;
  renderItem?: (t: T) => ReactNode;
  onPick: (t: T) => void;
}
export interface CheckboxProps { name: string; label: string; description?: string }

// ---------- print and documents ----------
export interface PrintPageProps {
  size: 'A4' | 'A5';
  orientation: 'portrait' | 'landscape';
  /** NĐ30 margins (top 20-25mm, bottom 20-25mm, left 30-35mm, right 15-20mm) or none for cards. */
  margins: 'nd30' | 'none';
  children: ReactNode;
}
/** Two-column Quốc hiệu/Tiêu ngữ header; issuer lines from orgIdentity(settings). */
export interface Nd30HeaderProps {
  issuer: 'ubnd' | 'so_tai_chinh' | 'trung_tam';
  /** 'Số: ..... /KH-SCE-TCSK'; dots when absent. */
  documentNumber?: string;
  date?: IsoDate;
}
export interface SignatureBlockProps {
  left?: { title: string; note?: string; name?: string };
  right: { title: string; note?: string; name?: string };
  recipients?: ReadonlyArray<string>;
}
/** Print routes live under src/app/(print)/...: no shell, @page rules, auto window.print(). */
export interface PrintLinkProps { href: string; label?: string }

export interface QrCodeProps {
  /** Always from encodeCheckinPayload(). */
  payload: string;
  size: number;
  /** Rendered under the code as text, e.g. the human checkinCode. */
  caption?: string;
}
/** PNG data URL for email attachments; awaits the encoder (no fixed timeout, m4c B44). */
export function qrPngDataUrl(payload: string, size: number): Promise<string> {
  throw new Error('not implemented');
}

// ---------- files ----------
/** Revokes the object URL after the click has been dispatched (m3 B33, m4c B51). */
export function downloadBlob(blob: Blob, fileName: string): void {
  throw new Error('not implemented');
}
/** ExcelJS loaded lazily from npm. Strings are written as text cells, never formulas. */
export interface XlsxSheetSpec<Row> {
  name: string;
  title?: { lines: ReadonlyArray<string> };
  columns: ReadonlyArray<{ header: string; width: number; value: (row: Row, i: number) => string | number | null; fill?: (row: Row) => string | null }>;
  rows: ReadonlyArray<Row>;
  footer?: { lines: ReadonlyArray<string> };
  autoFilter?: boolean;
  freezeHeader?: boolean;
}
/** Erases Row so one workbook can hold sheets of different row types. */
export interface XlsxSheet { readonly __sheet: true }
export function xlsxSheet<Row>(spec: XlsxSheetSpec<Row>): XlsxSheet {
  throw new Error('not implemented');
}
export function downloadXlsx(fileName: string, sheets: ReadonlyArray<XlsxSheet>): Promise<void> {
  throw new Error('not implemented');
}
/** Word-compatible HTML (.doc) with NĐ30 page CSS; title escaped (m3 B29). */
export function downloadWordHtml(input: { fileName: string; title: string; body: SanitizedHtml; orientation?: 'portrait' | 'landscape' }): void {
  throw new Error('not implemented');
}

// ---------- realtime ----------
/** Subscribes to postgres_changes for these tables filtered by event_id; debounced router.refresh(). */
export function useEventChanges(eventId: string, tables: ReadonlyArray<`sce_tcsk_${string}`>): { connected: boolean } {
  throw new Error('not implemented');
}

// ---------- app chrome hooks ----------
export function useSettings(): import('@/core/settings').SystemSettings {
  throw new Error('not implemented');
}
export function useCalendar(): import('@/core/dates').WorkCalendar {
  throw new Error('not implemented');
}
/** Single AudioContext, persisted on/off per device (m5 BUG-24). */
export function useBeep(): { enabled: boolean; setEnabled: (v: boolean) => void; ok: () => void; error: () => void } {
  throw new Error('not implemented');
}

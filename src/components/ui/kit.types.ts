// Shared UI kit, src/components/ui/*, foundation-owned and frozen for module
// workers. Prop signatures only; the implementations live beside this file and
// are re-exported by ./index.ts (conformance.ts checks each against the
// signature here). ReactNode is React's.
// Rules every primitive enforces: labels bound to controls, Esc/backdrop close,
// focus trap and return, role="dialog", aria-label on icon-only buttons, text
// content rendered as React text (no HTML strings), 44px touch targets.

import type { ReactNode } from 'react';
import type { HHmm, IsoDate, SanitizedHtml } from '@/core/brand';
import type { EnumRegistry, Tone } from '@/core/vocab';

export type { ReactNode };
export type Component<P> = (props: P) => ReactNode | Promise<ReactNode>;

/** Per-tab accent, from the legacy sidebar table (core §1.4). */
export type Accent = 'blue' | 'purple' | 'amber' | 'emerald' | 'teal' | 'rose' | 'slate' | 'cyan' | 'indigo';
/** lucide-react icon names used in the app; the kit maps them, features never import icon packs. */
export type IconName =
  | 'calendar-check' | 'file-signature' | 'users' | 'store' | 'smartphone' | 'chart-line' | 'settings'
  | 'user-cog' | 'layout-template' | 'building' | 'contact' | 'bell' | 'printer' | 'cloud' | 'download'
  | 'undo' | 'redo' | 'moon' | 'sun' | 'plus' | 'pencil' | 'trash' | 'search' | 'x' | 'check' | 'qr-code'
  | 'mail' | 'file-spreadsheet' | 'file-text' | 'alert-triangle' | 'clock' | 'lock' | 'unlock' | 'shield'
  | 'log-out' | 'chevron-down' | 'chevron-right' | 'copy' | 'external-link' | 'upload' | 'map' | 'armchair' | 'menu'
  // The legacy emoji meanings: VIP star, Sở ngành landmark, Quốc tế globe, Doanh nghiệp briefcase, Báo chí newspaper,
  // venue map-pin, emergency siren, red/green/yellow status circle-x / circle-check / alert-triangle. Then kit controls.
  | 'star' | 'landmark' | 'globe' | 'briefcase' | 'newspaper' | 'map-pin' | 'siren' | 'info' | 'circle-x'
  | 'circle-check' | 'filter' | 'ellipsis' | 'arrow-left' | 'arrow-left-right' | 'calendar' | 'phone' | 'eye'
  | 'refresh' | 'list-check' | 'paperclip' | 'layers';

// ---------- actions ----------
// Three colour vocabularies, on purpose: `accent` is a module colour (Accent), `tone` is a status colour (Tone, from
// core/vocab), and ConfirmOptions.tone names the intent of a confirm button.
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Confirm tones only, on a primary button. A module colour never paints a button. */
  accent?: Extract<Accent, 'emerald' | 'amber'>;
  icon?: IconName;
  /** Spinner, aria-disabled and cursor-progress at full opacity, so "saving" never looks like "not allowed". */
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  /** Renders a link with the same look. Navigation is a link, never a button with router.push. */
  href?: string;
  /** With href: opens a new tab and tells screen readers so. */
  newTab?: boolean;
  /** A toggle button: sets aria-pressed. */
  pressed?: boolean;
  children: ReactNode;
}
export interface IconButtonProps {
  icon: IconName;
  /** Required: becomes aria-label and tooltip. */
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** Status colour of the glyph (red for delete, emerald for approve). Every Tone is styled. */
  tone?: Tone;
}

// ---------- overlays ----------
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Kept for compatibility and ignored: icon tiles are neutral, a tint only ever means a status. */
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
/** Top-end, plain text only (core B29). Success and info stay 4 s, warning and error 6 s; hover or focus pauses. */
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
  /** Kept for compatibility and ignored: the icon tile is neutral. */
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
  /** Tints the card with its accent; the one KPI a screen leads with. */
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
  /** Name of the nav landmark; defaults to 'Phân mục'. Give each tab bar on a page its own name. */
  label?: string;
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
  /** Only for a live state ('Đang diễn ra', 'Khẩn cấp'), and on at most one element per screen. */
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
/** A callout inside a page or dialog: what happened and what to do. Not for results of an action (useToast). */
export interface AlertProps {
  tone: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
  /** One Button, e.g. "Thử lại". */
  action?: ReactNode;
}
export interface RowMenuItem {
  id: string;
  label: string;
  icon?: IconName;
  /** Exactly one of onSelect or href. */
  onSelect?: () => void;
  href?: string;
  /** Destructive items are red and should open useDialogs().confirm. */
  tone?: 'danger';
  disabled?: boolean;
}
/** The "…" menu at the end of a table row or card: one IconButton, a keyboard menu, Esc returns focus. */
export interface RowMenuProps {
  items: ReadonlyArray<RowMenuItem>;
  /** Accessible name of the trigger, e.g. 'Thao tác với Nguyễn Văn An'. Defaults to 'Thao tác'. */
  label?: string;
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
  /** Hidden below md. The first column is the row's title on phones; give the rest a reason to stay. */
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
  /** Skeleton rows and aria-busy while the rows are being fetched; the empty state waits. */
  loading?: boolean;
}
export interface FilterBarProps {
  /** label defaults to 'Tìm kiếm'; every control in the bar has a visible label, like a FormField. */
  search: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; /** Enter in the search box, for a bar that searches on demand instead of on every keystroke. */ onSubmit?: (v: string) => void };
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
export interface NumberInputProps { name: string; min?: number; max?: number; step?: number; disabled?: boolean }
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
  /** For a plain form post without useZodForm; inside a Form, use the form's defaultValues. */
  defaultValue?: K;
  /** Controlled use outside a Form (a filter, an inline choice): pass value and onChange together. '' is the placeholder. */
  value?: K | '';
  onChange?: (next: K | '') => void;
  /** Accessible name for a Select outside a FormField. Inside one, the field's label names it. */
  label?: string;
  disabled?: boolean;
}
export interface TextareaProps { name: string; placeholder?: string; rows?: number }
/** Own legend, hint and error, like Checkbox: use it inside a Form directly, not inside FormField. */
export interface RadioGroupProps<K extends string> {
  name: string;
  label: string;
  options: ReadonlyArray<{ value: K; label: string; description?: string }>;
  hint?: string;
  required?: boolean;
  orientation?: 'vertical' | 'horizontal';
  /** For a plain form post without useZodForm. */
  defaultValue?: K;
}
/** An on/off setting that applies at once (no Save button). For a form field, use Checkbox. */
export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}
export interface ComboboxProps<T> {
  name: string;
  /** Server-backed search via useQuery; results ranked by matchesQuery. */
  search: (q: string) => Promise<ReadonlyArray<T>>;
  itemKey: (t: T) => string;
  /** The option's text, and the box's text after a pick unless inputLabel says otherwise. */
  itemLabel: (t: T) => string;
  /** What the typed text is matched and ranked against. Defaults to itemLabel; give it every searched field (name, organization, phone). */
  matchText?: (t: T) => string;
  /** The box's text after a pick. Defaults to itemLabel. */
  inputLabel?: (t: T) => string;
  /** Shown when the search found nothing. Defaults to 'Không tìm thấy kết quả.' */
  emptyMessage?: string;
  renderItem?: (t: T) => ReactNode;
  onPick: (t: T) => void;
}
export interface CheckboxProps {
  name: string;
  label: string;
  description?: string;
  /** Controlled use outside a form (task lists): pass checked and onChange together. */
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Line through the label while checked, for done tasks. */
  strike?: boolean;
}

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

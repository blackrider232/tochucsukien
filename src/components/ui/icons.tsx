import {
  AlertTriangle, Armchair, Bell, Building, CalendarCheck, ChartLine, Check, ChevronDown, ChevronRight, Clock,
  Cloud, Contact, Copy, Download, ExternalLink, FileSignature, FileSpreadsheet, FileText, LayoutTemplate,
  Lock, LogOut, Mail, Map as MapIcon, Moon, Pencil, Plus, Printer, QrCode as QrIcon, Redo2, Search, Settings,
  Shield, Smartphone, Store, Sun, Trash2, Undo2, Unlock, Upload, UserCog, Users, X,
  type LucideIcon,
} from 'lucide-react';
import type { IconName } from './kit.types';

const ICONS: Readonly<Record<IconName, LucideIcon>> = {
  'calendar-check': CalendarCheck,
  'file-signature': FileSignature,
  users: Users,
  store: Store,
  smartphone: Smartphone,
  'chart-line': ChartLine,
  settings: Settings,
  'user-cog': UserCog,
  'layout-template': LayoutTemplate,
  building: Building,
  contact: Contact,
  bell: Bell,
  printer: Printer,
  cloud: Cloud,
  download: Download,
  undo: Undo2,
  redo: Redo2,
  moon: Moon,
  sun: Sun,
  plus: Plus,
  pencil: Pencil,
  trash: Trash2,
  search: Search,
  x: X,
  check: Check,
  'qr-code': QrIcon,
  mail: Mail,
  'file-spreadsheet': FileSpreadsheet,
  'file-text': FileText,
  'alert-triangle': AlertTriangle,
  clock: Clock,
  lock: Lock,
  unlock: Unlock,
  shield: Shield,
  'log-out': LogOut,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  copy: Copy,
  'external-link': ExternalLink,
  upload: Upload,
  map: MapIcon,
  armchair: Armchair,
};

export const ICON_NAMES = Object.keys(ICONS) as ReadonlyArray<IconName>;

/** Decorative by default (aria-hidden); the surrounding control carries the name. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const Cmp = ICONS[name];
  return <Cmp aria-hidden="true" focusable="false" width={size} height={size} className={className} />;
}

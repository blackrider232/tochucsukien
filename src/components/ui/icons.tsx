import {
  AlertTriangle, AlignCenter, AlignJustify, AlignLeft, AlignRight, Armchair, Bold, ArrowLeft, ArrowLeftRight, Bell, Briefcase, Building, Calendar, CalendarCheck, ChartLine, Check,
  ChevronDown, ChevronRight, CircleCheck, CircleX, Clock, Cloud, Contact, Copy, Download, Ellipsis, ExternalLink, Eye,
  FileSignature, FileSpreadsheet, FileText, Filter, Globe, Info, Italic, Landmark, Layers, LayoutTemplate, ListChecks, LoaderCircle,
  Lock, LogOut, Mail, Map as MapIcon, MapPin, Menu, Moon, Newspaper, Paperclip, Pencil, Phone, Plus, Printer,
  QrCode as QrIcon, Redo2, RefreshCw, Search, Settings, Shield, Siren, Smartphone, Star, Store, Sun, Table as TableIcon, Trash2, Underline, Undo2, Unlock,
  Upload, UserCog, Users, X,
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
  menu: Menu,
  star: Star,
  landmark: Landmark,
  globe: Globe,
  briefcase: Briefcase,
  newspaper: Newspaper,
  'map-pin': MapPin,
  siren: Siren,
  info: Info,
  'circle-x': CircleX,
  'circle-check': CircleCheck,
  filter: Filter,
  ellipsis: Ellipsis,
  'arrow-left': ArrowLeft,
  'arrow-left-right': ArrowLeftRight,
  calendar: Calendar,
  phone: Phone,
  eye: Eye,
  refresh: RefreshCw,
  'list-check': ListChecks,
  paperclip: Paperclip,
  layers: Layers,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  'align-left': AlignLeft,
  'align-center': AlignCenter,
  'align-right': AlignRight,
  'align-justify': AlignJustify,
  table: TableIcon,
};

export const ICON_NAMES = Object.keys(ICONS) as ReadonlyArray<IconName>;

/** Decorative by default (aria-hidden); the surrounding control carries the name. With `label` it is an image with that name. */
export function Icon({ name, size = 16, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  const Cmp = ICONS[name];
  const named = label !== undefined && label !== '';
  return (
    <Cmp
      {...(named ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
      width={size}
      height={size}
      className={className}
    />
  );
}

/** The busy indicator of Button and DataTable. Decorative: the control says what is loading. */
export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle aria-hidden="true" focusable="false" width={size} height={size} className="animate-spin" />;
}

# UI rules for module workers

Paste this into every module brief. `pnpm lint` and `pnpm test` enforce the rules marked (guard). Every specimen is at `/dev/kit` (`SCE_DEV_MEMORY=1 pnpm dev`), in light and dark.

1. Import UI only from `@/components/ui`. Never deep-import a kit file or an icon pack (guard).
2. Colour only through token classes: `bg-surface`/`-2`/`-3`, `bg-app`, `text-ink`/`-2`/`-muted`, `text-link`, `text-danger-ink`, `text-success-ink`, `text-warning-ink`, `border-line`, `border-control-border`, `bg-primary`, `bg-selected`, and `bg-paper`/`text-paper-ink`/`border-paper-ink` on print. No palette classes, no hex, no arbitrary `[..]` values (guard). Print sizes are `text-print-lg`/`-base`/`-sm`/`-xs`.
3. Coloured text is `text-link`, never `text-primary` (2.83:1 on the dark surface).
4. Status colour comes from a vocab registry through `<StatusBadge>`, or a `Tone` on `<Badge>` and `rowTone`. Never pick a colour per screen.
5. No emoji anywhere (guard). Use `<Icon name>`, `<Badge icon>` or an `icon` prop. The legacy meanings are `star`, `landmark`, `globe`, `briefcase`, `newspaper`, `map-pin`, `siren`, `circle-x`, `circle-check`. Never render `GUEST_GROUPS[].icon`. Missing icon: ask the lead.
6. Actions: one `<Button>` (primary) per view. Navigation is `<Button href>` (add `newTab` for a new tab), never `router.push` in an `onClick`. `accent` is `emerald` or `amber` for a confirm only. A toggle is `<Button pressed>`. Saving is `<Button loading>`.
7. Icon-only controls are `<IconButton label="…">`, with the Vietnamese action as the label. Per-row actions beyond one go in `<RowMenu label="Thao tác với …" items>`.
8. Destructive actions: `useDialogs().confirm({ tone: 'danger' })`. Never `window.confirm`, never a custom modal. Forms in a modal use `<Dialog dirty>`.
9. Forms: `useZodForm(schema)` + `<Form>` + `<FormField>` around `TextInput`, `NumberInput`, `MoneyInput`, `DateInput`, `TimeInput`, `Select`, `Textarea`, `Combobox`, `FileInput` (type and size checked before the file reaches you) and `RichEditor` (hands you sanitized HTML; add tools with `toolbarExtras` and `useRichEditor()`). `Select` also works outside a form: pass `value` and `onChange` with a `label`. `Checkbox` and `RadioGroup` carry their own label: put them in the form directly. No raw `<input>`, `<select>` or `<textarea>`.
10. A setting that applies at once is `<Switch>`. A task list outside a form is `<Checkbox checked onChange strike>`.
11. Lists: `<FilterBar>` above `<DataTable>`. Give every row a stable `rowKey`. The first column is the row's title on phones. Set `hideOnMobile` on every other column a phone does not need. Pass `loading` while fetching. Empty is `empty={{ icon, title, text, action }}`.
12. Feedback: `useToast()` for the result of an action, inline `FormField` errors for input, `<Alert tone>` for a state the page is in ("chưa sẵn sàng", a failed load with a retry `action`).
13. Page sections are `<SectionCard>`. Headline numbers are `<KpiCard>`, and `highlight` goes on one per screen at most. No cards in cards, no extra border or shadow.
14. Never render `<main>` (guard) or `<h1>`. The shell owns both. Your first heading is h2, which SectionCard gives you.
15. Event pages render inside the event layout, which shows the event name, switcher, `eventActions` and your sub-tabs. Do not build an event header, switcher or tab bar for your nav entry. Use `slots.tsx` and `subTabs` in your manifest.
16. Several tab bars on one page each get their own `<LinkTabs label>`.
17. `pulse` only for a live state ("Đang diễn ra", "Khẩn cấp"), on one element per screen.
18. Vietnamese copy uses sentence case, no CAPS labels. Use old-style tone marks: Xóa, Hủy, Khóa, Hòa, Thủy (guard). Buttons are verbs ("Lưu", "Thêm khách", "Xuất Excel"). Errors say what to do ("Nhập họ tên").
19. Phone screens (live check-in) have no horizontal scroll, no nested scroll areas and one action per row. The kit already gives 44 px targets on touch screens.
20. Check every screen at 360 px and 1440 px, light and dark, with keyboard only (Tab order, Esc, focus return), before review.
21. Kit helpers you may reach for before writing your own: `useOnline()` (offline state), `useSubTabCount(subTabId, count)` (a count on your sub-tab, such as '4/10'), `<CodeScanner onCode>` (camera QR decode with every failure said in words), `<PrintPage type="nd30">` (Times New Roman at the Word file's pt sizes), `<Icon label>` (a named image; icons are decorative otherwise).
22. Need a primitive, token or icon the kit lacks? Stop and ask the lead. Do not hand-roll it in your feature.

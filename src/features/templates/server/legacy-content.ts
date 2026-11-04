// Fixes to the text of a legacy template that the built-ins already received
// (LEGACY_FIXES in __tests__/legacy-templates.ts), applied to what an admin saved.

/**
 * `{{NGAY_HOM_NAY}}` prints "ngày 04 tháng 11 năm 2026" since m3 B13, so the word "ngày"
 * an admin typed in front of it (legacy printed only dd/mm/yyyy) would print twice.
 * Matches the spellings an editor leaves: capital, `&nbsp;`, several spaces, spaces inside the braces.
 */
const NGAY_BEFORE_DATE_TAG = /(?<![\p{L}\p{N}])ngày(?:\s|&nbsp;)+(?=\{\{\s*NGAY_HOM_NAY\s*\}\})/giu;

export const dropDuplicatedNgay = (html: string): string => html.replace(NGAY_BEFORE_DATE_TAG, '');

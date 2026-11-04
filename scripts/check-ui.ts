// UI guards a lint rule cannot express (docs/rewrite/audits/ui-kit-audit.md):
//   G4  no emoji in code under src/ (Extended_Pictographic), except legacy vocabulary data;
//   G11 one spelling of the tone marks: Xóa, Hủy, Khóa, Hòa, Thủy;
//   G12 every value the kit exports has a specimen in /dev/kit (a data-kit key) or a reason not to.
// The checks are pure over file text, so check-ui.test.ts feeds them failing examples.
// Usage: pnpm tsx scripts/check-ui.ts

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface SourceFile {
  /** Repo-relative, with '/' separators. */
  path: string;
  text: string;
}

/** Legacy registry data that still carries the old emoji; never rendered (render an Icon instead). */
const EMOJI_ALLOWED: Readonly<Record<string, ReadonlyArray<string>>> = {
  'src/core/vocab.ts': ['⭐', '🏛️', '💼', '🌐', '📰'],
};

const EMOJI = /\p{Extended_Pictographic}️?/gu;
const OLD_TONE_MARKS = /(?<!\p{L})(xoá|huỷ|khoá|hoà|thuỷ)(?!\p{L})/giu;
const NEW_TONE_MARK: Readonly<Record<string, string>> = { xoá: 'xóa', huỷ: 'hủy', khoá: 'khóa', hoà: 'hòa', thuỷ: 'thủy' };

const isTest = (path: string) => /(^|\/)__tests__\//.test(path) || /\.test\.tsx?$/.test(path);

export function emojiAndSpelling(files: ReadonlyArray<SourceFile>): string[] {
  const errors: string[] = [];
  for (const file of files) {
    if (isTest(file.path)) continue;
    const allowed = new Set(EMOJI_ALLOWED[file.path] ?? []);
    file.text.normalize('NFC').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(EMOJI)) {
        if (!allowed.has(m[0])) errors.push(`${file.path}:${i + 1} emoji "${m[0]}": emoji are content, never icons. Use <Icon name> or <Badge icon>.`);
      }
      for (const m of line.matchAll(OLD_TONE_MARKS)) {
        errors.push(`${file.path}:${i + 1} "${m[0]}": write "${NEW_TONE_MARK[m[0].toLowerCase()]}" (old-style tone marks, the majority spelling).`);
      }
    });
  }
  return errors;
}

/** Kit values with nothing to look at, and why. Anything else the kit exports needs a /dev/kit specimen. */
export const NOT_IN_GALLERY: Readonly<Record<string, string>> = {
  UiProviders: 'the gallery itself renders inside it',
  DialogsProvider: 'part of UiProviders',
  ToastProvider: 'part of UiProviders',
  SkipLink: 'rendered by the root layout; Tab once on any page to see it',
  cn: 'class-name helper',
  useAppContext: 'core hook, no UI',
  useSettings: 'core hook, no UI',
  useCalendar: 'core hook, no UI',
  useEventChanges: 'core realtime hook, no UI',
  useCommand: 'core command hook, no UI',
  useUndo: 'core undo hook; the shell renders its buttons',
};

export function exportedValues(indexSource: string): string[] {
  const names: string[] = [];
  for (const m of indexSource.matchAll(/^export \{([^}]+)\} from /gm)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name && !name.startsWith('type ')) names.push(name);
    }
  }
  return names;
}

export function galleryKeys(gallerySource: string): Set<string> {
  return new Set([...gallerySource.matchAll(/\bkit="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
}

export function galleryGaps(indexSource: string, gallerySource: string): string[] {
  const shown = galleryKeys(gallerySource);
  return exportedValues(indexSource)
    .filter((name) => !shown.has(name) && !(name in NOT_IN_GALLERY))
    .map((name) => `${name} is exported by src/components/ui but has no kit="…${name}…" specimen in src/app/dev/kit/kit-gallery.tsx`);
}

function sourceFiles(root: string, dir: string): SourceFile[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(root, rel);
    if (!/\.(ts|tsx)$/.test(e.name)) return [];
    return [{ path: relative(root, join(root, rel)).split(sep).join('/'), text: readFileSync(join(root, rel), 'utf8') }];
  });
}

export function checkUi(root: string): string[] {
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  return [
    ...emojiAndSpelling(sourceFiles(root, 'src')),
    ...galleryGaps(read('src/components/ui/index.ts'), read('src/app/dev/kit/kit-gallery.tsx')),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkUi(join(import.meta.dirname, '..'));
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length > 0) {
    console.error(`check-ui failed with ${errors.length} violation(s)`);
    process.exit(1);
  }
  console.log('check-ui passed: no emoji, one tone-mark spelling, every kit export in /dev/kit');
}

import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// Boundary rules of the parallel-work contract (docs/architecture/design.md, item 9).

const FEATURE_KEYS = ['core', 'progress', 'templates', 'guests', 'venue', 'directory', 'comms', 'live', 'reports'];

const SUPABASE = {
  group: ['@supabase/*'],
  message: 'Only src/core/db and src/core/auth may import @supabase/*. Read and write through ctx.db and commands.',
};

// Everything below a feature except its public entries (the root, and server).
const featureInternals = (key) => ({
  group: [`@/features/${key}/*`, `!@/features/${key}/server`, `!@/features/${key}/server/**`],
  message: `Import ${key} through "@/features/${key}" or "@/features/${key}/server" only.`,
});

// One way into the command system: '@/core/commands'. Tests also run commands through '@/core/commands/pipeline'.
const COMMANDS_INTERNALS = {
  group: ['@/core/commands/*', '!@/core/commands/pipeline'],
  message: 'Import commands from "@/core/commands" (defineCommands, CommandError, types, useCommand). Tests use runCommand from "@/core/commands/pipeline".',
};

// Feature server code imports '@/core/commands' at runtime and dispatch imports every feature, so the entry stays pure.
const PURE_COMMANDS_ENTRY = {
  group: ['./dispatch', './pipeline', '@/core/commands/*', '@/features/*', '@/core/auth/server', 'next/headers'],
  allowTypeImports: true,
  message: '@/core/commands must not reach dispatch, the registry or next/headers: features import it at runtime, so it would close an import cycle.',
};

// UI guards from docs/rewrite/audits/ui-kit-audit.md (G1-G6, G8). Their failing examples are in
// src/components/ui/__tests__/guards-lint.test.ts.
const ICON_PACKS = {
  group: ['lucide-react', '@heroicons/*', 'react-icons', 'react-icons/*'],
  message: 'Icons come from the kit: <Icon name="…"> or a kit prop. A missing name is a request to the lead.',
};

const KIT_INTERNALS = {
  group: ['@/components/ui/*', '!@/components/ui/__tests__', '!@/components/ui/__tests__/*'],
  message: "Import the UI kit from '@/components/ui' only. Its files are internals.",
};

const importRule = ({ supabase, ownKey, extra = [], iconPacks = true }) => [
  'error',
  {
    patterns: [
      ...(supabase ? [SUPABASE] : []),
      ...(iconPacks ? [ICON_PACKS] : []),
      ...FEATURE_KEYS.filter((key) => key !== ownKey).map(featureInternals),
      ...extra,
    ],
  },
];

const SYNTAX = {
  useServer: {
    selector: "ExpressionStatement[directive='use server']",
    message: "'use server' is allowed only in src/core/commands/dispatch.ts. Declare a command with defineCommands.",
  },
  rawHtml: {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'Render a SanitizedHtml value through the kit <RichHtml>. Raw HTML props are not allowed.',
  },
  localStorage: {
    selector: "Identifier[name='localStorage']",
    message: 'localStorage is for UI prefs only, through src/core/prefs.',
  },
  isoSlice: {
    selector: "CallExpression[callee.property.name=/^(slice|substring|substr|split)$/][callee.object.callee.property.name='toISOString']",
    message: 'Slicing toISOString() yields the UTC date. Use src/core/dates.',
  },
  dateLiteral: {
    selector: "NewExpression[callee.name='Date'][arguments.0.type='Literal'][arguments.0.value=/^\\d{4}-\\d{2}-\\d{2}$/]",
    message: "new Date('YYYY-MM-DD') parses as UTC. Use src/core/dates.",
  },
};

const PALETTE = '\\b(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|accent|decoration|caret|placeholder|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\\b';
const ARBITRARY = '\\b[a-z][a-z0-9-]*-\\[[^\\]]+\\]';
const HEX = '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b';
const PALETTE_MESSAGE = 'Use a token class (bg-surface, text-ink, text-danger-ink, border-control-border…). Palette colours live only in globals.css.';
const ARBITRARY_MESSAGE = 'No arbitrary Tailwind values outside the kit. Use a token or kit prop, or ask the lead for one.';
const HEX_MESSAGE = 'No raw hex colours in code. Use a token class; colours live in globals.css.';

Object.assign(SYNTAX, {
  palette: { selector: `Literal[value=/${PALETTE}/]`, message: PALETTE_MESSAGE },
  paletteTemplate: { selector: `TemplateElement[value.raw=/${PALETTE}/]`, message: PALETTE_MESSAGE },
  hex: { selector: `Literal[value=/${HEX}/]`, message: HEX_MESSAGE },
  hexTemplate: { selector: `TemplateElement[value.raw=/${HEX}/]`, message: HEX_MESSAGE },
  arbitrary: { selector: `Literal[value=/${ARBITRARY}/]`, message: ARBITRARY_MESSAGE },
  arbitraryTemplate: { selector: `TemplateElement[value.raw=/${ARBITRARY}/]`, message: ARBITRARY_MESSAGE },
  main: { selector: "JSXOpeningElement[name.name='main']", message: 'AppShell renders the only <main>. Render a <div> or <section>.' },
});

const OUTSIDE_FEATURES = ['arbitrary', 'arbitraryTemplate', 'main'];
const IN_TESTS = ['palette', 'paletteTemplate', 'hex', 'hexTemplate', 'arbitrary', 'arbitraryTemplate', 'main'];

const syntaxRule = (...allowed) => [
  'error',
  ...Object.entries(SYNTAX)
    .filter(([name]) => !allowed.includes(name))
    .map(([, restriction]) => restriction),
];

export default defineConfig([
  globalIgnores(['.next/**', 'node_modules/**', 'legacy/**', 'docs/**', '.agents/**', '.claude/**', 'public/**', 'next-env.d.ts']),
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Stubs keep their final signatures with throwing bodies; unused parameters are expected until implemented.
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
      // CommandMap and PermissionMap are empty on purpose: features fill them by declaration merging.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.{ts,mjs}'],
    rules: {
      'no-restricted-imports': importRule({ supabase: true, ownKey: null, extra: [COMMANDS_INTERNALS] }),
      'no-restricted-syntax': syntaxRule(...OUTSIDE_FEATURES),
    },
  },
  ...FEATURE_KEYS.map((key) => ({
    files: [`src/features/${key}/**`],
    rules: {
      'no-restricted-imports': importRule({ supabase: true, ownKey: key, extra: [COMMANDS_INTERNALS, KIT_INTERNALS] }),
      'no-restricted-syntax': syntaxRule(),
    },
  })),
  {
    files: ['src/app/**'],
    rules: {
      'no-restricted-imports': importRule({ supabase: true, ownKey: null, extra: [COMMANDS_INTERNALS, KIT_INTERNALS] }),
      'no-restricted-syntax': syntaxRule('main'),
    },
  },
  { files: ['src/app/(app)/**'], rules: { 'no-restricted-syntax': syntaxRule() } },
  { files: ['src/components/ui/icons.tsx'], rules: { 'no-restricted-imports': importRule({ supabase: true, ownKey: null, extra: [COMMANDS_INTERNALS], iconPacks: false }) } },
  {
    files: ['src/core/db/**', 'src/core/auth/**'],
    rules: { 'no-restricted-imports': importRule({ supabase: false, ownKey: null, extra: [COMMANDS_INTERNALS] }) },
  },
  {
    files: ['src/core/commands/index.ts', 'src/core/commands/client.tsx'],
    rules: { 'no-restricted-imports': importRule({ supabase: true, ownKey: null, extra: [PURE_COMMANDS_ENTRY] }) },
  },
  { files: ['src/core/commands/dispatch.ts'], rules: { 'no-restricted-syntax': syntaxRule('useServer', ...OUTSIDE_FEATURES) } },
  { files: ['src/components/ui/**'], rules: { 'no-restricted-syntax': syntaxRule('rawHtml', ...OUTSIDE_FEATURES) } },
  { files: ['src/core/prefs/**'], rules: { 'no-restricted-syntax': syntaxRule('localStorage', ...OUTSIDE_FEATURES) } },
  { files: ['src/core/dates/**'], rules: { 'no-restricted-syntax': syntaxRule('isoSlice', 'dateLiteral', ...OUTSIDE_FEATURES) } },
  // The browser theme colour of the PWA manifest and viewport has to be a literal.
  { files: ['src/app/layout.tsx', 'src/app/manifest.ts'], rules: { 'no-restricted-syntax': syntaxRule('hex', 'main') } },
  // Tests assert class names and render landmarks on purpose; the kit gallery shows the shell's own landmark.
  { files: ['**/__tests__/**', '**/*.test.{ts,tsx}'], rules: { 'no-restricted-syntax': syntaxRule(...IN_TESTS) } },
]);

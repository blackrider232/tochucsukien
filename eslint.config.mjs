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

const importRule = ({ supabase, ownKey }) => [
  'error',
  {
    patterns: [
      ...(supabase ? [SUPABASE] : []),
      ...FEATURE_KEYS.filter((key) => key !== ownKey).map(featureInternals),
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

const syntaxRule = (...allowed) => [
  'error',
  ...Object.entries(SYNTAX)
    .filter(([name]) => !allowed.includes(name))
    .map(([, restriction]) => restriction),
];

export default defineConfig([
  globalIgnores(['.next/**', 'node_modules/**', 'legacy/**', 'docs/**', 'public/**', 'next-env.d.ts']),
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ['**/*.{ts,tsx,mts,mjs}'],
    rules: {
      'no-restricted-imports': importRule({ supabase: true, ownKey: null }),
      'no-restricted-syntax': syntaxRule(),
    },
  },
  ...FEATURE_KEYS.map((key) => ({
    files: [`src/features/${key}/**`],
    rules: { 'no-restricted-imports': importRule({ supabase: true, ownKey: key }) },
  })),
  {
    files: ['src/core/db/**', 'src/core/auth/**'],
    rules: { 'no-restricted-imports': importRule({ supabase: false, ownKey: null }) },
  },
  { files: ['src/core/commands/dispatch.ts'], rules: { 'no-restricted-syntax': syntaxRule('useServer') } },
  { files: ['src/components/ui/**'], rules: { 'no-restricted-syntax': syntaxRule('rawHtml') } },
  { files: ['src/core/prefs/**'], rules: { 'no-restricted-syntax': syntaxRule('localStorage') } },
  { files: ['src/core/dates/**'], rules: { 'no-restricted-syntax': syntaxRule('isoSlice', 'dateLiteral') } },
]);

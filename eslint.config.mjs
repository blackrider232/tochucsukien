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

const importRule = ({ supabase, ownKey, extra = [] }) => [
  'error',
  {
    patterns: [
      ...(supabase ? [SUPABASE] : []),
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
      'no-restricted-syntax': syntaxRule(),
    },
  },
  ...FEATURE_KEYS.map((key) => ({
    files: [`src/features/${key}/**`],
    rules: { 'no-restricted-imports': importRule({ supabase: true, ownKey: key, extra: [COMMANDS_INTERNALS] }) },
  })),
  {
    files: ['src/core/db/**', 'src/core/auth/**'],
    rules: { 'no-restricted-imports': importRule({ supabase: false, ownKey: null, extra: [COMMANDS_INTERNALS] }) },
  },
  {
    files: ['src/core/commands/index.ts', 'src/core/commands/client.tsx'],
    rules: { 'no-restricted-imports': importRule({ supabase: true, ownKey: null, extra: [PURE_COMMANDS_ENTRY] }) },
  },
  { files: ['src/core/commands/dispatch.ts'], rules: { 'no-restricted-syntax': syntaxRule('useServer') } },
  { files: ['src/components/ui/**'], rules: { 'no-restricted-syntax': syntaxRule('rawHtml') } },
  { files: ['src/core/prefs/**'], rules: { 'no-restricted-syntax': syntaxRule('localStorage') } },
  { files: ['src/core/dates/**'], rules: { 'no-restricted-syntax': syntaxRule('isoSlice', 'dateLiteral') } },
]);

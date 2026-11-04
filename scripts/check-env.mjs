import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = process.argv[2] ?? 'dev';
const required = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
  .split('\n')
  .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
  .filter(Boolean);

const out = execFileSync('infisical', ['export', '--env', env, '--format=json'], { encoding: 'utf8' });
const present = new Map(JSON.parse(out).map((s) => [s.key, s.value]));
const missing = required.filter((k) => !present.get(k));

for (const k of required) console.log(`${present.get(k) ? 'ok     ' : 'MISSING'} ${k}`);
if (missing.length) {
  console.error(`\n${missing.length} secret(s) missing or empty in Infisical env "${env}".`);
  process.exit(1);
}

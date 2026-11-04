// Runs the legacy generateStandardEventTemplate (legacy/index.html) in Node,
// so the typed template table can be diffed against the original code.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

export interface LegacyStep {
  id: string;
  name: string;
  requirement: string;
  offsetDays: number;
  dayType: string;
  targetPhase: string;
  calculatedDeadline: string;
  assignee: string;
  templateKey: string;
  subTasks: Array<{ id: number; name: string; completed: boolean }>;
  links: unknown[];
}
export interface LegacyGroup {
  id: string;
  phase: string;
  name: string;
  leadPerson: string;
  note: string;
  steps: LegacyStep[];
}

/** The source between two function declarations, by name, so line drift in the legacy file does not matter. */
function between(source: string, startFn: string, endFn: string): string {
  const start = source.indexOf(`function ${startFn}(`);
  const end = source.indexOf(`function ${endFn}(`, start);
  if (start < 0 || end < 0) throw new Error(`legacy/index.html: cannot find ${startFn}..${endFn}`);
  return source.slice(start, end);
}

export function runLegacyGenerator(type: 'hoi_nghi' | 'hoi_cho', t0: string, lead: string): LegacyGroup[] {
  const html = readFileSync(join(process.cwd(), 'legacy', 'index.html'), 'utf8');
  const script = [
    between(html, 'isWeekend', 'getDaysDiff'),
    'var currentUser = null;',
    between(html, 'generateStandardEventTemplate', 'initDefaultSampleEvents'),
    `generateStandardEventTemplate(${JSON.stringify(type)}, ${JSON.stringify(t0)}, 'N', 'D', ${JSON.stringify(lead)}, 'L', 'B', 150).groups;`,
  ].join('\n');
  return runInNewContext(script, { Date }) as LegacyGroup[];
}

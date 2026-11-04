// Every audit row comms writes names its action and entity with literals the
// database accepts (202611041350_core_audit_action_charset.sql; memoryDb's
// writer applies the same sets). A refused row is a change saved unaudited, so
// the sets are checked here, on the source, for every audit() call.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ACTION = /^[0-9A-Za-zÀ-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ /().,:;'"&+%#?!-]+$/u;
const ENTITY = /^[A-Za-z0-9_.-]+$/;

const ROOT = join(process.cwd(), 'src', 'features', 'comms');
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' ? [] : sources(p);
    return /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
  });
}

/** The top-level arguments of the call whose `(` is at `open`, as source text. Strings and template literals are skipped whole. */
function callArgs(src: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  let i = open;
  const skipString = (quote: string) => {
    for (i += 1; src[i] !== quote; i += 1) {
      if (src[i] === '\\') i += 1;
      else if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
        let inner = 0;
        for (i += 1; !(src[i] === '}' && inner === 1); i += 1) {
          if (src[i] === '{') inner += 1;
          else if (src[i] === '}') inner -= 1;
          else if (src[i] === "'" || src[i] === '`') skipString(src[i]!);
        }
      }
    }
  };
  for (; i < src.length; i += 1) {
    const c = src[i]!;
    if (c === "'" || c === '"' || c === '`') skipString(c);
    else if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return [...args, src.slice(start, i).trim()];
    } else if (c === ',' && depth === 1) {
      args.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  throw new Error(`unclosed call at ${open}`);
}

const LITERAL = /'([^'\\]*)'/g;
const calls = sources(ROOT).flatMap((file) => {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/\baudit\(/g)].map((m) => ({ at: `${relative(process.cwd(), file)}:${src.slice(0, m.index).split('\n').length}`, args: callArgs(src, m.index + 'audit'.length) }));
});

describe('comms audit strings', () => {
  it('finds the audit() calls of every command', () => {
    expect(calls.length).toBeGreaterThanOrEqual(20);
  });

  it.each(calls)('$at: the action is a literal in the action set and the entity an ASCII identifier', ({ args }) => {
    expect(args).toHaveLength(5);
    const [action, , , entity] = args as [string, string, string, string];
    // A literal, or a choice between literals: never text built at run time.
    expect(action).toMatch(/^(?:[\w.\s]+\?\s*)?'[^']*'(?:\s*:\s*'[^']*')?$/);
    for (const [, text] of action.matchAll(LITERAL)) expect(text).toMatch(ACTION);
    expect(entity).toMatch(/^'[^']*'$/);
    expect(entity.slice(1, -1)).toMatch(ENTITY);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ND30_PT } from '../domain/word';

describe('the NĐ30 pt sizes', () => {
  it('are the same in the Word file and in the kit tokens that PrintPage type="nd30" prints with', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const pt = (name: string) => Number(css.match(new RegExp(`--${name}:\\s*(\\d+)pt;`))?.[1]);
    expect({ body: pt('text-nd30'), header: pt('text-nd30-header'), signer: pt('text-nd30'), recipientsHeading: pt('text-nd30-note'), copies: pt('text-nd30-copies') }).toEqual(ND30_PT);
  });
});

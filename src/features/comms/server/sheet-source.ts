// The port the form sync reads a responses sheet through. Outside dev memory
// the registered commands read Google (fetchSheetCsv and its guards); the dev
// memory runtime and every test use the fake, which answers from a table of
// fixture sheets and never opens a connection, so neither can reach Google.

import { devMemoryEnabled } from '@/core/dev/mode';
import { DEV_SHEETS } from './dev-sheets';
import { fetchSheetCsv, type SheetFetchResult } from './sheet-fetch';

export interface SheetSource {
  readonly kind: 'google' | 'fake';
  /** The CSV text behind a stored export URL, or a Vietnamese reason why there is none. */
  read(storedUrl: string): Promise<SheetFetchResult>;
}

export const FAKE_UNKNOWN_SHEET = 'Môi trường phát triển không đọc Google Sheet thật. Chỉ Sheet mẫu của sự kiện thử nghiệm đọc được.';

export interface FakeSheetSource extends SheetSource {
  /** Sets what a URL answers: CSV text, or a failure. */
  set(url: string, answer: string | { ok: false; message: string }): void;
  /** Every URL read, in order. */
  readonly reads: ReadonlyArray<string>;
}

export function fakeSheetSource(sheets: Readonly<Record<string, string>> = {}): FakeSheetSource {
  const answers = new Map<string, SheetFetchResult>(Object.entries(sheets).map(([url, text]) => [url, { ok: true, text }]));
  const reads: string[] = [];
  return {
    kind: 'fake',
    reads,
    set(url, answer) {
      answers.set(url, typeof answer === 'string' ? { ok: true, text: answer } : answer);
    },
    async read(url) {
      reads.push(url);
      return answers.get(url) ?? { ok: false, message: FAKE_UNKNOWN_SHEET };
    },
  };
}

/**
 * The source the registered commands use: the dev fixture sheets under SCE_DEV_MEMORY, Google otherwise. Asked on
 * every read, not at import, so the choice follows the runtime the request runs in.
 */
let devSource: FakeSheetSource | null = null;
export const defaultSheetSource: SheetSource = {
  get kind() {
    return devMemoryEnabled() ? 'fake' : 'google';
  },
  read(url) {
    if (!devMemoryEnabled()) return fetchSheetCsv(url);
    devSource ??= fakeSheetSource(DEV_SHEETS);
    return devSource.read(url);
  },
};

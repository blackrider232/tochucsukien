// Compile-time check that each implementation matches its signature in kit.types.ts.
// Nothing here runs: tsc fails when a signature in the contract and its implementation diverge.

import type * as Contract from './kit.types';
import { useBeep } from './beep';
import { useDialogs } from './dialogs';
import { downloadBlob, downloadWordHtml, downloadXlsx, xlsxSheet } from './files';
import { qrPngDataUrl } from './qr';
import { useCalendar, useSettings } from './app-env';
import { useToast } from './toast';

export const conformance = {
  useDialogs: useDialogs satisfies typeof Contract.useDialogs,
  useToast: useToast satisfies typeof Contract.useToast,
  qrPngDataUrl: qrPngDataUrl satisfies typeof Contract.qrPngDataUrl,
  downloadBlob: downloadBlob satisfies typeof Contract.downloadBlob,
  xlsxSheet: xlsxSheet satisfies typeof Contract.xlsxSheet,
  downloadXlsx: downloadXlsx satisfies typeof Contract.downloadXlsx,
  downloadWordHtml: downloadWordHtml satisfies typeof Contract.downloadWordHtml,
  useSettings: useSettings satisfies typeof Contract.useSettings,
  useCalendar: useCalendar satisfies typeof Contract.useCalendar,
  useBeep: useBeep satisfies typeof Contract.useBeep,
};

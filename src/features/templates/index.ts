// Public client-safe entry: the contract's types, the pure functions other
// features call (step key -> template, links, rendering), and the screens the
// routes render. The server reads and commands are in "./server".

export type * from './contract';
export { renderTemplate } from './domain/merge-tags';
export { resolveTemplateKey, templateHref, templatePrintHref } from './domain/key-mapping';

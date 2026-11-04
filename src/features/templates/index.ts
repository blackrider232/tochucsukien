// Public client-safe entry: the contract's types, the pure functions other
// features call (step key -> template, links, rendering), and the screens the
// routes render. The server reads and commands are in "./server".

export type * from './contract';
export { renderTemplate } from './domain/merge-tags';
export { resolveTemplateKey, templateHref, templatePrintHref, templateKeyOptions } from './domain/key-mapping';
export { TemplateStudio, type StudioProps } from './components/template-studio';
export { PrintTemplate } from './components/print-template';
export { AdminTemplates, type AdminTemplatesProps } from './components/admin-templates';

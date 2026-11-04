// Imported first by the scripts that load the feature servers (check:contract,
// the legacy import). They run on the server, so the server-only marker
// resolves to its empty module, as Next resolves it on its server layer.

import { registerHooks } from 'node:module';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const empty = pathToFileURL(createRequire(import.meta.url).resolve('next/dist/compiled/server-only/empty.js')).href;
registerHooks({
  resolve: (specifier, context, next) => (specifier === 'next/dist/compiled/server-only' ? { url: empty, shortCircuit: true } : next(specifier, context)),
});

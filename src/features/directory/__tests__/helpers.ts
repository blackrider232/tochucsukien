import type { ContactDraft } from '../domain/schemas';

export const parseEmailDraft = (d: ContactDraft | null) => d?.email ?? null;

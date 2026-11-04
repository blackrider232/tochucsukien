// SCE_DEV_MEMORY=1 only (docs/rewrite/dev-runtime.md): the plainly fake sample
// contacts, plus one markup-looking record so the screens show it as text.
// Never runs in production (decision 13).

import type { ContactId } from '@/core/brand';
import type { DevSeed } from '@/core/dev/runtime';
import type { DraftOf } from '@/core/db';
import { SAMPLE_CONTACTS } from '../domain/sample-contacts';
import type { ContactDraft } from '../domain/schemas';
import { searchTextOf } from '../domain/search';
import { contactsTable, type ContactRow } from './tables';

const XSS: ContactDraft = {
  name: '<img src=x onerror=alert(1)> Thử XSS', group: 'DoanhNghiep', title: '<b>đậm</b>', organization: '<script>alert(2)</script> Công ty XSS', phone: '0900.000.099',
  email: null, address: '', taxCode: '', notes: '=HYPERLINK("http://evil","x")', hasBanquet: false,
};

export const devSeed: DevSeed = async (db, { id }) => {
  await db.table(contactsTable).insertMany(
    [...SAMPLE_CONTACTS, XSS].map((draft, i) => ({ ...draft, id: id('MasterContact', `directory-dev|${i}`) as ContactId, legacyId: null, searchText: searchTextOf(draft) }) as unknown as DraftOf<ContactRow>),
  );
};

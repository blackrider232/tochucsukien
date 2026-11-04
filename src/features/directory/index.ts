// Public client-safe entry: the contract's types, the pure functions other
// features call (contact -> guest fields, the import plan), the live
// auto-suggest and picker the guest form mounts, the batch copy dialog, and the
// screen the route renders. The server reads and commands are in "./server".

export type * from './contract';
export { guestFieldsFromContact, contactToGuestDraft, planEventImport, existingContactIds, type EventImportPlan } from './domain/to-guest';
export { rankContacts, buildIndex, searchTextOf } from './domain/search';
export { ContactSuggest, ContactLookup, ContactPickerDialog, useContactSearch } from './components/contact-suggest';
export { BatchImportDialog, EventPickerDialog, type EventChoice } from './components/event-import';
export { DirectoryScreen, type DirectoryScreenProps } from './components/directory-screen';

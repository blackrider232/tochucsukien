// Pure data, safe to import from the proxy.

import { defineFeature } from '@/core/registry';

export const commsManifest = defineFeature({
  key: 'comms',
  worker: 'M4c',
  permissions: {
    'comms.read': { label: 'Xem thư mời và phản hồi', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'comms.send': { label: 'Gửi thư mời', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'comms.rsvp.manage': { label: 'Quản lý Google Form RSVP', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'comms.mailboxes.read': { label: 'Xem hòm thư gửi', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'all', user: 'all' } },
    'comms.mailboxes.admin': { label: 'Quản trị hòm thư gửi', scope: 'global', grants: { admin: 'all', leader: 'none', dept_leader: 'none', user: 'none' } },
  },
  nav: [],
  subTabs: [
    { parentNav: 'guests', id: 'invitations', order: 20, label: 'Gửi thư mời', href: { kind: 'event', segment: 'invitations' }, permission: 'comms.read' },
    { parentNav: 'guests', id: 'rsvp-form', order: 30, label: 'Google Form', href: { kind: 'event', segment: 'invitations/form' }, permission: 'comms.read' },
  ],
  routes: [
    { dir: '(app)/events/[eventId]/invitations', permission: 'comms.read' },
    { dir: 'api/cron/rsvp-sync', permission: 'comms.rsvp.manage' },
  ],
  tables: ['sce_tcsk_sender_mailboxes', 'sce_tcsk_rsvp_forms', 'sce_tcsk_rsvp_responses', 'sce_tcsk_email_deliveries', 'sce_tcsk_email_campaigns'],
  // Partial keys: Google Form fields on events, email results on guests, unitSenderEmails in settings (googleClientId is core's).
  legacyBlobKeys: ['events', 'eventGuests', 'systemSettings'],
});

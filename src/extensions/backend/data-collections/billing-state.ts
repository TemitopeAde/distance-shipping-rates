import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'billing-state';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Billing State',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'snapshot', type: 'OBJECT', displayName: 'Billing snapshot', objectOptions: { fields: [] } },
    { key: 'usageMonth', type: 'TEXT', displayName: 'Usage month' },
    { key: 'usageCount', type: 'NUMBER', displayName: 'Lookups this month' },
    { key: 'lastEventType', type: 'TEXT', displayName: 'Last event' },
    { key: 'lastEventAt', type: 'DATETIME', displayName: 'Last event at' },
    { key: 'refreshedAt', type: 'DATETIME', displayName: 'Refreshed at' },
    { key: 'schemaVersion', type: 'NUMBER', displayName: 'Schema version' },
  ],
  displayField: 'instanceId',
  // App-private data: only reachable through the app's elevated backend code.
  dataPermissions: { itemRead: 'PRIVILEGED', itemInsert: 'PRIVILEGED', itemUpdate: 'PRIVILEGED', itemRemove: 'PRIVILEGED' },
  indexes: [],
  initialData: [],
} satisfies DataCollection;

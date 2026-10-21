import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'merchant-settings';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Merchant Settings',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'settingsVersion', type: 'NUMBER', displayName: 'Settings version' },
    { key: 'payload', type: 'OBJECT', displayName: 'Settings', objectOptions: { fields: [] } },
    { key: 'schemaVersion', type: 'NUMBER', displayName: 'Schema version' },
  ],
  displayField: 'instanceId',
  // App-private data: only reachable through the app's elevated backend code.
  dataPermissions: { itemRead: 'PRIVILEGED', itemInsert: 'PRIVILEGED', itemUpdate: 'PRIVILEGED', itemRemove: 'PRIVILEGED' },
  indexes: [],
  initialData: [],
} satisfies DataCollection;

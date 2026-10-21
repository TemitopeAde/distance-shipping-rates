import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'app-instances';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'App Instances',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'installedAt', type: 'DATETIME', displayName: 'Installed at' },
    { key: 'removedAt', type: 'DATETIME', displayName: 'Removed at' },
    { key: 'lastSeenAt', type: 'DATETIME', displayName: 'Last seen at' },
    { key: 'schemaVersion', type: 'NUMBER', displayName: 'Schema version' },
  ],
  displayField: 'instanceId',
  // App-private data: only reachable through the app's elevated backend code.
  dataPermissions: { itemRead: 'PRIVILEGED', itemInsert: 'PRIVILEGED', itemUpdate: 'PRIVILEGED', itemRemove: 'PRIVILEGED' },
  indexes: [],
  initialData: [],
} satisfies DataCollection;

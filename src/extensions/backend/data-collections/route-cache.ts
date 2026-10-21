import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'route-cache';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Route Cache',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'payload', type: 'OBJECT', displayName: 'Cached distances', objectOptions: { fields: [] } },
    { key: 'expiresAt', type: 'DATETIME', displayName: 'Expires at' },
  ],
  displayField: 'instanceId',
  // App-private data: only reachable through the app's elevated backend code.
  dataPermissions: { itemRead: 'PRIVILEGED', itemInsert: 'PRIVILEGED', itemUpdate: 'PRIVILEGED', itemRemove: 'PRIVILEGED' },
  indexes: [
    { fields: [{ path: 'expiresAt', order: 'ASC' }] },
  ],
  initialData: [],
} satisfies DataCollection;

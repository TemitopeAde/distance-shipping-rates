import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'fulfillment-locations';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Fulfillment Locations',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'name', type: 'TEXT', displayName: 'Name' },
    { key: 'isPrimary', type: 'BOOLEAN', displayName: 'Primary' },
    { key: 'active', type: 'BOOLEAN', displayName: 'Active' },
    { key: 'payload', type: 'OBJECT', displayName: 'Location', objectOptions: { fields: [] } },
    { key: 'schemaVersion', type: 'NUMBER', displayName: 'Schema version' },
  ],
  displayField: 'name',
  // App-private data: only reachable through the app's elevated backend code.
  dataPermissions: { itemRead: 'PRIVILEGED', itemInsert: 'PRIVILEGED', itemUpdate: 'PRIVILEGED', itemRemove: 'PRIVILEGED' },
  indexes: [
    { fields: [{ path: 'instanceId' }] },
  ],
  initialData: [],
} satisfies DataCollection;

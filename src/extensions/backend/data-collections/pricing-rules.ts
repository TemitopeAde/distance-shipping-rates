import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'pricing-rules';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Pricing Rules',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'name', type: 'TEXT', displayName: 'Name' },
    { key: 'code', type: 'TEXT', displayName: 'Option code' },
    { key: 'priority', type: 'NUMBER', displayName: 'Priority' },
    { key: 'active', type: 'BOOLEAN', displayName: 'Active' },
    { key: 'payload', type: 'OBJECT', displayName: 'Rule', objectOptions: { fields: [] } },
    { key: 'schemaVersion', type: 'NUMBER', displayName: 'Schema version' },
  ],
  displayField: 'name',
  // App-private data: only reachable through the app's elevated backend code.
  dataPermissions: { itemRead: 'PRIVILEGED', itemInsert: 'PRIVILEGED', itemUpdate: 'PRIVILEGED', itemRemove: 'PRIVILEGED' },
  indexes: [
    { fields: [{ path: 'instanceId' }, { path: 'priority', order: 'ASC' }] },
  ],
  initialData: [],
} satisfies DataCollection;

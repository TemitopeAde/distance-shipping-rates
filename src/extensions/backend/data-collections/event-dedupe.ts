import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'event-dedupe';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Event Dedupe',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'kind', type: 'TEXT', displayName: 'Kind' },
    { key: 'processedAt', type: 'DATETIME', displayName: 'Processed at' },
  ],
  displayField: 'kind',
  // App-private data: only reachable through the app's elevated backend code.
  dataPermissions: { itemRead: 'PRIVILEGED', itemInsert: 'PRIVILEGED', itemUpdate: 'PRIVILEGED', itemRemove: 'PRIVILEGED' },
  indexes: [
    { fields: [{ path: 'processedAt', order: 'ASC' }] },
  ],
  initialData: [],
} satisfies DataCollection;

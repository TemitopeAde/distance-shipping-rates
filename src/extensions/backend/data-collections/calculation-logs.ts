import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'calculation-logs';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Calculation Logs',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'source', type: 'TEXT', displayName: 'Source' },
    { key: 'status', type: 'TEXT', displayName: 'Status' },
    { key: 'reason', type: 'TEXT', displayName: 'Reason' },
    { key: 'providerError', type: 'TEXT', displayName: 'Provider error' },
    { key: 'cacheHit', type: 'BOOLEAN', displayName: 'Cache hit' },
    { key: 'providerCalls', type: 'NUMBER', displayName: 'Provider calls' },
    { key: 'latencyMs', type: 'NUMBER', displayName: 'Latency (ms)' },
    { key: 'distance', type: 'NUMBER', displayName: 'Distance' },
    { key: 'unit', type: 'TEXT', displayName: 'Unit' },
    { key: 'originLocationId', type: 'TEXT', displayName: 'Origin location' },
    { key: 'optionCodes', type: 'TEXT', displayName: 'Option codes' },
    { key: 'price', type: 'TEXT', displayName: 'Price' },
    { key: 'currency', type: 'TEXT', displayName: 'Currency' },
    { key: 'destCountry', type: 'TEXT', displayName: 'Destination country' },
    { key: 'destPostalPrefix', type: 'TEXT', displayName: 'Destination postal prefix' },
    { key: 'requestRef', type: 'TEXT', displayName: 'Request reference' },
    { key: 'createdAt', type: 'DATETIME', displayName: 'Created at' },
    { key: 'details', type: 'OBJECT', displayName: 'Details', objectOptions: { fields: [] } },
  ],
  displayField: 'status',
  // App-private data: only reachable through the app's elevated backend code.
  dataPermissions: { itemRead: 'PRIVILEGED', itemInsert: 'PRIVILEGED', itemUpdate: 'PRIVILEGED', itemRemove: 'PRIVILEGED' },
  indexes: [
    { fields: [{ path: 'instanceId' }, { path: 'createdAt', order: 'DESC' }] },
    { fields: [{ path: 'status' }, { path: 'createdAt', order: 'DESC' }] },
  ],
  initialData: [],
} satisfies DataCollection;

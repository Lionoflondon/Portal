import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Portal Events Firestore index', () => {
  it('supports active events ordered by their most recent update', async () => {
    const config = JSON.parse(await readFile('firestore.indexes.json', 'utf8'));
    expect(config.indexes).toContainEqual({
      collectionGroup: 'events',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'archived', order: 'ASCENDING' },
        { fieldPath: 'updatedAt', order: 'DESCENDING' },
      ],
    });
    expect(config.indexes).toContainEqual({
      collectionGroup: 'events',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'archived', order: 'ASCENDING' },
        { fieldPath: 'expiresAt', order: 'ASCENDING' },
      ],
    });
  });
});

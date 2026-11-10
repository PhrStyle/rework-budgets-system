import { setTimeout as sleep } from 'node:timers/promises';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { RedisData } from '../redis/redis.js';
import { startTestRedis } from '../testing/redis.js';
import type { TestRedis } from '../testing/redis.js';
import { draftKey } from './draft.js';
import { DraftStore } from './draft.store.js';

let redis: TestRedis;

beforeAll(async () => {
  redis = await startTestRedis();
}, 120_000);

afterAll(() => redis.stop());

it('o rascunho sobrevive a um reinício do Redis no meio da edição (AOF)', async () => {
  const connection = new RedisData(redis.url());
  const store = new DraftStore(connection, 30 * 60 * 1000);
  await store.open(42, { id: 1, name: 'Ana' });
  await store.update(42, 1, (d) => {
    d.header.margemBp = 1500;
    d.changes++;
    return Promise.resolve();
  });
  await connection.onApplicationShutdown();

  // appendfsync everysec: o que foi gravado há mais de 1 s já está no disco. É o limite honesto
  // do redis-data: numa queda brusca, perde-se no máximo o último segundo de edições.
  await sleep(1_500);
  await redis.container.restart();

  const after = new Redis(redis.url());
  try {
    const raw = await after.get(draftKey(42));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '{}')).toMatchObject({
      ownerId: 1,
      changes: 1,
      header: { margemBp: 1500 },
    });
    expect(await after.pttl(draftKey(42))).toBeGreaterThan(29 * 60 * 1000);
  } finally {
    after.disconnect();
  }
}, 120_000);

import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

export interface TestRedis {
  container: StartedTestContainer;
  url: () => string;
  stop: () => Promise<void>;
}

/** Redis descartável com a mesma configuração do `redis-data` do compose: AOF e noeviction. */
export async function startTestRedis(): Promise<TestRedis> {
  const container = await new GenericContainer('redis:8.8.4-alpine')
    .withCommand([
      'redis-server',
      '--maxmemory-policy',
      'noeviction',
      '--appendonly',
      'yes',
      '--appendfsync',
      'everysec',
      '--save',
      '',
    ])
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
  return {
    container,
    // Depois de um restart, a porta no host pode mudar: sempre pergunte de novo.
    url: () => `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    stop: async () => {
      await container.stop();
    },
  };
}

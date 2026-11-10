import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

export interface TestRedis {
  container: StartedTestContainer;
  url: () => string;
  stop: () => Promise<void>;
}

const CONFIG = {
  // Como o `redis-data` do compose: AOF e noeviction (rascunhos não podem sumir).
  data: ['--maxmemory-policy', 'noeviction', '--appendonly', 'yes', '--appendfsync', 'everysec'],
  // Como o `redis-cache`: LRU e nenhuma persistência (só cópias reconstruíveis).
  cache: ['--maxmemory', '64mb', '--maxmemory-policy', 'allkeys-lru', '--appendonly', 'no'],
};

/** Redis descartável com a mesma configuração da instância correspondente do compose. */
export async function startTestRedis(kind: keyof typeof CONFIG = 'data'): Promise<TestRedis> {
  const container = await new GenericContainer('redis:8.8.4-alpine')
    .withCommand(['redis-server', ...CONFIG[kind], '--save', ''])
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

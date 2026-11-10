import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

export interface TestElasticsearch {
  container: StartedTestContainer;
  url: string;
  stop: () => Promise<void>;
}

/** Elasticsearch descartável, nó único e sem segurança, como o do compose. */
export async function startTestElasticsearch(): Promise<TestElasticsearch> {
  const container = await new GenericContainer('elasticsearch:9.5.5')
    .withEnvironment({
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms512m -Xmx512m',
      // Disco quase cheio na máquina de teste não deve deixar o índice só de leitura.
      'cluster.routing.allocation.disk.threshold_enabled': 'false',
    })
    .withExposedPorts(9200)
    .withWaitStrategy(
      Wait.forHttp('/_cluster/health?wait_for_status=yellow', 9200).forStatusCode(200),
    )
    .withStartupTimeout(180_000)
    .start();
  return {
    container,
    url: `http://${container.getHost()}:${container.getMappedPort(9200)}`,
    stop: async () => {
      await container.stop();
    },
  };
}

/**
 * Endereço sem nada escutando: os testes que não são da busca usam a reserva do Postgres
 * (conexão recusada na hora), sem subir um Elasticsearch de 512 MB por arquivo de teste.
 */
export const NO_ELASTICSEARCH = 'http://127.0.0.1:1';

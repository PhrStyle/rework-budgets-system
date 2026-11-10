import { Client, errors } from '@elastic/elasticsearch';

/**
 * Cliente do Elasticsearch para a API e o worker. Sem retentativa e com prazo curto: se a busca
 * estiver fora do ar, a API cai para o Postgres em vez de deixar o usuário esperando.
 */
export function createElastic(url: string, requestTimeoutMs = 2_000): Client {
  return new Client({ node: url, requestTimeout: requestTimeoutMs, maxRetries: 0 });
}

export const isConflict = (error: unknown): boolean =>
  error instanceof errors.ResponseError && error.statusCode === 409;

export const isNotFound = (error: unknown): boolean =>
  error instanceof errors.ResponseError && error.statusCode === 404;

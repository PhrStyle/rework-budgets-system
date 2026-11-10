import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Só aceita o ID do cliente num formato seguro: um valor livre poderia forjar linhas nos logs. */
const SAFE_ID = /^[\w-]{8,64}$/;

/** Reaproveita o ID de quem chamou (proxy, outro serviço) ou gera um. Vai nos logs e na resposta. */
export function requestId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  return typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
}

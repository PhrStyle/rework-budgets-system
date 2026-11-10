import { describe, expect, it } from 'vitest';

import { ApiFailure } from './api/client.js';
import { isReportable } from './observability.js';

const failure = (status: number) =>
  new ApiFailure(status, { statusCode: status, message: 'x', requestId: 'req-12345678' });

describe('o que a tela envia ao Sentry', () => {
  it('5xx da API e falhas de rede, sim', () => {
    expect(isReportable(failure(500))).toBe(true);
    expect(isReportable(failure(503))).toBe(true);
    expect(isReportable(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('4xx (bloqueio, conflito, validação) é a API respondendo: não', () => {
    for (const status of [400, 404, 409, 410, 423])
      expect(isReportable(failure(status))).toBe(false);
  });
});

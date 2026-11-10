import type { ArgumentsHost } from '@nestjs/common';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ErrorReporter } from '../errors/reporter.js';
import { ApiErrorFilter } from './api-error.filter.js';

function run(exception: unknown) {
  const capture = vi.fn();
  const reporter: ErrorReporter = { capture, message: vi.fn(), flush: vi.fn() };
  const send = vi.fn();
  const reply = { status: vi.fn(() => ({ send })) };
  const request = {
    id: 'req-12345678',
    method: 'POST',
    url: '/api/budgets/7/draft/save',
    routeOptions: { url: '/api/budgets/:id/draft/save' },
    headers: { 'x-user-id': '3' },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
  } as unknown as ArgumentsHost;
  new ApiErrorFilter(reporter).catch(exception, host);
  return {
    capture,
    reply,
    body: send.mock.calls[0]?.[0] as { statusCode: number; message: string },
  };
}

describe('erros enviados ao Sentry', () => {
  it('erro inesperado: 500 sem detalhes para o cliente, e o erro vai com o ID da requisição', () => {
    const error = new Error('conexão com o banco caiu');
    const { capture, body } = run(error);

    expect(body.statusCode).toBe(500);
    expect(body.message).not.toContain('banco'); // nada de detalhe interno na tela
    expect(capture).toHaveBeenCalledExactlyOnceWith(error, {
      requestId: 'req-12345678',
      userId: 3,
      tags: { method: 'POST', route: '/api/budgets/:id/draft/save' },
    });
  });

  it('5xx de propósito (serviço indisponível) também vai', () => {
    const { capture, body } = run(new ServiceUnavailableException());

    expect(body.statusCode).toBe(503);
    expect(capture).toHaveBeenCalledOnce();
  });

  it.each([
    ['404', new NotFoundException('Orçamento 9 não existe.')],
    ['409', new ConflictException('grupos mudaram')],
  ])('%s é a API respondendo, não defeito: não vai', (_, exception) => {
    const { capture } = run(exception);

    expect(capture).not.toHaveBeenCalled();
  });
});

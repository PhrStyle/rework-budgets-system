import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ApiError } from '@budgets/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Toda resposta de erro tem o mesmo formato e leva o ID da requisição. Erro inesperado vira 500
 * sem detalhes para o cliente (nada de stack trace na tela) e com tudo no log.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    let body: ApiError;
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && 'message' in response
          ? (response.message as string | string[])
          : exception.message;
      body = { statusCode: exception.getStatus(), message, requestId: request.id };
      if (typeof response === 'object' && 'details' in response) body.details = response.details;
    } else {
      this.logger.error(exception);
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Erro interno. Informe o código da requisição ao suporte.',
        requestId: request.id,
      };
    }
    void reply.status(body.statusCode).send(body);
  }
}

import 'reflect-metadata';

import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, LoggerModule } from 'nestjs-pino';

import { BudgetsController } from './budgets/budgets.controller.js';
import { BudgetsService } from './budgets/budgets.service.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { Database, DATABASE_URL } from './db/database.js';
import { ApiErrorFilter } from './http/api-error.filter.js';
import { REQUEST_ID_HEADER, requestId } from './http/request-id.js';

export interface AppConfig {
  databaseUrl: string;
  /** `silent` nos testes; `info` em produção. */
  logLevel: string;
  /** Logs legíveis no terminal (dev); JSON de uma linha nos demais casos. */
  prettyLogs: boolean;
}

@Module({})
class AppModule {}

function appModule(config: AppConfig): DynamicModule {
  return {
    module: AppModule,
    imports: [
      LoggerModule.forRoot({
        pinoHttp: {
          level: config.logLevel,
          // Uma linha por requisição, com o ID, a rota e o tempo; sem cabeçalhos nem corpo.
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          transport: config.prettyLogs
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        },
      }),
    ],
    controllers: [BudgetsController, CatalogController],
    providers: [{ provide: DATABASE_URL, useValue: config.databaseUrl }, Database, BudgetsService],
  };
}

export async function createApp(config: AppConfig): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ genReqId: requestId });
  // Devolve o ID na resposta: quem vê um erro na tela consegue achar o log dele.
  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  const app = await NestFactory.create<NestFastifyApplication>(appModule(config), adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();
  return app;
}

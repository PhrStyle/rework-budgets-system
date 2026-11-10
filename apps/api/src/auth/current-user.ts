import { createParamDecorator, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Ref } from '@budgets/contracts';
import type { FastifyRequest } from 'fastify';

import { Database } from '../db/database.js';

export const USER_HEADER = 'x-user-id';

type WithUser = FastifyRequest & { user?: Ref };

/**
 * Login simulado, como na legada: o usuário vem num cabeçalho, sem senha. Autenticação de verdade
 * não é o assunto do projeto; o bloqueio e o rascunho só precisam saber quem é quem.
 */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(@Inject(Database) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WithUser>();
    request.user = (await this.resolve(request)) ?? undefined;
    if (!request.user)
      throw new UnauthorizedException(`Informe o usuário no cabeçalho ${USER_HEADER}.`);
    return true;
  }

  /** Usuário do cabeçalho, ou `null` se não veio ou não existe. */
  async resolve(request: FastifyRequest): Promise<Ref | null> {
    const raw = request.headers[USER_HEADER];
    const id = typeof raw === 'string' && /^\d{1,9}$/.test(raw) ? Number(raw) : null;
    if (id === null) return null;
    return this.db.prisma.seller.findUnique({ where: { id }, select: { id: true, name: true } });
  }
}

/** Usuário que passou pelo `UserGuard`. */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): Ref => {
  const user = context.switchToHttp().getRequest<WithUser>().user;
  if (!user) throw new UnauthorizedException(`Informe o usuário no cabeçalho ${USER_HEADER}.`);
  return user;
});

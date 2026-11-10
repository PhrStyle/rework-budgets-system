import { ConflictException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DraftInfo } from '@budgets/contracts';

import { RedisData } from '../redis/redis.js';
import { draftKey, newDraft } from './draft.js';
import type { Draft } from './draft.js';

export const DRAFT_TTL_MS = Symbol('DRAFT_TTL_MS');

/** Tentativas quando outra aba grava o mesmo rascunho no meio de uma edição. */
const MAX_RETRIES = 10;

/**
 * Compare-and-set: grava (e renova o TTL) só se a revisão no Redis ainda é a que foi lida.
 * Atômico no servidor, na conexão compartilhada (WATCH exigiria uma conexão por requisição).
 * Devolve 1 gravou, 0 outra aba gravou antes, −1 o rascunho não existe mais.
 */
const COMPARE_AND_SET = `
local current = redis.call('GET', KEYS[1])
if not current then return -1 end
if cjson.decode(current).rev ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1`;

/**
 * O rascunho **é** o bloqueio: uma chave só, criada com `SET NX` e com TTL. Enquanto ela existir,
 * só o dono edita; quando expira (30 min sem edição), rascunho e bloqueio somem juntos.
 */
@Injectable()
export class DraftStore {
  constructor(
    @Inject(RedisData) private readonly redis: RedisData,
    @Inject(DRAFT_TTL_MS) readonly ttlMs: number,
  ) {}

  async get(budgetId: number): Promise<Draft | null> {
    const raw = await this.redis.client.get(draftKey(budgetId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  }

  async info(draft: Draft, viewerId: number | null): Promise<DraftInfo> {
    const ttl = await this.redis.client.pttl(draftKey(draft.budgetId));
    return {
      ownerId: draft.ownerId,
      ownerName: draft.ownerName,
      expiresAt: new Date(Date.now() + Math.max(ttl, 0)).toISOString(),
      changes: draft.changes,
      mine: draft.ownerId === viewerId,
    };
  }

  /**
   * Abre o rascunho do usuário. Se já existe e é dele (outra aba, ou voltou depois de uma queda),
   * devolve o mesmo. Se é de outra pessoa, 423 com quem está editando.
   */
  async open(budgetId: number, owner: { id: number; name: string }): Promise<Draft> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const created = newDraft(budgetId, owner);
      const ok = await this.redis.client.set(
        draftKey(budgetId),
        JSON.stringify(created),
        'PX',
        this.ttlMs,
        'NX',
      );
      if (ok) return created;

      const existing = await this.get(budgetId);
      if (!existing) continue; // expirou entre o SET e o GET
      await this.assertOwner(existing, owner.id);
      return existing;
    }
    throw new ConflictException('Não foi possível abrir o rascunho; tente de novo.');
  }

  /**
   * Lê, altera e grava o rascunho. Se outra aba gravou no meio, refaz a alteração sobre a versão
   * nova (as operações são reaplicadas, não somadas por cima). Renova o TTL.
   */
  async update<T>(
    budgetId: number,
    userId: number,
    change: (draft: Draft) => Promise<T>,
  ): Promise<{ draft: Draft; result: T }> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const draft = await this.require(budgetId, userId);
      const readRev = draft.rev;
      const result = await change(draft);
      draft.rev = readRev + 1;
      const written = await this.redis.client.eval(
        COMPARE_AND_SET,
        1,
        draftKey(budgetId),
        readRev,
        JSON.stringify(draft),
        this.ttlMs,
      );
      if (written === 1) return { draft, result };
      if (written === -1) throw gone();
    }
    throw new ConflictException('O rascunho está sendo alterado em outra aba; tente de novo.');
  }

  /** Rascunho do usuário, ou erro: 410 se não existe mais, 423 se é de outra pessoa. */
  async require(budgetId: number, userId: number): Promise<Draft> {
    const draft = await this.get(budgetId);
    if (!draft) throw gone();
    await this.assertOwner(draft, userId);
    return draft;
  }

  /** Apaga o rascunho (e com ele o bloqueio). */
  async delete(budgetId: number): Promise<void> {
    await this.redis.client.del(draftKey(budgetId));
  }

  private async assertOwner(draft: Draft, userId: number): Promise<void> {
    if (draft.ownerId === userId) return;
    throw new HttpException(
      {
        message: `${draft.ownerName} está editando este orçamento. Ele fica só para leitura até salvar, descartar ou o rascunho expirar.`,
        details: { lock: await this.info(draft, userId) },
      },
      HttpStatus.LOCKED,
    );
  }
}

function gone(): HttpException {
  return new HttpException(
    'Não há rascunho aberto: ele expirou ou já foi salvo. Abra para edição de novo.',
    HttpStatus.GONE,
  );
}

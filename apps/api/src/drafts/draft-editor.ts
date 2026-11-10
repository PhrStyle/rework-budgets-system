import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { itemDelta } from '@budgets/budget-calc';
import type { DraftOp } from '@budgets/contracts';
import { bp, cents, isValidQuantity, itemTotal, qty } from '@budgets/money';

import { toCents } from '../db/database.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { isUnit } from './draft.js';
import type { Draft, DraftGroup, DraftItem } from './draft.js';

/** Folga entre posições: inserir entre dois vizinhos usa o meio, sem renumerar a lista. */
export const POSITION_GAP = 1024;

/**
 * Aplica operações de edição a um rascunho. Lê do Postgres só o que a operação toca (o item, o
 * grupo, o produto) e recalcula por delta: o subtotal do grupo muda pela diferença do item.
 * Nunca escreve no Postgres.
 */
export class DraftEditor {
  /** Itens criados ou alterados nesta chamada (para devolver à tela com o total novo). */
  readonly touchedItems = new Set<number>();
  readonly removedItems = new Set<number>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly draft: Draft,
  ) {}

  async apply(op: DraftOp): Promise<void> {
    switch (op.op) {
      case 'header': {
        const { description, status, prazoBp, margemBp } = op;
        Object.assign(
          this.draft.header,
          stripUndefined({ description, status, prazoBp, margemBp }),
        );
        break;
      }
      case 'addGroup': {
        const id = this.tempId();
        this.draft.groups[id] = {
          id,
          name: op.name,
          category: op.category,
          position: (await this.lastGroupPosition()) + POSITION_GAP,
          version: 0,
          subtotalCents: 0,
          itemCount: 0,
          baseVersion: null,
          deleted: false,
        };
        break;
      }
      case 'updateGroup': {
        const group = await this.group(op.groupId);
        if (op.name !== undefined) group.name = op.name;
        if (op.category !== undefined) group.category = op.category;
        break;
      }
      case 'removeGroup': {
        const group = await this.group(op.groupId);
        // Os itens vão junto (ON DELETE CASCADE ao salvar): tira do rascunho os que estavam nele.
        this.draft.items = without(
          this.draft.items,
          Object.values(this.draft.items).filter((i) => i.groupId === group.id),
        );
        if (group.baseVersion === null) this.draft.groups = without(this.draft.groups, [group]);
        else Object.assign(group, { deleted: true, subtotalCents: 0, itemCount: 0 });
        break;
      }
      case 'addItem': {
        const group = await this.group(op.groupId);
        const product = await this.prisma.product.findUnique({ where: { id: op.productId } });
        if (!product) throw new NotFoundException(`Produto ${op.productId} não existe.`);
        if (!isUnit(product.unit)) throw new Error(`unidade desconhecida: ${product.unit}`);
        this.assertQuantity(op.quantity, product.unit);

        const id = this.tempId();
        const item: DraftItem = {
          id,
          groupId: group.id,
          productId: product.id,
          // Nome, unidade e preço copiados do catálogo agora: o catálogo muda, o orçamento não.
          name: product.name,
          unit: product.unit,
          priceCents: product.priceCents,
          quantity: op.quantity,
          discountBp: op.discountBp,
          position: await this.positionFor(group.id, op, null),
          totalCents: 0,
          basePosition: null,
          deleted: false,
        };
        item.totalCents = lineTotal(item);
        this.draft.items[id] = item;
        group.subtotalCents += itemDelta(null, calcInput(item));
        group.itemCount++;
        this.touchedItems.add(id);
        break;
      }
      case 'updateItem': {
        const item = await this.item(op.itemId);
        const before = calcInput(item);
        if (op.quantity !== undefined) {
          this.assertQuantity(op.quantity, item.unit);
          item.quantity = op.quantity;
        }
        if (op.discountBp !== undefined) item.discountBp = op.discountBp;
        item.totalCents = lineTotal(item);
        (await this.group(item.groupId)).subtotalCents += itemDelta(before, calcInput(item));
        this.touchedItems.add(item.id);
        break;
      }
      case 'removeItem': {
        const item = await this.item(op.itemId);
        const group = await this.group(item.groupId);
        group.subtotalCents += itemDelta(calcInput(item), null);
        group.itemCount--;
        if (item.basePosition === null) this.draft.items = without(this.draft.items, [item]);
        else item.deleted = true;
        this.touchedItems.delete(item.id);
        this.removedItems.add(item.id);
        break;
      }
      case 'moveItem': {
        const item = await this.item(op.itemId);
        item.position = await this.positionFor(item.groupId, op, item.id);
        this.touchedItems.add(item.id);
        break;
      }
    }
    this.draft.changes++;
  }

  private tempId(): number {
    return this.draft.nextTempId--;
  }

  /** O grupo no rascunho; na primeira vez, copia do banco e guarda a versão de partida. */
  private async group(id: number): Promise<DraftGroup> {
    const inDraft = this.draft.groups[id];
    if (inDraft) {
      if (inDraft.deleted) throw new NotFoundException(`O grupo ${id} foi removido no rascunho.`);
      return inDraft;
    }
    const row = await this.prisma.group.findFirst({
      where: { id, budgetId: this.draft.budgetId },
    });
    if (!row) throw new NotFoundException(`Grupo ${id} não existe neste orçamento.`);
    const group: DraftGroup = {
      id: row.id,
      name: row.name,
      category: row.category,
      position: row.position,
      version: row.version,
      subtotalCents: toCents(row.subtotalCents),
      itemCount: row.itemCount,
      baseVersion: row.version,
      deleted: false,
    };
    this.draft.groups[id] = group;
    return group;
  }

  /** O item no rascunho; na primeira vez, copia do banco. */
  private async item(id: number): Promise<DraftItem> {
    const inDraft = this.draft.items[id];
    if (inDraft) {
      if (inDraft.deleted) throw new NotFoundException(`O item ${id} foi removido no rascunho.`);
      return inDraft;
    }
    const row = await this.prisma.item.findFirst({
      where: { id, group: { budgetId: this.draft.budgetId } },
    });
    // Item de um grupo removido no rascunho também "não existe".
    if (!row || this.draft.groups[row.groupId]?.deleted) {
      throw new NotFoundException(`Item ${id} não existe neste orçamento.`);
    }
    if (!isUnit(row.unit)) throw new Error(`unidade desconhecida: ${row.unit}`);
    const item: DraftItem = {
      id: row.id,
      groupId: row.groupId,
      productId: row.productId,
      name: row.name,
      unit: row.unit,
      priceCents: row.priceCents,
      quantity: row.quantity,
      discountBp: row.discountBp,
      position: row.position,
      totalCents: toCents(row.totalCents),
      basePosition: row.position,
      deleted: false,
    };
    this.draft.items[id] = item;
    return item;
  }

  private assertQuantity(quantity: number, unit: DraftItem['unit']): void {
    if (!isValidQuantity(qty(quantity), unit)) {
      throw new BadRequestException(
        unit === 'un'
          ? 'Quantidade em "un" não aceita fração.'
          : `Quantidade inválida para ${unit}: use até 2 casas decimais.`,
      );
    }
  }

  private async lastGroupPosition(): Promise<number> {
    const row = await this.prisma.group.aggregate({
      where: { budgetId: this.draft.budgetId },
      _max: { position: true },
    });
    const inDraft = Object.values(this.draft.groups).map((g) => g.position);
    return Math.max(row._max.position ?? 0, ...inDraft);
  }

  /**
   * Posição para inserir (ou mover) um item antes ou depois de outro, ou no fim do grupo: o meio
   * entre os vizinhos. Sem folga entre eles, renumbera o grupo no rascunho (raro: 10 inserções
   * seguidas no mesmo ponto).
   */
  private async positionFor(
    groupId: number,
    anchor: { before?: number; after?: number },
    moving: number | null,
  ): Promise<number> {
    if (anchor.before !== undefined && anchor.after !== undefined) {
      throw new UnprocessableEntityException('Use before ou after, não os dois.');
    }
    let order = await this.orderOf(groupId, moving);
    const anchorId = anchor.before ?? anchor.after;
    if (anchorId === undefined) return (order.at(-1)?.position ?? 0) + POSITION_GAP;
    if (anchorId === moving)
      throw new UnprocessableEntityException('Um item não se move em relação a ele mesmo.');

    for (let pass = 0; pass < 2; pass++) {
      const index = order.findIndex((o) => o.id === anchorId);
      if (index === -1) {
        throw new NotFoundException(`Item ${anchorId} não existe neste grupo.`);
      }
      const [low, high] =
        anchor.after !== undefined
          ? [order[index]?.position ?? 0, order[index + 1]?.position ?? null]
          : [order[index - 1]?.position ?? 0, order[index]?.position ?? 0];
      if (high === null) return low + POSITION_GAP;
      if (high - low >= 2) return Math.floor((low + high) / 2);

      await this.renumber(groupId, order);
      order = await this.orderOf(groupId, moving);
    }
    throw new Error('sem posição livre mesmo depois de renumerar');
  }

  /** Ordem atual do grupo (banco + rascunho), sem o item que está sendo movido. */
  private async orderOf(
    groupId: number,
    moving: number | null,
  ): Promise<{ id: number; position: number }[]> {
    const rows =
      groupId > 0
        ? await this.prisma.item.findMany({
            where: { groupId },
            select: { id: true, position: true },
          })
        : [];
    const byId = new Map(rows.map((r) => [r.id, r.position]));
    for (const item of Object.values(this.draft.items)) {
      if (item.groupId !== groupId) continue;
      if (item.deleted) byId.delete(item.id);
      else byId.set(item.id, item.position);
    }
    if (moving !== null) byId.delete(moving);
    return [...byId]
      .map(([id, position]) => ({ id, position }))
      .sort((a, b) => a.position - b.position);
  }

  /** Reespaça as posições do grupo com a folga padrão; todos os itens passam a estar no rascunho. */
  private async renumber(groupId: number, order: { id: number }[]): Promise<void> {
    for (const [i, { id }] of order.entries()) {
      (await this.item(id)).position = (i + 1) * POSITION_GAP;
      this.touchedItems.add(id);
    }
  }
}

function calcInput(item: DraftItem) {
  return {
    id: item.id,
    price: cents(item.priceCents),
    quantity: qty(item.quantity),
    discount: bp(item.discountBp),
  };
}

function lineTotal(item: DraftItem): number {
  return itemTotal(cents(item.priceCents), qty(item.quantity), bp(item.discountBp));
}

/** Cópia do mapa sem as entradas dadas. */
function without<T extends { id: number }>(map: Record<string, T>, remove: T[]): Record<string, T> {
  const ids = new Set(remove.map((r) => String(r.id)));
  return Object.fromEntries(Object.entries(map).filter(([key]) => !ids.has(key)));
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

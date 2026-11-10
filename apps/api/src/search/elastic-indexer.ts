import type { Client } from '@elastic/elasticsearch';

import type { BudgetDocument, SearchIndexer } from '../worker/indexer.js';
import { isConflict, isNotFound } from './elastic.js';
import { BUDGETS } from './indices.js';

/**
 * Indexa no Elasticsearch com **versão externa**: a versão do documento é a hora da última
 * gravação no Postgres. Com o worker processando tarefas em paralelo, uma tarefa antiga que termina
 * depois de uma nova é recusada (409) em vez de sobrescrever o dado novo com o velho.
 */
export class ElasticIndexer implements SearchIndexer {
  constructor(private readonly es: Client) {}

  async upsertBudget(doc: BudgetDocument): Promise<void> {
    try {
      await this.es.index({
        index: BUDGETS,
        id: String(doc.id),
        document: doc,
        version: Date.parse(doc.updatedAt),
        version_type: 'external_gte',
      });
    } catch (error) {
      // O índice já tem uma versão mais nova: esta tarefa chegou atrasada e não tem o que fazer.
      if (!isConflict(error)) throw error;
    }
  }

  async removeBudget(id: number): Promise<void> {
    try {
      await this.es.delete({ index: BUDGETS, id: String(id) });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}

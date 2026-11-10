import type { estypes } from '@elastic/elasticsearch';

/**
 * Índices da busca. A API usa sempre o **alias** (`budgets`, `products`); o índice de verdade tem
 * a data no nome. Reindexar cria um índice novo, carrega e troca o alias numa operação só: a busca
 * nunca fica vazia nem fora do ar durante a troca.
 */
export const BUDGETS = 'budgets';
export const PRODUCTS = 'products';

const settings: estypes.IndicesIndexSettings = {
  number_of_shards: 1,
  number_of_replicas: 0, // nó único (local e na VPS emulada)
  analysis: {
    filter: {
      // "câmera", "cam", "ca": prefixos para o autocomplete, só na hora de indexar.
      prefixes: { type: 'edge_ngram', min_gram: 2, max_gram: 15 },
    },
    analyzer: {
      // Palavras em minúsculas e sem acento: "Câmera" e "camera" viram o mesmo termo.
      pt_folded: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding'] },
      pt_prefix: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'prefixes'],
      },
    },
  },
};

/** Texto pesquisável: por palavra inteira (com tolerância a erro) e por prefixo (autocomplete). */
const searchableText: estypes.MappingProperty = {
  type: 'text',
  analyzer: 'pt_folded',
  fields: {
    // Indexa os prefixos, mas busca pelo texto como digitado: "cam" acha "câmera", não "c".
    prefix: { type: 'text', analyzer: 'pt_prefix', search_analyzer: 'pt_folded' },
  },
};

export const budgetsIndex: estypes.IndicesCreateRequest = {
  index: BUDGETS,
  settings,
  mappings: {
    dynamic: 'strict',
    properties: {
      id: { type: 'integer' },
      description: searchableText,
      clientId: { type: 'integer' },
      clientName: searchableText,
      sellerId: { type: 'integer' },
      sellerName: { type: 'keyword' },
      status: { type: 'keyword' },
      totalCents: { type: 'long' },
      parentId: { type: 'integer' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
};

export const productsIndex: estypes.IndicesCreateRequest = {
  index: PRODUCTS,
  settings,
  mappings: {
    dynamic: 'strict',
    properties: {
      id: { type: 'integer' },
      sku: {
        type: 'keyword',
        fields: { prefix: { type: 'text', analyzer: 'pt_prefix', search_analyzer: 'pt_folded' } },
      },
      name: searchableText,
      category: { type: 'keyword' },
      unit: { type: 'keyword' },
      priceCents: { type: 'long' },
    },
  },
};

import type { Unit } from '@budgets/money';

import type { Rng } from './random.js';

export type Category = 'Rede' | 'Elétrica' | 'TI' | 'Segurança' | 'Construção' | 'Serviços';

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: Category;
  unit: Unit;
  /** Preço por unidade, em centavos. */
  price: number;
}

type Band = 'barato' | 'medio' | 'caro' | 'muito-caro';

/** Faixas de preço em centavos. Inteiros, para o gerador não depender de float. */
const BANDS: Record<Band, readonly [number, number]> = {
  barato: [200, 5_000],
  medio: [5_000, 60_000],
  caro: [60_000, 600_000],
  'muito-caro': [200_000, 2_500_000],
};

/** 50 produtos-base × 11 linhas × 10 séries = 5.500 produtos com nomes únicos. */
const BASES: readonly (readonly [string, Category, Unit, Band])[] = [
  ['Cabo UTP Cat6', 'Rede', 'm', 'barato'],
  ['Patch cord', 'Rede', 'un', 'barato'],
  ['Switch gerenciável', 'Rede', 'un', 'caro'],
  ['Roteador', 'Rede', 'un', 'medio'],
  ['Access point', 'Rede', 'un', 'medio'],
  ['Conector RJ45', 'Rede', 'un', 'barato'],
  ['Patch panel', 'Rede', 'un', 'medio'],
  ['Rack de parede', 'Rede', 'un', 'caro'],
  ['Fibra óptica', 'Rede', 'm', 'barato'],
  ['Organizador de cabos', 'Rede', 'un', 'barato'],
  ['Disjuntor', 'Elétrica', 'un', 'barato'],
  ['Cabo flexível', 'Elétrica', 'm', 'barato'],
  ['Eletroduto', 'Elétrica', 'm', 'barato'],
  ['Tomada', 'Elétrica', 'un', 'barato'],
  ['Interruptor', 'Elétrica', 'un', 'barato'],
  ['Quadro de distribuição', 'Elétrica', 'un', 'caro'],
  ['Luminária LED', 'Elétrica', 'un', 'medio'],
  ['Fita isolante', 'Elétrica', 'un', 'barato'],
  ['Canaleta', 'Elétrica', 'm', 'barato'],
  ['Contator', 'Elétrica', 'un', 'medio'],
  ['Notebook', 'TI', 'un', 'muito-caro'],
  ['Monitor', 'TI', 'un', 'caro'],
  ['Teclado', 'TI', 'un', 'medio'],
  ['Mouse', 'TI', 'un', 'barato'],
  ['SSD', 'TI', 'un', 'medio'],
  ['Memória RAM', 'TI', 'un', 'medio'],
  ['Nobreak', 'TI', 'un', 'caro'],
  ['Servidor', 'TI', 'un', 'muito-caro'],
  ['Impressora', 'TI', 'un', 'caro'],
  ['Licença de software', 'TI', 'un', 'caro'],
  ['Câmera IP', 'Segurança', 'un', 'caro'],
  ['Gravador NVR', 'Segurança', 'un', 'caro'],
  ['Sensor de presença', 'Segurança', 'un', 'medio'],
  ['Fechadura eletrônica', 'Segurança', 'un', 'caro'],
  ['Central de alarme', 'Segurança', 'un', 'caro'],
  ['Cimento', 'Construção', 'kg', 'barato'],
  ['Argamassa', 'Construção', 'kg', 'barato'],
  ['Tinta acrílica', 'Construção', 'l', 'barato'],
  ['Massa corrida', 'Construção', 'kg', 'barato'],
  ['Gesso', 'Construção', 'kg', 'barato'],
  ['Selador', 'Construção', 'l', 'barato'],
  ['Impermeabilizante', 'Construção', 'l', 'medio'],
  ['Areia', 'Construção', 'kg', 'barato'],
  ['Mão de obra elétrica', 'Serviços', 'un', 'medio'],
  ['Instalação de rede', 'Serviços', 'un', 'medio'],
  ['Configuração de equipamentos', 'Serviços', 'un', 'medio'],
  ['Visita técnica', 'Serviços', 'un', 'medio'],
  ['Projeto executivo', 'Serviços', 'un', 'caro'],
  ['Certificação de cabeamento', 'Serviços', 'un', 'caro'],
  ['Treinamento', 'Serviços', 'un', 'medio'],
];

const LINES = [
  'Básico',
  'Pro',
  'Plus',
  'Industrial',
  'Compacto',
  'Premium',
  'Eco',
  'Max',
  'Slim',
  'Reforçado',
  'Mini',
];
const SERIES = ['S100', 'S200', 'S300', 'S400', 'S500', 'S600', 'S700', 'S800', 'S900', 'S1000'];

export const MAX_PRODUCTS = BASES.length * LINES.length * SERIES.length;

export function generateCatalog(rng: Rng, count: number): Product[] {
  if (count > MAX_PRODUCTS) {
    throw new RangeError(`o catálogo comporta até ${MAX_PRODUCTS} produtos, pedido: ${count}`);
  }
  const combos: (readonly [number, number, number])[] = [];
  BASES.forEach((_, b) => {
    LINES.forEach((_l, l) => {
      SERIES.forEach((_s, s) => combos.push([b, l, s]));
    });
  });

  // Embaralha para que um catálogo menor (perfil de teste) ainda tenha todas as categorias.
  return rng
    .shuffle(combos)
    .slice(0, count)
    .map(([b, l, s], index) => {
      const base = BASES[b];
      if (base === undefined) throw new RangeError('produto-base inexistente');
      const [name, category, unit, band] = base;
      const [min, max] = BANDS[band];
      return {
        id: index + 1,
        sku: `SKU-${String(10_000 + index)}`,
        name: `${name} ${LINES[l] ?? ''} ${SERIES[s] ?? ''}`,
        category,
        unit,
        price: rng.int(min, max),
      };
    });
}

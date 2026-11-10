import type { Rng } from './random.js';

export interface Client {
  id: number;
  name: string;
}

export interface Seller {
  id: number;
  name: string;
}

/** Nomes fictícios, gerados por combinação; nenhum documento (CPF/CNPJ) é gerado. */
const KINDS = [
  'Construtora',
  'Hospital',
  'Escola',
  'Clínica',
  'Supermercado',
  'Indústria',
  'Transportadora',
  'Hotel',
  'Condomínio',
  'Escritório',
  'Farmácia',
  'Academia',
  'Restaurante',
  'Cooperativa',
  'Laboratório',
];
const NAMES = [
  'Horizonte',
  'Aurora',
  'São Lucas',
  'Vale Verde',
  'Boa Vista',
  'Nova Era',
  'Atlântico',
  'Santa Clara',
  'Pinheiros',
  'Bela Vista',
  'Primavera',
  'Monte Alto',
  'Rio Claro',
  'Serra Azul',
  'Bom Jesus',
  'Três Rios',
  'Porto Novo',
  'Campo Belo',
  'Lagoa Santa',
  'Sol Nascente',
  'Vila Rica',
  'Alto da Serra',
  'Ipê Amarelo',
  'Jardim Europa',
  'Recanto',
  'Mar Azul',
  'Estrela',
  'Pioneira',
  'Central',
  'Progresso',
  'Itaúna',
  'Cerrado',
  'Pantanal',
  'Litoral',
  'Planalto',
  'Mirante',
  'Canaã',
  'Esperança',
  'União',
  'Bandeirantes',
];
const SUFFIXES = ['Ltda', 'S.A.', 'ME', 'EPP'];

const SELLERS = [
  'Marina Costa',
  'Rafael Lima',
  'Camila Souza',
  'Bruno Alves',
  'Juliana Rocha',
  'Diego Martins',
  'Fernanda Dias',
  'Lucas Pereira',
  'Patrícia Gomes',
  'Thiago Ribeiro',
  'Aline Barbosa',
  'Gustavo Freitas',
];

export const MAX_CLIENTS = KINDS.length * NAMES.length * SUFFIXES.length;

export function generateClients(rng: Rng, count: number): Client[] {
  if (count > MAX_CLIENTS) {
    throw new RangeError(`até ${MAX_CLIENTS} clientes, pedido: ${count}`);
  }
  const all: string[] = [];
  for (const kind of KINDS) {
    for (const name of NAMES) {
      for (const suffix of SUFFIXES) all.push(`${kind} ${name} ${suffix}`);
    }
  }
  return rng
    .shuffle(all)
    .slice(0, count)
    .map((name, index) => ({ id: index + 1, name }));
}

export function generateSellers(count: number): Seller[] {
  if (count > SELLERS.length) {
    throw new RangeError(`até ${SELLERS.length} vendedores, pedido: ${count}`);
  }
  return SELLERS.slice(0, count).map((name, index) => ({ id: index + 1, name }));
}

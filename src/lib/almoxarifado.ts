// Almoxarifado utilities — item detection and attribute parsing

export interface ParsedItemAttributes {
  tipo_produto: string;
  modelo_fivela: string;
  largura_mm: number | null;
  requer_separacao_almoxarifado: boolean;
}

const MODELOS_FIVELA = [
  'MATRIZ REDONDA',
  'MATRIZ QUADRADA',
  'MATRIZ OVAL',
  'ALINE',
  'ALICE',
  'CAROL',
  'JULIA',
  'DIANA',
  'LARA',
  'LUNA',
  'IRIS',
  'ROSA',
  'CLARA',
  'FLOR',
];

/**
 * Determines if a product item requires warehouse (almoxarifado) separation.
 * Matches:
 * - Items with FIVELA, PASSANTE, AVIAMENTO in description/category
 * - CINTO SINTETICO / CINTO SINTÉTICO
 * - CINTO TECIDO
 * - TIRA SINTETICO / TIRA SINTÉTICO / TIRA TECIDO
 * - FIVELA COBERTA
 */
export function requerSeparacaoAlmoxarifado(descricao: string, categoria?: string | null): boolean {
  const desc = (descricao || '').toUpperCase();
  const cat = (categoria || '').toUpperCase();

  // Direct match keywords
  if (desc.includes('FIVELA') || desc.includes('PASSANTE') || cat.includes('FIVELA') || cat.includes('AVIAMENTO')) {
    return true;
  }

  // Product patterns that require buckle separation
  if (
    desc.includes('CINTO SINTETICO') || desc.includes('CINTO SINTÉTICO') ||
    desc.includes('CINTO TECIDO') ||
    desc.includes('TIRA SINTETICO') || desc.includes('TIRA SINTÉTICO') ||
    desc.includes('TIRA TECIDO') ||
    desc.includes('FIVELA COBERTA')
  ) {
    return true;
  }

  return false;
}

/**
 * Parses a product description to extract structured attributes:
 * - tipo_produto: SINTETICO, TECIDO, FIVELA_COBERTA, AVIAMENTO, OUTROS
 * - modelo_fivela: e.g. ALINE, MATRIZ REDONDA
 * - largura_mm: e.g. 15, 30
 */
export function parseItemAttributes(descricao: string, categoria?: string | null): ParsedItemAttributes {
  const desc = (descricao || '').toUpperCase();
  const cat = (categoria || '').toUpperCase();

  const requer = requerSeparacaoAlmoxarifado(descricao, categoria);

  // Determine tipo_produto
  let tipo_produto = 'OUTROS';
  if (desc.includes('FIVELA COBERTA') || cat === 'FIVELA COBERTA' || cat === 'FIVELA_COBERTA') {
    tipo_produto = 'FIVELA_COBERTA';
  } else if (desc.includes('CINTO SINTETICO') || desc.includes('CINTO SINTÉTICO') || desc.includes('TIRA SINTETICO') || desc.includes('TIRA SINTÉTICO')) {
    tipo_produto = 'SINTETICO';
  } else if (desc.includes('CINTO TECIDO') || desc.includes('TIRA TECIDO')) {
    tipo_produto = 'TECIDO';
  } else if (desc.includes('FIVELA') || desc.includes('PASSANTE') || cat.includes('AVIAMENTO')) {
    tipo_produto = 'AVIAMENTO';
  }

  // Extract largura_mm
  let largura_mm: number | null = null;
  const larguraMatch = desc.match(/(\d+)\s*MM/);
  if (larguraMatch) {
    largura_mm = parseInt(larguraMatch[1], 10);
  }
  // Also try "LAT 15MM" or "LAT 15 MM" pattern
  if (!largura_mm) {
    const latMatch = desc.match(/LAT\s*(\d+)/);
    if (latMatch) largura_mm = parseInt(latMatch[1], 10);
  }

  // Extract modelo_fivela
  let modelo_fivela = '';
  // Try multi-word models first (MATRIZ REDONDA, etc)
  for (const modelo of MODELOS_FIVELA) {
    if (desc.includes(modelo)) {
      modelo_fivela = modelo;
      break;
    }
  }

  return {
    tipo_produto,
    modelo_fivela,
    largura_mm,
    requer_separacao_almoxarifado: requer,
  };
}

export const TIPO_PRODUTO_ALMOX_LABELS: Record<string, string> = {
  SINTETICO: 'Sintético',
  TECIDO: 'Tecido',
  FIVELA_COBERTA: 'Fivela Coberta',
  AVIAMENTO: 'Aviamento',
  OUTROS: 'Outros',
};

export const TIPO_PRODUTO_ALMOX_COLORS: Record<string, string> = {
  SINTETICO: 'bg-purple-500/15 text-purple-700 border-purple-300',
  TECIDO: 'bg-orange-500/15 text-orange-700 border-orange-300',
  FIVELA_COBERTA: 'bg-blue-500/15 text-blue-700 border-blue-300',
  AVIAMENTO: 'bg-amber-500/15 text-amber-700 border-amber-300',
  OUTROS: 'bg-muted text-muted-foreground border-border',
};

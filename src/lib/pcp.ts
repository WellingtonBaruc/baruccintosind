// PCP utilities — product classification and cut grouping

export interface CutGroup {
  largura: string;
  material: string;
  tamanho: string;
  cor: string;
  itens: CutGroupItem[];
  quantidadeTotal: number;
}

export interface CutGroupItem {
  id: string;
  descricao: string;
  referencia: string | null;
  observacao_producao: string | null;
  quantidade: number;
  numero_venda?: string | null;
  data_venda?: string | null;
  lead_time_dias?: number | null;
  tipo_produto?: string | null;
}

// Extract attributes from product name for cut grouping
export function extrairAtributosProduto(nome: string) {
  const upper = (nome || '').toUpperCase();

  // Largura — match patterns like 15MM, 20MM
  const larguraMatch = upper.match(/(\d+)\s*MM/);
  const largura = larguraMatch ? `${larguraMatch[1]}MM` : 'N/D';

  // Material
  let material = 'OUTROS';
  if (upper.includes('MEGA')) material = 'MEGA';
  else if (upper.includes('PERUGIA')) material = 'PERUGIA';
  else if (upper.includes('DUBLADO')) material = 'DUBLADO';
  else if (upper.includes('TECIDO')) material = 'TERTELO';

  // Tamanho
  let tamanho = 'PADRÃO';
  if (upper.includes('SLIM')) tamanho = 'SLIM';
  else if (upper.includes('PLUS')) tamanho = 'PLUS';

  // Cor — last word
  const words = upper.trim().split(/\s+/);
  const cor = words.length > 0 ? words[words.length - 1] : 'N/D';

  return { largura, material, tamanho, cor };
}

// Group items for cut planning
export function agruparParaCorte(itens: CutGroupItem[]): CutGroup[] {
  const groupMap = new Map<string, CutGroup>();

  for (const item of itens) {
    const attrs = extrairAtributosProduto(item.descricao);
    const key = `${attrs.largura}|${attrs.material}|${attrs.tamanho}|${attrs.cor}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        ...attrs,
        itens: [],
        quantidadeTotal: 0,
      });
    }

    const group = groupMap.get(key)!;
    group.itens.push(item);
    group.quantidadeTotal += item.quantidade;
  }

  return Array.from(groupMap.values()).sort((a, b) => a.largura.localeCompare(b.largura));
}

// Classify product type
export function classificarProduto(nomeProduto: string): string {
  const upper = (nomeProduto || '').toUpperCase();
  if (upper.includes('FIVELA COBERTA')) return 'FIVELA_COBERTA';
  if (upper.includes('CINTO SINTETICO') || upper.includes('TIRA SINTETICO') || upper.includes('CINTO SINTÉTICO') || upper.includes('TIRA SINTÉTICO')) return 'SINTETICO';
  if (upper.includes('CINTO TECIDO') || upper.includes('TIRA TECIDO')) return 'TECIDO';
  return 'OUTROS';
}

export const TIPO_PRODUTO_LABELS: Record<string, string> = {
  SINTETICO: 'Sintético',
  TECIDO: 'Tecido',
  FIVELA_COBERTA: 'Fivela Coberta',
  OUTROS: 'Outros',
};

export const TIPO_PRODUTO_BADGE: Record<string, string> = {
  SINTETICO: 'bg-purple-500/15 text-purple-700 border-purple-200',
  TECIDO: 'bg-orange-500/15 text-orange-700 border-orange-200',
  FIVELA_COBERTA: 'bg-blue-500/15 text-blue-700 border-blue-200',
  OUTROS: 'bg-muted text-muted-foreground border-border',
};

export const STATUS_PRAZO_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  NO_PRAZO: { label: 'No prazo', color: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]', icon: '🟢' },
  ATENCAO: { label: 'Atenção', color: 'bg-warning/15 text-warning', icon: '🟡' },
  ATRASADO: { label: 'Atrasado', color: 'bg-destructive/15 text-destructive', icon: '🔴' },
};

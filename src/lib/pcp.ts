// PCP utilities — product classification and cut grouping

import { parseISO, differenceInCalendarDays, addDays, format } from 'date-fns';

export interface CutGroup {
  largura: string;
  material: string;
  tamanho: string;
  cor: string;
  itens: CutGroupItem[];
  quantidadeTotal: number;
  faixa_data?: string;
  data_mais_antiga?: string;
  is_manual?: boolean;
  manual_id?: string;
  manual_descricao?: string;
  manual_data_inicio?: string;
  manual_data_fim?: string;
  manual_observacao?: string;
}

export interface ObsCorte {
  id: string;
  observacao: string;
  criado_em: string;
  lido: boolean;
  lido_em: string | null;
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
  obs_corte?: ObsCorte[];
}

// Extract attributes from product name for cut grouping
export function extrairAtributosProduto(nome: string) {
  const upper = (nome || '').toUpperCase();

  const larguraMatch = upper.match(/(\d+)\s*MM/);
  const largura = larguraMatch ? `${larguraMatch[1]}MM` : 'N/D';

  let material = 'OUTROS';
  if (upper.includes('MEGA')) material = 'MEGA';
  else if (upper.includes('PERUGIA')) material = 'PERUGIA';
  else if (upper.includes('DUBLADO')) material = 'DUBLADO';
  else if (upper.includes('TECIDO')) material = 'TERTELO';

  let tamanho = 'PADRÃO';
  if (upper.includes('SLIM')) tamanho = 'SLIM';
  else if (upper.includes('PLUS')) tamanho = 'PLUS';

  const words = upper.trim().split(/\s+/);
  const cor = words.length > 0 ? words[words.length - 1] : 'N/D';

  return { largura, material, tamanho, cor };
}

/**
 * Calculate date window key for grouping.
 * janelaDias=0 means exact date, janelaDias>0 groups into blocks of N days.
 */
function calcularFaixaData(dataVenda: string | null, janelaDias: number, dataBase: Date): { faixaKey: string; faixaLabel: string } {
  if (!dataVenda) {
    return { faixaKey: 'SEM_DATA', faixaLabel: 'SEM DATA' };
  }

  const dv = parseISO(dataVenda);

  if (janelaDias === 0) {
    const key = format(dv, 'yyyy-MM-dd');
    const label = format(dv, 'dd/MM');
    return { faixaKey: key, faixaLabel: label };
  }

  const diff = differenceInCalendarDays(dv, dataBase);
  const bloco = Math.floor(diff / janelaDias);
  const inicio = addDays(dataBase, bloco * janelaDias);
  const fim = addDays(inicio, janelaDias - 1);
  const key = format(inicio, 'yyyy-MM-dd');
  const label = `${format(inicio, 'dd/MM')}–${format(fim, 'dd/MM')}`;
  return { faixaKey: key, faixaLabel: label };
}

/**
 * Group items for cut planning.
 * janelaDias: undefined/null = standard grouping (no date), number = date window grouping
 */
export function agruparParaCorte(itens: CutGroupItem[], janelaDias?: number | null): CutGroup[] {
  const useDateGrouping = janelaDias != null;
  const groupMap = new Map<string, CutGroup>();

  // Find the earliest date as base for window calculations
  let dataBase: Date | null = null;
  if (useDateGrouping) {
    for (const item of itens) {
      if (item.data_venda) {
        const d = parseISO(item.data_venda);
        if (!dataBase || d < dataBase) dataBase = d;
      }
    }
    if (!dataBase) dataBase = new Date();
  }

  for (const item of itens) {
    const attrs = extrairAtributosProduto(item.descricao);

    let faixaKey = '';
    let faixaLabel: string | undefined;

    if (useDateGrouping) {
      const faixa = calcularFaixaData(item.data_venda, janelaDias!, dataBase!);
      faixaKey = faixa.faixaKey;
      faixaLabel = faixa.faixaLabel;
    }

    const key = useDateGrouping
      ? `${attrs.largura}|${attrs.material}|${attrs.tamanho}|${attrs.cor}|${faixaKey}`
      : `${attrs.largura}|${attrs.material}|${attrs.tamanho}|${attrs.cor}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        ...attrs,
        itens: [],
        quantidadeTotal: 0,
        faixa_data: faixaLabel,
        data_mais_antiga: item.data_venda || undefined,
      });
    }

    const group = groupMap.get(key)!;
    group.itens.push(item);
    group.quantidadeTotal += item.quantidade;

    // Track oldest date in the group
    if (item.data_venda) {
      if (!group.data_mais_antiga || item.data_venda < group.data_mais_antiga) {
        group.data_mais_antiga = item.data_venda;
      }
    }
  }

  const groups = Array.from(groupMap.values());

  if (useDateGrouping) {
    // Sort: groups with dates first (oldest first), then SEM DATA at the end
    return groups.sort((a, b) => {
      const aNoDate = a.faixa_data === 'SEM DATA';
      const bNoDate = b.faixa_data === 'SEM DATA';
      if (aNoDate && !bNoDate) return 1;
      if (!aNoDate && bNoDate) return -1;
      if (aNoDate && bNoDate) return a.largura.localeCompare(b.largura);
      // Both have dates — sort by oldest date ASC
      const aDate = a.data_mais_antiga || '';
      const bDate = b.data_mais_antiga || '';
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.largura.localeCompare(b.largura);
    });
  }

  return groups.sort((a, b) => a.largura.localeCompare(b.largura));
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

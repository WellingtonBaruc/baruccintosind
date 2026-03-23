import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, Package } from 'lucide-react';
import {
  parseItemAttributes,
  TIPO_PRODUTO_ALMOX_LABELS,
  type ParsedItemAttributes,
} from '@/lib/almoxarifado';
import { differenceInCalendarDays, format } from 'date-fns';

interface AlmoxItem {
  id: string;
  descricao_produto: string;
  referencia_produto: string | null;
  quantidade: number;
  observacao_producao: string | null;
  origem: 'fivela' | 'solicitacao';
  solicitacao_id?: string;
  parsed: ParsedItemAttributes;
}

interface AlmoxVenda {
  pedido_id: string;
  api_venda_id: string;
  cliente_nome: string;
  data_previsao_entrega: string | null;
  status_prazo: string | null;
  fivelas_separadas: boolean;
  origem: 'fivela' | 'solicitacao' | 'ambos';
  itens: AlmoxItem[];
}

interface Props {
  vendas: AlmoxVenda[];
  onConfirmar: (venda: AlmoxVenda) => void;
}

function calcDiasAtraso(dataEntrega: string | null): number {
  if (!dataEntrega) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const entrega = new Date(dataEntrega + 'T00:00:00');
  return differenceInCalendarDays(hoje, entrega);
}

function formatTempoDisplay(dias: number): string {
  if (dias > 0) return `+${dias}d`;
  if (dias === 0) return 'HOJE';
  return `${dias}d`;
}

type Urgencia = 'atrasado' | 'atencao' | 'ok';

function getUrgencia(dias: number): Urgencia {
  if (dias > 0) return 'atrasado';
  if (dias >= -3) return 'atencao';
  return 'ok';
}

const urgenciaStyles: Record<Urgencia, { row: string; tempo: string; bar: string }> = {
  atrasado: {
    row: 'bg-destructive/[0.08]',
    tempo: 'text-destructive font-black',
    bar: 'bg-destructive',
  },
  atencao: {
    row: 'bg-[hsl(var(--warning))]/[0.08]',
    tempo: 'text-[hsl(var(--warning))] font-black',
    bar: 'bg-[hsl(var(--warning))]',
  },
  ok: {
    row: 'bg-[hsl(var(--success))]/[0.04]',
    tempo: 'text-[hsl(var(--success))] font-bold',
    bar: 'bg-[hsl(var(--success))]',
  },
};

export default function AlmoxProducaoMode({ vendas, onConfirmar }: Props) {
  const [now, setNow] = useState(Date.now());

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const pendentes = useMemo(() => vendas.filter(v => !v.fivelas_separadas), [vendas]);

  const sorted = useMemo(() => {
    return [...pendentes].sort((a, b) => {
      const aA = calcDiasAtraso(a.data_previsao_entrega);
      const aB = calcDiasAtraso(b.data_previsao_entrega);
      if (aA !== aB) return aB - aA; // maior atraso primeiro
      const dA = a.data_previsao_entrega || '9999-12-31';
      const dB = b.data_previsao_entrega || '9999-12-31';
      return dA.localeCompare(dB);
    });
  }, [pendentes, now]);

  // Gargalo: tipo com mais itens atrasados/pendentes
  const gargalo = useMemo(() => {
    const contagem: Record<string, { total: number; atrasados: number }> = {};
    for (const v of pendentes) {
      const dias = calcDiasAtraso(v.data_previsao_entrega);
      for (const item of v.itens) {
        const p = item.parsed || parseItemAttributes(item.descricao_produto);
        const tipo = TIPO_PRODUTO_ALMOX_LABELS[p.tipo_produto] || p.tipo_produto;
        if (!contagem[tipo]) contagem[tipo] = { total: 0, atrasados: 0 };
        contagem[tipo].total++;
        if (dias > 0) contagem[tipo].atrasados++;
      }
    }
    let best = '';
    let bestScore = -1;
    for (const [tipo, c] of Object.entries(contagem)) {
      const score = c.atrasados * 1000 + c.total;
      if (score > bestScore) { bestScore = score; best = tipo; }
    }
    return best ? { tipo: best, ...contagem[best] } : null;
  }, [pendentes]);

  const totalUnidades = useMemo(
    () => pendentes.reduce((s, v) => s + v.itens.reduce((si, i) => si + i.quantidade, 0), 0),
    [pendentes]
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <CheckCircle2 className="h-16 w-16 mb-4 text-[hsl(var(--success))]" />
        <p className="text-xl font-bold">FILA LIMPA</p>
        <p className="text-sm">Nenhum pedido pendente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between bg-foreground/[0.03] border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold uppercase tracking-wide text-foreground">
            {sorted.length} pedidos
          </span>
          <span className="text-xs text-muted-foreground">
            {totalUnidades} un
          </span>
        </div>
        {gargalo && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-xs font-bold text-destructive uppercase">
              Gargalo: {gargalo.tipo} ({gargalo.atrasados > 0 ? `${gargalo.atrasados} atrasados / ` : ''}{gargalo.total} itens)
            </span>
          </div>
        )}
      </div>

      {/* ── Table header ── */}
      <div className="grid grid-cols-[80px_1fr_140px_120px_100px_80px_120px_130px] gap-0 border-b border-border bg-muted/50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Tempo</span>
        <span>Pedido / Cliente</span>
        <span>Tipo</span>
        <span>Modelo</span>
        <span>Largura</span>
        <span>Qtd</span>
        <span>Entrega</span>
        <span></span>
      </div>

      {/* ── Rows ── */}
      <div className="divide-y divide-border">
        {sorted.map((v, idx) => {
          const dias = calcDiasAtraso(v.data_previsao_entrega);
          const urgencia = getUrgencia(dias);
          const styles = urgenciaStyles[urgencia];
          const totalQty = v.itens.reduce((s, i) => s + i.quantidade, 0);

          // Aggregate attributes
          const tipos = new Set<string>();
          const modelos = new Set<string>();
          const larguras = new Set<string>();
          for (const item of v.itens) {
            const p = item.parsed || parseItemAttributes(item.descricao_produto);
            tipos.add(TIPO_PRODUTO_ALMOX_LABELS[p.tipo_produto] || p.tipo_produto);
            if (p.modelo_fivela) modelos.add(p.modelo_fivela);
            if (p.largura_mm) larguras.add(`${p.largura_mm}mm`);
          }

          return (
            <div
              key={v.pedido_id}
              className={`grid grid-cols-[80px_1fr_140px_120px_100px_80px_120px_130px] gap-0 items-center px-4 py-3 ${styles.row} transition-colors relative`}
            >
              {/* Barra lateral de urgência */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${styles.bar}`} />

              {/* Tempo */}
              <div className={`text-xl tabular-nums leading-none ${styles.tempo}`}>
                {formatTempoDisplay(dias)}
              </div>

              {/* Pedido / Cliente */}
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{v.api_venda_id}</span>
                  {v.origem !== 'fivela' && (
                    <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-purple-500/15 text-purple-600">
                      Loja
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{v.cliente_nome}</p>
              </div>

              {/* Tipo */}
              <div className="text-xs font-medium">
                {[...tipos].join(', ')}
              </div>

              {/* Modelo */}
              <div className="text-xs text-muted-foreground">
                {[...modelos].join(', ') || '—'}
              </div>

              {/* Largura */}
              <div className="text-xs text-muted-foreground">
                {[...larguras].join(', ') || '—'}
              </div>

              {/* Qtd */}
              <div className="text-sm font-bold tabular-nums">
                {totalQty}
              </div>

              {/* Entrega */}
              <div className="text-xs text-muted-foreground tabular-nums">
                {v.data_previsao_entrega
                  ? format(new Date(v.data_previsao_entrega + 'T00:00:00'), 'dd/MM/yy')
                  : '—'}
              </div>

              {/* Ação */}
              <div>
                <Button
                  size="sm"
                  className="w-full h-9 text-xs font-bold"
                  onClick={() => onConfirmar(v)}
                >
                  <Package className="h-3.5 w-3.5 mr-1" />
                  SEPARAR
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

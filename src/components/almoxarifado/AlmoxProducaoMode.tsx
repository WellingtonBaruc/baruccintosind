import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, AlertTriangle, Package, Ruler, Tag } from 'lucide-react';
import {
  parseItemAttributes,
  TIPO_PRODUTO_ALMOX_LABELS,
  type ParsedItemAttributes,
} from '@/lib/almoxarifado';
import { differenceInCalendarDays, differenceInMinutes } from 'date-fns';

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

function calcAtraso(dataEntrega: string | null): number {
  if (!dataEntrega) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const entrega = new Date(dataEntrega + 'T00:00:00');
  return differenceInCalendarDays(hoje, entrega);
}

function tempoEmFila(): string {
  // We don't have exact entry timestamp, show relative time via a live counter
  return '';
}

function getPrioridade(v: AlmoxVenda): { cor: string; label: string; bgClass: string; borderClass: string; order: number } {
  const atraso = calcAtraso(v.data_previsao_entrega);
  if (atraso > 0) return {
    cor: 'destructive',
    label: `${atraso}d atrasado`,
    bgClass: 'bg-destructive/10 border-l-destructive',
    borderClass: 'border-l-4',
    order: 0,
  };
  if (v.status_prazo === 'ATENCAO' || (atraso >= -2 && atraso <= 0)) return {
    cor: 'warning',
    label: atraso === 0 ? 'Vence hoje' : `${Math.abs(atraso)}d restantes`,
    bgClass: 'bg-[hsl(var(--warning))]/10 border-l-[hsl(var(--warning))]',
    borderClass: 'border-l-4',
    order: 1,
  };
  return {
    cor: 'success',
    label: v.data_previsao_entrega ? `${Math.abs(atraso)}d restantes` : 'Sem prazo',
    bgClass: 'bg-[hsl(var(--success))]/5 border-l-[hsl(var(--success))]',
    borderClass: 'border-l-4',
    order: 2,
  };
}

export default function AlmoxProducaoMode({ vendas, onConfirmar }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const pendentes = useMemo(() => vendas.filter(v => !v.fivelas_separadas), [vendas]);

  const sorted = useMemo(() => {
    return [...pendentes].sort((a, b) => {
      const atrasoA = calcAtraso(a.data_previsao_entrega);
      const atrasoB = calcAtraso(b.data_previsao_entrega);
      // 1. Maior atraso primeiro
      if (atrasoA !== atrasoB) return atrasoB - atrasoA;
      // 2. Entrega mais próxima
      const dA = a.data_previsao_entrega || '9999-12-31';
      const dB = b.data_previsao_entrega || '9999-12-31';
      return dA.localeCompare(dB);
    });
  }, [pendentes, now]);

  // Gargalo — tipo com mais pedidos
  const gargalo = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const v of pendentes) {
      for (const item of v.itens) {
        const parsed = item.parsed || parseItemAttributes(item.descricao_produto);
        const tipo = TIPO_PRODUTO_ALMOX_LABELS[parsed.tipo_produto] || parsed.tipo_produto;
        contagem[tipo] = (contagem[tipo] || 0) + 1;
      }
    }
    let max = 0;
    let maxTipo = '';
    for (const [tipo, count] of Object.entries(contagem)) {
      if (count > max) { max = count; maxTipo = tipo; }
    }
    return maxTipo ? { tipo: maxTipo, count: max } : null;
  }, [pendentes]);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <CheckCircle2 className="h-12 w-12 mb-3 text-[hsl(var(--success))]" />
        <p className="text-lg font-medium">Tudo separado!</p>
        <p className="text-sm">Nenhum pedido pendente no momento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Barra de gargalo */}
      {gargalo && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <span className="text-sm font-semibold text-destructive">
            Gargalo atual: {gargalo.tipo} ({gargalo.count} {gargalo.count === 1 ? 'item' : 'itens'})
          </span>
        </div>
      )}

      {/* Contadores */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>{sorted.length} pedidos pendentes</span>
        <span>•</span>
        <span>{sorted.reduce((sum, v) => sum + v.itens.reduce((s, i) => s + i.quantidade, 0), 0)} unidades</span>
      </div>

      {/* Lista de blocos */}
      <div className="space-y-2">
        {sorted.map((v, idx) => {
          const prioridade = getPrioridade(v);
          const totalQty = v.itens.reduce((s, i) => s + i.quantidade, 0);

          // Aggregate tipos
          const tipos = new Set<string>();
          const modelos = new Set<string>();
          const larguras = new Set<number>();
          for (const item of v.itens) {
            const p = item.parsed || parseItemAttributes(item.descricao_produto);
            tipos.add(TIPO_PRODUTO_ALMOX_LABELS[p.tipo_produto] || p.tipo_produto);
            if (p.modelo_fivela) modelos.add(p.modelo_fivela);
            if (p.largura_mm) larguras.add(p.largura_mm);
          }

          return (
            <div
              key={v.pedido_id}
              className={`rounded-lg border ${prioridade.borderClass} ${prioridade.bgClass} p-4 transition-all`}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-bold text-muted-foreground tabular-nums">#{idx + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-lg leading-none">{v.api_venda_id}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${
                          prioridade.cor === 'destructive'
                            ? 'bg-destructive/15 text-destructive border-destructive/30'
                            : prioridade.cor === 'warning'
                            ? 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30'
                            : 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30'
                        }`}
                      >
                        <Clock className="h-3 w-3 mr-0.5" />
                        {prioridade.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{v.cliente_nome}</p>
                  </div>
                </div>

                <Button
                  size="sm"
                  className="shrink-0 min-h-[40px] px-4"
                  onClick={() => onConfirmar(v)}
                >
                  <Package className="h-4 w-4 mr-1.5" />
                  Confirmar
                </Button>
              </div>

              {/* Attributes row */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {[...tipos].map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] bg-card/60">
                    <Tag className="h-2.5 w-2.5 mr-0.5" />
                    {t}
                  </Badge>
                ))}
                {[...modelos].map(m => (
                  <Badge key={m} variant="outline" className="text-[10px] bg-card/60">
                    {m}
                  </Badge>
                ))}
                {[...larguras].map(l => (
                  <Badge key={l} variant="outline" className="text-[10px] bg-card/60">
                    <Ruler className="h-2.5 w-2.5 mr-0.5" />
                    {l}mm
                  </Badge>
                ))}
                <Badge variant="outline" className="text-[10px] font-bold bg-card/60">
                  {totalQty} un
                </Badge>
              </div>

              {/* Itens detail (collapsed for KDS readability) */}
              {v.itens.length > 1 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {v.itens.map(i => (
                    <div key={i.id} className="flex items-center gap-2 py-0.5">
                      <span className="font-medium">{i.quantidade}×</span>
                      <span className="truncate">{i.descricao_produto}</span>
                      {i.origem === 'solicitacao' && (
                        <Badge variant="outline" className="text-[8px] bg-purple-500/10 text-purple-600 border-purple-500/20">Loja</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

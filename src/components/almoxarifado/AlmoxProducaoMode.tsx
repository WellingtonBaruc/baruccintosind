import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Package, Volume2 } from 'lucide-react';
import {
  parseItemAttributes,
  TIPO_PRODUTO_ALMOX_LABELS,
  type ParsedItemAttributes,
} from '@/lib/almoxarifado';
import { differenceInCalendarDays } from 'date-fns';

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

type Urgencia = 'vermelho' | 'laranja' | 'verde';

function getUrgencia(dias: number): Urgencia {
  if (dias > 0) return 'vermelho';
  if (dias >= -3) return 'laranja';
  return 'verde';
}

// Solid KDS-style colors matching the reference
const headerColors: Record<Urgencia, string> = {
  vermelho: 'bg-[#d32f2f]', // solid red
  laranja: 'bg-[#e65100]',  // solid orange
  verde: 'bg-[#2e7d32]',    // solid green
};

const headerText: Record<Urgencia, string> = {
  vermelho: 'text-white',
  laranja: 'text-white',
  verde: 'text-white',
};

function formatTimer(dias: number): string {
  if (dias > 0) return `+${String(dias).padStart(2, '0')}d`;
  if (dias === 0) return '00:00';
  return `-${String(Math.abs(dias)).padStart(2, '0')}d`;
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
      const aA = calcDiasAtraso(a.data_previsao_entrega);
      const aB = calcDiasAtraso(b.data_previsao_entrega);
      if (aA !== aB) return aB - aA;
      const dA = a.data_previsao_entrega || '9999-12-31';
      const dB = b.data_previsao_entrega || '9999-12-31';
      return dA.localeCompare(dB);
    });
  }, [pendentes, now]);

  // Gargalo
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

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <CheckCircle2 className="h-16 w-16 mb-4 text-[#2e7d32]" />
        <p className="text-xl font-bold text-foreground">FILA LIMPA</p>
        <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Top bar - gargalo */}
      {gargalo && (
        <div className="flex items-center gap-2 bg-[#d32f2f] text-white px-4 py-2 rounded-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-bold uppercase">
            Gargalo: {gargalo.tipo} ({gargalo.atrasados > 0 ? `${gargalo.atrasados} atrasados / ` : ''}{gargalo.total} itens)
          </span>
        </div>
      )}

      {/* KDS Blocks */}
      <div className="space-y-1">
        {sorted.map((v) => {
          const dias = calcDiasAtraso(v.data_previsao_entrega);
          const urgencia = getUrgencia(dias);
          const totalQty = v.itens.reduce((s, i) => s + i.quantidade, 0);

          return (
            <div key={v.pedido_id} className="bg-card border border-border overflow-hidden rounded-sm">
              {/* Header colorido KDS */}
              <div className={`${headerColors[urgencia]} ${headerText[urgencia]} px-4 py-2`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Tempo */}
                    <div>
                      <span className="text-[10px] font-medium uppercase opacity-80 block leading-none">tempo</span>
                      <span className="text-2xl font-black tabular-nums leading-none tracking-tight">
                        {formatTimer(dias)}
                      </span>
                    </div>
                    {/* Pedido */}
                    <div>
                      <span className="text-[10px] font-medium uppercase opacity-80 block leading-none">pedido</span>
                      <span className="text-2xl font-black leading-none tracking-tight">
                        {v.api_venda_id}
                      </span>
                    </div>
                  </div>
                  {/* Botão SEPARAR */}
                  <button
                    onClick={() => onConfirmar(v)}
                    className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 active:bg-white/40 transition-colors rounded-sm px-4 py-2 font-black text-sm uppercase tracking-wide"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    SEPARAR
                  </button>
                </div>
                {/* Cliente + tipo */}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs opacity-80 truncate">{v.cliente_nome}</span>
                  {v.origem !== 'fivela' && (
                    <span className="text-[9px] font-bold uppercase bg-white/20 px-1.5 py-0.5 rounded-sm">
                      Loja
                    </span>
                  )}
                </div>
              </div>

              {/* Items - simple list like KDS */}
              <div className="px-4 py-2 divide-y divide-border/50">
                {v.itens.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <div className="w-4 h-4 border-2 border-border rounded-sm shrink-0" />
                    <span className="font-bold text-foreground shrink-0">{item.quantidade}</span>
                    <span className="text-foreground truncate">{item.descricao_produto}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

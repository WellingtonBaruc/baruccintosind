import { Card, CardContent } from '@/components/ui/card';
import { ShoppingBag, Clock, Wrench, Box, AlertTriangle, Send, CheckCircle2, TrendingUp } from 'lucide-react';

interface LojaKpiData {
  total: number;
  aguardandoLoja: number;
  aguardandoOp: number;
  aguardandoAlmox: number;
  pendenteFinalizacao: number;
  enviadasComercial: number;
  validadasComercial: number;
  finalizadasHoje: number;
}

interface Props {
  data: LojaKpiData;
  onFilterClick?: (status: string) => void;
}

const kpis = [
  { key: 'total' as const, label: 'Total na Loja', icon: ShoppingBag, colorClass: 'text-foreground', bgClass: 'bg-muted', filterStatus: 'all' },
  { key: 'aguardandoLoja' as const, label: 'Aguardando Loja', icon: Clock, colorClass: 'text-red-700 font-bold', bgClass: 'bg-red-500/15', filterStatus: 'AGUARDANDO_LOJA' },
  { key: 'aguardandoOp' as const, label: 'Aguard. OP', icon: Wrench, colorClass: 'text-amber-600', bgClass: 'bg-amber-500/10', filterStatus: 'AGUARDANDO_OP_COMPLEMENTAR' },
  { key: 'aguardandoAlmox' as const, label: 'Aguard. Almox', icon: Box, colorClass: 'text-purple-600', bgClass: 'bg-purple-500/10', filterStatus: 'AGUARDANDO_ALMOXARIFADO' },
  { key: 'pendenteFinalizacao' as const, label: 'Pend. Finalização', icon: AlertTriangle, colorClass: 'text-orange-600', bgClass: 'bg-orange-500/10', filterStatus: 'LOJA_PENDENTE_FINALIZACAO' },
  { key: 'enviadasComercial' as const, label: 'Enviadas Comercial', icon: Send, colorClass: 'text-red-700 font-bold', bgClass: 'bg-red-500/15', filterStatus: 'AGUARDANDO_COMERCIAL' },
  { key: 'validadasComercial' as const, label: 'Validadas Comercial', icon: CheckCircle2, colorClass: 'text-sky-600', bgClass: 'bg-sky-500/10', filterStatus: 'VALIDADO_COMERCIAL' },
  { key: 'finalizadasHoje' as const, label: 'Finalizadas Hoje', icon: TrendingUp, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-500/10', filterStatus: '' },
];

export default function LojaKpiCards({ data, onFilterClick }: Props) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
      {kpis.map(kpi => {
        const Icon = kpi.icon;
        const value = data[kpi.key];
        const clickable = kpi.filterStatus !== '' && onFilterClick;

        return (
          <Card
            key={kpi.key}
            className={`border-border/60 overflow-hidden transition-shadow ${clickable ? 'cursor-pointer hover:shadow-md' : ''}`}
            onClick={() => clickable && onFilterClick(kpi.filterStatus)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`rounded-md p-1 ${kpi.bgClass}`}>
                  <Icon className={`h-3.5 w-3.5 ${kpi.colorClass}`} />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide leading-tight truncate">
                  {kpi.label}
                </span>
              </div>
              <p className={`text-2xl font-bold tabular-nums ${kpi.colorClass}`}>
                {value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export type { LojaKpiData };

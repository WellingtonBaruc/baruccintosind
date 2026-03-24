import { Card, CardContent } from '@/components/ui/card';
import { PlayCircle, CheckCircle2, AlertTriangle, AlertCircle, Factory, Package, TrendingUp } from 'lucide-react';

interface Props {
  iniciarHoje: number;
  concluirHoje: number;
  atrasados: number;
  emRisco: number;
  capacidadeDia: number;
  cargaDia: number;
  saldoDia: number;
}

const kpiConfig = [
  { key: 'iniciarHoje', label: 'Iniciar Hoje', icon: PlayCircle, colorClass: 'text-blue-600', bgClass: 'bg-blue-500/10' },
  { key: 'concluirHoje', label: 'Concluir Hoje', icon: CheckCircle2, colorClass: 'text-orange-600', bgClass: 'bg-orange-500/10' },
  { key: 'atrasados', label: 'Atrasados', icon: AlertTriangle, colorClass: 'text-destructive', bgClass: 'bg-destructive/10' },
  { key: 'emRisco', label: 'Em Risco', icon: AlertCircle, colorClass: 'text-amber-600', bgClass: 'bg-amber-500/10' },
  { key: 'capacidadeDia', label: 'Capacidade', icon: Factory, colorClass: 'text-[hsl(var(--primary))]', bgClass: 'bg-primary/10' },
  { key: 'cargaDia', label: 'Carga', icon: Package, colorClass: 'text-[hsl(var(--primary))]', bgClass: 'bg-primary/10' },
  { key: 'saldoDia', label: 'Saldo', icon: TrendingUp, colorClass: '', bgClass: '' },
] as const;

export default function PainelKpiCards(props: Props) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
      {kpiConfig.map(kpi => {
        const value = props[kpi.key];
        const Icon = kpi.icon;
        const isSaldo = kpi.key === 'saldoDia';
        const saldoColor = isSaldo ? (value >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive') : kpi.colorClass;
        const saldoBg = isSaldo ? (value >= 0 ? 'bg-[hsl(var(--success))]/10' : 'bg-destructive/10') : kpi.bgClass;

        return (
          <Card key={kpi.key} className="border-border/60 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`rounded-lg p-1.5 ${saldoBg}`}>
                  <Icon className={`h-3.5 w-3.5 ${saldoColor}`} />
                </div>
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
              </div>
              <p className={`text-2xl font-bold tabular-nums ${saldoColor}`}>
                {isSaldo && value > 0 ? '+' : ''}{value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

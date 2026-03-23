import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, Clock, Factory } from 'lucide-react';

interface TipoStats {
  tipo: string;
  tipoLabel: string;
  leadTime: number;
  emProducao: number;
  emFila: number;
  atrasoMedio: number;
}

interface Props {
  stats: TipoStats[];
}

export default function PcpIntelligenceBar({ stats }: Props) {
  if (stats.length === 0) return null;

  const gargalo = stats.reduce((max, s) => s.atrasoMedio > max.atrasoMedio ? s : max, stats[0]);
  const hasGargalo = gargalo.atrasoMedio > 0;

  return (
    <div className="space-y-3">
      {hasGargalo && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-destructive font-medium">Gargalo atual da produção:</span>
          <span className="font-semibold">{gargalo.tipoLabel}</span>
          <span className="text-muted-foreground">— atraso médio de {Math.abs(gargalo.atrasoMedio).toFixed(1)} dias úteis</span>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        {stats.map(s => (
          <Card key={s.tipo} className="border-border/60">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{s.tipoLabel}</span>
                <Badge variant="outline" className="text-xs font-mono">{s.leadTime}d</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <Factory className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
                  <p className="text-lg font-bold tabular-nums">{s.emProducao}</p>
                  <p className="text-[10px] text-muted-foreground">Produção</p>
                </div>
                <div>
                  <Clock className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
                  <p className="text-lg font-bold tabular-nums">{s.emFila}</p>
                  <p className="text-[10px] text-muted-foreground">Fila</p>
                </div>
                <div>
                  <TrendingDown className="h-3.5 w-3.5 mx-auto text-destructive mb-0.5" />
                  <p className={`text-lg font-bold tabular-nums ${s.atrasoMedio > 0 ? 'text-destructive' : 'text-[hsl(var(--success))]'}`}>
                    {s.atrasoMedio > 0 ? `-${s.atrasoMedio.toFixed(1)}` : '0'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Atraso</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

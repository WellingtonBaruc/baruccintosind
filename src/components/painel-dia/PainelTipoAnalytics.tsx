import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TIPO_PRODUTO_BADGE, TIPO_PRODUTO_LABELS } from '@/lib/pcp';
import type { TipoAnalytics } from '@/lib/pcpPainelDia';
import { Factory, Package, TrendingDown, AlertTriangle, AlertCircle } from 'lucide-react';

interface Props {
  analytics: TipoAnalytics[];
}

export default function PainelTipoAnalytics({ analytics }: Props) {
  if (analytics.length === 0) return null;

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      {analytics.map(a => {
        const pctCarga = a.capacidade > 0 ? Math.round((a.carga / a.capacidade) * 100) : 0;
        const overload = a.saldo < 0;

        return (
          <Card key={a.tipo} className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge className={`text-xs font-medium ${TIPO_PRODUTO_BADGE[a.tipo] || ''}`}>
                    {a.tipoLabel}
                  </Badge>
                </CardTitle>
                <span className="text-xs text-muted-foreground">{a.pedidos} pedidos · {a.pecas} peças</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Capacity bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Carga / Capacidade</span>
                  <span className={`text-xs font-medium tabular-nums ${overload ? 'text-destructive' : 'text-[hsl(var(--success))]'}`}>
                    {a.carga} / {a.capacidade} ({pctCarga}%)
                  </span>
                </div>
                <Progress value={Math.min(pctCarga, 100)} className={`h-2 ${overload ? '[&>div]:bg-destructive' : ''}`} />
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <Factory className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold tabular-nums">{a.capacidade}</p>
                  <p className="text-[10px] text-muted-foreground">Capacidade</p>
                </div>
                <div>
                  <Package className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold tabular-nums">{a.carga}</p>
                  <p className="text-[10px] text-muted-foreground">Carga</p>
                </div>
                <div>
                  <p className={`text-lg font-bold tabular-nums ${a.saldo >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                    {a.saldo > 0 ? '+' : ''}{a.saldo}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Saldo</p>
                </div>
                <div>
                  <TrendingDown className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
                  <p className={`text-lg font-bold tabular-nums ${a.atrasoMedio > 0 ? 'text-destructive' : 'text-[hsl(var(--success))]'}`}>
                    {a.atrasoMedio > 0 ? a.atrasoMedio.toFixed(1) : '0'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Atraso Médio</p>
                </div>
              </div>

              {/* Risk indicators */}
              {(a.atrasados > 0 || a.emRisco > 0) && (
                <div className="flex gap-3">
                  {a.atrasados > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{a.atrasados} atrasados</span>
                    </div>
                  )}
                  {a.emRisco > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>{a.emRisco} em risco</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

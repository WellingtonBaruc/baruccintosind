import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CapacidadeDia } from '@/lib/pcpPainelDia';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart3 } from 'lucide-react';

interface Props {
  projecao: CapacidadeDia[];
}

export default function PainelCapacidadeCarga({ projecao }: Props) {
  if (projecao.length === 0) return null;

  const chartData = projecao.map(d => ({
    ...d,
    label: format(new Date(d.data + 'T00:00:00'), 'EEE dd/MM', { locale: ptBR }),
  }));

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[hsl(var(--primary))]" />
          Capacidade × Carga — Próximos {projecao.length} dias úteis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, borderColor: 'hsl(var(--border))' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="carga_sintetico" name="Carga Sintético" fill="hsl(262, 52%, 60%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="carga_tecido" name="Carga Tecido" fill="hsl(38, 92%, 50%)" radius={[3, 3, 0, 0]} />
              <ReferenceLine y={projecao[0]?.capacidade_total || 0} stroke="hsl(0, 72%, 51%)" strokeDasharray="5 5" label={{ value: 'Capacidade', fill: 'hsl(0, 72%, 51%)', fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Saldo table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left pb-2 font-medium">Dia</th>
                <th className="text-center pb-2 font-medium">Sintético</th>
                <th className="text-center pb-2 font-medium">Tecido</th>
                <th className="text-center pb-2 font-medium">Total</th>
                <th className="text-center pb-2 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {projecao.map(d => (
                <tr key={d.data} className="border-b border-border/40">
                  <td className="py-1.5 font-medium">{format(new Date(d.data + 'T00:00:00'), 'EEE dd/MM', { locale: ptBR })}</td>
                  <td className="text-center tabular-nums">{d.carga_sintetico}/{d.capacidade_sintetico}</td>
                  <td className="text-center tabular-nums">{d.carga_tecido}/{d.capacidade_tecido}</td>
                  <td className="text-center tabular-nums">{d.carga_total}/{d.capacidade_total}</td>
                  <td className="text-center">
                    <Badge variant="outline" className={`text-[10px] font-medium tabular-nums ${d.saldo_total >= 0 ? 'text-[hsl(var(--success))] border-[hsl(var(--success))]/30' : 'text-destructive border-destructive/30'}`}>
                      {d.saldo_total > 0 ? '+' : ''}{d.saldo_total}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

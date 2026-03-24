import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TIPO_PRODUTO_BADGE, TIPO_PRODUTO_LABELS } from '@/lib/pcp';
import { STATUS_PCP_CONFIG, type PedidoPainelDia } from '@/lib/pcpPainelDia';
import { PlayCircle, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  iniciarHoje: PedidoPainelDia[];
  concluirHoje: PedidoPainelDia[];
  criticos: PedidoPainelDia[];
  onDesprogramar?: (pedido: PedidoPainelDia) => void;
  hoje?: string;
}

function PedidoRow({ p, onDesprogramar, hoje }: { p: PedidoPainelDia; onDesprogramar?: (pedido: PedidoPainelDia) => void; hoje?: string }) {
  const statusCfg = STATUS_PCP_CONFIG[p.status_pcp];
  const isProgramado = hoje && (p.programado_inicio_data === hoje || p.programado_conclusao_data === hoje);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${statusCfg.color}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{p.api_venda_id || p.numero_pedido}</span>
          {p.tipo_produto && (
            <Badge className={`text-[10px] px-1.5 py-0 font-normal ${TIPO_PRODUTO_BADGE[p.tipo_produto] || ''}`}>
              {TIPO_PRODUTO_LABELS[p.tipo_produto] || p.tipo_produto}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] font-normal">
            {p.quantidade_itens} un
          </Badge>
          {isProgramado && onDesprogramar && (
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDesprogramar(p)}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground truncate">{p.cliente_nome}</p>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex gap-3">
          {p.data_previsao_entrega && (
            <span>Entrega: {format(new Date(p.data_previsao_entrega + 'T00:00:00'), 'dd/MM')}</span>
          )}
          {p.data_inicio_ideal && (
            <span>Início: {format(new Date(p.data_inicio_ideal + 'T00:00:00'), 'dd/MM')}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {p.dias_atraso > 0 && <span className="text-destructive font-medium">-{p.dias_atraso}d</span>}
          {p.etapa_atual && <span>· {p.etapa_atual}</span>}
        </div>
      </div>
      {isProgramado && (
        <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">
          ✓ Programado
        </Badge>
      )}
    </div>
  );
}

export default function PainelAgendaDia({ iniciarHoje, concluirHoje, criticos, onDesprogramar, hoje }: Props) {
  const columns = [
    { title: 'Iniciar Hoje', icon: PlayCircle, items: iniciarHoje, iconColor: 'text-blue-600', emptyMsg: 'Nenhum pedido para iniciar hoje' },
    { title: 'Concluir Hoje', icon: CheckCircle2, items: concluirHoje, iconColor: 'text-orange-600', emptyMsg: 'Nenhum pedido para concluir hoje' },
    { title: 'Críticos / Atrasados', icon: AlertTriangle, items: criticos, iconColor: 'text-destructive', emptyMsg: 'Nenhum pedido crítico' },
  ];

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
      {columns.map(col => {
        const Icon = col.icon;
        return (
          <Card key={col.title} className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Icon className={`h-4 w-4 ${col.iconColor}`} />
                {col.title}
                <Badge variant="outline" className="text-[10px] font-normal ml-auto">{col.items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {col.items.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">{col.emptyMsg}</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                  {col.items.map(p => <PedidoRow key={p.id} p={p} onDesprogramar={onDesprogramar} hoje={hoje} />)}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

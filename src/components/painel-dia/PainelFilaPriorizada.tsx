import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIPO_PRODUTO_BADGE, TIPO_PRODUTO_LABELS } from '@/lib/pcp';
import { STATUS_PCP_CONFIG, ETIQUETA_CONFIG, type PedidoPainelDia, type StatusPcpInteligente, type EtiquetaPrioridade } from '@/lib/pcpPainelDia';
import { ListOrdered, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  pedidos: PedidoPainelDia[];
}

export default function PainelFilaPriorizada({ pedidos }: Props) {
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<string>('TODOS');

  const filtered = pedidos.filter(p => {
    if (filtroTipo !== 'TODOS' && p.tipo_produto !== filtroTipo) return false;
    if (filtroStatus !== 'TODOS' && p.status_pcp !== filtroStatus) return false;
    if (filtroEtiqueta !== 'TODOS' && p.etiqueta !== filtroEtiqueta) return false;
    return true;
  });

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-[hsl(var(--primary))]" />
            Fila Priorizada Inteligente
            <Badge variant="outline" className="text-[10px] font-normal">{filtered.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos Tipos</SelectItem>
                <SelectItem value="SINTETICO">Sintético</SelectItem>
                <SelectItem value="TECIDO">Tecido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos Status</SelectItem>
                <SelectItem value="ATRASADO">Atrasado</SelectItem>
                <SelectItem value="EM_RISCO">Em Risco</SelectItem>
                <SelectItem value="PROGRAMADO_HOJE">Iniciar Hoje</SelectItem>
                <SelectItem value="CONCLUIR_HOJE">Concluir Hoje</SelectItem>
                <SelectItem value="EM_PRODUCAO_PRAZO">Em Produção</SelectItem>
                <SelectItem value="NAO_INICIADO">Não Iniciado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroEtiqueta} onValueChange={setFiltroEtiqueta}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todas</SelectItem>
                <SelectItem value="CRITICO">Crítico</SelectItem>
                <SelectItem value="HOJE">Hoje</SelectItem>
                <SelectItem value="PROXIMO">Próximo</SelectItem>
                <SelectItem value="REPROGRAMAVEL">Reprogramável</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left pb-2 font-medium">#</th>
                <th className="text-left pb-2 font-medium">Pedido</th>
                <th className="text-left pb-2 font-medium">Cliente</th>
                <th className="text-center pb-2 font-medium">Tipo</th>
                <th className="text-center pb-2 font-medium">Status</th>
                <th className="text-center pb-2 font-medium">Etiqueta</th>
                <th className="text-center pb-2 font-medium">Entrega</th>
                <th className="text-center pb-2 font-medium">Início Ideal</th>
                <th className="text-center pb-2 font-medium">Atraso</th>
                <th className="text-center pb-2 font-medium">Peças</th>
                <th className="text-right pb-2 font-medium flex items-center justify-end gap-1">
                  <ArrowUpDown className="h-3 w-3" /> Score
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((p, i) => {
                const statusCfg = STATUS_PCP_CONFIG[p.status_pcp];
                const etiqCfg = ETIQUETA_CONFIG[p.etiqueta];

                return (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 font-medium">{p.api_venda_id || p.numero_pedido}</td>
                    <td className="py-2 max-w-[150px] truncate">{p.cliente_nome}</td>
                    <td className="py-2 text-center">
                      {p.tipo_produto && (
                        <Badge className={`text-[10px] px-1.5 py-0 font-normal ${TIPO_PRODUTO_BADGE[p.tipo_produto] || ''}`}>
                          {TIPO_PRODUTO_LABELS[p.tipo_produto] || p.tipo_produto}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 text-center">
                      <span className="text-[10px]">{statusCfg.icon} {statusCfg.label}</span>
                    </td>
                    <td className="py-2 text-center">
                      <Badge className={`text-[10px] px-1.5 py-0 font-medium ${etiqCfg.color}`}>
                        {etiqCfg.label}
                      </Badge>
                    </td>
                    <td className="py-2 text-center tabular-nums">
                      {p.data_previsao_entrega ? format(new Date(p.data_previsao_entrega + 'T00:00:00'), 'dd/MM') : '—'}
                    </td>
                    <td className="py-2 text-center tabular-nums">
                      {p.data_inicio_ideal ? format(new Date(p.data_inicio_ideal + 'T00:00:00'), 'dd/MM') : '—'}
                    </td>
                    <td className="py-2 text-center">
                      {p.dias_atraso > 0 ? (
                        <span className="text-destructive font-medium">-{p.dias_atraso}d</span>
                      ) : (
                        <span className="text-[hsl(var(--success))]">OK</span>
                      )}
                    </td>
                    <td className="py-2 text-center tabular-nums">{p.quantidade_itens}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{p.score_prioridade}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">Nenhum pedido encontrado com os filtros selecionados.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

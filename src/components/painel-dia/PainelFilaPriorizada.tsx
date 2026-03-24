import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIPO_PRODUTO_BADGE, TIPO_PRODUTO_LABELS } from '@/lib/pcp';
import { STATUS_PCP_CONFIG, ETIQUETA_CONFIG, type PedidoPainelDia } from '@/lib/pcpPainelDia';
import { ListOrdered, ArrowUpDown, CalendarPlus, CalendarCheck, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';

interface Props {
  pedidos: PedidoPainelDia[];
  onProgramarInicio?: (pedido: PedidoPainelDia) => void;
  onProgramarConclusao?: (pedido: PedidoPainelDia) => void;
  onDesprogramar?: (pedido: PedidoPainelDia) => void;
  hoje?: string;
  capacidadeTotal?: number;
  cargaProgramada?: number;
}

export default function PainelFilaPriorizada({ pedidos, onProgramarInicio, onProgramarConclusao, onDesprogramar, hoje, capacidadeTotal = 0, cargaProgramada = 0 }: Props) {
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<string>('TODOS');

  const filtered = pedidos.filter(p => {
    if (filtroTipo !== 'TODOS' && p.tipo_produto !== filtroTipo) return false;
    if (filtroStatus !== 'TODOS' && p.status_pcp !== filtroStatus) return false;
    if (filtroEtiqueta !== 'TODOS' && p.etiqueta !== filtroEtiqueta) return false;
    return true;
  });

  const cargaPct = capacidadeTotal > 0 ? Math.min((cargaProgramada / capacidadeTotal) * 100, 100) : 0;
  const excedido = cargaProgramada > capacidadeTotal && capacidadeTotal > 0;

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

        {/* Capacity bar */}
        {capacidadeTotal > 0 && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Carga programada</span>
              <span className={excedido ? 'text-destructive font-semibold' : 'text-foreground'}>
                {cargaProgramada} / {capacidadeTotal} peças
                {excedido && <AlertTriangle className="h-3 w-3 inline ml-1" />}
              </span>
            </div>
            <Progress value={cargaPct} className={`h-2 ${excedido ? '[&>div]:bg-destructive' : ''}`} />
          </div>
        )}
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
                <th className="text-center pb-2 font-medium">Peças</th>
                <th className="text-right pb-2 font-medium flex items-center justify-end gap-1">
                  <ArrowUpDown className="h-3 w-3" /> Score
                </th>
                <th className="text-center pb-2 font-medium">Programação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((p, i) => {
                const statusCfg = STATUS_PCP_CONFIG[p.status_pcp];
                const etiqCfg = ETIQUETA_CONFIG[p.etiqueta];
                const isProgramadoInicio = !!p.programado_inicio_data;
                const isProgramadoConclusao = !!p.programado_conclusao_data;
                const isProgramado = isProgramadoInicio || isProgramadoConclusao;

                return (
                  <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/30 transition-colors ${isProgramado ? 'bg-primary/5' : ''}`}>
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
                    <td className="py-2 text-center tabular-nums">{p.quantidade_itens}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{p.score_prioridade}</td>
                    <td className="py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* Botão Iniciar */}
                        {isProgramadoInicio ? (
                          <Badge className="text-[10px] bg-blue-500/15 text-blue-700 border-blue-300 gap-0.5">
                            <CheckCircle className="h-3 w-3" /> {format(new Date(p.programado_inicio_data! + 'T00:00:00'), 'dd/MM')}
                          </Badge>
                        ) : (
                          onProgramarInicio && (
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-blue-600 hover:bg-blue-50" onClick={() => onProgramarInicio(p)} title="Programar início">
                              <CalendarPlus className="h-3 w-3 mr-0.5" /> Início
                            </Button>
                          )
                        )}
                        {/* Botão Concluir */}
                        {isProgramadoConclusao ? (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 border-emerald-300 gap-0.5">
                            <CheckCircle className="h-3 w-3" /> {format(new Date(p.programado_conclusao_data! + 'T00:00:00'), 'dd/MM')}
                          </Badge>
                        ) : (
                          onProgramarConclusao && (
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-emerald-600 hover:bg-emerald-50" onClick={() => onProgramarConclusao(p)} title="Programar conclusão">
                              <CalendarCheck className="h-3 w-3 mr-0.5" /> Conclusão
                            </Button>
                          )
                        )}
                        {/* Desprogramar */}
                        {isProgramado && onDesprogramar && (
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDesprogramar(p)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
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

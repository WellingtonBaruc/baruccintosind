import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_PEDIDO_CONFIG, iniciarVerificacaoLoja, finalizarVerificacaoLoja } from '@/lib/producao';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, Clock, Package, Eye, CheckCircle2, Send } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const PERFIS_LOJA = ['loja', 'admin', 'gestor'];
const STATUS_LOJA = ['AGUARDANDO_LOJA', 'LOJA_VERIFICANDO', 'AGUARDANDO_OP_COMPLEMENTAR', 'AGUARDANDO_ALMOXARIFADO', 'LOJA_PENDENTE_FINALIZACAO'] as const;
const STATUS_POS_LOJA = ['AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL', 'AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO', 'LIBERADO_LOGISTICA', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE', 'CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO', 'AGUARDANDO_PRODUCAO', 'EM_PRODUCAO', 'PRODUCAO_CONCLUIDA', 'LOJA_OK', 'AGUARDANDO_CIENCIA_COMERCIAL'];

interface PedidoLoja {
  id: string;
  numero_pedido: string;
  api_venda_id: string | null;
  cliente_nome: string;
  status_atual: string;
  tipo_fluxo: string | null;
  subtipo_pronta_entrega: string | null;
  criado_em: string;
  valor_liquido: number;
  qtd_itens?: number;
  data_venda_api?: string | null;
  data_previsao_entrega?: string | null;
  observacao_api?: string | null;
  fivelas_separadas?: boolean;
  op_concluida?: boolean;
  almox_atendido?: boolean;
}

export default function FilaLoja() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoLoja[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => { fetchPedidos(); }, []);

  const fetchPedidos = async () => {
    // Fetch pedidos in loja statuses OR with status_api 'Pedido Enviado' (not yet past loja)
    const { data } = await supabase
      .from('pedidos')
      .select('*, fivelas_separadas')
      .or(`status_atual.in.(${STATUS_LOJA.join(',')}),and(status_api.eq.Pedido Enviado,status_atual.not.in.(${STATUS_POS_LOJA.join(',')}))`)
      .order('criado_em', { ascending: true });

    if (data) {
      const pedidoIds = data.map((p: any) => p.id);

      // Fetch item counts, OP statuses, and solicitações in parallel
      const [itensResult, ordensResult, solicitacoesResult] = await Promise.all([
        Promise.all(data.map(async (p: any) => {
          const { count } = await supabase.from('pedido_itens').select('*', { count: 'exact', head: true }).eq('pedido_id', p.id);
          return { id: p.id, count: count || 0 };
        })),
        supabase.from('ordens_producao').select('pedido_id, status').in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']),
        supabase.from('solicitacoes_almoxarifado').select('pedido_id, status').in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']),
      ]);

      const itensMap: Record<string, number> = {};
      itensResult.forEach(r => { itensMap[r.id] = r.count; });

      // Check if all OPs for each pedido are CONCLUIDA
      const opMap: Record<string, boolean> = {};
      if (ordensResult.data) {
        const grouped: Record<string, string[]> = {};
        ordensResult.data.forEach((o: any) => {
          if (!grouped[o.pedido_id]) grouped[o.pedido_id] = [];
          grouped[o.pedido_id].push(o.status);
        });
        for (const [pid, statuses] of Object.entries(grouped)) {
          opMap[pid] = statuses.length > 0 && statuses.every(s => s === 'CONCLUIDA');
        }
      }

      // Check if all solicitações for each pedido are ATENDIDA
      const almoxMap: Record<string, boolean> = {};
      if (solicitacoesResult.data) {
        const grouped: Record<string, string[]> = {};
        solicitacoesResult.data.forEach((s: any) => {
          if (!grouped[s.pedido_id]) grouped[s.pedido_id] = [];
          grouped[s.pedido_id].push(s.status);
        });
        for (const [pid, statuses] of Object.entries(grouped)) {
          almoxMap[pid] = statuses.length > 0 && statuses.every(s => s === 'ATENDIDA' || s === 'ATENDIDO');
        }
      }

      setPedidos(data.map((p: any) => ({
        ...p,
        qtd_itens: itensMap[p.id] || 0,
        op_concluida: opMap[p.id] || false,
        almox_atendido: almoxMap[p.id] !== undefined ? almoxMap[p.id] : true, // no solicitações = ok
      })));
    }
    setLoading(false);
  };

  if (!profile || !PERFIS_LOJA.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleIniciarVerificacao = async (pedidoId: string) => {
    try {
      await iniciarVerificacaoLoja(pedidoId, profile.id);
      toast.success('Verificação iniciada!');
      navigate(`/loja/verificar/${pedidoId}`);
    } catch {
      toast.error('Erro ao iniciar verificação.');
    }
  };

  const handleEnviarComercial = async (pedido: PedidoLoja) => {
    setSendingId(pedido.id);
    try {
      await finalizarVerificacaoLoja(pedido.id, profile.id);
      toast.success('Pedido encaminhado para o comercial!');
      fetchPedidos();
    } catch {
      toast.error('Erro ao enviar para comercial.');
    }
    setSendingId(null);
  };

  const canSendToComercial = (p: PedidoLoja) => {
    if (p.status_atual === 'LOJA_PENDENTE_FINALIZACAO') {
      return true;
    }
    if (p.status_atual === 'AGUARDANDO_OP_COMPLEMENTAR') {
      return p.op_concluida === true;
    }
    if (p.status_atual === 'AGUARDANDO_ALMOXARIFADO') {
      return p.almox_atendido === true;
    }
    return false;
  };

  const filtered = pedidos.filter(p => {
    const matchSearch = search === '' ||
      p.numero_pedido.toLowerCase().includes(search.toLowerCase()) ||
      p.cliente_nome.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status_atual === statusFilter;
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    // LOJA_PENDENTE_FINALIZACAO always on top
    const aIsPending = a.status_atual === 'LOJA_PENDENTE_FINALIZACAO' ? 0 : 1;
    const bIsPending = b.status_atual === 'LOJA_PENDENTE_FINALIZACAO' ? 0 : 1;
    if (aIsPending !== bIsPending) return aIsPending - bIsPending;
    return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
  });

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fila da Loja</h1>
        <p className="text-muted-foreground mt-0.5">Pedidos aguardando verificação e expedição.</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pedido ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_LOJA.map(s => {
              const cfg = STATUS_PEDIDO_CONFIG[s];
              return <SelectItem key={s} value={s}>{cfg?.label || s}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Nenhum pedido na fila da loja.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data Venda</TableHead>
                  <TableHead>Prev. Entrega</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tempo em espera</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const cfg = STATUS_PEDIDO_CONFIG[p.status_atual] || { label: p.status_atual, color: 'bg-muted text-muted-foreground' };
                  const showSendButton = canSendToComercial(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.api_venda_id || p.numero_pedido}</TableCell>
                      <TableCell className="text-muted-foreground">{p.cliente_nome}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" /> {p.qtd_itens}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.data_venda_api ? format(new Date(p.data_venda_api + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.data_previsao_entrega ? (
                          <span className={p.observacao_api?.includes('[IMPORTADO SEM DATA PREVISTA]') ? 'text-destructive font-medium' : ''}>
                            {format(new Date(p.data_previsao_entrega + 'T12:00:00'), 'dd/MM/yyyy')}
                          </span>
                        ) : (
                          <span className="text-destructive font-medium">Sem previsão</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <Badge className={`font-normal ${cfg.color}`}>{cfg.label}</Badge>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {p.fivelas_separadas && (
                              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]" variant="outline">
                                <CheckCircle2 className="h-3 w-3 mr-0.5" /> Fivelas ✓
                              </Badge>
                            )}
                            {p.status_atual === 'AGUARDANDO_OP_COMPLEMENTAR' && p.op_concluida && (
                              <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30 text-[10px]" variant="outline">
                                <CheckCircle2 className="h-3 w-3 mr-0.5" /> OP Concluída ✓
                              </Badge>
                            )}
                            {p.status_atual === 'AGUARDANDO_ALMOXARIFADO' && p.almox_atendido && (
                              <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30 text-[10px]" variant="outline">
                                <CheckCircle2 className="h-3 w-3 mr-0.5" /> Almox Atendido ✓
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(p.criado_em), { locale: ptBR, addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {p.status_atual === 'AGUARDANDO_LOJA' ? (
                            <Button size="sm" onClick={() => handleIniciarVerificacao(p.id)}>
                              Iniciar verificação
                            </Button>
                          ) : showSendButton ? (
                            <Button
                              size="sm"
                              className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white"
                              onClick={() => handleEnviarComercial(p)}
                              disabled={sendingId === p.id}
                            >
                              {sendingId === p.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <Send className="h-3.5 w-3.5 mr-1" />
                              )}
                              Enviar ao Comercial
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => navigate(`/loja/verificar/${p.id}`)}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
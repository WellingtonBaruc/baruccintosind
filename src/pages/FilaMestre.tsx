import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_PRAZO_CONFIG, TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { STATUS_PEDIDO_CONFIG } from '@/lib/producao';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Loader2, X, Calendar, AlertTriangle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface VendaRow {
  id: string;
  api_venda_id: string | null;
  numero_pedido: string;
  cliente_nome: string;
  valor_liquido: number;
  data_venda_api: string | null;
  data_previsao_entrega: string | null;
  status_atual: string;
  status_prazo: string | null;
  status_api: string | null;
  criado_em: string;
  ordem_id: string | null;
  tipo_produto: string | null;
  etapa_atual: string;
  operador_atual: string;
  data_inicio_pcp: string | null;
  data_fim_pcp: string | null;
  is_piloto: boolean;
  status_piloto: string | null;
  fivelas_separadas: boolean;
}

interface PedidoDetail {
  pedido: any;
  itens: any[];
  historico: any[];
  ordens: any[];
  perdas: any[];
}

export default function FilaMestre() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<VendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [prazoFilter, setPrazoFilter] = useState('all');

  // Side panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PedidoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Inline editing
  const [editingPcp, setEditingPcp] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => { fetchRows(); }, []);

  const fetchRows = async () => {
    // Fetch pedidos that are not finalized
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id, api_venda_id, numero_pedido, cliente_nome, valor_liquido, data_venda_api, data_previsao_entrega, status_atual, status_prazo, status_api, criado_em, is_piloto, status_piloto, fivelas_separadas')
      .not('status_api', 'eq', 'Finalizado')
      .order('criado_em', { ascending: false });

    if (!pedidos) { setLoading(false); return; }

    // Fetch ordens with etapa info
    const pedidoIds = pedidos.map(p => p.id);
    const { data: ordens } = await supabase
      .from('ordens_producao')
      .select('id, pedido_id, tipo_produto, data_inicio_pcp, data_fim_pcp')
      .in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']);

    // Fetch active etapas
    const ordemIds = (ordens || []).map(o => o.id);
    const { data: etapas } = await supabase
      .from('op_etapas')
      .select('ordem_id, nome_etapa, operador_id, status, usuarios(nome)')
      .eq('status', 'EM_ANDAMENTO')
      .in('ordem_id', ordemIds.length > 0 ? ordemIds : ['none']);

    const vendas: VendaRow[] = pedidos.map(p => {
      const ordem = (ordens || []).find(o => o.pedido_id === p.id);
      const etapa = ordem ? (etapas || []).find(e => e.ordem_id === ordem.id) : null;
      return {
        ...p,
        ordem_id: ordem?.id || null,
        tipo_produto: ordem?.tipo_produto || null,
        etapa_atual: etapa?.nome_etapa || '—',
        operador_atual: (etapa?.usuarios as any)?.nome || '—',
        data_inicio_pcp: (ordem as any)?.data_inicio_pcp || null,
        data_fim_pcp: (ordem as any)?.data_fim_pcp || null,
        is_piloto: (p as any).is_piloto || false,
        status_piloto: (p as any).status_piloto || null,
        fivelas_separadas: (p as any).fivelas_separadas || false,
      };
    });

    setRows(vendas);
    setLoading(false);
  };

  const openDetail = async (pedidoId: string) => {
    setSelectedId(pedidoId);
    setDetailLoading(true);
    const [rPedido, rItens, rHist, rOrdens] = await Promise.all([
      supabase.from('pedidos').select('*').eq('id', pedidoId).single(),
      supabase.from('pedido_itens').select('*').eq('pedido_id', pedidoId),
      supabase.from('pedido_historico').select('*, usuarios(nome)').eq('pedido_id', pedidoId).order('criado_em', { ascending: false }),
      supabase.from('ordens_producao').select('*, pipeline_producao(nome)').eq('pedido_id', pedidoId),
    ]);
    // Fetch losses for all ordens of this pedido
    const ordemIds = (rOrdens.data || []).map((o: any) => o.id);
    const { data: perdas } = await supabase.from('ordem_perdas').select('*, usuarios:registrado_por(nome)').in('ordem_id', ordemIds.length > 0 ? ordemIds : ['none']);
    setDetail({
      pedido: rPedido.data,
      itens: rItens.data || [],
      historico: rHist.data || [],
      ordens: rOrdens.data || [],
      perdas: perdas || [],
    });
    setDetailLoading(false);
  };

  const savePcpDate = async (ordemId: string, field: string, value: string) => {
    await supabase.from('ordens_producao').update({ [field]: value || null } as any).eq('id', ordemId);
    setEditingPcp(null);
    fetchRows();
  };

  // Filters
  const filtered = rows.filter(r => {
    if (search && !r.cliente_nome.toLowerCase().includes(search.toLowerCase()) && !r.numero_pedido.toLowerCase().includes(search.toLowerCase()) && !(r.api_venda_id || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (tipoFilter !== 'all' && r.tipo_produto !== tipoFilter) return false;
    if (statusFilter !== 'all' && r.status_atual !== statusFilter) return false;
    if (prazoFilter === 'ATRASADO' && r.status_prazo !== 'ATRASADO') return false;
    if (prazoFilter === 'HOJE' && r.data_previsao_entrega !== new Date().toISOString().slice(0, 10)) return false;
    if (prazoFilter === 'FUTURO' && (r.status_prazo === 'ATRASADO' || r.data_previsao_entrega === new Date().toISOString().slice(0, 10))) return false;
    return true;
  });

  // Sort by urgency
  const sorted = [...filtered].sort((a, b) => {
    const prazoOrder: Record<string, number> = { ATRASADO: 0, ATENCAO: 1, NO_PRAZO: 2 };
    const pa = prazoOrder[a.status_prazo || 'NO_PRAZO'] ?? 3;
    const pb = prazoOrder[b.status_prazo || 'NO_PRAZO'] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
  });

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string | null) => d ? format(new Date(d + 'T00:00:00'), 'dd/MM/yy') : '—';

  const canEdit = profile && ['admin', 'gestor', 'supervisor_producao'].includes(profile.perfil);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Fila Mestre</h1>
        <Button variant="outline" onClick={() => navigate('/painel-dia')}>
          <Calendar className="h-4 w-4 mr-1.5" /> Painel do Dia
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="SINTETICO">Sintético</SelectItem>
            <SelectItem value="TECIDO">Tecido</SelectItem>
            <SelectItem value="FIVELA_COBERTA">Fivela Coberta</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_PEDIDO_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prazoFilter} onValueChange={setPrazoFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Prazo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ATRASADO">Atrasados</SelectItem>
            <SelectItem value="HOJE">Hoje</SelectItem>
            <SelectItem value="FUTURO">Futuros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="flex gap-3 flex-wrap text-sm">
        <Badge variant="outline" className="text-sm py-1 px-3">{sorted.length} pedidos</Badge>
        <Badge className="bg-destructive/15 text-destructive border-destructive/30 py-1 px-3">
          {sorted.filter(r => r.status_prazo === 'ATRASADO').length} atrasados
        </Badge>
      </div>

      {/* Table */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : sorted.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Nenhum pedido encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">⏱</TableHead>
                    <TableHead>Venda</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Dt. Venda</TableHead>
                    <TableHead>Prev. Entrega</TableHead>
                    <TableHead>Início PCP</TableHead>
                    <TableHead>Fim PCP</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(r => {
                    const prazoCfg = STATUS_PRAZO_CONFIG[r.status_prazo || 'NO_PRAZO'];
                    const statusCfg = STATUS_PEDIDO_CONFIG[r.status_atual] || { label: r.status_atual, color: 'bg-muted text-muted-foreground' };
                    const tipoBadge = TIPO_PRODUTO_BADGE[r.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border';
                    const tipoLabel = TIPO_PRODUTO_LABELS[r.tipo_produto || ''] || 'A classificar';

                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-accent/40 transition-colors"
                        onClick={() => openDetail(r.id)}
                      >
                        <TableCell>{prazoCfg?.icon}</TableCell>
                        <TableCell className="font-medium text-sm">{r.api_venda_id || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.numero_pedido}</TableCell>
                        <TableCell className="text-sm">{r.cliente_nome}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs font-normal ${tipoBadge}`}>{tipoLabel}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(r.valor_liquido)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.data_venda_api)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.data_previsao_entrega)}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          {editingPcp?.id === r.ordem_id && editingPcp?.field === 'data_inicio_pcp' ? (
                            <Input type="date" className="h-7 w-[120px] text-xs" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => r.ordem_id && savePcpDate(r.ordem_id, 'data_inicio_pcp', editValue)} autoFocus />
                          ) : (
                            <span className={`text-xs ${canEdit ? 'cursor-pointer hover:text-primary' : ''} text-muted-foreground`}
                              onClick={() => { if (canEdit && r.ordem_id) { setEditingPcp({ id: r.ordem_id, field: 'data_inicio_pcp' }); setEditValue(r.data_inicio_pcp || ''); } }}>
                              {fmtDate(r.data_inicio_pcp)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          {editingPcp?.id === r.ordem_id && editingPcp?.field === 'data_fim_pcp' ? (
                            <Input type="date" className="h-7 w-[120px] text-xs" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => r.ordem_id && savePcpDate(r.ordem_id, 'data_fim_pcp', editValue)} autoFocus />
                          ) : (
                            <span className={`text-xs ${canEdit ? 'cursor-pointer hover:text-primary' : ''} text-muted-foreground`}
                              onClick={() => { if (canEdit && r.ordem_id) { setEditingPcp({ id: r.ordem_id, field: 'data_fim_pcp' }); setEditValue(r.data_fim_pcp || ''); } }}>
                              {fmtDate(r.data_fim_pcp)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.etapa_atual}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge className={`font-normal text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
                            {r.is_piloto && (
                              <Badge className={`text-[10px] ${r.status_piloto === 'REPROVADO' ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-purple-500/15 text-purple-600 border-purple-500/30'}`}>
                                {r.status_piloto === 'REPROVADO' ? 'PILOTO ✗' : 'PILOTO'}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Side Panel */}
      <Sheet open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhe do Pedido</SheetTitle>
          </SheetHeader>
          {detailLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : detail ? (
            <Tabs defaultValue="info" className="mt-4">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="info">Dados</TabsTrigger>
                <TabsTrigger value="itens">Itens ({detail.itens.length})</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Pedido:</span> <span className="font-medium">{detail.pedido.numero_pedido}</span></div>
                  <div><span className="text-muted-foreground">Venda:</span> <span className="font-medium">{detail.pedido.api_venda_id || '—'}</span></div>
                  <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{detail.pedido.cliente_nome}</span></div>
                  <div><span className="text-muted-foreground">Valor:</span> <span className="font-medium">{fmt(detail.pedido.valor_liquido)}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge className={`font-normal text-xs ${(STATUS_PEDIDO_CONFIG[detail.pedido.status_atual] || {}).color || ''}`}>{(STATUS_PEDIDO_CONFIG[detail.pedido.status_atual] || {}).label || detail.pedido.status_atual}</Badge></div>
                  <div><span className="text-muted-foreground">Prazo:</span> <span>{STATUS_PRAZO_CONFIG[detail.pedido.status_prazo || 'NO_PRAZO']?.icon} {STATUS_PRAZO_CONFIG[detail.pedido.status_prazo || 'NO_PRAZO']?.label}</span></div>
                  <div><span className="text-muted-foreground">Prev. Entrega:</span> <span>{fmtDate(detail.pedido.data_previsao_entrega)}</span></div>
                  <div><span className="text-muted-foreground">Dt. Venda:</span> <span>{fmtDate(detail.pedido.data_venda_api)}</span></div>
                  {detail.pedido.cliente_telefone && <div><span className="text-muted-foreground">Telefone:</span> <span>{detail.pedido.cliente_telefone}</span></div>}
                  {detail.pedido.cliente_email && <div><span className="text-muted-foreground">Email:</span> <span>{detail.pedido.cliente_email}</span></div>}
                  {detail.pedido.cliente_endereco && <div className="col-span-2"><span className="text-muted-foreground">Endereço:</span> <span>{detail.pedido.cliente_endereco}</span></div>}
                  {detail.pedido.forma_pagamento && <div><span className="text-muted-foreground">Pagamento:</span> <span>{detail.pedido.forma_pagamento}</span></div>}
                  {detail.pedido.forma_envio && <div><span className="text-muted-foreground">Envio:</span> <span>{detail.pedido.forma_envio}</span></div>}
                  {detail.pedido.vendedor_nome && <div><span className="text-muted-foreground">Vendedor:</span> <span>{detail.pedido.vendedor_nome}</span></div>}
                </div>
                {detail.pedido.observacao_api && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Observação (API)</p>
                    <p>{detail.pedido.observacao_api}</p>
                  </div>
                )}
                {detail.pedido.observacao_interna_api && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Observação Interna</p>
                    <p>{detail.pedido.observacao_interna_api}</p>
                  </div>
                )}
                {detail.ordens.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Ordens de Produção</p>
                    {detail.ordens.map((o: any) => (
                      <div key={o.id} className="rounded-lg border border-border/60 p-3 text-sm flex items-center justify-between">
                        <div>
                          <span className="font-medium">{o.pipeline_producao?.nome}</span>
                          <span className="text-muted-foreground ml-2">— {o.status}</span>
                        </div>
                        <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[o.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                          {TIPO_PRODUTO_LABELS[o.tipo_produto || ''] || 'A classificar'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Piloto Toggle */}
                {canEdit && (
                  <div className="rounded-lg border border-border/60 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Marcar como Piloto</Label>
                      <Switch
                        checked={detail.pedido.is_piloto || false}
                        onCheckedChange={async (checked) => {
                          await supabase.from('pedidos').update({ is_piloto: checked, status_piloto: checked ? 'ENVIADO' : null }).eq('id', detail.pedido.id);
                          toast.success(checked ? 'Marcado como piloto' : 'Piloto removido');
                          openDetail(detail.pedido.id);
                          fetchRows();
                        }}
                      />
                    </div>
                    {detail.pedido.is_piloto && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Select value={detail.pedido.status_piloto || 'ENVIADO'} onValueChange={async (v) => {
                            const update: any = { status_piloto: v };
                            if (v === 'REPROVADO' && !detail.pedido.observacao_piloto) {
                              toast.error('Preencha o motivo da reprovação antes');
                              return;
                            }
                            await supabase.from('pedidos').update(update).eq('id', detail.pedido.id);
                            await supabase.from('pedido_historico').insert({
                              pedido_id: detail.pedido.id, usuario_id: profile!.id, tipo_acao: 'EDICAO',
                              observacao: `Piloto ${v === 'APROVADO' ? 'aprovado' : v === 'REPROVADO' ? 'reprovado' : 'enviado'} por ${profile!.nome}`,
                            });
                            toast.success(`Piloto marcado como ${v}`);
                            openDetail(detail.pedido.id);
                            fetchRows();
                          }}>
                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ENVIADO">Enviado</SelectItem>
                              <SelectItem value="APROVADO">Aprovado</SelectItem>
                              <SelectItem value="REPROVADO">Reprovado</SelectItem>
                            </SelectContent>
                          </Select>
                          <Badge className={`text-xs self-center ${
                            detail.pedido.status_piloto === 'APROVADO' ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' :
                            detail.pedido.status_piloto === 'REPROVADO' ? 'bg-destructive/15 text-destructive' :
                            'bg-purple-500/15 text-purple-600'
                          }`}>
                            {detail.pedido.status_piloto || 'ENVIADO'}
                          </Badge>
                        </div>
                        <Textarea
                          placeholder="Observação do piloto..."
                          defaultValue={detail.pedido.observacao_piloto || ''}
                          onBlur={async (e) => {
                            if (e.target.value !== (detail.pedido.observacao_piloto || '')) {
                              await supabase.from('pedidos').update({ observacao_piloto: e.target.value }).eq('id', detail.pedido.id);
                            }
                          }}
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Perdas confirmadas */}
                {detail.perdas.filter((p: any) => p.status === 'CONFIRMADA').length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-destructive" /> Perdas Confirmadas</p>
                    {detail.perdas.filter((p: any) => p.status === 'CONFIRMADA').map((p: any) => (
                      <div key={p.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                        <p className="font-medium">{p.nm_item}</p>
                        <div className="flex gap-3 text-muted-foreground mt-1">
                          <span>{p.quantidade_perdida} un perdida{p.quantidade_perdida > 1 ? 's' : ''}</span>
                          <span>Etapa: {p.etapa}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Motivo: {p.motivo}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="itens" className="mt-4">
                <div className="space-y-2">
                  {detail.itens.map((item: any) => (
                    <div key={item.id} className="rounded-lg border border-border/60 p-3 text-sm">
                      <p className="font-medium">{item.descricao_produto}</p>
                      <div className="flex gap-4 text-muted-foreground mt-1">
                        <span>Qtd: {item.quantidade}</span>
                        <span>R$ {item.valor_total?.toFixed(2)}</span>
                        {item.referencia_produto && <span>Ref: {item.referencia_produto}</span>}
                      </div>
                      {item.observacao_producao && <p className="text-xs text-primary mt-1">📝 {item.observacao_producao}</p>}
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="historico" className="mt-4">
                <div className="space-y-2">
                  {detail.historico.map((h: any) => (
                    <div key={h.id} className="rounded-lg border border-border/60 p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">{h.tipo_acao}</span>
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(h.criado_em), { locale: ptBR, addSuffix: true })}</span>
                      </div>
                      {h.observacao && <p className="text-muted-foreground mt-1">{h.observacao}</p>}
                      {h.usuarios?.nome && <p className="text-xs text-muted-foreground mt-0.5">por {h.usuarios.nome}</p>}
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_PRAZO_CONFIG, TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Loader2, ShoppingBag, DollarSign, Truck, ArrowRight, Package } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface VendaCard {
  id: string;
  numero_pedido: string;
  api_venda_id: string | null;
  cliente_nome: string;
  valor_liquido: number;
  status_atual: string;
  status_prazo: string | null;
  data_previsao_entrega: string | null;
  data_venda_api: string | null;
  criado_em: string;
  atualizado_em: string;
  tipo_produto: string | null;
  forma_pagamento: string | null;
  forma_envio: string | null;
  cliente_endereco: string | null;
  observacao_comercial: string | null;
  observacao_financeiro: string | null;
  observacao_logistica: string | null;
  codigo_rastreio: string | null;
}

interface ColumnDef {
  key: string;
  label: string;
  icon: React.ElementType;
  statuses: string[];
  color: string;
  bgColor: string;
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'comercial',
    label: 'Comercial',
    icon: ShoppingBag,
    statuses: ['PRODUCAO_CONCLUIDA', 'AGUARDANDO_COMERCIAL'],
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
  },
  {
    key: 'validado_comercial',
    label: 'Validado Comercial',
    icon: ShoppingBag,
    statuses: ['VALIDADO_COMERCIAL'],
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50 border-emerald-200',
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    icon: DollarSign,
    statuses: ['AGUARDANDO_FINANCEIRO'],
    color: 'text-amber-700',
    bgColor: 'bg-amber-50 border-amber-200',
  },
  {
    key: 'validado_financeiro',
    label: 'Validado Financeiro',
    icon: DollarSign,
    statuses: ['VALIDADO_FINANCEIRO'],
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50 border-emerald-200',
  },
  {
    key: 'logistica',
    label: 'Logística',
    icon: Truck,
    statuses: ['LIBERADO_LOGISTICA', 'EM_SEPARACAO'],
    color: 'text-purple-700',
    bgColor: 'bg-purple-50 border-purple-200',
  },
  {
    key: 'enviado',
    label: 'Enviado',
    icon: Package,
    statuses: ['ENVIADO'],
    color: 'text-green-700',
    bgColor: 'bg-green-50 border-green-200',
  },
];

// Defines which status a card can be moved to from a given column
const NEXT_STATUS: Record<string, string> = {
  PRODUCAO_CONCLUIDA: 'VALIDADO_COMERCIAL',
  AGUARDANDO_COMERCIAL: 'VALIDADO_COMERCIAL',
  VALIDADO_COMERCIAL: 'AGUARDANDO_FINANCEIRO',
  AGUARDANDO_FINANCEIRO: 'VALIDADO_FINANCEIRO',
  VALIDADO_FINANCEIRO: 'LIBERADO_LOGISTICA',
  LIBERADO_LOGISTICA: 'EM_SEPARACAO',
  EM_SEPARACAO: 'ENVIADO',
};

const STATUS_LABELS: Record<string, string> = {
  VALIDADO_COMERCIAL: 'Validar Comercial',
  AGUARDANDO_FINANCEIRO: 'Enviar p/ Financeiro',
  VALIDADO_FINANCEIRO: 'Validar Financeiro',
  LIBERADO_LOGISTICA: 'Liberar Logística',
  EM_SEPARACAO: 'Iniciar Separação',
  ENVIADO: 'Marcar Enviado',
};

export default function KanbanVenda() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<VendaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const allowedPerfis = ['admin', 'gestor', 'supervisor_producao', 'comercial', 'financeiro', 'logistica'];

  useEffect(() => {
    fetchCards();
    const channel = supabase
      .channel('kanban-venda-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => fetchCards())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!profile || !allowedPerfis.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchCards = async () => {
    const allStatuses = COLUMNS.flatMap(c => c.statuses);
    const { data } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, api_venda_id, cliente_nome, valor_liquido, status_atual, status_prazo, data_previsao_entrega, data_venda_api, criado_em, atualizado_em, forma_pagamento, forma_envio, cliente_endereco, observacao_comercial, observacao_financeiro, observacao_logistica, codigo_rastreio')
      .in('status_atual', allStatuses)
      .order('atualizado_em', { ascending: true });

    // Get tipo_produto from ordens_producao
    const pedidoIds = (data || []).map(p => p.id);
    let tipoMap: Record<string, string> = {};
    if (pedidoIds.length > 0) {
      const { data: ordens } = await supabase
        .from('ordens_producao')
        .select('pedido_id, tipo_produto')
        .in('pedido_id', pedidoIds);
      (ordens || []).forEach(o => {
        if (o.tipo_produto) tipoMap[o.pedido_id] = o.tipo_produto;
      });
    }

    setCards((data || []).map(p => ({ ...p, tipo_produto: tipoMap[p.id] || null })));
    setLoading(false);
  };

  const handleAdvance = async (card: VendaCard) => {
    const nextStatus = NEXT_STATUS[card.status_atual];
    if (!nextStatus) return;

    await supabase.from('pedidos').update({ status_atual: nextStatus } as any).eq('id', card.id);
    await supabase.from('pedido_historico').insert({
      pedido_id: card.id,
      usuario_id: profile!.id,
      tipo_acao: 'TRANSICAO',
      status_anterior: card.status_atual,
      status_novo: nextStatus,
      observacao: `${profile!.nome} moveu o pedido para ${STATUS_LABELS[nextStatus] || nextStatus}.`,
    });
    toast.success(`Pedido ${card.api_venda_id || card.numero_pedido} movido!`);
    fetchCards();
  };

  const openDetail = async (pedidoId: string) => {
    setSelectedId(pedidoId);
    setDetailLoading(true);
    const [rPedido, rItens, rHist] = await Promise.all([
      supabase.from('pedidos').select('*').eq('id', pedidoId).single(),
      supabase.from('pedido_itens').select('*').eq('pedido_id', pedidoId),
      supabase.from('pedido_historico').select('*, usuarios(nome)').eq('pedido_id', pedidoId).order('criado_em', { ascending: false }),
    ]);
    setDetail({ pedido: rPedido.data, itens: rItens.data || [], historico: rHist.data || [] });
    setDetailLoading(false);
  };

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string | null) => d ? format(new Date(d + 'T00:00:00'), 'dd/MM/yy') : '—';

  const isAdmin = profile && ['admin', 'gestor'].includes(profile.perfil);
  const canAdvance = (colKey: string) => {
    if (isAdmin) return true;
    if (profile?.perfil === 'comercial' && (colKey === 'comercial')) return true;
    if (profile?.perfil === 'financeiro' && (colKey === 'financeiro' || colKey === 'validado_comercial')) return true;
    if (profile?.perfil === 'logistica' && (colKey === 'validado_financeiro' || colKey === 'logistica')) return true;
    return false;
  };

  const filtered = cards.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.cliente_nome.toLowerCase().includes(s) || c.numero_pedido.toLowerCase().includes(s) || (c.api_venda_id || '').toLowerCase().includes(s);
  });

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Kanban Venda</h1>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pedido ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex gap-2 flex-wrap">
        {COLUMNS.map(col => {
          const count = filtered.filter(c => col.statuses.includes(c.status_atual)).length;
          return (
            <Badge key={col.key} variant="outline" className={`text-xs py-1 px-2.5 ${count > 0 ? col.color : 'text-muted-foreground'}`}>
              <col.icon className="h-3 w-3 mr-1" />
              {col.label}: {count}
            </Badge>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
          {COLUMNS.map(col => {
            const colCards = filtered.filter(c => col.statuses.includes(c.status_atual));
            const canMove = canAdvance(col.key);

            return (
              <div key={col.key} className="flex-shrink-0 w-[260px] flex flex-col">
                {/* Column header */}
                <div className={`rounded-t-lg border px-3 py-2 flex items-center justify-between ${col.bgColor}`}>
                  <div className="flex items-center gap-1.5">
                    <col.icon className={`h-4 w-4 ${col.color}`} />
                    <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs font-normal">{colCards.length}</Badge>
                </div>

                {/* Column body */}
                <div className="flex-1 border border-t-0 rounded-b-lg bg-muted/20 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                  {colCards.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">Nenhum pedido</p>
                  ) : colCards.map(card => {
                    const prazoCfg = STATUS_PRAZO_CONFIG[card.status_prazo || 'NO_PRAZO'];
                    const nextStatus = NEXT_STATUS[card.status_atual];
                    const headerBg = card.status_prazo === 'ATRASADO' ? 'bg-red-100 border-red-200'
                      : card.status_prazo === 'ATENCAO' ? 'bg-yellow-100 border-yellow-200'
                      : 'bg-green-50 border-green-200';

                    return (
                      <Card key={card.id} className="shadow-sm border-border/60 overflow-hidden">
                        {/* Card header */}
                        <div className={`px-2.5 py-1.5 border-b flex items-center justify-between cursor-pointer ${headerBg}`} onClick={() => openDetail(card.id)}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">{prazoCfg?.icon}</span>
                            <span className="text-xs font-semibold">{card.api_venda_id || card.numero_pedido}</span>
                          </div>
                          {card.tipo_produto && (
                            <Badge className={`text-[9px] font-normal ${TIPO_PRODUTO_BADGE[card.tipo_produto] || 'bg-muted text-muted-foreground'}`}>
                              {TIPO_PRODUTO_LABELS[card.tipo_produto] || card.tipo_produto}
                            </Badge>
                          )}
                        </div>

                        <CardContent className="p-2.5 space-y-1.5">
                          <p className="text-xs font-medium truncate">{card.cliente_nome}</p>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Valor:</span>
                            <span className="font-semibold tabular-nums">{fmt(card.valor_liquido)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Entrega:</span>
                            <span>{fmtDate(card.data_previsao_entrega)}</span>
                          </div>
                          {card.forma_pagamento && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Pagamento:</span>
                              <span className="truncate max-w-[120px]">{card.forma_pagamento}</span>
                            </div>
                          )}
                          {card.forma_envio && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Envio:</span>
                              <span className="truncate max-w-[120px]">{card.forma_envio}</span>
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground">
                            Atualizado {formatDistanceToNow(new Date(card.atualizado_em), { locale: ptBR, addSuffix: true })}
                          </div>

                          {/* Advance button */}
                          {canMove && nextStatus && (
                            <Button
                              size="sm"
                              className="w-full mt-1 h-7 text-xs"
                              onClick={(e) => { e.stopPropagation(); handleAdvance(card); }}
                            >
                              <ArrowRight className="h-3 w-3 mr-1" />
                              {STATUS_LABELS[nextStatus] || 'Avançar'}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Sheet */}
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
                  <div><span className="text-muted-foreground">Prazo:</span> <span>{STATUS_PRAZO_CONFIG[detail.pedido.status_prazo || 'NO_PRAZO']?.icon} {STATUS_PRAZO_CONFIG[detail.pedido.status_prazo || 'NO_PRAZO']?.label}</span></div>
                  <div><span className="text-muted-foreground">Prev. Entrega:</span> <span>{fmtDate(detail.pedido.data_previsao_entrega)}</span></div>
                  {detail.pedido.forma_pagamento && <div><span className="text-muted-foreground">Pagamento:</span> <span>{detail.pedido.forma_pagamento}</span></div>}
                  {detail.pedido.forma_envio && <div><span className="text-muted-foreground">Envio:</span> <span>{detail.pedido.forma_envio}</span></div>}
                  {detail.pedido.vendedor_nome && <div><span className="text-muted-foreground">Vendedor:</span> <span>{detail.pedido.vendedor_nome}</span></div>}
                  {detail.pedido.cliente_telefone && <div><span className="text-muted-foreground">Telefone:</span> <span>{detail.pedido.cliente_telefone}</span></div>}
                  {detail.pedido.cliente_email && <div><span className="text-muted-foreground">Email:</span> <span>{detail.pedido.cliente_email}</span></div>}
                  {detail.pedido.cliente_endereco && <div className="col-span-2"><span className="text-muted-foreground">Endereço:</span> <span>{detail.pedido.cliente_endereco}</span></div>}
                </div>
                {detail.pedido.observacao_comercial && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Obs. Comercial</p>
                    <p>{detail.pedido.observacao_comercial}</p>
                  </div>
                )}
                {detail.pedido.observacao_financeiro && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Obs. Financeiro</p>
                    <p>{detail.pedido.observacao_financeiro}</p>
                  </div>
                )}
                {detail.pedido.observacao_logistica && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Obs. Logística</p>
                    <p>{detail.pedido.observacao_logistica}</p>
                  </div>
                )}
                {detail.pedido.codigo_rastreio && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Rastreio</p>
                    <p className="font-medium">{detail.pedido.codigo_rastreio}</p>
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

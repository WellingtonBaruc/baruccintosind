import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { concluirEtapa } from '@/lib/producao';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, User, Search, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface KanbanCard {
  id: string;
  ordem_id: string;
  pedido_id: string;
  nome_etapa: string;
  etapa_status: string;
  ordem_sequencia: number;
  operador_id: string | null;
  operador_nome: string;
  api_venda_id: string;
  cliente_nome: string;
  tipo_produto: string;
  quantidade: number;
  status_prazo: string;
  data_previsao_entrega: string | null;
  ordem_status: string;
}

const PIPELINE_COLUMNS: Record<string, string[]> = {
  SINTETICO: ['Aguardando Início', 'Corte', 'Preparação', 'Montagem', 'Embalagem', 'Concluído'],
  TECIDO: ['Aguardando Início', 'Conferência', 'Fusionagem', 'Colagem / Viração', 'Finalização', 'Concluído'],
  FIVELA_COBERTA: ['Aguardando Início', 'Em Andamento', 'Concluído'],
};

// Map real etapa names to kanban column
function mapEtapaToColumn(etapaName: string, etapaStatus: string, ordemStatus: string): string {
  if (ordemStatus === 'AGUARDANDO') return 'Aguardando Início';
  // Map "Produção" (fivela pipeline stage) to "Em Andamento"
  if (etapaName === 'Produção') return 'Em Andamento';
  // Map final stages
  if (etapaName === 'Produção Finalizada') return 'Concluído';
  if (etapaName === 'Concluído') return 'Concluído';
  return etapaName;
}

export default function KanbanProducao() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('SINTETICO');
  const [filterMode, setFilterMode] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: string; card: KanbanCard | null }>({ open: false, type: '', card: null });

  useEffect(() => { fetchCards(); }, []);

  const fetchCards = async () => {
    const { data: etapas } = await supabase
      .from('op_etapas')
      .select(`
        id, ordem_id, nome_etapa, ordem_sequencia, operador_id, status,
        usuarios(nome),
        ordens_producao!inner(
          id, pedido_id, tipo_produto, status,
          pedidos!inner(api_venda_id, cliente_nome, status_prazo, data_previsao_entrega, status_api)
        )
      `)
      .in('status', ['EM_ANDAMENTO', 'CONCLUIDA', 'PENDENTE'])
      .neq('ordens_producao.pedidos.status_api', 'Finalizado');

    if (!etapas) { setLoading(false); return; }

    const pedidoIds = [...new Set(etapas.map((e: any) => e.ordens_producao.pedido_id))];
    const { data: itens } = await supabase
      .from('pedido_itens')
      .select('pedido_id, quantidade, categoria_produto, descricao_produto')
      .in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']);

    const qtdMap = new Map<string, number>();
    for (const item of (itens || [])) {
      const cat = (item.categoria_produto || '').toUpperCase();
      const desc = (item.descricao_produto || '').toUpperCase();
      if (cat === 'ADICIONAIS' || desc.includes('ADICIONAL')) continue;
      qtdMap.set(item.pedido_id, (qtdMap.get(item.pedido_id) || 0) + item.quantidade);
    }

    // For each ordem, pick the active etapa (EM_ANDAMENTO) or last CONCLUIDA
    const ordemMap = new Map<string, any>();
    for (const e of etapas as any[]) {
      const key = e.ordem_id;
      const existing = ordemMap.get(key);
      if (!existing) { ordemMap.set(key, e); continue; }
      // Prefer EM_ANDAMENTO
      if (e.status === 'EM_ANDAMENTO') ordemMap.set(key, e);
      else if (existing.status !== 'EM_ANDAMENTO' && e.ordem_sequencia > existing.ordem_sequencia) ordemMap.set(key, e);
    }

    const kanbanCards: KanbanCard[] = Array.from(ordemMap.values()).map((e: any) => ({
      id: e.id,
      ordem_id: e.ordem_id,
      pedido_id: e.ordens_producao.pedido_id,
      nome_etapa: e.nome_etapa,
      etapa_status: e.status,
      ordem_sequencia: e.ordem_sequencia,
      operador_id: e.operador_id,
      operador_nome: (e.usuarios as any)?.nome || '',
      api_venda_id: e.ordens_producao.pedidos.api_venda_id || '—',
      cliente_nome: e.ordens_producao.pedidos.cliente_nome,
      tipo_produto: e.ordens_producao.tipo_produto || 'OUTROS',
      quantidade: qtdMap.get(e.ordens_producao.pedido_id) || 0,
      status_prazo: e.ordens_producao.pedidos.status_prazo || 'NO_PRAZO',
      data_previsao_entrega: e.ordens_producao.pedidos.data_previsao_entrega,
      ordem_status: e.ordens_producao.status,
    }));

    setCards(kanbanCards);
    setLoading(false);
  };

  const isSupervisor = profile && ['admin', 'gestor', 'supervisor_producao'].includes(profile.perfil);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !profile) return;
    const destCol = result.destination.droppableId;
    const card = cards.find(c => c.id === result.draggableId);
    if (!card) return;

    const columns = PIPELINE_COLUMNS[activeTab] || [];
    const currentCol = mapEtapaToColumn(card.nome_etapa, card.etapa_status, card.ordem_status);
    if (currentCol === destCol) return;

    const srcIdx = columns.indexOf(currentCol);
    const destIdx = columns.indexOf(destCol);

    // No dragging backwards
    if (destIdx <= srcIdx) {
      toast.error('Não é possível voltar etapas.');
      return;
    }
    // Only one step at a time
    if (destIdx !== srcIdx + 1) {
      toast.error('Só é possível avançar uma etapa por vez.');
      return;
    }
    if (!isSupervisor) {
      toast.error('Apenas supervisores podem arrastar cards.');
      return;
    }

    // Check cross-pipeline notifications
    if (destCol === 'Concluído' && activeTab === 'TECIDO') {
      setConfirmDialog({ open: true, type: 'TECIDO_CONCLUIDO', card });
      return;
    }
    if (destCol === 'Concluído' && activeTab === 'FIVELA_COBERTA') {
      setConfirmDialog({ open: true, type: 'FIVELA_CONCLUIDA', card });
      return;
    }

    await advanceCard(card);
  };

  const advanceCard = async (card: KanbanCard, obs?: string) => {
    try {
      await concluirEtapa(card.id, card.ordem_id, card.pedido_id, profile!.id, obs || `Avançado via kanban por ${profile!.nome}`);
      toast.success('Etapa avançada com sucesso');
      fetchCards();
    } catch {
      toast.error('Erro ao avançar etapa');
    }
  };

  const handleCrossPipelineConfirm = async () => {
    const { card, type } = confirmDialog;
    if (!card || !profile) return;

    // First advance the current card to Concluído
    await advanceCard(card, type === 'TECIDO_CONCLUIDO'
      ? `Tecido concluído — encaminhado para Preparação do Sintético. Confirmado por ${profile.nome}`
      : `Fivelas prontas — encaminhadas para Embalagem do Sintético. Confirmado por ${profile.nome}`
    );

    toast.success(type === 'TECIDO_CONCLUIDO'
      ? `Tecido concluído — card enviado para Preparação do Sintético (#${card.api_venda_id})`
      : `Fivelas prontas — card enviado para Embalagem do Sintético (#${card.api_venda_id})`
    );

    setConfirmDialog({ open: false, type: '', card: null });
  };

  // Filter logic
  const getFilteredCards = (tipo: string) => {
    let filtered = cards.filter(c => c.tipo_produto === tipo);
    if (profile?.perfil === 'operador_producao') {
      filtered = filtered.filter(c => c.operador_id === profile.id);
    }
    if (filterMode === 'ATRASADO') filtered = filtered.filter(c => c.status_prazo === 'ATRASADO');
    if (filterMode === 'SEM_OPERADOR') filtered = filtered.filter(c => !c.operador_id);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.api_venda_id.toLowerCase().includes(q) || c.cliente_nome.toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  const getCardsForColumn = (tipoCards: KanbanCard[], column: string) =>
    tipoCards.filter(c => mapEtapaToColumn(c.nome_etapa, c.etapa_status, c.ordem_status) === column);

  const prazoClasses: Record<string, string> = {
    ATRASADO: 'border-l-destructive bg-destructive/5',
    ATENCAO: 'border-l-[hsl(var(--warning))] bg-[hsl(var(--warning))]/5',
    NO_PRAZO: 'border-l-[hsl(var(--success))]',
  };

  const prazoBadge: Record<string, { label: string; cls: string }> = {
    ATRASADO: { label: 'Atrasado', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
    ATENCAO: { label: 'Atenção', cls: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30' },
    NO_PRAZO: { label: 'No prazo', cls: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' },
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const tabTypes = ['SINTETICO', 'TECIDO', 'FIVELA_COBERTA'] as const;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Kanban de Produção</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar venda ou cliente..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 w-[220px]"
            />
          </div>
          <Select value={filterMode} onValueChange={setFilterMode}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ATRASADO">Atrasados</SelectItem>
              <SelectItem value="SEM_OPERADOR">Sem operador</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {tabTypes.map(t => {
            const count = getFilteredCards(t).length;
            return (
              <TabsTrigger key={t} value={t} className="gap-1.5">
                {TIPO_PRODUTO_LABELS[t] || t}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{count}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabTypes.map(tipo => {
          const columns = PIPELINE_COLUMNS[tipo];
          const tipoCards = getFilteredCards(tipo);

          return (
            <TabsContent key={tipo} value={tipo}>
              <DragDropContext onDragEnd={handleDragEnd}>
                <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '65vh' }}>
                  {columns.map(col => {
                    const colCards = getCardsForColumn(tipoCards, col);
                    return (
                      <Droppable droppableId={col} key={col}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-shrink-0 w-[250px] rounded-xl border border-border/60 bg-muted/30 p-2 transition-colors ${snapshot.isDraggingOver ? 'bg-accent/40' : ''}`}
                          >
                            <div className="flex items-center justify-between px-2 py-2 mb-1">
                              <h3 className="text-sm font-semibold text-foreground truncate">{col}</h3>
                              <Badge variant="outline" className="text-[10px] ml-1">{colCards.length}</Badge>
                            </div>
                            <div className="space-y-2 min-h-[80px]">
                              {colCards.map((card, index) => (
                                <Draggable key={card.id} draggableId={card.id} index={index} isDragDisabled={!isSupervisor}>
                                  {(prov, snap) => (
                                    <div
                                      ref={prov.innerRef}
                                      {...prov.draggableProps}
                                      {...prov.dragHandleProps}
                                      className={`rounded-lg border bg-card p-3 shadow-sm border-l-4 ${prazoClasses[card.status_prazo] || 'border-l-border'} ${snap.isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''}`}
                                    >
                                      <p className="font-bold text-base leading-tight">{card.api_venda_id}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{card.cliente_nome}</p>
                                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        <Badge className={`text-[10px] font-normal ${TIPO_PRODUTO_BADGE[card.tipo_produto] || 'bg-muted text-muted-foreground border-border'}`}>
                                          {TIPO_PRODUTO_LABELS[card.tipo_produto] || card.tipo_produto}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">{card.quantidade} un</span>
                                        <Badge variant="outline" className={`text-[10px] ${prazoBadge[card.status_prazo]?.cls || ''}`}>
                                          {prazoBadge[card.status_prazo]?.label || '—'}
                                        </Badge>
                                      </div>
                                      {card.data_previsao_entrega && (
                                        <p className="text-[10px] text-muted-foreground mt-1.5">
                                          Entrega: {new Date(card.data_previsao_entrega + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                                        <User className="h-3 w-3" />
                                        {card.operador_nome
                                          ? <span>{card.operador_nome}</span>
                                          : <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">Sem operador</Badge>
                                        }
                                      </div>
                                      {/* Operator confirm button */}
                                      {profile?.perfil === 'operador_producao' && card.operador_id === profile.id && col !== 'Aguardando Início' && col !== 'Concluído' && (
                                        <Button
                                          size="sm"
                                          className="w-full mt-2 h-8 text-xs"
                                          onClick={() => advanceCard(card, `Concluído pelo operador ${profile.nome}`)}
                                        >
                                          <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmar conclusão
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          </div>
                        )}
                      </Droppable>
                    );
                  })}
                </div>
              </DragDropContext>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Cross-pipeline confirmation dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={o => !o && setConfirmDialog({ open: false, type: '', card: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.type === 'TECIDO_CONCLUIDO'
                ? 'Tecido concluído — confirmar entrada no Sintético'
                : 'Fivelas prontas — confirmar entrega para Sintético'
              }
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDialog.type === 'TECIDO_CONCLUIDO'
              ? `Confirmar que o tecido do pedido #${confirmDialog.card?.api_venda_id} está pronto e deve entrar na Preparação do Kanban Sintético?`
              : `Confirmar que as fivelas do pedido #${confirmDialog.card?.api_venda_id} estão prontas e devem entrar na Embalagem do Kanban Sintético?`
            }
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, type: '', card: null })}>Cancelar</Button>
            <Button onClick={handleCrossPipelineConfirm}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

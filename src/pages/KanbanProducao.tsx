import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { concluirEtapa } from '@/lib/producao';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE, STATUS_PRAZO_CONFIG } from '@/lib/pcp';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, User } from 'lucide-react';
import { toast } from 'sonner';

interface KanbanCard {
  id: string; // op_etapa id
  ordem_id: string;
  pedido_id: string;
  nome_etapa: string;
  ordem_sequencia: number;
  operador_id: string | null;
  operador_nome: string;
  api_venda_id: string;
  cliente_nome: string;
  tipo_produto: string;
  quantidade: number;
  status_prazo: string;
  data_previsao_entrega: string | null;
}

const PIPELINE_ETAPAS: Record<string, string[]> = {
  SINTETICO: ['Corte', 'Preparação', 'Montagem', 'Embalagem', 'Produção Finalizada'],
  TECIDO: ['Conferência', 'Fusionagem', 'Colagem / Viração', 'Finalização', 'Concluído'],
  FIVELA_COBERTA: ['Conferência', 'Produção', 'Embalagem'],
};

export default function KanbanProducao() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFilter, setTipoFilter] = useState('SINTETICO');
  const [prazoFilter, setPrazoFilter] = useState('all');

  useEffect(() => { fetchCards(); }, []);

  const fetchCards = async () => {
    // Get all active ordens with their active etapa
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

    // Get quantities
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

    // Build kanban cards — one per etapa that is EM_ANDAMENTO or CONCLUIDA (for concluded column)
    const kanbanCards: KanbanCard[] = etapas
      .filter((e: any) => e.status === 'EM_ANDAMENTO' || e.status === 'CONCLUIDA')
      .map((e: any) => ({
        id: e.id,
        ordem_id: e.ordem_id,
        pedido_id: e.ordens_producao.pedido_id,
        nome_etapa: e.nome_etapa,
        ordem_sequencia: e.ordem_sequencia,
        operador_id: e.operador_id,
        operador_nome: (e.usuarios as any)?.nome || 'Sem operador',
        api_venda_id: e.ordens_producao.pedidos.api_venda_id || '—',
        cliente_nome: e.ordens_producao.pedidos.cliente_nome,
        tipo_produto: e.ordens_producao.tipo_produto || 'OUTROS',
        quantidade: qtdMap.get(e.ordens_producao.pedido_id) || 0,
        status_prazo: e.ordens_producao.pedidos.status_prazo || 'NO_PRAZO',
        data_previsao_entrega: e.ordens_producao.pedidos.data_previsao_entrega,
      }));

    setCards(kanbanCards);
    setLoading(false);
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !profile) return;
    const cardId = result.draggableId;
    const destEtapa = result.destination.droppableId;
    const card = cards.find(c => c.id === cardId);
    if (!card || card.nome_etapa === destEtapa) return;

    // Check if supervisor or admin
    if (!['admin', 'gestor', 'supervisor_producao'].includes(profile.perfil)) {
      toast.error('Apenas supervisores podem arrastar cards.');
      return;
    }

    const etapas = PIPELINE_ETAPAS[tipoFilter] || [];
    const srcIdx = etapas.indexOf(card.nome_etapa);
    const destIdx = etapas.indexOf(destEtapa);

    // Only allow advancing one step
    if (destIdx !== srcIdx + 1) {
      toast.error('Só é possível avançar uma etapa por vez.');
      return;
    }

    try {
      await concluirEtapa(card.id, card.ordem_id, card.pedido_id, profile.id, `Avançado via kanban por ${profile.nome}`);
      toast.success(`Avançado para ${destEtapa}`);
      fetchCards();
    } catch (err) {
      toast.error('Erro ao avançar etapa');
    }
  };

  const etapas = PIPELINE_ETAPAS[tipoFilter] || [];

  const filteredCards = cards.filter(c => {
    if (c.tipo_produto !== tipoFilter) return false;
    if (prazoFilter === 'ATRASADO' && c.status_prazo !== 'ATRASADO') return false;
    // For operador, show only assigned
    if (profile?.perfil === 'operador_producao' && c.operador_id !== profile.id) return false;
    return true;
  });

  const getCardsForEtapa = (etapa: string) => filteredCards.filter(c => c.nome_etapa === etapa);

  const prazoColors: Record<string, string> = {
    ATRASADO: 'border-l-destructive',
    ATENCAO: 'border-l-[hsl(var(--warning))]',
    NO_PRAZO: 'border-l-[hsl(var(--success))]',
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Kanban</h1>
        <div className="flex gap-2">
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SINTETICO">Sintético</SelectItem>
              <SelectItem value="TECIDO">Tecido</SelectItem>
              <SelectItem value="FIVELA_COBERTA">Fivela Coberta</SelectItem>
            </SelectContent>
          </Select>
          <Select value={prazoFilter} onValueChange={setPrazoFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ATRASADO">Atrasados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
          {etapas.map(etapa => {
            const colCards = getCardsForEtapa(etapa);
            return (
              <Droppable droppableId={etapa} key={etapa}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-shrink-0 w-[260px] rounded-xl border border-border/60 bg-muted/30 p-2 transition-colors ${snapshot.isDraggingOver ? 'bg-accent/40' : ''}`}
                  >
                    <div className="flex items-center justify-between px-2 py-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground">{etapa}</h3>
                      <Badge variant="outline" className="text-xs">{colCards.length}</Badge>
                    </div>
                    <div className="space-y-2 min-h-[100px]">
                      {colCards.map((card, index) => (
                        <Draggable key={card.id} draggableId={card.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`rounded-lg border bg-card p-3 shadow-sm border-l-4 ${prazoColors[card.status_prazo] || 'border-l-border'} ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''}`}
                            >
                              <p className="font-semibold text-sm">{card.api_venda_id}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{card.cliente_nome}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge className={`text-[10px] font-normal ${TIPO_PRODUTO_BADGE[card.tipo_produto] || 'bg-muted text-muted-foreground border-border'}`}>
                                  {TIPO_PRODUTO_LABELS[card.tipo_produto] || card.tipo_produto}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">{card.quantidade} un</span>
                              </div>
                              <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                                <User className="h-3 w-3" />
                                <span>{card.operador_nome}</span>
                              </div>
                              {card.data_previsao_entrega && (
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  Entrega: {new Date(card.data_previsao_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </p>
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
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE, STATUS_PRAZO_CONFIG } from '@/lib/pcp';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, X, Play, CalendarDays, Users } from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PERFIS_ALLOWED = ['admin', 'gestor', 'supervisor_producao'];

interface OrdemItem {
  id: string;
  pedido_id: string;
  tipo_produto: string | null;
  status: string;
  programado_para_hoje: boolean;
  pedidos: {
    numero_pedido: string;
    cliente_nome: string;
    data_previsao_entrega: string | null;
    status_prazo: string | null;
    status_atual: string;
  };
  pipeline_producao: { nome: string };
  quantidade_itens?: number;
}

export default function ProgramacaoDia() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ordens, setOrdens] = useState<OrdemItem[]>([]);
  const [operadores, setOperadores] = useState<any[]>([]);
  const [operadorDialog, setOperadorDialog] = useState<{ open: boolean; ordemId: string }>({ open: false, ordemId: '' });
  const [selectedOperador, setSelectedOperador] = useState('');

  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
      .from('ordens_producao')
      .select(`
        id, pedido_id, tipo_produto, status, programado_para_hoje,
        pedidos!inner(numero_pedido, cliente_nome, data_previsao_entrega, status_prazo, status_atual),
        pipeline_producao(nome)
      `)
      .neq('pedidos.status_api', 'Finalizado')
      .in('pedidos.status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO'])
      .in('status', ['AGUARDANDO', 'EM_ANDAMENTO']);

    // Get item quantities
    if (data) {
      const pedidoIds = [...new Set(data.map((o: any) => o.pedido_id))];
      const { data: itens } = await supabase
        .from('pedido_itens')
        .select('pedido_id, quantidade, categoria_produto, descricao_produto')
        .in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']);

      const qtdMap: Record<string, number> = {};
      for (const item of (itens || [])) {
        const cat = (item.categoria_produto || '').toUpperCase();
        const desc = (item.descricao_produto || '').toUpperCase();
        if (cat === 'ADICIONAIS' || desc.includes('ADICIONAL')) continue;
        qtdMap[item.pedido_id] = (qtdMap[item.pedido_id] || 0) + item.quantidade;
      }

      setOrdens(data.map((o: any) => ({ ...o, quantidade_itens: qtdMap[o.pedido_id] || 0 })));
    }

    const { data: ops } = await supabase
      .from('usuarios')
      .select('id, nome')
      .eq('perfil', 'operador_producao')
      .eq('ativo', true);
    setOperadores(ops || []);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!profile || !PERFIS_ALLOWED.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const filaDisponivel = ordens
    .filter(o => !o.programado_para_hoje && o.pedidos.status_atual === 'AGUARDANDO_PRODUCAO')
    .sort((a, b) => {
      const da = a.pedidos.data_previsao_entrega || '9999-12-31';
      const db = b.pedidos.data_previsao_entrega || '9999-12-31';
      return da.localeCompare(db);
    });

  const programados = ordens.filter(o => o.programado_para_hoje);
  const totalUnidadesProgramadas = programados.reduce((acc, o) => acc + (o.quantidade_itens || 0), 0);

  const handleAdicionarAoDia = async (ordemId: string) => {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('ordens_producao').update({
      programado_para_hoje: true,
      data_programacao: today,
    } as any).eq('id', ordemId);
    toast.success('Adicionado à programação do dia');
    fetchData();
  };

  const handleRemoverDoDia = async (ordemId: string) => {
    await supabase.from('ordens_producao').update({
      programado_para_hoje: false,
      data_programacao: null,
    } as any).eq('id', ordemId);
    toast.success('Removido da programação');
    fetchData();
  };

  const handleIniciarProducao = async (ordem: OrdemItem) => {
    // Update pedido status to EM_PRODUCAO
    await supabase.from('pedidos').update({ status_atual: 'EM_PRODUCAO' } as any).eq('id', ordem.pedido_id);
    // Update ordem status
    await supabase.from('ordens_producao').update({ status: 'EM_ANDAMENTO' } as any).eq('id', ordem.id);
    // Start first etapa
    const { data: etapas } = await supabase
      .from('op_etapas')
      .select('id')
      .eq('ordem_id', ordem.id)
      .eq('status', 'PENDENTE')
      .order('ordem_sequencia')
      .limit(1);
    if (etapas && etapas.length > 0) {
      await supabase.from('op_etapas').update({
        status: 'EM_ANDAMENTO',
        iniciado_em: new Date().toISOString(),
      } as any).eq('id', etapas[0].id);
    }
    // Record history
    await supabase.from('pedido_historico').insert({
      pedido_id: ordem.pedido_id,
      usuario_id: profile!.id,
      tipo_acao: 'TRANSICAO',
      status_anterior: 'AGUARDANDO_PRODUCAO',
      status_novo: 'EM_PRODUCAO',
      observacao: 'Produção iniciada via programação do dia',
    });
    toast.success('Produção iniciada!');
    fetchData();
  };

  const handleAtribuirOperador = async () => {
    if (!selectedOperador) return;
    const { data: etapas } = await supabase
      .from('op_etapas')
      .select('id')
      .eq('ordem_id', operadorDialog.ordemId)
      .in('status', ['EM_ANDAMENTO', 'PENDENTE'])
      .order('ordem_sequencia')
      .limit(1);
    if (etapas && etapas.length > 0) {
      await supabase.from('op_etapas').update({ operador_id: selectedOperador } as any).eq('id', etapas[0].id);
    }
    toast.success('Operador atribuído');
    setOperadorDialog({ open: false, ordemId: '' });
    setSelectedOperador('');
    fetchData();
  };

  const dataEntregaColor = (dateStr: string | null) => {
    if (!dateStr) return 'text-muted-foreground';
    const d = parseISO(dateStr);
    if (isPast(d) && !isToday(d)) return 'text-red-600 font-semibold';
    if (isToday(d) || isTomorrow(d)) return 'text-yellow-600 font-semibold';
    return 'text-green-600';
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6" /> Programação do Dia
        </h1>
        <p className="text-muted-foreground mt-0.5">
          {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Fila disponível */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fila Disponível ({filaDisponivel.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[65vh] overflow-y-auto">
            {filaDisponivel.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido aguardando produção.</p>}
            {filaDisponivel.map(o => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs ${dataEntregaColor(o.pedidos.data_previsao_entrega)}`}>
                      {o.pedidos.data_previsao_entrega ? format(parseISO(o.pedidos.data_previsao_entrega), 'dd/MM') : '—'}
                    </span>
                    <span className="font-medium text-sm">{o.pedidos.numero_pedido}</span>
                    <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[o.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                      {TIPO_PRODUTO_LABELS[o.tipo_produto || ''] || 'Outro'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{o.pedidos.cliente_nome}</p>
                  <p className="text-xs text-muted-foreground">{o.quantidade_itens || 0} un</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleAdicionarAoDia(o.id)}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Programados para hoje */}
        <Card className="border-primary/30 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Programados para Hoje ({programados.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[65vh] overflow-y-auto">
            {programados.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido programado para hoje.</p>}
            {programados.map(o => (
              <div key={o.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{o.pedidos.numero_pedido}</span>
                    <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[o.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                      {TIPO_PRODUTO_LABELS[o.tipo_produto || ''] || 'Outro'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{o.quantidade_itens || 0} un</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemoverDoDia(o.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground truncate">{o.pedidos.cliente_nome}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setOperadorDialog({ open: true, ordemId: o.id }); }}>
                    <Users className="h-3 w-3 mr-1" /> Operador
                  </Button>
                  {o.pedidos.status_atual === 'AGUARDANDO_PRODUCAO' && (
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleIniciarProducao(o)}>
                      <Play className="h-3 w-3 mr-1" /> Iniciar Produção
                    </Button>
                  )}
                  {o.pedidos.status_atual === 'EM_PRODUCAO' && (
                    <Badge className="bg-green-500/15 text-green-700 text-xs">Em andamento</Badge>
                  )}
                </div>
              </div>
            ))}
            {programados.length > 0 && (
              <div className="border-t pt-3 mt-3 text-sm text-muted-foreground text-right">
                Total programado: <span className="font-semibold text-foreground">{totalUnidadesProgramadas.toLocaleString('pt-BR')} unidades</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog atribuir operador */}
      <Dialog open={operadorDialog.open} onOpenChange={(open) => setOperadorDialog({ ...operadorDialog, open })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Atribuir Operador</DialogTitle></DialogHeader>
          <div className="py-3">
            <Label>Operador</Label>
            <Select value={selectedOperador} onValueChange={setSelectedOperador}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {operadores.map(op => (
                  <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOperadorDialog({ open: false, ordemId: '' })}>Cancelar</Button>
            <Button onClick={handleAtribuirOperador} disabled={!selectedOperador}>Atribuir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

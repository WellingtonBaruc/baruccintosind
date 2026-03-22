import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import {
  OrdemProducao, OpEtapa, PedidoHistorico, Pedido, PedidoItem,
  STATUS_ORDEM_CONFIG, STATUS_ETAPA_CONFIG,
  iniciarEtapa, concluirEtapa, aprovarOrdem, rejeitarOrdem,
} from '@/lib/producao';
import { agruparParaCorte, classificarProduto, TIPO_PRODUTO_LABELS } from '@/lib/pcp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Play, CheckCircle2, XCircle, Shield, Clock, User, MessageSquare, Scissors, Package, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function DetalheOrdem() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [ordem, setOrdem] = useState<OrdemProducao | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [pedidoItens, setPedidoItens] = useState<PedidoItem[]>([]);
  const [etapas, setEtapas] = useState<OpEtapa[]>([]);
  const [historico, setHistorico] = useState<PedidoHistorico[]>([]);
  const [operadores, setOperadores] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Concluir dialog
  const [concluirDialogOpen, setConcluirDialogOpen] = useState(false);
  const [concluirEtapaId, setConcluirEtapaId] = useState('');
  const [observacaoConcluir, setObservacaoConcluir] = useState('');

  // Rejeitar dialog
  const [rejeitarDialogOpen, setRejeitarDialogOpen] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  // Tecido→Sintetico transfer dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  // Preparação sub-etapas state
  const [subEtapas, setSubEtapas] = useState<{ nome: string; checked: boolean; operadorId: string; quantidade: number }[]>([
    { nome: 'Costura', checked: false, operadorId: '', quantidade: 0 },
    { nome: 'Ilhós', checked: false, operadorId: '', quantidade: 0 },
    { nome: 'Fechamento máquina', checked: false, operadorId: '', quantidade: 0 },
  ]);
  const [subEtapaCustom, setSubEtapaCustom] = useState('');

  // Montagem operadores
  const [montagemOperadores, setMontagemOperadores] = useState<string[]>([]);

  // Corte grupos
  const [corteGrupos, setCorteGrupos] = useState<ReturnType<typeof agruparParaCorte>>([]);
  const [corteGruposConcluidos, setCorteGruposConcluidos] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    if (!id) return;
    const { data: ordemData } = await supabase
      .from('ordens_producao')
      .select('*, pipeline_producao(nome)')
      .eq('id', id)
      .single();

    if (!ordemData) { setLoading(false); return; }
    setOrdem(ordemData);

    const [pedidoRes, etapasRes, historicoRes, itensRes, operadoresRes] = await Promise.all([
      supabase.from('pedidos').select('*').eq('id', ordemData.pedido_id).single(),
      supabase.from('op_etapas').select('*, usuarios(nome)').eq('ordem_id', id).order('ordem_sequencia'),
      supabase.from('pedido_historico').select('*, usuarios(nome)').eq('pedido_id', ordemData.pedido_id).order('criado_em', { ascending: false }),
      supabase.from('pedido_itens').select('*').eq('pedido_id', ordemData.pedido_id),
      supabase.from('usuarios').select('id, nome').eq('ativo', true).in('perfil', ['operador_producao', 'supervisor_producao']),
    ]);

    setPedido(pedidoRes.data);
    setEtapas(etapasRes.data || []);
    setHistorico(historicoRes.data || []);
    setPedidoItens(itensRes.data || []);
    setOperadores(operadoresRes.data || []);

    // Setup corte groups if applicable
    if (ordemData.tipo_produto === 'SINTETICO' && itensRes.data) {
      const sinteticoItens = itensRes.data
        .filter((i: any) => {
          const tipo = classificarProduto(i.descricao_produto);
          return tipo === 'SINTETICO';
        })
        .map((i: any) => ({
          id: i.id,
          descricao: i.descricao_produto,
          referencia: i.referencia_produto,
          observacao_producao: i.observacao_producao,
          quantidade: i.quantidade,
        }));
      setCorteGrupos(agruparParaCorte(sinteticoItens));
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!ordem || !pedido || !profile) return <div className="text-center py-20 text-muted-foreground">Ordem não encontrada.</div>;

  const ordemCfg = STATUS_ORDEM_CONFIG[ordem.status] || { label: ordem.status, color: '' };
  const isOperador = ['operador_producao', 'supervisor_producao', 'admin'].includes(profile.perfil);
  const isSupervisor = ['supervisor_producao', 'admin'].includes(profile.perfil);
  const aguardandoAprovacao = ordem.status === 'CONCLUIDA' && !ordem.aprovado_em;

  const etapaAtiva = etapas.find(e => e.status === 'EM_ANDAMENTO');
  const isCorteActive = etapaAtiva?.nome_etapa === 'Corte' && ordem.tipo_produto === 'SINTETICO';
  const isPreparacaoActive = etapaAtiva?.nome_etapa === 'Preparação';
  const isMontagemActive = etapaAtiva?.nome_etapa === 'Montagem';
  const isTecidoConcluido = etapaAtiva?.nome_etapa === 'Concluído' && ordem.tipo_produto === 'TECIDO';

  const handleIniciar = async (etapaId: string) => {
    setActionLoading(true);
    try {
      await iniciarEtapa(etapaId, profile.id, pedido.id);
      toast.success('Etapa iniciada!');
      fetchData();
    } catch { toast.error('Erro ao iniciar etapa.'); }
    setActionLoading(false);
  };

  const handleConcluir = async () => {
    setActionLoading(true);
    try {
      await concluirEtapa(concluirEtapaId, ordem.id, pedido.id, profile.id, observacaoConcluir);
      toast.success('Etapa concluída!');
      setConcluirDialogOpen(false);
      setObservacaoConcluir('');
      fetchData();
    } catch { toast.error('Erro ao concluir etapa.'); }
    setActionLoading(false);
  };

  const handleAprovar = async () => {
    setActionLoading(true);
    try {
      await aprovarOrdem(ordem.id, pedido.id, profile.id);
      toast.success('Ordem aprovada!');
      fetchData();
    } catch { toast.error('Erro ao aprovar.'); }
    setActionLoading(false);
  };

  const handleRejeitar = async () => {
    if (!motivoRejeicao.trim()) { toast.error('Motivo é obrigatório.'); return; }
    setActionLoading(true);
    try {
      await rejeitarOrdem(ordem.id, pedido.id, profile.id, motivoRejeicao);
      toast.success('Ordem rejeitada.');
      setRejeitarDialogOpen(false);
      setMotivoRejeicao('');
      fetchData();
    } catch { toast.error('Erro ao rejeitar.'); }
    setActionLoading(false);
  };

  const handleCorteGrupoConcluir = (idx: number) => {
    setCorteGruposConcluidos(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const handleCorteConcluirTodos = async () => {
    if (corteGruposConcluidos.size < corteGrupos.length) {
      toast.error('Conclua todos os grupos de corte antes de finalizar.');
      return;
    }
    if (!etapaAtiva) return;
    setConcluirEtapaId(etapaAtiva.id);
    setObservacaoConcluir(`Corte concluído — ${corteGrupos.length} grupos processados.`);
    setConcluirDialogOpen(true);
  };

  const handlePreparacaoConcluir = async () => {
    const checked = subEtapas.filter(s => s.checked);
    if (checked.length === 0) { toast.error('Marque pelo menos uma sub-etapa.'); return; }
    if (!etapaAtiva) return;
    const obs = checked.map(s => `${s.nome}: qtd ${s.quantidade}`).join('; ');
    setConcluirEtapaId(etapaAtiva.id);
    setObservacaoConcluir(`Preparação: ${obs}`);
    setConcluirDialogOpen(true);
  };

  const handleMontagemConcluir = async () => {
    if (montagemOperadores.length === 0) { toast.error('Selecione pelo menos um operador.'); return; }
    if (!etapaAtiva) return;
    const nomes = montagemOperadores.map(opId => operadores.find(o => o.id === opId)?.nome || opId).join(', ');
    setConcluirEtapaId(etapaAtiva.id);
    setObservacaoConcluir(`Montagem — Operadores: ${nomes}`);
    setConcluirDialogOpen(true);
  };

  const handleTecidoTransfer = async () => {
    setActionLoading(true);
    try {
      // Concluir etapa atual
      if (etapaAtiva) {
        await concluirEtapa(etapaAtiva.id, ordem.id, pedido.id, profile.id, 'Tecido concluído — pronto para transferir ao Sintético.');
      }

      // Create new Sintético order starting from Preparação (skip Corte)
      const pipelineId = '00000000-0000-0000-0000-000000000001';
      const { data: etapasPipeline } = await supabase
        .from('pipeline_etapas')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('ordem');

      if (etapasPipeline) {
        // Count existing orders
        const { count } = await supabase.from('ordens_producao').select('*', { count: 'exact', head: true }).eq('pedido_id', pedido.id);
        
        const { data: novaOrdem } = await supabase
          .from('ordens_producao')
          .insert({
            pedido_id: pedido.id,
            pipeline_id: pipelineId,
            sequencia: (count || 0) + 1,
            status: 'EM_ANDAMENTO',
            tipo_produto: 'SINTETICO',
          })
          .select('id')
          .single();

        if (novaOrdem) {
          // Skip Corte (first step), start from Preparação
          const etapasSemCorte = etapasPipeline.filter(e => e.nome !== 'Corte');
          const opEtapas = etapasSemCorte.map((e, idx) => ({
            ordem_id: novaOrdem.id,
            pipeline_etapa_id: e.id,
            nome_etapa: e.nome,
            ordem_sequencia: e.ordem,
            status: (idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE') as 'EM_ANDAMENTO' | 'PENDENTE',
            ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
          }));
          await supabase.from('op_etapas').insert(opEtapas);
        }
      }

      await supabase.from('pedido_historico').insert({
        pedido_id: pedido.id,
        usuario_id: profile.id,
        tipo_acao: 'TRANSICAO',
        observacao: 'Tecido concluído — ordem de Preparação Sintético criada (Corte pulado).',
      });

      toast.success('Tecido concluído! Ordem de Sintético criada.');
      setTransferDialogOpen(false);
      fetchData();
    } catch { toast.error('Erro na transferência.'); }
    setActionLoading(false);
  };

  const totalItens = pedidoItens.reduce((sum, i) => sum + i.quantidade, 0);
  const tipoLabel = TIPO_PRODUTO_LABELS[ordem.tipo_produto || ''] || ordem.tipo_produto || '—';

  return (
    <div className="animate-fade-in space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/producao')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{pedido.numero_pedido}</h1>
            <Badge className={ordemCfg.color}>{ordemCfg.label}</Badge>
            <Badge variant="outline">{tipoLabel}</Badge>
          </div>
          <p className="text-muted-foreground mt-0.5">{pedido.cliente_nome} • {pedido.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Specialized stage views */}
          {isCorteActive && etapaAtiva && (
            <Card className="border-primary/30 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scissors className="h-4 w-4" /> Etapa de Corte — Agrupamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {corteGrupos.map((group, idx) => {
                  const done = corteGruposConcluidos.has(idx);
                  return (
                    <div key={idx} className={`border rounded-lg p-3 ${done ? 'border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/5' : 'border-border'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono">{group.largura}</Badge>
                          <Badge variant="outline">{group.material}</Badge>
                          <Badge variant="outline">{group.tamanho}</Badge>
                          <Badge variant="outline">{group.cor}</Badge>
                        </div>
                        <span className="font-semibold text-sm">×{group.quantidadeTotal}</span>
                      </div>
                      {group.itens.map(item => (
                        <div key={item.id} className="text-xs mb-1">
                          <span className="text-muted-foreground">{item.descricao}</span>
                          <span className="ml-1 font-medium">×{item.quantidade}</span>
                          {item.observacao_producao && (
                            <div className="mt-0.5 bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5 text-warning">
                              {item.observacao_producao}
                            </div>
                          )}
                        </div>
                      ))}
                      {!done && (
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => handleCorteGrupoConcluir(idx)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir grupo
                        </Button>
                      )}
                      {done && <p className="text-xs text-[hsl(var(--success))] mt-1">✓ Grupo concluído</p>}
                    </div>
                  );
                })}
                <Button className="w-full" onClick={handleCorteConcluirTodos} disabled={actionLoading}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar Corte
                </Button>
              </CardContent>
            </Card>
          )}

          {isPreparacaoActive && etapaAtiva && (
            <Card className="border-primary/30 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" /> Etapa de Preparação — Checklist
                </CardTitle>
                <p className="text-xs text-muted-foreground">Total de itens do pedido: {totalItens}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {subEtapas.map((sub, idx) => (
                  <div key={idx} className="flex items-start gap-3 border rounded-lg p-3">
                    <Checkbox
                      checked={sub.checked}
                      onCheckedChange={(checked) => {
                        const next = [...subEtapas];
                        next[idx] = { ...next[idx], checked: !!checked };
                        setSubEtapas(next);
                      }}
                    />
                    <div className="flex-1 space-y-2">
                      <span className="text-sm font-medium">{sub.nome}</span>
                      {sub.checked && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Operador</Label>
                            <Select
                              value={sub.operadorId}
                              onValueChange={(v) => {
                                const next = [...subEtapas];
                                next[idx] = { ...next[idx], operadorId: v };
                                setSubEtapas(next);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Selecionar" />
                              </SelectTrigger>
                              <SelectContent>
                                {operadores.map(op => (
                                  <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Quantidade</Label>
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={sub.quantidade}
                              max={totalItens}
                              onChange={(e) => {
                                const val = Math.min(parseInt(e.target.value) || 0, totalItens);
                                const next = [...subEtapas];
                                next[idx] = { ...next[idx], quantidade: val };
                                setSubEtapas(next);
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {/* Custom sub-etapa */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar sub-etapa..."
                    value={subEtapaCustom}
                    onChange={(e) => setSubEtapaCustom(e.target.value)}
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (subEtapaCustom.trim()) {
                        setSubEtapas([...subEtapas, { nome: subEtapaCustom.trim(), checked: false, operadorId: '', quantidade: 0 }]);
                        setSubEtapaCustom('');
                      }
                    }}
                  >
                    Adicionar
                  </Button>
                </div>
                <Button className="w-full" onClick={handlePreparacaoConcluir} disabled={actionLoading}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar Preparação
                </Button>
              </CardContent>
            </Card>
          )}

          {isMontagemActive && etapaAtiva && (
            <Card className="border-primary/30 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Etapa de Montagem — Operadores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label className="text-xs text-muted-foreground">Selecione os operadores presentes:</Label>
                <div className="space-y-2">
                  {operadores.map(op => (
                    <div key={op.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={montagemOperadores.includes(op.id)}
                        onCheckedChange={(checked) => {
                          setMontagemOperadores(prev =>
                            checked ? [...prev, op.id] : prev.filter(id => id !== op.id)
                          );
                        }}
                      />
                      <span className="text-sm">{op.nome}</span>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={handleMontagemConcluir} disabled={actionLoading}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar Montagem
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Etapas da Produção</CardTitle>
              {aguardandoAprovacao && isSupervisor && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAprovar} disabled={actionLoading}>
                    <Shield className="h-3.5 w-3.5 mr-1" /> Aprovar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setRejeitarDialogOpen(true)} disabled={actionLoading}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Rejeitar
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-border" />
                <div className="space-y-0">
                  {etapas.map((etapa, idx) => {
                    const cfg = STATUS_ETAPA_CONFIG[etapa.status] || { label: etapa.status, color: '' };
                    const isActive = etapa.status === 'EM_ANDAMENTO';
                    const isDone = etapa.status === 'CONCLUIDA';
                    const canStart = isActive && !etapa.operador_id && isOperador;
                    const canConclude = isActive && etapa.operador_id && isOperador;
                    // Don't show generic conclude for specialized stages
                    const hasSpecializedView = isActive && (
                      (etapa.nome_etapa === 'Corte' && ordem.tipo_produto === 'SINTETICO') ||
                      etapa.nome_etapa === 'Preparação' ||
                      etapa.nome_etapa === 'Montagem'
                    );

                    return (
                      <div key={etapa.id} className={`relative flex gap-4 py-4 ${isActive ? 'bg-primary/[0.03] -mx-6 px-6 rounded-lg' : ''}`}>
                        <div className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                          isDone ? 'border-[hsl(var(--success))] bg-[hsl(var(--success))]/10' :
                          isActive ? 'border-primary bg-primary/10 ring-4 ring-primary/10' :
                          etapa.status === 'REJEITADA' ? 'border-destructive bg-destructive/10' :
                          'border-border bg-background'
                        }`}>
                          {isDone ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" /> :
                           isActive ? <Play className="h-3.5 w-3.5 text-primary" /> :
                           etapa.status === 'REJEITADA' ? <XCircle className="h-4 w-4 text-destructive" /> :
                           <span className="text-xs font-medium text-muted-foreground">{idx + 1}</span>}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{etapa.nome_etapa}</span>
                            <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                          </div>

                          <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                            {etapa.operador_id && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" /> {(etapa.usuarios as any)?.nome || 'Operador'}
                              </span>
                            )}
                            {etapa.iniciado_em && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Início: {format(new Date(etapa.iniciado_em), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            )}
                            {etapa.concluido_em && (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Fim: {format(new Date(etapa.concluido_em), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            )}
                          </div>

                          {etapa.observacao && <p className="text-xs text-muted-foreground mt-1 bg-muted/50 rounded px-2 py-1">{etapa.observacao}</p>}
                          {etapa.motivo_rejeicao && <p className="text-xs text-destructive mt-1 bg-destructive/5 rounded px-2 py-1">Rejeitado: {etapa.motivo_rejeicao}</p>}

                          {canStart && (
                            <Button size="sm" className="mt-2" onClick={() => handleIniciar(etapa.id)} disabled={actionLoading}>
                              <Play className="h-3.5 w-3.5 mr-1" /> Iniciar Etapa
                            </Button>
                          )}
                          {canConclude && !hasSpecializedView && (
                            <Button size="sm" className="mt-2" onClick={() => { setConcluirEtapaId(etapa.id); setConcluirDialogOpen(true); }} disabled={actionLoading}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir Etapa
                            </Button>
                          )}
                          {/* Tecido transfer button */}
                          {isTecidoConcluido && etapa.id === etapaAtiva?.id && canConclude && (
                            <Button size="sm" className="mt-2" onClick={() => setTransferDialogOpen(true)} disabled={actionLoading}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir e Transferir para Sintético
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Itens do pedido */}
          {pedidoItens.length > 0 && (
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Itens do Pedido</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {pedidoItens.map(item => (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{item.descricao_produto}</span>
                        <span className="text-sm tabular-nums">×{item.quantidade}</span>
                      </div>
                      {item.observacao_producao && (
                        <div className="mt-1 bg-warning/10 border border-warning/20 rounded px-2 py-1 text-xs text-warning">
                          📋 {item.observacao_producao}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados do Pedido</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Pedido:</span> <span className="font-medium">{pedido.numero_pedido}</span></div>
              <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{pedido.cliente_nome}</span></div>
              {pedido.cliente_cpf_cnpj && <div><span className="text-muted-foreground">CPF/CNPJ:</span> {pedido.cliente_cpf_cnpj}</div>}
              {pedido.vendedor_nome && <div><span className="text-muted-foreground">Vendedor:</span> {pedido.vendedor_nome}</div>}
              <Separator />
              <div><span className="text-muted-foreground">Valor:</span> <span className="font-semibold">{pedido.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
              {pedido.forma_pagamento && <div><span className="text-muted-foreground">Pagamento:</span> {pedido.forma_pagamento}</div>}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
            <CardContent className="p-0 max-h-[400px] overflow-y-auto scrollbar-thin">
              {historico.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground text-sm">Sem registros.</p>
              ) : (
                <div className="divide-y divide-border">
                  {historico.map(h => (
                    <div key={h.id} className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        <span>{(h.usuarios as any)?.nome || 'Sistema'}</span>
                        <span>•</span>
                        <span>{format(new Date(h.criado_em), "dd/MM HH:mm", { locale: ptBR })}</span>
                      </div>
                      <p className="text-sm mt-0.5 whitespace-pre-line">{h.observacao || h.tipo_acao}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Concluir dialog */}
      <Dialog open={concluirDialogOpen} onOpenChange={setConcluirDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Concluir Etapa</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacaoConcluir} onChange={e => setObservacaoConcluir(e.target.value)} placeholder="Alguma observação..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConcluirDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleConcluir} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Concluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejeitar dialog */}
      <Dialog open={rejeitarDialogOpen} onOpenChange={setRejeitarDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rejeitar Ordem</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Motivo da rejeição *</Label>
              <Textarea value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)} placeholder="Descreva o motivo..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejeitarDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRejeitar} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rejeitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tecido transfer dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Transferir para Sintético</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ao confirmar, o tecido será marcado como concluído e uma nova ordem de produção Sintético será criada 
            automaticamente (iniciando na Preparação, pulando o Corte).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleTecidoTransfer} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Transferência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

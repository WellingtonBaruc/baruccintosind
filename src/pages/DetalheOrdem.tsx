import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import {
  OrdemProducao, OpEtapa, PedidoHistorico, Pedido,
  STATUS_ORDEM_CONFIG, STATUS_ETAPA_CONFIG,
  iniciarEtapa, concluirEtapa, aprovarOrdem, rejeitarOrdem,
} from '@/lib/producao';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, Play, CheckCircle2, XCircle, Shield, Clock, User, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function DetalheOrdem() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [ordem, setOrdem] = useState<OrdemProducao | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [etapas, setEtapas] = useState<OpEtapa[]>([]);
  const [historico, setHistorico] = useState<PedidoHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Concluir dialog
  const [concluirDialogOpen, setConcluirDialogOpen] = useState(false);
  const [concluirEtapaId, setConcluirEtapaId] = useState('');
  const [observacaoConcluir, setObservacaoConcluir] = useState('');

  // Rejeitar dialog
  const [rejeitarDialogOpen, setRejeitarDialogOpen] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  const fetchData = useCallback(async () => {
    if (!id) return;
    const { data: ordemData } = await supabase
      .from('ordens_producao')
      .select('*, pipeline_producao(nome)')
      .eq('id', id)
      .single();

    if (!ordemData) { setLoading(false); return; }
    setOrdem(ordemData);

    const [pedidoRes, etapasRes, historicoRes] = await Promise.all([
      supabase.from('pedidos').select('*').eq('id', ordemData.pedido_id).single(),
      supabase.from('op_etapas').select('*, usuarios(nome)').eq('ordem_id', id).order('ordem_sequencia'),
      supabase.from('pedido_historico').select('*, usuarios(nome)').eq('pedido_id', ordemData.pedido_id).order('criado_em', { ascending: false }),
    ]);

    setPedido(pedidoRes.data);
    setEtapas(etapasRes.data || []);
    setHistorico(historicoRes.data || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!ordem || !pedido || !profile) return <div className="text-center py-20 text-muted-foreground">Ordem não encontrada.</div>;

  const ordemCfg = STATUS_ORDEM_CONFIG[ordem.status] || { label: ordem.status, color: '' };
  const isOperador = ['operador_producao', 'supervisor_producao', 'admin'].includes(profile.perfil);
  const isSupervisor = ['supervisor_producao', 'admin'].includes(profile.perfil);
  const allEtapasConcluidas = etapas.length > 0 && etapas.every(e => e.status === 'CONCLUIDA');
  const aguardandoAprovacao = ordem.status === 'CONCLUIDA' && !ordem.aprovado_em;

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
      toast.success('Ordem rejeitada. Última etapa voltou para Em Andamento.');
      setRejeitarDialogOpen(false);
      setMotivoRejeicao('');
      fetchData();
    } catch { toast.error('Erro ao rejeitar.'); }
    setActionLoading(false);
  };

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
          </div>
          <p className="text-muted-foreground mt-0.5">{pedido.cliente_nome} • {pedido.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline - takes 2 cols */}
        <div className="lg:col-span-2 space-y-4">
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
                {/* Vertical line */}
                <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-border" />

                <div className="space-y-0">
                  {etapas.map((etapa, idx) => {
                    const cfg = STATUS_ETAPA_CONFIG[etapa.status] || { label: etapa.status, color: '' };
                    const isActive = etapa.status === 'EM_ANDAMENTO';
                    const isDone = etapa.status === 'CONCLUIDA';
                    const canStart = etapa.status === 'EM_ANDAMENTO' && !etapa.operador_id && isOperador;
                    const canConclude = etapa.status === 'EM_ANDAMENTO' && etapa.operador_id && isOperador;

                    return (
                      <div key={etapa.id} className={`relative flex gap-4 py-4 ${isActive ? 'bg-primary/[0.03] -mx-6 px-6 rounded-lg' : ''}`}>
                        {/* Circle */}
                        <div className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                          isDone ? 'border-[hsl(var(--success))] bg-[hsl(var(--success))]/10' :
                          isActive ? 'border-primary bg-primary/10 ring-4 ring-primary/10' :
                          etapa.status === 'REJEITADA' ? 'border-destructive bg-destructive/10' :
                          'border-border bg-background'
                        }`}>
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                          ) : isActive ? (
                            <Play className="h-3.5 w-3.5 text-primary" />
                          ) : etapa.status === 'REJEITADA' ? (
                            <XCircle className="h-4 w-4 text-destructive" />
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">{idx + 1}</span>
                          )}
                        </div>

                        {/* Content */}
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

                          {etapa.observacao && (
                            <p className="text-xs text-muted-foreground mt-1 bg-muted/50 rounded px-2 py-1">{etapa.observacao}</p>
                          )}
                          {etapa.motivo_rejeicao && (
                            <p className="text-xs text-destructive mt-1 bg-destructive/5 rounded px-2 py-1">Rejeitado: {etapa.motivo_rejeicao}</p>
                          )}

                          {/* Action buttons */}
                          {canStart && (
                            <Button size="sm" className="mt-2" onClick={() => handleIniciar(etapa.id)} disabled={actionLoading}>
                              <Play className="h-3.5 w-3.5 mr-1" /> Iniciar Etapa
                            </Button>
                          )}
                          {canConclude && (
                            <Button size="sm" className="mt-2" onClick={() => { setConcluirEtapaId(etapa.id); setConcluirDialogOpen(true); }} disabled={actionLoading}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir Etapa
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
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados do Pedido</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Pedido:</span> <span className="font-medium">{pedido.numero_pedido}</span></div>
              <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{pedido.cliente_nome}</span></div>
              {pedido.cliente_cpf_cnpj && <div><span className="text-muted-foreground">CPF/CNPJ:</span> {pedido.cliente_cpf_cnpj}</div>}
              {pedido.cliente_telefone && <div><span className="text-muted-foreground">Telefone:</span> {pedido.cliente_telefone}</div>}
              {pedido.vendedor_nome && <div><span className="text-muted-foreground">Vendedor:</span> {pedido.vendedor_nome}</div>}
              <Separator />
              <div><span className="text-muted-foreground">Valor:</span> <span className="font-semibold">{pedido.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
              {pedido.forma_pagamento && <div><span className="text-muted-foreground">Pagamento:</span> {pedido.forma_pagamento}</div>}
              {pedido.forma_envio && <div><span className="text-muted-foreground">Envio:</span> {pedido.forma_envio}</div>}
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
                      <p className="text-sm mt-0.5">{h.observacao || h.tipo_acao}</p>
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
              <Textarea value={observacaoConcluir} onChange={e => setObservacaoConcluir(e.target.value)} placeholder="Alguma observação sobre esta etapa..." rows={3} />
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
              <Textarea value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)} placeholder="Descreva o motivo da rejeição..." rows={3} />
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
    </div>
  );
}

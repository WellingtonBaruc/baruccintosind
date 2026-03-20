import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import {
  STATUS_PEDIDO_CONFIG,
  SUBTIPO_PRONTA_ENTREGA_CONFIG,
  confirmarLojaOk,
  definirCaminhoLoja,
  finalizarVerificacaoLoja,
  criarPedidoCompleto,
} from '@/lib/producao';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, CheckCircle2, Package, AlertTriangle, Send, Warehouse } from 'lucide-react';
import { toast } from 'sonner';

const PERFIS_LOJA = ['loja', 'admin', 'gestor'];

interface PedidoItem {
  id: string;
  descricao_produto: string;
  unidade_medida: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  observacao_producao: string | null;
  conferido: boolean;
  disponivel: boolean | null;
  item_faltante_tipo: string | null;
}

export default function VerificacaoLoja() {
  const { id: pedidoId } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [pedido, setPedido] = useState<any>(null);
  const [itens, setItens] = useState<PedidoItem[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [caminhoSelecionado, setCaminhoSelecionado] = useState('');
  const [opDialogOpen, setOpDialogOpen] = useState(false);
  const [almoxDialogOpen, setAlmoxDialogOpen] = useState(false);
  const [descricaoSolicitacao, setDescricaoSolicitacao] = useState('');
  const [qtdSolicitacao, setQtdSolicitacao] = useState(1);

  const [opComplementarDone, setOpComplementarDone] = useState(false);

  const fetchData = useCallback(async () => {
    if (!pedidoId) return;
    const [pedidoRes, itensRes, solicRes] = await Promise.all([
      supabase.from('pedidos').select('*').eq('id', pedidoId).single(),
      supabase.from('pedido_itens').select('*').eq('pedido_id', pedidoId).order('id'),
      supabase.from('solicitacoes_almoxarifado').select('*').eq('pedido_id', pedidoId).order('criado_em'),
    ]);
    setPedido(pedidoRes.data);
    setItens(itensRes.data || []);
    setSolicitacoes(solicRes.data || []);
    if (pedidoRes.data?.subtipo_pronta_entrega) {
      setCaminhoSelecionado(pedidoRes.data.subtipo_pronta_entrega);
    }
    setLoading(false);
  }, [pedidoId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!pedidoId) return;
    supabase.from('ordens_producao').select('id, status, aprovado_em')
      .eq('pedido_id', pedidoId)
      .eq('tipo_produto', 'OP_COMPLEMENTAR')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setOpComplementarDone(data.every(o => o.aprovado_em !== null));
        } else {
          setOpComplementarDone(true);
        }
      });
  }, [pedidoId, pedido?.status_atual]);

  if (!profile || !PERFIS_LOJA.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!pedido) return <div className="text-center py-20 text-muted-foreground">Pedido não encontrado.</div>;

  const statusCfg = STATUS_PEDIDO_CONFIG[pedido.status_atual] || { label: pedido.status_atual, color: '' };
  const todosConferidos = itens.length > 0 && itens.every(i => i.conferido);
  const todosDisponiveis = itens.length > 0 && itens.every(i => i.disponivel === true);
  const itensFaltantes = itens.filter(i => i.disponivel === false);
  const isVerificando = pedido.status_atual === 'LOJA_VERIFICANDO';
  const isAguardandoOp = pedido.status_atual === 'AGUARDANDO_OP_COMPLEMENTAR';
  const isAguardandoAlmox = pedido.status_atual === 'AGUARDANDO_ALMOXARIFADO';
  const allSolicitacoesAtendidas = solicitacoes.length > 0 && solicitacoes.every(s => s.status === 'ATENDIDA');

  const handleToggleConferido = async (itemId: string, checked: boolean) => {
    await supabase.from('pedido_itens').update({ conferido: checked } as any).eq('id', itemId);
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, conferido: checked } : i));
  };

  const handleToggleDisponivel = async (itemId: string, disponivel: boolean) => {
    await supabase.from('pedido_itens').update({ disponivel } as any).eq('id', itemId);
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, disponivel } : i));
  };

  const handleMarcarFaltanteTipo = async (itemId: string, tipo: string) => {
    await supabase.from('pedido_itens').update({ item_faltante_tipo: tipo } as any).eq('id', itemId);
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, item_faltante_tipo: tipo } : i));
  };

  // Caminho A: tudo OK
  const handleCaminhoA = async () => {
    setActionLoading(true);
    try {
      await confirmarLojaOk(pedido.id, profile.id, 'A_CINTOS');
      toast.success('Pedido confirmado! Encaminhado para comercial.');
      navigate('/loja');
    } catch { toast.error('Erro ao confirmar.'); }
    setActionLoading(false);
  };

  // Caminho B: gerar OP complementar
  const handleCaminhoB = async () => {
    setActionLoading(true);
    try {
      // Get default pipeline
      const { data: pipelines } = await supabase.from('pipeline_producao').select('id').eq('padrao', true).limit(1);
      const pipelineId = pipelines?.[0]?.id;
      if (!pipelineId) { toast.error('Nenhum pipeline padrão encontrado.'); setActionLoading(false); return; }

      // Create complementary OP for missing items
      const { data: ordem } = await supabase.from('ordens_producao').insert({
        pedido_id: pedido.id,
        pipeline_id: pipelineId,
        sequencia: 2,
        status: 'EM_ANDAMENTO',
        tipo_produto: 'OP_COMPLEMENTAR',
        observacao: `Itens faltantes: ${itensFaltantes.map(i => i.descricao_produto).join(', ')}`,
      }).select().single();

      if (ordem) {
        // Create etapas from pipeline
        const { data: etapas } = await supabase.from('pipeline_etapas').select('*').eq('pipeline_id', pipelineId).order('ordem');
        if (etapas && etapas.length > 0) {
          const opEtapas = etapas.map((e: any, idx: number) => ({
            ordem_id: ordem.id,
            pipeline_etapa_id: e.id,
            nome_etapa: e.nome,
            ordem_sequencia: e.ordem,
            status: (idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE') as 'EM_ANDAMENTO' | 'PENDENTE',
            ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
          }));
          await supabase.from('op_etapas').insert(opEtapas as any);
        }
      }

      await definirCaminhoLoja(pedido.id, profile.id, 'B_OP_COMPLEMENTAR', 'AGUARDANDO_OP_COMPLEMENTAR');
      toast.success('OP complementar criada! Pedido aguardando produção dos faltantes.');
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Erro ao criar OP complementar.'); }
    setActionLoading(false);
  };

  // Caminho C: solicitar ao almoxarifado
  const handleCaminhoC = async () => {
    setAlmoxDialogOpen(true);
  };

  const handleEnviarSolicitacaoAlmox = async () => {
    if (!descricaoSolicitacao.trim()) { toast.error('Descrição é obrigatória.'); return; }
    setActionLoading(true);
    try {
      await supabase.from('solicitacoes_almoxarifado').insert({
        pedido_id: pedido.id,
        descricao: descricaoSolicitacao,
        quantidade: qtdSolicitacao,
        solicitado_por: profile.id,
      });

      if (pedido.status_atual === 'LOJA_VERIFICANDO') {
        await definirCaminhoLoja(pedido.id, profile.id, 'C_FIVELAS', 'AGUARDANDO_ALMOXARIFADO');
      }

      toast.success('Solicitação enviada ao almoxarifado!');
      setAlmoxDialogOpen(false);
      setDescricaoSolicitacao('');
      setQtdSolicitacao(1);
      fetchData();
    } catch { toast.error('Erro ao enviar solicitação.'); }
    setActionLoading(false);
  };

  // Atender solicitação (almoxarifado/supervisor)
  const handleAtenderSolicitacao = async (solicId: string) => {
    await supabase.from('solicitacoes_almoxarifado').update({
      status: 'ATENDIDA',
      atendido_por: profile.id,
      atendido_em: new Date().toISOString(),
    } as any).eq('id', solicId);
    toast.success('Solicitação atendida!');
    fetchData();
  };

  // Caminho D: misto
  const handleCaminhoD = async () => {
    setActionLoading(true);
    try {
      // Create OP for production items
      const faltantesProd = itensFaltantes.filter(i => i.item_faltante_tipo === 'producao');
      const faltantesAlmox = itensFaltantes.filter(i => i.item_faltante_tipo === 'almoxarifado');

      if (faltantesProd.length > 0) {
        const { data: pipelines } = await supabase.from('pipeline_producao').select('id').eq('padrao', true).limit(1);
        const pipelineId = pipelines?.[0]?.id;
        if (pipelineId) {
          const { data: ordem } = await supabase.from('ordens_producao').insert({
            pedido_id: pedido.id,
            pipeline_id: pipelineId,
            sequencia: 2,
            status: 'EM_ANDAMENTO',
            tipo_produto: 'OP_COMPLEMENTAR',
            observacao: `Itens faltantes (produção): ${faltantesProd.map(i => i.descricao_produto).join(', ')}`,
          }).select().single();

          if (ordem) {
            const { data: etapas } = await supabase.from('pipeline_etapas').select('*').eq('pipeline_id', pipelineId).order('ordem');
            if (etapas && etapas.length > 0) {
              const opEtapas = etapas.map((e: any, idx: number) => ({
                ordem_id: ordem.id,
                pipeline_etapa_id: e.id,
                nome_etapa: e.nome,
                ordem_sequencia: e.ordem,
                status: (idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE') as 'EM_ANDAMENTO' | 'PENDENTE',
                ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
              }));
              await supabase.from('op_etapas').insert(opEtapas as any);
            }
          }
        }
      }

      if (faltantesAlmox.length > 0) {
        for (const item of faltantesAlmox) {
          await supabase.from('solicitacoes_almoxarifado').insert({
            pedido_id: pedido.id,
            pedido_item_id: item.id,
            descricao: item.descricao_produto,
            quantidade: item.quantidade,
            solicitado_por: profile.id,
          });
        }
      }

      await definirCaminhoLoja(pedido.id, profile.id, 'D_MISTO', 'AGUARDANDO_OP_COMPLEMENTAR');
      toast.success('Caminho misto definido. OP e solicitações criadas.');
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Erro.'); }
    setActionLoading(false);
  };

  // Finalizar verificação (after OP done + almox atendido)
  const handleFinalizar = async () => {
    setActionLoading(true);
    try {
      await finalizarVerificacaoLoja(pedido.id, profile.id);
      toast.success('Verificação concluída! Pedido encaminhado para comercial.');
      navigate('/loja');
    } catch { toast.error('Erro ao finalizar.'); }
    setActionLoading(false);
  };

  const canFinalizar = (isAguardandoOp || isAguardandoAlmox) && opComplementarDone && allSolicitacoesAtendidas;

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/loja')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{pedido.numero_pedido}</h1>
            <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
            {pedido.subtipo_pronta_entrega && (
              <Badge variant="outline" className="text-xs">
                {SUBTIPO_PRONTA_ENTREGA_CONFIG[pedido.subtipo_pronta_entrega]?.label || pedido.subtipo_pronta_entrega}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5">
            {pedido.cliente_nome} • {pedido.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </div>

      {/* Itens */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Itens do Pedido ({itens.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {itens.map(item => (
            <div key={item.id} className={`rounded-lg border p-4 space-y-2 transition-colors ${
              item.conferido ? 'border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/[0.03]' : 'border-border'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{item.descricao_produto}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.quantidade} {item.unidade_medida || 'UN'} × {item.valor_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  {item.observacao_producao && (
                    <p className="text-xs text-muted-foreground mt-1 bg-muted/50 rounded px-2 py-1">
                      📋 {item.observacao_producao}
                    </p>
                  )}
                </div>

                {isVerificando && (
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={item.conferido}
                        onCheckedChange={(checked) => handleToggleConferido(item.id, !!checked)}
                      />
                      <Label className="text-xs">Conferido</Label>
                    </div>
                    {item.conferido && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={item.disponivel === true ? 'default' : 'outline'}
                          className="h-7 text-xs"
                          onClick={() => handleToggleDisponivel(item.id, true)}
                        >
                          Disponível
                        </Button>
                        <Button
                          size="sm"
                          variant={item.disponivel === false ? 'destructive' : 'outline'}
                          className="h-7 text-xs"
                          onClick={() => handleToggleDisponivel(item.id, false)}
                        >
                          Faltante
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* For path D: classify missing items */}
              {isVerificando && item.disponivel === false && caminhoSelecionado === 'D_MISTO' && (
                <div className="flex items-center gap-2 pt-1">
                  <Label className="text-xs text-muted-foreground">Tipo:</Label>
                  <Button size="sm" variant={item.item_faltante_tipo === 'producao' ? 'default' : 'outline'} className="h-6 text-xs"
                    onClick={() => handleMarcarFaltanteTipo(item.id, 'producao')}>
                    Produção
                  </Button>
                  <Button size="sm" variant={item.item_faltante_tipo === 'almoxarifado' ? 'default' : 'outline'} className="h-6 text-xs"
                    onClick={() => handleMarcarFaltanteTipo(item.id, 'almoxarifado')}>
                    Almoxarifado
                  </Button>
                </div>
              )}

              {/* Status indicators */}
              {!isVerificando && item.disponivel === true && (
                <Badge className="bg-success/15 text-success text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> Disponível</Badge>
              )}
              {!isVerificando && item.disponivel === false && (
                <Badge className="bg-destructive/15 text-destructive text-xs"><AlertTriangle className="h-3 w-3 mr-1" /> Faltante</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Solicitações de almoxarifado */}
      {solicitacoes.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Warehouse className="h-4 w-4" /> Solicitações ao Almoxarifado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {solicitacoes.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <span className="text-sm font-medium">{s.descricao}</span>
                  <span className="text-xs text-muted-foreground ml-2">Qtd: {s.quantidade}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={s.status === 'ATENDIDA' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}>
                    {s.status === 'ATENDIDA' ? 'Atendida' : 'Pendente'}
                  </Badge>
                  {s.status === 'PENDENTE' && ['admin', 'gestor', 'supervisor_producao', 'loja'].includes(profile.perfil) && (
                    <Button size="sm" variant="outline" onClick={() => handleAtenderSolicitacao(s.id)}>
                      Atender
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Action area */}
      {isVerificando && todosConferidos && (
        <Card className="border-primary/30 shadow-sm bg-primary/[0.02]">
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-medium text-sm">Definir caminho do pedido</h3>

            {todosDisponiveis ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Todos os itens estão disponíveis.</p>
                <Button onClick={handleCaminhoA} disabled={actionLoading}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar OK — Caminho A (Cintos)
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 inline mr-1 text-warning" />
                  {itensFaltantes.length} item(ns) faltante(s). Selecione o caminho:
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {['B_OP_COMPLEMENTAR', 'C_FIVELAS', 'D_MISTO'].map(k => {
                    const cfg = SUBTIPO_PRONTA_ENTREGA_CONFIG[k];
                    return (
                      <Button
                        key={k}
                        variant={caminhoSelecionado === k ? 'default' : 'outline'}
                        className="h-auto py-3 flex-col items-start text-left"
                        onClick={() => setCaminhoSelecionado(k)}
                      >
                        <span className="text-sm font-medium">{cfg.label}</span>
                        <span className="text-xs opacity-70 font-normal">{cfg.description}</span>
                      </Button>
                    );
                  })}
                </div>

                {caminhoSelecionado === 'B_OP_COMPLEMENTAR' && (
                  <Button onClick={handleCaminhoB} disabled={actionLoading}>
                    <Send className="h-4 w-4 mr-1" /> Gerar OP Complementar
                  </Button>
                )}
                {caminhoSelecionado === 'C_FIVELAS' && (
                  <Button onClick={handleCaminhoC} disabled={actionLoading}>
                    <Warehouse className="h-4 w-4 mr-1" /> Solicitar ao Almoxarifado
                  </Button>
                )}
                {caminhoSelecionado === 'D_MISTO' && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Classifique os itens faltantes acima como "Produção" ou "Almoxarifado" antes de confirmar.</p>
                    <Button
                      onClick={handleCaminhoD}
                      disabled={actionLoading || itensFaltantes.some(i => !i.item_faltante_tipo)}
                    >
                      <Send className="h-4 w-4 mr-1" /> Confirmar Caminho Misto
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Finalizar after OP + almox resolved */}
      {(isAguardandoOp || isAguardandoAlmox) && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="pt-6">
            {canFinalizar ? (
              <div className="space-y-3">
                <p className="text-sm text-[hsl(var(--success))]">
                  <CheckCircle2 className="h-4 w-4 inline mr-1" />
                  Todos os itens faltantes foram resolvidos.
                </p>
                <Button onClick={handleFinalizar} disabled={actionLoading}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar Verificação e Enviar para Comercial
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 inline mr-1 animate-spin" />
                Aguardando resolução dos itens faltantes...
                {!opComplementarDone && ' (OP complementar em andamento)'}
                {!allSolicitacoesAtendidas && solicitacoes.length > 0 && ' (Solicitações pendentes no almoxarifado)'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Almoxarifado dialog */}
      <Dialog open={almoxDialogOpen} onOpenChange={setAlmoxDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Solicitar ao Almoxarifado</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Descrição do item *</Label>
              <Textarea value={descricaoSolicitacao} onChange={e => setDescricaoSolicitacao(e.target.value)} placeholder="Descreva o que precisa..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={qtdSolicitacao} onChange={(e: any) => setQtdSolicitacao(parseInt(e.target.value) || 1)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlmoxDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEnviarSolicitacaoAlmox} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar Solicitação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

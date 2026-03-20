import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Loader2, Pencil, Trash2, GripVertical, ChevronRight, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';

interface Pipeline {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  padrao: boolean;
  criado_em: string;
}

interface Etapa {
  id: string;
  pipeline_id: string;
  nome: string;
  ordem: number;
  setor_responsavel: string | null;
  requer_supervisor: boolean;
  avanco_automatico: boolean;
}

export default function Pipelines() {
  const { profile } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pipeline | null>(null);
  const [saving, setSaving] = useState(false);

  // Pipeline form
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');

  // Detail view
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [etapaLoading, setEtapaLoading] = useState(false);

  // Etapa form
  const [etapaDialogOpen, setEtapaDialogOpen] = useState(false);
  const [editingEtapa, setEditingEtapa] = useState<Etapa | null>(null);
  const [etapaNome, setEtapaNome] = useState('');
  const [etapaSetor, setEtapaSetor] = useState('');
  const [etapaRequerSupervisor, setEtapaRequerSupervisor] = useState(false);
  const [etapaAvancoAutomatico, setEtapaAvancoAutomatico] = useState(false);

  if (profile?.perfil !== 'admin') return <Navigate to="/dashboard" replace />;

  const fetchPipelines = async () => {
    const { data } = await supabase.from('pipeline_producao').select('*').order('criado_em', { ascending: false });
    setPipelines(data || []);
    setLoading(false);
  };

  const fetchEtapas = useCallback(async (pipelineId: string) => {
    setEtapaLoading(true);
    const { data } = await supabase.from('pipeline_etapas').select('*').eq('pipeline_id', pipelineId).order('ordem');
    setEtapas(data || []);
    setEtapaLoading(false);
  }, []);

  useEffect(() => { fetchPipelines(); }, []);

  useEffect(() => {
    if (selectedPipeline) fetchEtapas(selectedPipeline.id);
  }, [selectedPipeline, fetchEtapas]);

  const openCreate = () => {
    setEditing(null); setNome(''); setDescricao('');
    setDialogOpen(true);
  };

  const openEdit = (p: Pipeline) => {
    setEditing(p); setNome(p.nome); setDescricao(p.descricao || '');
    setDialogOpen(true);
  };

  const handleSavePipeline = async () => {
    if (!nome.trim()) { toast.error('Nome é obrigatório.'); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('pipeline_producao').update({ nome, descricao: descricao || null }).eq('id', editing.id);
        if (error) throw error;
        toast.success('Pipeline atualizado.');
        if (selectedPipeline?.id === editing.id) {
          setSelectedPipeline({ ...selectedPipeline, nome, descricao });
        }
      } else {
        const { error } = await supabase.from('pipeline_producao').insert({ nome, descricao: descricao || null });
        if (error) throw error;
        toast.success('Pipeline criado.');
      }
      setDialogOpen(false);
      fetchPipelines();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar.');
    }
    setSaving(false);
  };

  const togglePadrao = async (p: Pipeline) => {
    // Unset all others first
    if (!p.padrao) {
      await supabase.from('pipeline_producao').update({ padrao: false }).neq('id', p.id);
    }
    const { error } = await supabase.from('pipeline_producao').update({ padrao: !p.padrao }).eq('id', p.id);
    if (error) { toast.error('Erro.'); return; }
    toast.success(p.padrao ? 'Pipeline não é mais padrão.' : 'Pipeline definido como padrão.');
    fetchPipelines();
  };

  const toggleAtivo = async (p: Pipeline) => {
    const { error } = await supabase.from('pipeline_producao').update({ ativo: !p.ativo }).eq('id', p.id);
    if (error) { toast.error('Erro.'); return; }
    fetchPipelines();
  };

  const deletePipeline = async (p: Pipeline) => {
    if (!confirm(`Excluir pipeline "${p.nome}"?`)) return;
    const { error } = await supabase.from('pipeline_producao').delete().eq('id', p.id);
    if (error) { toast.error('Erro ao excluir.'); return; }
    if (selectedPipeline?.id === p.id) setSelectedPipeline(null);
    toast.success('Pipeline excluído.');
    fetchPipelines();
  };

  // Etapa CRUD
  const openCreateEtapa = () => {
    setEditingEtapa(null);
    setEtapaNome(''); setEtapaSetor(''); setEtapaRequerSupervisor(false); setEtapaAvancoAutomatico(false);
    setEtapaDialogOpen(true);
  };

  const openEditEtapa = (e: Etapa) => {
    setEditingEtapa(e);
    setEtapaNome(e.nome); setEtapaSetor(e.setor_responsavel || '');
    setEtapaRequerSupervisor(e.requer_supervisor); setEtapaAvancoAutomatico(e.avanco_automatico);
    setEtapaDialogOpen(true);
  };

  const handleSaveEtapa = async () => {
    if (!etapaNome.trim() || !selectedPipeline) { toast.error('Nome é obrigatório.'); return; }
    setSaving(true);
    try {
      if (editingEtapa) {
        const { error } = await supabase.from('pipeline_etapas').update({
          nome: etapaNome, setor_responsavel: etapaSetor || null,
          requer_supervisor: etapaRequerSupervisor, avanco_automatico: etapaAvancoAutomatico,
        }).eq('id', editingEtapa.id);
        if (error) throw error;
        toast.success('Etapa atualizada.');
      } else {
        const novaOrdem = etapas.length > 0 ? Math.max(...etapas.map(e => e.ordem)) + 1 : 0;
        const { error } = await supabase.from('pipeline_etapas').insert({
          pipeline_id: selectedPipeline.id, nome: etapaNome,
          ordem: novaOrdem, setor_responsavel: etapaSetor || null,
          requer_supervisor: etapaRequerSupervisor, avanco_automatico: etapaAvancoAutomatico,
        });
        if (error) throw error;
        toast.success('Etapa adicionada.');
      }
      setEtapaDialogOpen(false);
      fetchEtapas(selectedPipeline.id);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar.');
    }
    setSaving(false);
  };

  const deleteEtapa = async (e: Etapa) => {
    if (!selectedPipeline) return;
    const { error } = await supabase.from('pipeline_etapas').delete().eq('id', e.id);
    if (error) { toast.error('Erro ao excluir.'); return; }
    toast.success('Etapa excluída.');
    fetchEtapas(selectedPipeline.id);
  };

  const moveEtapa = async (etapa: Etapa, direction: 'up' | 'down') => {
    if (!selectedPipeline) return;
    const idx = etapas.findIndex(e => e.id === etapa.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= etapas.length) return;

    const other = etapas[swapIdx];
    await Promise.all([
      supabase.from('pipeline_etapas').update({ ordem: other.ordem }).eq('id', etapa.id),
      supabase.from('pipeline_etapas').update({ ordem: etapa.ordem }).eq('id', other.id),
    ]);
    fetchEtapas(selectedPipeline.id);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipelines de Produção</h1>
          <p className="text-muted-foreground mt-1">Configure os fluxos de produção do sistema.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo Pipeline
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline List */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipelines</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : pipelines.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Nenhum pipeline criado.</p>
            ) : (
              <div className="divide-y divide-border">
                {pipelines.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/40 ${
                      selectedPipeline?.id === p.id ? 'bg-accent/60' : ''
                    }`}
                    onClick={() => setSelectedPipeline(p)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{p.nome}</span>
                        {p.padrao && (
                          <Badge variant="default" className="text-xs px-1.5 py-0">Padrão</Badge>
                        )}
                        {!p.ativo && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">Inativo</Badge>
                        )}
                      </div>
                      {p.descricao && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.descricao}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); togglePadrao(p); }}>
                        <Star className={`h-3.5 w-3.5 ${p.padrao ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deletePipeline(p); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Switch checked={p.ativo} onCheckedChange={() => toggleAtivo(p)} onClick={(e) => e.stopPropagation()} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Etapas Detail */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {selectedPipeline ? `Etapas — ${selectedPipeline.nome}` : 'Selecione um pipeline'}
            </CardTitle>
            {selectedPipeline && (
              <Button size="sm" onClick={openCreateEtapa}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Etapa
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {!selectedPipeline ? (
              <p className="text-center py-12 text-muted-foreground text-sm">
                <ChevronRight className="inline h-4 w-4 mr-1" /> Selecione um pipeline à esquerda
              </p>
            ) : etapaLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : etapas.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma etapa cadastrada.</p>
            ) : (
              <div className="divide-y divide-border">
                {etapas.map((e, idx) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        disabled={idx === 0}
                        onClick={() => moveEtapa(e, 'up')}
                      >▲</button>
                      <button
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        disabled={idx === etapas.length - 1}
                        onClick={() => moveEtapa(e, 'down')}
                      >▼</button>
                    </div>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.nome}</p>
                      <div className="flex gap-2 mt-0.5">
                        {e.setor_responsavel && <span className="text-xs text-muted-foreground">{e.setor_responsavel}</span>}
                        {e.requer_supervisor && <Badge variant="outline" className="text-xs px-1 py-0">Supervisor</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEtapa(e)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteEtapa(e)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Pipeline' : 'Novo Pipeline'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Produção padrão" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePipeline} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Etapa Dialog */}
      <Dialog open={etapaDialogOpen} onOpenChange={setEtapaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEtapa ? 'Editar Etapa' : 'Nova Etapa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da etapa</Label>
              <Input value={etapaNome} onChange={(e) => setEtapaNome(e.target.value)} placeholder="Ex: Corte, Montagem..." />
            </div>
            <div className="space-y-2">
              <Label>Setor responsável</Label>
              <Input value={etapaSetor} onChange={(e) => setEtapaSetor(e.target.value)} placeholder="Ex: Produção" />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox checked={etapaRequerSupervisor} onCheckedChange={(v) => setEtapaRequerSupervisor(!!v)} />
                <Label className="text-sm font-normal">Requer supervisor</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={etapaAvancoAutomatico} onCheckedChange={(v) => setEtapaAvancoAutomatico(!!v)} />
                <Label className="text-sm font-normal">Avanço automático</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEtapaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEtapa} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingEtapa ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

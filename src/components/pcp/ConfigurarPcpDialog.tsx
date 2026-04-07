import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function ConfigurarPcpDialog({ open, onOpenChange, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar PCP</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="leadtime" className="mt-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="leadtime">Lead Time</TabsTrigger>
            <TabsTrigger value="calendario">Calendário</TabsTrigger>
            <TabsTrigger value="pausas">Pausas</TabsTrigger>
          </TabsList>
          <TabsContent value="leadtime"><LeadTimeTab onSaved={onSaved} /></TabsContent>
          <TabsContent value="calendario"><CalendarioTab onSaved={onSaved} /></TabsContent>
          <TabsContent value="pausas"><PausasTab onSaved={onSaved} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// =================== LEAD TIME TAB ===================
function LeadTimeTab({ onSaved }: { onSaved?: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ tipo: '', lead_time_dias: 2, observacao: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => { fetch(); }, []);
  const fetch = async () => {
    const { data } = await supabase.from('pcp_lead_times').select('*').order('tipo');
    setItems(data || []);
    setLoading(false);
  };

  const save = async () => {
    if (!form.tipo.trim()) { toast.error('Tipo é obrigatório'); return; }
    if (editId) {
      await supabase.from('pcp_lead_times').update({ tipo: form.tipo, lead_time_dias: form.lead_time_dias, observacao: form.observacao || null, atualizado_em: new Date().toISOString() }).eq('id', editId);
      toast.success('Atualizado');
    } else {
      await supabase.from('pcp_lead_times').insert({ tipo: form.tipo, lead_time_dias: form.lead_time_dias, observacao: form.observacao || null });
      toast.success('Adicionado');
    }
    setEditId(null); setAdding(false); setForm({ tipo: '', lead_time_dias: 2, observacao: '' });
    fetch(); onSaved?.();
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    await supabase.from('pcp_lead_times').update({ ativo: !ativo, atualizado_em: new Date().toISOString() }).eq('id', id);
    fetch(); onSaved?.();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 mt-4">
      {(adding || editId) && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo de Produto</Label>
              <Input value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} placeholder="Ex: SINTETICO" />
            </div>
            <div>
              <Label className="text-xs">Lead Time (dias úteis)</Label>
              <Input type="number" min={1} value={form.lead_time_dias} onChange={e => setForm({ ...form, lead_time_dias: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} className="h-16" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>{editId ? 'Salvar' : 'Adicionar'}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setEditId(null); }}>Cancelar</Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Lead Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Observação</TableHead>
            <TableHead className="w-20">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.tipo}</TableCell>
              <TableCell>{item.lead_time_dias} dias</TableCell>
              <TableCell>
                <Badge className={item.ativo ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' : 'bg-muted text-muted-foreground'} onClick={() => toggleAtivo(item.id, item.ativo)} style={{ cursor: 'pointer' }}>
                  {item.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{item.observacao || '—'}</TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditId(item.id); setForm({ tipo: item.tipo, lead_time_dias: item.lead_time_dias, observacao: item.observacao || '' }); setAdding(false); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!adding && !editId && (
        <Button variant="outline" size="sm" onClick={() => { setAdding(true); setForm({ tipo: '', lead_time_dias: 2, observacao: '' }); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Lead Time
        </Button>
      )}
    </div>
  );
}

// =================== CALENDARIO TAB ===================
function CalendarioTab({ onSaved }: { onSaved?: () => void }) {
  const [config, setConfig] = useState<any>(null);
  const [feriados, setFeriados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ data: '', nome: '', tipo: 'Nacional' });

  useEffect(() => { fetch(); }, []);
  const fetch = async () => {
    const [cRes, fRes] = await Promise.all([
      supabase.from('pcp_config_semana').select('*').limit(1).single(),
      supabase.from('pcp_feriados').select('*').order('data', { ascending: true }),
    ]);
    setConfig(cRes.data);
    setFeriados(fRes.data || []);
    setLoading(false);
  };

  const toggleDia = async (field: 'sabado_ativo' | 'domingo_ativo') => {
    if (!config) return;
    const newVal = !config[field];
    const updateData = field === 'sabado_ativo'
      ? { sabado_ativo: newVal, atualizado_em: new Date().toISOString() }
      : { domingo_ativo: newVal, atualizado_em: new Date().toISOString() };
    await supabase.from('pcp_config_semana').update(updateData).eq('id', config.id);
    setConfig({ ...config, [field]: newVal });
    onSaved?.();
  };

  const addFeriado = async () => {
    if (!form.data || !form.nome) { toast.error('Data e nome são obrigatórios'); return; }
    await supabase.from('pcp_feriados').insert({ data: form.data, nome: form.nome, tipo: form.tipo });
    toast.success('Feriado adicionado');
    setAdding(false); setForm({ data: '', nome: '', tipo: 'Nacional' });
    fetch(); onSaved?.();
  };

  const delFeriado = async (id: string) => {
    await supabase.from('pcp_feriados').delete().eq('id', id);
    toast.success('Feriado removido');
    fetch(); onSaved?.();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 mt-4">
      {/* Dias fixos */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Dias Não Produtivos</h3>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <Switch checked={!config?.sabado_ativo} onCheckedChange={() => toggleDia('sabado_ativo')} />
            <Label className="text-sm">Sábado não produtivo</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!config?.domingo_ativo} onCheckedChange={() => toggleDia('domingo_ativo')} />
            <Label className="text-sm">Domingo não produtivo</Label>
          </div>
        </div>
      </div>

      {/* Feriados */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Feriados</h3>
        {adding && (
          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Data</Label><Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
              <div><Label className="text-xs">Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Natal" /></div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nacional">Nacional</SelectItem>
                    <SelectItem value="Local">Local</SelectItem>
                    <SelectItem value="Interno">Interno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addFeriado}>Adicionar</Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-14"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feriados.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">Nenhum feriado cadastrado</TableCell></TableRow>
            ) : feriados.map(f => (
              <TableRow key={f.id}>
                <TableCell className="text-sm">{format(new Date(f.data + 'T00:00:00'), 'dd/MM/yyyy')}</TableCell>
                <TableCell className="text-sm">{f.nome}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{f.tipo}</Badge></TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => delFeriado(f.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Feriado
          </Button>
        )}
      </div>
    </div>
  );
}

// =================== PAUSAS TAB ===================
function PausasTab({ onSaved }: { onSaved?: () => void }) {
  const [pausas, setPausas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ data_inicio: '', data_fim: '', motivo: '' });

  useEffect(() => { fetch(); }, []);
  const fetch = async () => {
    const { data } = await supabase.from('pcp_pausas').select('*').order('data_inicio', { ascending: true });
    setPausas(data || []);
    setLoading(false);
  };

  const add = async () => {
    if (!form.data_inicio || !form.data_fim || !form.motivo) { toast.error('Todos os campos são obrigatórios'); return; }
    await supabase.from('pcp_pausas').insert(form);
    toast.success('Pausa adicionada');
    setAdding(false); setForm({ data_inicio: '', data_fim: '', motivo: '' });
    fetch(); onSaved?.();
  };

  const del = async (id: string) => {
    await supabase.from('pcp_pausas').delete().eq('id', id);
    toast.success('Pausa removida');
    fetch(); onSaved?.();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 mt-4">
      {adding && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Data Início</Label><Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div><Label className="text-xs">Data Fim</Label><Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></div>
            <div><Label className="text-xs">Motivo</Label><Input value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Manutenção" /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={add}>Adicionar</Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Início</TableHead>
            <TableHead>Fim</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead className="w-14"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pausas.length === 0 ? (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">Nenhuma pausa cadastrada</TableCell></TableRow>
          ) : pausas.map(p => (
            <TableRow key={p.id}>
              <TableCell className="text-sm">{format(new Date(p.data_inicio + 'T00:00:00'), 'dd/MM/yyyy')}</TableCell>
              <TableCell className="text-sm">{format(new Date(p.data_fim + 'T00:00:00'), 'dd/MM/yyyy')}</TableCell>
              <TableCell className="text-sm">{p.motivo}</TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => del(p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!adding && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar Pausa
        </Button>
      )}
    </div>
  );
}

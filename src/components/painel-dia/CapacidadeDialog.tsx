import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  dataHoje: string;
}

export default function CapacidadeDialog({ open, onClose, dataHoje }: Props) {
  const [padrao, setPadrao] = useState({ sintetico: 30, tecido: 20, total: 50 });
  const [diario, setDiario] = useState({ sintetico: 0, tecido: 0, total: 0, observacao: '' });
  const [hasDiario, setHasDiario] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, dataHoje]);

  const loadData = async () => {
    const { data: p } = await supabase.from('pcp_capacidade_padrao').select('*').limit(1).single();
    if (p) setPadrao({ sintetico: p.capacidade_sintetico, tecido: p.capacidade_tecido, total: p.capacidade_total });

    const { data: d } = await supabase.from('pcp_capacidade_diaria').select('*').eq('data', dataHoje).maybeSingle();
    if (d) {
      setDiario({ sintetico: d.capacidade_sintetico, tecido: d.capacidade_tecido, total: d.capacidade_total, observacao: d.observacao || '' });
      setHasDiario(true);
    } else {
      setDiario({ sintetico: padrao.sintetico, tecido: padrao.tecido, total: padrao.total, observacao: '' });
      setHasDiario(false);
    }
  };

  const savePadrao = async () => {
    setSaving(true);
    const { error } = await supabase.from('pcp_capacidade_padrao').update({
      capacidade_sintetico: padrao.sintetico,
      capacidade_tecido: padrao.tecido,
      capacidade_total: padrao.total,
      atualizado_em: new Date().toISOString(),
    }).neq('id', '00000000-0000-0000-0000-000000000000'); // update all rows
    
    // If no rows exist to update, try updating with a broader filter
    const { data: rows } = await supabase.from('pcp_capacidade_padrao').select('id').limit(1);
    if (rows && rows.length > 0) {
      await supabase.from('pcp_capacidade_padrao').update({
        capacidade_sintetico: padrao.sintetico,
        capacidade_tecido: padrao.tecido,
        capacidade_total: padrao.total,
        atualizado_em: new Date().toISOString(),
      }).eq('id', rows[0].id);
    }

    setSaving(false);
    toast.success('Capacidade padrão atualizada');
  };

  const saveDiario = async () => {
    setSaving(true);
    if (hasDiario) {
      await supabase.from('pcp_capacidade_diaria').update({
        capacidade_sintetico: diario.sintetico,
        capacidade_tecido: diario.tecido,
        capacidade_total: diario.total,
        observacao: diario.observacao || null,
        atualizado_em: new Date().toISOString(),
      }).eq('data', dataHoje);
    } else {
      await supabase.from('pcp_capacidade_diaria').insert({
        data: dataHoje,
        capacidade_sintetico: diario.sintetico,
        capacidade_tecido: diario.tecido,
        capacidade_total: diario.total,
        observacao: diario.observacao || null,
      });
    }
    setSaving(false);
    setHasDiario(true);
    toast.success('Capacidade do dia atualizada');
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Configurar Capacidade</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="hoje">
          <TabsList className="w-full">
            <TabsTrigger value="hoje" className="flex-1">Hoje ({dataHoje.slice(8)}/{dataHoje.slice(5, 7)})</TabsTrigger>
            <TabsTrigger value="padrao" className="flex-1">Padrão</TabsTrigger>
          </TabsList>
          <TabsContent value="hoje" className="space-y-4 pt-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Sintético</Label>
                <Input type="number" value={diario.sintetico} onChange={e => setDiario(d => ({ ...d, sintetico: +e.target.value }))} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Tecido</Label>
                <Input type="number" value={diario.tecido} onChange={e => setDiario(d => ({ ...d, tecido: +e.target.value }))} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Total</Label>
                <Input type="number" value={diario.total} onChange={e => setDiario(d => ({ ...d, total: +e.target.value }))} className="h-8" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Input value={diario.observacao} onChange={e => setDiario(d => ({ ...d, observacao: e.target.value }))} className="h-8" placeholder="Ex: 2 operadores ausentes" />
            </div>
            <Button onClick={saveDiario} disabled={saving} className="w-full">Salvar Capacidade do Dia</Button>
          </TabsContent>
          <TabsContent value="padrao" className="space-y-4 pt-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Sintético</Label>
                <Input type="number" value={padrao.sintetico} onChange={e => setPadrao(d => ({ ...d, sintetico: +e.target.value }))} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Tecido</Label>
                <Input type="number" value={padrao.tecido} onChange={e => setPadrao(d => ({ ...d, tecido: +e.target.value }))} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Total</Label>
                <Input type="number" value={padrao.total} onChange={e => setPadrao(d => ({ ...d, total: +e.target.value }))} className="h-8" />
              </div>
            </div>
            <Button onClick={savePadrao} disabled={saving} className="w-full">Salvar Capacidade Padrão</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

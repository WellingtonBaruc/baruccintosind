import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Loader2, MessageCircle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Vendedora {
  id: string;
  nome: string;
  whatsapp: string;
  ativa: boolean;
  criado_em: string;
}

export default function VendedorasManager() {
  const [vendedoras, setVendedoras] = useState<Vendedora[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendedora | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vendedora | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const fetch = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vendedoras').select('*').order('criado_em', { ascending: true });
    if (error) toast.error('Erro ao carregar vendedoras.');
    setVendedoras(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const resetForm = () => { setNome(''); setWhatsapp(''); };

  const openCreate = () => { setEditing(null); resetForm(); setDialogOpen(true); };

  const openEdit = (v: Vendedora) => {
    setEditing(v);
    setNome(v.nome);
    setWhatsapp(v.whatsapp);
    setDialogOpen(true);
  };

  const sanitizeWhatsapp = (val: string) => val.replace(/\D/g, '');

  const handleSave = async () => {
    const nomeTrim = nome.trim();
    const wpClean = sanitizeWhatsapp(whatsapp);
    if (!nomeTrim || !wpClean) { toast.error('Nome e WhatsApp são obrigatórios.'); return; }
    if (wpClean.length < 12) { toast.error('Número inválido. Use 55 + DDD + número.'); return; }

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('vendedoras').update({ nome: nomeTrim, whatsapp: wpClean }).eq('id', editing.id);
        if (error) throw error;
        toast.success('Vendedora atualizada.');
      } else {
        const { error } = await supabase.from('vendedoras').insert({ nome: nomeTrim, whatsapp: wpClean });
        if (error) throw error;
        toast.success('Vendedora cadastrada.');
      }
      setDialogOpen(false);
      resetForm();
      await fetch();
    } catch {
      toast.error('Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('vendedoras').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Erro ao excluir.'); }
    else { toast.success('Vendedora excluída.'); setDeleteTarget(null); await fetch(); }
    setDeleting(false);
  };

  const toggleAtiva = async (v: Vendedora) => {
    const { error } = await supabase.from('vendedoras').update({ ativa: !v.ativa }).eq('id', v.id);
    if (error) { toast.error('Erro ao alterar status.'); return; }
    toast.success(v.ativa ? 'Vendedora desativada.' : 'Vendedora ativada.');
    fetch();
  };

  const formatWhatsapp = (num: string) => {
    if (num.length === 13) return num.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4');
    if (num.length === 12) return num.replace(/(\d{2})(\d{2})(\d{4})(\d{4})/, '+$1 ($2) $3-$4');
    return num;
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          Vendedoras (WhatsApp)
        </CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : vendedoras.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma vendedora cadastrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendedoras.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.nome}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{formatWhatsapp(v.whatsapp)}</TableCell>
                  <TableCell><Switch checked={v.ativa} onCheckedChange={() => toggleAtiva(v)} /></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(v)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Vendedora' : 'Nova Vendedora'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria Silva" />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5511999999999" />
              <p className="text-xs text-muted-foreground">Formato: 55 + DDD + número (sem espaços)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vendedora</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

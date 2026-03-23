import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth, PerfilUsuario } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const PERFIS: PerfilUsuario[] = ['admin', 'gestor', 'supervisor_producao', 'operador_producao', 'comercial', 'financeiro', 'logistica', 'loja', 'almoxarifado'];

const PERFIL_LABELS: Record<PerfilUsuario, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  supervisor_producao: 'Supervisor Produção',
  operador_producao: 'Operador Produção',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  logistica: 'Logística',
  loja: 'Loja/Expedição',
  almoxarifado: 'Almoxarifado',
};

interface UsuarioRow {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  setor: string | null;
  ativo: boolean;
  criado_em: string;
}

export default function Usuarios() {
  const { profile } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UsuarioRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<PerfilUsuario>('operador_producao');
  const [setor, setSetor] = useState('');

  const fetchUsuarios = async () => {
    const { data } = await supabase.from('usuarios').select('*').order('criado_em', { ascending: false });
    setUsuarios(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsuarios(); }, []);

  if (profile?.perfil !== 'admin') return <Navigate to="/dashboard" replace />;

  const openCreate = () => {
    setEditing(null);
    setNome(''); setEmail(''); setSenha(''); setPerfil('operador_producao'); setSetor('');
    setDialogOpen(true);
  };

  const openEdit = (u: UsuarioRow) => {
    setEditing(u);
    setNome(u.nome); setEmail(u.email); setSenha(''); setPerfil(u.perfil); setSetor(u.setor || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nome.trim() || !email.trim()) {
      toast.error('Nome e email são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('usuarios').update({ nome, email, perfil, setor: setor || null }).eq('id', editing.id);
        if (error) throw error;
        toast.success('Usuário atualizado.');
      } else {
        if (!senha || senha.length < 6) {
          toast.error('Senha deve ter pelo menos 6 caracteres.');
          setSaving(false);
          return;
        }
        // Create auth user first via edge function or admin — for now use signUp
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome } },
        });
        if (authError) throw authError;
        if (!authData.user) throw new Error('Falha ao criar usuário.');

        const { error: insertError } = await supabase.from('usuarios').insert({
          id: authData.user.id,
          nome,
          email,
          perfil,
          setor: setor || null,
        });
        if (insertError) throw insertError;
        toast.success('Usuário criado com sucesso.');
      }
      setDialogOpen(false);
      fetchUsuarios();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar.');
    }
    setSaving(false);
  };

  const toggleAtivo = async (u: UsuarioRow) => {
    const { error } = await supabase.from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id);
    if (error) { toast.error('Erro ao alterar status.'); return; }
    toast.success(u.ativo ? 'Usuário desativado.' : 'Usuário ativado.');
    fetchUsuarios();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground mt-1">Gerencie os usuários do sistema.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo usuário
        </Button>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {PERFIL_LABELS[u.perfil]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.setor || '—'}</TableCell>
                    <TableCell>
                      <Switch checked={u.ativo} onCheckedChange={() => toggleAtivo(u)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {usuarios.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum usuário cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" disabled={false} />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={perfil} onValueChange={(v) => setPerfil(v as PerfilUsuario)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFIS.map((p) => (
                    <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Setor</Label>
              <Input value={setor} onChange={(e) => setSetor(e.target.value)} placeholder="Ex: Produção, Comercial..." />
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
    </div>
  );
}

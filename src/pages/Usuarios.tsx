import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth, PerfilUsuario } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

const ADMIN_USER_FUNCTION = 'admin-user-management';

interface UsuarioRow {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  setor: string | null;
  ativo: boolean;
  criado_em: string;
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export default function Usuarios() {
  const { profile } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UsuarioRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UsuarioRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<PerfilUsuario>('operador_producao');
  const [setor, setSetor] = useState('');

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('usuarios').select('*').order('criado_em', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar usuários.');
      setUsuarios([]);
    } else {
      setUsuarios(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  if (profile?.perfil !== 'admin') return <Navigate to="/dashboard" replace />;

  const resetForm = () => {
    setNome('');
    setEmail('');
    setSenha('');
    setPerfil('operador_producao');
    setSetor('');
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (usuario: UsuarioRow) => {
    setEditing(usuario);
    setNome(usuario.nome);
    setEmail(usuario.email);
    setSenha('');
    setPerfil(usuario.perfil);
    setSetor(usuario.setor || '');
    setDialogOpen(true);
  };

  const callAdminUserFunction = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(ADMIN_USER_FUNCTION, { body: payload });

    if (error) {
      throw error;
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  };

  const handleSave = async () => {
    const nomeSanitizado = nome.trim();
    const emailSanitizado = normalizeEmail(email);
    const setorSanitizado = setor.trim() || null;

    if (!nomeSanitizado || !emailSanitizado) {
      toast.error('Nome e email são obrigatórios.');
      return;
    }

    setSaving(true);

    try {
      if (editing) {
        await callAdminUserFunction({
          action: 'update',
          userId: editing.id,
          nome: nomeSanitizado,
          email: emailSanitizado,
          perfil,
          setor: setorSanitizado,
        });
        toast.success('Usuário atualizado.');
      } else {
        if (!senha || senha.length < 6) {
          toast.error('Senha deve ter pelo menos 6 caracteres.');
          return;
        }

        await callAdminUserFunction({
          action: 'create',
          nome: nomeSanitizado,
          email: emailSanitizado,
          senha,
          perfil,
          setor: setorSanitizado,
        });
        toast.success('Usuário criado com sucesso.');
      }

      setDialogOpen(false);
      resetForm();
      await fetchUsuarios();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar usuário.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      await callAdminUserFunction({ action: 'delete', userId: deleteTarget.id });
      toast.success('Usuário excluído.');
      setDeleteTarget(null);
      await fetchUsuarios();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir usuário.';
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleAtivo = async (usuario: UsuarioRow) => {
    const { error } = await supabase.from('usuarios').update({ ativo: !usuario.ativo }).eq('id', usuario.id);
    if (error) {
      toast.error('Erro ao alterar status.');
      return;
    }
    toast.success(usuario.ativo ? 'Usuário desativado.' : 'Usuário ativado.');
    fetchUsuarios();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="mt-1 text-muted-foreground">Gerencie os usuários do sistema.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Novo usuário
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
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell className="font-medium">{usuario.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{usuario.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {PERFIL_LABELS[usuario.perfil]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{usuario.setor || '—'}</TableCell>
                    <TableCell>
                      <Switch checked={usuario.ativo} onCheckedChange={() => toggleAtivo(usuario)} />
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(usuario)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(usuario)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {usuarios.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={perfil} onValueChange={(value) => setPerfil(value as PerfilUsuario)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFIS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PERFIL_LABELS[item]}
                    </SelectItem>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{deleteTarget?.nome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PERFIS = new Set([
  'admin',
  'gestor',
  'supervisor_producao',
  'operador_producao',
  'comercial',
  'financeiro',
  'logistica',
  'loja',
  'almoxarifado',
]);

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const normalizeText = (value: unknown) => String(value ?? '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authHeader = req.headers.get('Authorization');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: 'Configuração do backend incompleta.' }, 500);
    }

    if (!authHeader) {
      return json({ error: 'Não autorizado.' }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return json({ error: 'Sessão inválida.' }, 401);
    }

    const { data: requester, error: requesterError } = await adminClient
      .from('usuarios')
      .select('id, perfil, ativo')
      .eq('id', user.id)
      .maybeSingle();

    if (requesterError) throw requesterError;

    if (!requester || requester.perfil !== 'admin' || !requester.ativo) {
      return json({ error: 'Apenas administradores podem gerenciar usuários.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? '');

    if (!['create', 'update', 'delete'].includes(action)) {
      return json({ error: 'Ação inválida.' }, 400);
    }

    if (action === 'create') {
      const nome = normalizeText(body?.nome);
      const email = normalizeEmail(body?.email);
      const senha = String(body?.senha ?? '');
      const perfil = String(body?.perfil ?? '');
      const setor = normalizeText(body?.setor) || null;
      const kanbanProducaoAcesso = body?.kanban_producao_acesso !== false;
      const kanbanVendaAcesso = body?.kanban_venda_acesso !== false;

      if (!nome || !email || senha.length < 6 || !PERFIS.has(perfil)) {
        return json({ error: 'Dados inválidos para criar usuário.' }, 400);
      }

      const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      });

      if (createError || !createdUser.user) {
        throw createError ?? new Error('Falha ao criar usuário de autenticação.');
      }

      const { error: insertError } = await adminClient.from('usuarios').insert({
        id: createdUser.user.id,
        nome,
        email,
        perfil,
        setor,
        kanban_producao_acesso: kanbanProducaoAcesso,
        kanban_venda_acesso: kanbanVendaAcesso,
      });

      if (insertError) {
        await adminClient.auth.admin.deleteUser(createdUser.user.id);
        throw insertError;
      }

      return json({ success: true, userId: createdUser.user.id });
    }

    if (action === 'update') {
      const userId = String(body?.userId ?? '');
      const nome = normalizeText(body?.nome);
      const email = normalizeEmail(body?.email);
      const perfil = String(body?.perfil ?? '');
      const setor = normalizeText(body?.setor) || null;
      const kanbanProducaoAcesso = body?.kanban_producao_acesso !== false;
      const kanbanVendaAcesso = body?.kanban_venda_acesso !== false;

      if (!userId || !nome || !email || !PERFIS.has(perfil)) {
        return json({ error: 'Dados inválidos para atualizar usuário.' }, 400);
      }

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
        user_metadata: { nome },
      });

      if (authUpdateError) throw authUpdateError;

      const { error: profileUpdateError } = await adminClient
        .from('usuarios')
        .update({ nome, email, perfil, setor, kanban_producao_acesso: kanbanProducaoAcesso, kanban_venda_acesso: kanbanVendaAcesso })
        .eq('id', userId);

      if (profileUpdateError) throw profileUpdateError;

      return json({ success: true, userId });
    }

    const userId = String(body?.userId ?? '');

    if (!userId) {
      return json({ error: 'Usuário inválido para exclusão.' }, 400);
    }

    if (userId === requester.id) {
      return json({ error: 'Você não pode excluir o próprio usuário.' }, 400);
    }

    // Nullify FK references in related tables before deleting
    await adminClient.from('pedido_historico').update({ usuario_id: null }).eq('usuario_id', userId);
    await adminClient.from('op_etapas').update({ operador_id: null }).eq('operador_id', userId);
    await adminClient.from('ordens_producao').update({ supervisor_id: null }).eq('supervisor_id', userId);
    await adminClient.from('pedido_financeiro').update({ confirmado_por: null }).eq('confirmado_por', userId);
    await adminClient.from('pedido_logistica').update({ responsavel_envio_id: null }).eq('responsavel_envio_id', userId);
    await adminClient.from('ordem_perdas').update({ registrado_por: null }).eq('registrado_por', userId);
    await adminClient.from('ordem_perdas').update({ confirmado_por: null }).eq('confirmado_por', userId);
    await adminClient.from('solicitacoes_almoxarifado').update({ solicitado_por: null }).eq('solicitado_por', userId);
    await adminClient.from('solicitacoes_almoxarifado').update({ atendido_por: null }).eq('atendido_por', userId);
    await adminClient.from('op_etapa_montagem_operadores').delete().eq('operador_id', userId);

    // Delete profile row first (before auth, since usuarios.id references auth.users.id ON DELETE CASCADE)
    const { error: profileDeleteError } = await adminClient.from('usuarios').delete().eq('id', userId);
    if (profileDeleteError) throw profileDeleteError;

    // Now delete auth user
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (authDeleteError) throw authDeleteError;

    return json({ success: true, userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.';
    return json({ error: message }, 500);
  }
});

import { supabase } from '@/lib/supabase';

// Types
export interface Pedido {
  id: string;
  numero_pedido: string;
  api_venda_id: string | null;
  status_atual: string;
  cliente_nome: string;
  cliente_cpf_cnpj: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  cliente_endereco: string | null;
  vendedor_nome: string | null;
  valor_bruto: number;
  valor_desconto: number;
  valor_liquido: number;
  forma_pagamento: string | null;
  forma_envio: string | null;
  pagamento_confirmado: boolean;
  observacao_comercial: string | null;
  observacao_financeiro: string | null;
  observacao_logistica: string | null;
  usuario_responsavel_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  produto_api_id: string | null;
  descricao_produto: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  referencia_produto?: string | null;
  observacao_producao?: string | null;
  conferido?: boolean;
  disponivel?: boolean | null;
  quantidade_faltante?: number | null;
}

export interface OrdemProducao {
  id: string;
  pedido_id: string;
  pipeline_id: string;
  sequencia: number;
  status: string;
  tipo_produto: string | null;
  observacao: string | null;
  supervisor_id: string | null;
  aprovado_em: string | null;
  criado_em: string;
  pedidos?: Pedido;
  pipeline_producao?: { nome: string };
}

export interface OpEtapa {
  id: string;
  ordem_id: string;
  pipeline_etapa_id: string | null;
  nome_etapa: string;
  ordem_sequencia: number;
  status: string;
  operador_id: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  observacao: string | null;
  motivo_rejeicao: string | null;
  usuarios?: { nome: string } | null;
}

export interface PedidoHistorico {
  id: string;
  pedido_id: string;
  usuario_id: string | null;
  tipo_acao: string;
  status_anterior: string | null;
  status_novo: string | null;
  observacao: string | null;
  criado_em: string;
  usuarios?: { nome: string } | null;
}

// Generate sequential order number
export async function gerarNumeroPedido(): Promise<string> {
  const { count } = await supabase.from('pedidos').select('*', { count: 'exact', head: true });
  const seq = (count || 0) + 1;
  return `PED-${String(seq).padStart(5, '0')}`;
}

// Create pedido + itens + ordem + etapas in one flow
export async function criarPedidoCompleto(
  pedidoData: Record<string, any>,
  itens: Record<string, any>[],
  pipelineId: string,
  userId: string
) {
  // 1. Create pedido
  const { data: pedido, error: pedidoErr } = await supabase
    .from('pedidos')
    .insert(pedidoData as any)
    .select()
    .single();
  if (pedidoErr || !pedido) throw pedidoErr || new Error('Falha ao criar pedido');

  // 2. Create itens
  if (itens.length > 0) {
    const itensData = itens.map(i => ({ ...i, pedido_id: pedido.id }));
    const { error: itensErr } = await supabase.from('pedido_itens').insert(itensData as any);
    if (itensErr) throw itensErr;
  }

  // 3. Create ordem_producao
  const { data: ordem, error: ordemErr } = await supabase
    .from('ordens_producao')
    .insert({
      pedido_id: pedido.id,
      pipeline_id: pipelineId,
      sequencia: 1,
      status: 'EM_ANDAMENTO',
    })
    .select()
    .single();
  if (ordemErr || !ordem) throw ordemErr || new Error('Falha ao criar ordem');

  // 4. Get pipeline steps
  const { data: etapas } = await supabase
    .from('pipeline_etapas')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .order('ordem');

  if (etapas && etapas.length > 0) {
    const opEtapas = etapas.map((e, idx) => ({
      ordem_id: ordem.id,
      pipeline_etapa_id: e.id,
      nome_etapa: e.nome,
      ordem_sequencia: e.ordem,
      status: (idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE') as 'EM_ANDAMENTO' | 'PENDENTE',
      ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
    }));
    const { error: etapasErr } = await supabase.from('op_etapas').insert(opEtapas as any);
    if (etapasErr) throw etapasErr;
  }

  // 5. Update pedido status
  await supabase.from('pedidos').update({ status_atual: 'EM_PRODUCAO' }).eq('id', pedido.id);

  // 6. Register history
  await supabase.from('pedido_historico').insert({
    pedido_id: pedido.id,
    usuario_id: userId,
    tipo_acao: 'TRANSICAO',
    status_anterior: 'AGUARDANDO_PRODUCAO',
    status_novo: 'EM_PRODUCAO',
    observacao: 'Pedido criado e ordem de produção gerada automaticamente.',
  });

  return { pedido, ordem };
}

// Iniciar etapa (operador)
export async function iniciarEtapa(etapaId: string, operadorId: string, pedidoId: string) {
  const { error } = await supabase.from('op_etapas').update({
    status: 'EM_ANDAMENTO',
    operador_id: operadorId,
    iniciado_em: new Date().toISOString(),
  }).eq('id', etapaId);
  if (error) throw error;

  await supabase.from('pedido_historico').insert({
    pedido_id: pedidoId,
    usuario_id: operadorId,
    tipo_acao: 'TRANSICAO',
    observacao: 'Etapa iniciada.',
  });
}

// Concluir etapa (operador)
export async function concluirEtapa(
  etapaId: string,
  ordemId: string,
  pedidoId: string,
  userId: string,
  observacao?: string
) {
  // Mark current step done
  await supabase.from('op_etapas').update({
    status: 'CONCLUIDA',
    concluido_em: new Date().toISOString(),
    observacao: observacao || null,
  }).eq('id', etapaId);

  // Get all steps for this order
  const { data: allEtapas } = await supabase
    .from('op_etapas')
    .select('*')
    .eq('ordem_id', ordemId)
    .order('ordem_sequencia');

  if (!allEtapas) return;

  const currentIdx = allEtapas.findIndex(e => e.id === etapaId);
  const nextEtapa = allEtapas[currentIdx + 1];

  if (nextEtapa) {
    // Start next step
    await supabase.from('op_etapas').update({
      status: 'EM_ANDAMENTO',
      iniciado_em: new Date().toISOString(),
    }).eq('id', nextEtapa.id);
  } else {
    // All steps done — mark order as concluded
    await supabase.from('ordens_producao').update({ status: 'CONCLUIDA' }).eq('id', ordemId);

    // Check if ALL orders for this pedido are now CONCLUIDA
    const { data: allOrdens } = await supabase
      .from('ordens_producao')
      .select('id, status')
      .eq('pedido_id', pedidoId);

    // Auto-advance removed: supervisor must manually send to comercial via Kanban button
  }

  await supabase.from('pedido_historico').insert({
    pedido_id: pedidoId,
    usuario_id: userId,
    tipo_acao: 'TRANSICAO',
    observacao: `Etapa concluída.${observacao ? ' ' + observacao : ''}`,
  });
}

// Supervisor aprova ordem
export async function aprovarOrdem(ordemId: string, pedidoId: string, supervisorId: string) {
  await supabase.from('ordens_producao').update({
    status: 'CONCLUIDA',
    supervisor_id: supervisorId,
    aprovado_em: new Date().toISOString(),
  }).eq('id', ordemId);

  // Check if ALL orders for this pedido are approved
  const { data: allOrdens } = await supabase
    .from('ordens_producao')
    .select('id, status, aprovado_em')
    .eq('pedido_id', pedidoId);

  const allApproved = allOrdens?.every(o => o.aprovado_em !== null);

  // Get current pedido status
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('status_atual, subtipo_pronta_entrega')
    .eq('id', pedidoId)
    .single();

  const isLojaFlow = pedido?.status_atual === 'AGUARDANDO_OP_COMPLEMENTAR';

  if (isLojaFlow && allApproved) {
    // Check if almoxarifado solicitações are also resolved
    const { data: solicitacoes } = await supabase
      .from('solicitacoes_almoxarifado')
      .select('status')
      .eq('pedido_id', pedidoId);

    const allSolResolved = !solicitacoes || solicitacoes.length === 0 || 
      solicitacoes.every(s => s.status === 'ATENDIDA' || s.status === 'ATENDIDO');

    if (allSolResolved) {
      // All resolved — return to Loja for finalization (NEVER auto-advance to Comercial)
      await supabase.from('pedidos').update({ status_atual: 'LOJA_PENDENTE_FINALIZACAO' }).eq('id', pedidoId);
      await supabase.from('pedido_historico').insert({
        pedido_id: pedidoId,
        usuario_id: supervisorId,
        tipo_acao: 'TRANSICAO',
        status_anterior: 'AGUARDANDO_OP_COMPLEMENTAR',
        status_novo: 'LOJA_PENDENTE_FINALIZACAO',
        observacao: 'OP complementar aprovada e pendências resolvidas. Aguardando finalização pela Loja.',
      });
    } else {
      // OP done but almox pending — move to AGUARDANDO_ALMOXARIFADO
      await supabase.from('pedidos').update({ status_atual: 'AGUARDANDO_ALMOXARIFADO' }).eq('id', pedidoId);
      await supabase.from('pedido_historico').insert({
        pedido_id: pedidoId,
        usuario_id: supervisorId,
        tipo_acao: 'TRANSICAO',
        status_anterior: 'AGUARDANDO_OP_COMPLEMENTAR',
        status_novo: 'AGUARDANDO_ALMOXARIFADO',
        observacao: 'OP complementar aprovada. Aguardando almoxarifado.',
      });
    }
  } else if (allApproved && !isLojaFlow) {
    await supabase.from('pedidos').update({ status_atual: 'AGUARDANDO_COMERCIAL' }).eq('id', pedidoId);
    await supabase.from('pedido_historico').insert({
      pedido_id: pedidoId,
      usuario_id: supervisorId,
      tipo_acao: 'APROVACAO',
      status_anterior: 'EM_PRODUCAO',
      status_novo: 'AGUARDANDO_COMERCIAL',
      observacao: 'Todas as ordens aprovadas. Pedido encaminhado para comercial.',
    });
  } else {
    await supabase.from('pedido_historico').insert({
      pedido_id: pedidoId,
      usuario_id: supervisorId,
      tipo_acao: 'APROVACAO',
      observacao: 'Ordem de produção aprovada pelo supervisor.',
    });
  }
}

// Supervisor rejeita etapa
export async function rejeitarOrdem(
  ordemId: string,
  pedidoId: string,
  supervisorId: string,
  motivo: string
) {
  // Set order back to EM_ANDAMENTO
  await supabase.from('ordens_producao').update({ status: 'EM_ANDAMENTO' }).eq('id', ordemId);

  // Get last step and set to EM_ANDAMENTO with rejection reason
  const { data: etapas } = await supabase
    .from('op_etapas')
    .select('*')
    .eq('ordem_id', ordemId)
    .order('ordem_sequencia', { ascending: false })
    .limit(1);

  if (etapas && etapas[0]) {
    await supabase.from('op_etapas').update({
      status: 'EM_ANDAMENTO',
      concluido_em: null,
      motivo_rejeicao: motivo,
    }).eq('id', etapas[0].id);
  }

  await supabase.from('pedido_historico').insert({
    pedido_id: pedidoId,
    usuario_id: supervisorId,
    tipo_acao: 'REJEICAO',
    observacao: `Ordem rejeitada: ${motivo}`,
  });
}

// Status labels and colors
export const STATUS_PEDIDO_CONFIG: Record<string, { label: string; color: string }> = {
  AGUARDANDO_PRODUCAO: { label: 'Aguardando Produção', color: 'bg-muted text-muted-foreground' },
  EM_PRODUCAO: { label: 'Em Produção', color: 'bg-primary/15 text-primary' },
  PRODUCAO_CONCLUIDA: { label: 'Produção Concluída', color: 'bg-success/15 text-success' },
  AGUARDANDO_LOJA: { label: 'Aguardando Loja', color: 'bg-red-500/15 text-red-700 font-bold' },
  LOJA_VERIFICANDO: { label: 'Loja Verificando', color: 'bg-primary/15 text-primary' },
  AGUARDANDO_OP_COMPLEMENTAR: { label: 'Aguardando OP Complementar', color: 'bg-warning/15 text-warning' },
  AGUARDANDO_ALMOXARIFADO: { label: 'Aguardando Almoxarifado', color: 'bg-warning/15 text-warning' },
  LOJA_OK: { label: 'Loja OK', color: 'bg-success/15 text-success' },
  LOJA_PENDENTE_FINALIZACAO: { label: 'Aguardando Finalização da Loja', color: 'bg-orange-500/15 text-orange-600' },
  AGUARDANDO_COMERCIAL: { label: 'Aguardando Comercial', color: 'bg-red-500/15 text-red-700 font-bold' },
  VALIDADO_COMERCIAL: { label: 'Validado Comercial', color: 'bg-success/15 text-success' },
  AGUARDANDO_FINANCEIRO: { label: 'Aguardando Financeiro', color: 'bg-warning/15 text-warning' },
  VALIDADO_FINANCEIRO: { label: 'Validado Financeiro', color: 'bg-success/15 text-success' },
  LIBERADO_LOGISTICA: { label: 'Liberado Logística', color: 'bg-primary/15 text-primary' },
  EM_SEPARACAO: { label: 'Em Separação', color: 'bg-primary/15 text-primary' },
  ENVIADO: { label: 'Enviado', color: 'bg-success/15 text-success' },
  ENTREGUE: { label: 'Entregue', color: 'bg-success/20 text-success' },
  BLOQUEADO: { label: 'Bloqueado', color: 'bg-destructive/15 text-destructive' },
  CANCELADO: { label: 'Cancelado', color: 'bg-destructive/15 text-destructive' },
  FINALIZADO_SIMPLIFICA: { label: 'Finalizado (Simplifica)', color: 'bg-muted text-muted-foreground' },
  AGUARDANDO_CIENCIA_COMERCIAL: { label: 'Aguardando Ciência do Comercial', color: 'bg-warning/15 text-warning' },
  HISTORICO: { label: 'Histórico', color: 'bg-muted text-muted-foreground' },
};

export const STATUS_ORDEM_CONFIG: Record<string, { label: string; color: string }> = {
  AGUARDANDO: { label: 'Aguardando', color: 'bg-muted text-muted-foreground' },
  EM_ANDAMENTO: { label: 'Em Andamento', color: 'bg-primary/15 text-primary' },
  CONCLUIDA: { label: 'Concluída', color: 'bg-success/15 text-success' },
  REJEITADA: { label: 'Rejeitada', color: 'bg-destructive/15 text-destructive' },
  CANCELADA: { label: 'Cancelada', color: 'bg-destructive/15 text-destructive' },
};

export const STATUS_ETAPA_CONFIG: Record<string, { label: string; color: string }> = {
  PENDENTE: { label: 'Pendente', color: 'bg-muted text-muted-foreground' },
  EM_ANDAMENTO: { label: 'Em Andamento', color: 'bg-primary/15 text-primary' },
  CONCLUIDA: { label: 'Concluída', color: 'bg-success/15 text-success' },
  REJEITADA: { label: 'Rejeitada', color: 'bg-destructive/15 text-destructive' },
};

export const SUBTIPO_PRONTA_ENTREGA_CONFIG: Record<string, { label: string; description: string }> = {
  A_CINTOS: { label: 'A — Cintos', description: 'Tudo em estoque, pronto para envio' },
  B_OP_COMPLEMENTAR: { label: 'B — OP Complementar', description: 'Itens faltantes precisam de produção' },
  C_FIVELAS: { label: 'C — Fivelas', description: 'Solicitar fivelas ao almoxarifado' },
  D_MISTO: { label: 'D — Misto', description: 'Combinação de produção + almoxarifado' },
};

// Loja: iniciar verificação
export async function iniciarVerificacaoLoja(pedidoId: string, userId: string) {
  await supabase.from('pedidos').update({ status_atual: 'LOJA_VERIFICANDO' }).eq('id', pedidoId);
  await supabase.from('pedido_historico').insert({
    pedido_id: pedidoId,
    usuario_id: userId,
    tipo_acao: 'TRANSICAO',
    status_anterior: 'AGUARDANDO_LOJA',
    status_novo: 'LOJA_VERIFICANDO',
    observacao: 'Loja iniciou a verificação do pedido.',
  });
}

// Loja: confirmar caminho A (tudo ok)
export async function confirmarLojaOk(pedidoId: string, userId: string, subtipo: string) {
  await supabase.from('pedidos').update({
    status_atual: 'LOJA_OK',
    subtipo_pronta_entrega: subtipo,
  }).eq('id', pedidoId);

  // Auto-advance to AGUARDANDO_COMERCIAL
  await supabase.from('pedidos').update({ status_atual: 'AGUARDANDO_COMERCIAL' }).eq('id', pedidoId);

  await supabase.from('pedido_historico').insert({
    pedido_id: pedidoId,
    usuario_id: userId,
    tipo_acao: 'TRANSICAO',
    status_anterior: 'LOJA_VERIFICANDO',
    status_novo: 'AGUARDANDO_COMERCIAL',
    observacao: `Loja confirmou OK (${subtipo}). Pedido encaminhado para comercial.`,
  });
}

// Loja: definir caminho e subtipo
export async function definirCaminhoLoja(
  pedidoId: string,
  userId: string,
  subtipo: string,
  novoStatus: string
) {
  await supabase.from('pedidos').update({
    status_atual: novoStatus as any,
    subtipo_pronta_entrega: subtipo,
  } as any).eq('id', pedidoId);

  await supabase.from('pedido_historico').insert({
    pedido_id: pedidoId,
    usuario_id: userId,
    tipo_acao: 'TRANSICAO',
    status_anterior: 'LOJA_VERIFICANDO',
    status_novo: novoStatus,
    observacao: `Loja definiu caminho ${subtipo}.`,
  });
}

// Loja: finalizar verificação (todos os itens resolvidos)
export async function finalizarVerificacaoLoja(pedidoId: string, userId: string) {
  await supabase.from('pedidos').update({ status_atual: 'AGUARDANDO_COMERCIAL' }).eq('id', pedidoId);
  await supabase.from('pedido_historico').insert({
    pedido_id: pedidoId,
    usuario_id: userId,
    tipo_acao: 'TRANSICAO',
    status_anterior: 'LOJA_OK',
    status_novo: 'AGUARDANDO_COMERCIAL',
    observacao: 'Verificação concluída. Pedido encaminhado para comercial.',
  });
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_URL = Deno.env.get('SIMPLIFICA_API_URL') ?? '';

const PIPELINE_IDS: Record<string, string> = {
  SINTETICO: '00000000-0000-0000-0000-000000000001',
  TECIDO: '00000000-0000-0000-0000-000000000002',
  FIVELA_COBERTA: '00000000-0000-0000-0000-000000000003',
};

interface SyncResult {
  total_recebidos: number;
  total_inseridos: number;
  total_atualizados: number;
  total_ignorados: number;
  total_erros: number;
  paginas_processadas: number;
  erros: string[];
  alertas: string[];
}

function parseDateBR(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

function fmtBRL(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

// Classify product type from name and category
function classificarProduto(nomeProduto: string, categoriaProduto?: string, referenciaProduto?: string): string {
  const upper = (nomeProduto || '').toUpperCase();
  const catUpper = (categoriaProduto || '').toUpperCase();
  const refUpper = (referenciaProduto || '').toUpperCase();
  if (upper.includes('FIVELA COBERTA') || upper.includes('FIVELA MATRIZ') || catUpper === 'FIVELA COBERTA' || catUpper === 'FIVELA_COBERTA' || refUpper.startsWith('FVC')) return 'FIVELA_COBERTA';
  if (upper.includes('CINTO SINTETICO') || upper.includes('TIRA SINTETICO') || upper.includes('CINTO SINTÉTICO') || upper.includes('TIRA SINTÉTICO')) return 'SINTETICO';
  if (upper.includes('CINTO TECIDO') || upper.includes('TIRA TECIDO')) return 'TECIDO';
  return 'OUTROS';
}

/**
 * Reconcile status_atual based on new status_api from Simplifica.
 * Returns the new status_atual or null if no change needed.
 */
function reconcileStatusAtual(
  newStatusApi: string,
  currentStatusAtual: string,
  hasActiveComplementaryOp: boolean
): string | null {
  const normalized = (newStatusApi || '').trim();

  if (normalized === 'Finalizado') {
    const terminalStates = ['CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO', 'ENVIADO', 'ENTREGUE', 'AGUARDANDO_CIENCIA_COMERCIAL'];
    if (terminalStates.includes(currentStatusAtual)) return null;
    return 'FINALIZADO_SIMPLIFICA';
  }

  if (normalized === 'Pedido Enviado') {
    const postLojaStates = [
      'AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL',
      'AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO',
      'LIBERADO_LOGISTICA', 'EM_SEPARACAO',
      'ENVIADO', 'ENTREGUE', 'AGUARDANDO_CIENCIA_COMERCIAL', 'CANCELADO',
      'FINALIZADO_SIMPLIFICA', 'HISTORICO',
    ];
    if (postLojaStates.includes(currentStatusAtual)) return null;
    
    if (hasActiveComplementaryOp) {
      if (['AGUARDANDO_OP_COMPLEMENTAR', 'AGUARDANDO_ALMOXARIFADO'].includes(currentStatusAtual)) {
        return null;
      }
    }
    
    const productionStates = ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO', 'PRODUCAO_CONCLUIDA'];
    if (productionStates.includes(currentStatusAtual)) {
      return 'AGUARDANDO_LOJA';
    }
    
    const lojaStates = ['AGUARDANDO_LOJA', 'LOJA_VERIFICANDO', 'LOJA_OK'];
    if (lojaStates.includes(currentStatusAtual)) return null;
    
    return null;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let tipo = 'MANUAL';
  let diasOverride: number | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    tipo = body.tipo || 'MANUAL';
    if (body.dias_override && typeof body.dias_override === 'number' && body.dias_override > 0) {
      diasOverride = body.dias_override;
    }
  } catch { /* default */ }

  const result: SyncResult = {
    total_recebidos: 0,
    total_inseridos: 0,
    total_atualizados: 0,
    total_ignorados: 0,
    total_erros: 0,
    paginas_processadas: 0,
    erros: [],
    alertas: [],
  };

  try {
    const { data: config } = await supabase
      .from('integracao_configuracao')
      .select('*')
      .limit(1)
      .single();

    const isFirstSync = !config?.ultima_sincronizacao;
    const diasImportacao = diasOverride || (isFirstSync ? (config?.dias_importacao_inicial || 15) : 7);

    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasImportacao);
    const dataInicioStr = `${String(dataInicio.getDate()).padStart(2, '0')}/${String(dataInicio.getMonth() + 1).padStart(2, '0')}/${dataInicio.getFullYear()}`;

    // Load all pipeline steps
    const pipelineEtapasMap: Record<string, any[]> = {};
    for (const [tipo, pId] of Object.entries(PIPELINE_IDS)) {
      const { data: etapas } = await supabase
        .from('pipeline_etapas')
        .select('*')
        .eq('pipeline_id', pId)
        .order('ordem');
      pipelineEtapasMap[tipo] = etapas || [];
    }

    // Also load pcp_configuracao for lead time
    const { data: pcpConfigs } = await supabase.from('pcp_configuracao').select('*');
    const leadTimeMap: Record<string, number> = {};
    for (const cfg of (pcpConfigs || [])) {
      leadTimeMap[cfg.tipo_produto] = cfg.lead_time_dias;
    }

    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${API_URL}?limit=${limit}&offset=${offset}&dte_venda_ini=${dataInicioStr}`;
      console.log(`Fetching page: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const vendasArray = Array.isArray(data.items) ? data.items : [];
      const apiHasMore = data.hasMore === true;

      result.paginas_processadas++;
      result.total_recebidos += vendasArray.length;

      for (const venda of vendasArray) {
        try {
          const statusApi = (venda.situacao_texto || '').trim();
          const apiVendaId = String(venda.id_venda);

          const { data: existente } = await supabase
            .from('pedidos')
            .select('id, status_atual, sincronizacao_bloqueada, status_api, numero_pedido')
            .eq('api_venda_id', apiVendaId)
            .maybeSingle();

          if (existente) {
            await processarExistente(supabase, venda, existente, statusApi, result);
          } else if (statusApi === 'Em Produção' || statusApi === 'Pedido Enviado') {
            await inserirNovoPedido(supabase, venda, statusApi, pipelineEtapasMap, leadTimeMap, result);
          }
        } catch (err: any) {
          result.total_erros++;
          result.erros.push(`Venda ${venda.id_venda}: ${err.message}`);
        }
      }

      hasMore = apiHasMore && vendasArray.length === limit;
      offset += limit;
    }

    if (config?.id) {
      await supabase
        .from('integracao_configuracao')
        .update({ ultima_sincronizacao: new Date().toISOString() })
        .eq('id', config.id);
    }

    const duracao = Date.now() - startTime;
    const logStatus = result.total_erros > 0
      ? (result.total_inseridos > 0 || result.total_atualizados > 0 ? 'PARCIAL' : 'ERRO')
      : 'SUCESSO';

    await supabase.from('integracao_logs').insert({
      tipo,
      status: logStatus,
      total_recebidos: result.total_recebidos,
      total_inseridos: result.total_inseridos,
      total_atualizados: result.total_atualizados,
      total_ignorados: result.total_ignorados,
      total_erros: result.total_erros,
      paginas_processadas: result.paginas_processadas,
      erro_detalhes: result.erros.length > 0 ? result.erros.join('\n') : null,
      duracao_ms: duracao,
    });

    return new Response(JSON.stringify({
      success: true,
      ...result,
      duracao_ms: duracao,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    const duracao = Date.now() - startTime;
    await supabase.from('integracao_logs').insert({
      tipo,
      status: 'ERRO',
      total_recebidos: result.total_recebidos,
      total_inseridos: result.total_inseridos,
      total_atualizados: result.total_atualizados,
      total_ignorados: result.total_ignorados,
      total_erros: result.total_erros + 1,
      paginas_processadas: result.paginas_processadas,
      erro_detalhes: err.message,
      duracao_ms: duracao,
    });

    return new Response(JSON.stringify({ success: false, error: err.message, ...result }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Process existing order: detect changes, diff items, RECONCILE status ──

async function processarExistente(
  supabase: any,
  venda: any,
  existente: any,
  statusApi: string,
  result: SyncResult
) {
  let hadChanges = false;

  // ── Reconciliação de status ──
  // Atua quando:
  // 1. status_api mudou no Simplifica (fluxo normal), OU
  // 2. status_api já é "Finalizado" mas status_atual interno ainda está errado
  //    (pedidos antigos que acumularam inconsistência antes do cron ser ativado)
  const terminalStatesOk = ['CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO', 'ENVIADO', 'ENTREGUE', 'AGUARDANDO_CIENCIA_COMERCIAL'];
  const statusApiMudou = existente.status_api !== statusApi;
  const statusInconsistente = statusApi === 'Finalizado' && !terminalStatesOk.includes(existente.status_atual);

  if (statusApiMudou || statusInconsistente) {
    const { data: activeOps } = await supabase
      .from('ordens_producao')
      .select('id, sequencia')
      .eq('pedido_id', existente.id)
      .gt('sequencia', 1)
      .not('status', 'in', '("CONCLUIDA","CANCELADA")');

    const hasActiveComplementaryOp = (activeOps || []).length > 0;

    if (statusApiMudou) {
      await supabase.from('pedidos').update({ status_api: statusApi }).eq('id', existente.id);
      hadChanges = true;
    }

    const newStatusAtual = reconcileStatusAtual(statusApi, existente.status_atual, hasActiveComplementaryOp);
    if (newStatusAtual) {
      await supabase.from('pedidos').update({ status_atual: newStatusAtual }).eq('id', existente.id);
      await supabase.from('pedido_historico').insert({
        pedido_id: existente.id,
        tipo_acao: 'TRANSICAO',
        status_anterior: existente.status_atual,
        status_novo: newStatusAtual,
        observacao: statusApiMudou
          ? `Status reconciliado: Simplifica mudou para "${statusApi}". ${existente.status_atual} → ${newStatusAtual}.`
          : `Status corrigido automaticamente: Simplifica já estava "${statusApi}" mas interno era ${existente.status_atual}. Corrigido para ${newStatusAtual}.`,
      });
      hadChanges = true;
    }

    if (statusApi === 'Finalizado' && ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO'].includes(existente.status_atual)) {
      await supabase.from('pedido_historico').insert({
        pedido_id: existente.id,
        tipo_acao: 'COMENTARIO',
        observacao: `⚠️ ALERTA: Simplifica marcou como Finalizado mas produção interna estava em ${existente.status_atual}.`,
      });
    }
  }

  if (existente.sincronizacao_bloqueada) {
    const apiItens = (venda.itens2 || venda.itens || []) as any[];
    const { data: dbItens } = await supabase
      .from('pedido_itens')
      .select('*')
      .eq('pedido_id', existente.id);

    const itemChanges = detectItemChanges(dbItens || [], apiItens);

    if (itemChanges.hasChanges) {
      hadChanges = true;

      const diffLines: string[] = [];
      for (const changed of itemChanges.changed) {
        const lines = [`Item alterado: ${changed.descricao}`];
        if (changed.qtdBefore !== changed.qtdAfter) lines.push(`  Quantidade: ${changed.qtdBefore} → ${changed.qtdAfter}`);
        if (changed.vlBefore !== changed.vlAfter) lines.push(`  Valor unitário: ${fmtBRL(changed.vlBefore)} → ${fmtBRL(changed.vlAfter)}`);
        if (changed.obsBefore !== changed.obsAfter) lines.push(`  Observação produção alterada`);
        diffLines.push(lines.join('\n'));
      }
      for (const added of itemChanges.added) {
        diffLines.push(`Item adicionado: ${added.descricao}\n  Quantidade: ${added.qtd} — Valor: ${fmtBRL(added.vl)}`);
      }
      for (const removed of itemChanges.removed) {
        diffLines.push(`Item removido: ${removed.descricao}\n  Quantidade era: ${removed.qtd}`);
      }

      await supabase.from('pedido_historico').insert({
        pedido_id: existente.id,
        tipo_acao: 'ALTERACAO_ITENS',
        observacao: diffLines.join('\n\n'),
      });

      await applyItemChanges(supabase, existente.id, dbItens || [], apiItens);

      const activeStatuses = ['EM_PRODUCAO', 'PRODUCAO_CONCLUIDA', 'AGUARDANDO_COMERCIAL', 'AGUARDANDO_LOJA', 'LOJA_VERIFICANDO', 'AGUARDANDO_OP_COMPLEMENTAR'];
      if (activeStatuses.includes(existente.status_atual)) {
        await supabase.from('pedido_historico').insert({
          pedido_id: existente.id,
          tipo_acao: 'COMENTARIO',
          observacao: `🔔 ATENÇÃO: Pedido ${existente.numero_pedido} teve itens alterados no Simplifica — verifique antes de prosseguir.`,
        });
        result.alertas.push(`Pedido ${existente.numero_pedido}: itens alterados enquanto em ${existente.status_atual}`);
      }
    }
  }

  if (hadChanges) {
    result.total_atualizados++;
  } else {
    result.total_ignorados++;
  }
}

// ── Detect item changes ──

interface ItemChange {
  hasChanges: boolean;
  changed: { descricao: string; qtdBefore: number; qtdAfter: number; vlBefore: number; vlAfter: number; obsBefore: string | null; obsAfter: string | null; before: any; after: any }[];
  added: { descricao: string; qtd: number; vl: number; raw: any }[];
  removed: { descricao: string; qtd: number; raw: any }[];
}

function detectItemChanges(dbItens: any[], apiItens: any[]): ItemChange {
  const result: ItemChange = { hasChanges: false, changed: [], added: [], removed: [] };

  const dbMap = new Map<string, any>();
  for (const item of dbItens) {
    if (item.api_item_id) dbMap.set(item.api_item_id, item);
  }

  const apiMap = new Map<string, any>();
  for (const item of apiItens) {
    const key = item.id_item ? String(item.id_item) : null;
    if (key) apiMap.set(key, item);
  }

  for (const [apiId, apiItem] of apiMap) {
    const dbItem = dbMap.get(apiId);
    if (dbItem) {
      const qtdApi = parseInt(apiItem.qt_item) || 1;
      const vlApi = parseFloat(apiItem.vl_unitario) || 0;
      const obsApi = apiItem.ds_observacao || null;
      const qtdDb = dbItem.quantidade;
      const vlDb = parseFloat(dbItem.valor_unitario) || 0;
      const obsDb = dbItem.observacao_producao || null;

      if (qtdApi !== qtdDb || Math.abs(vlApi - vlDb) > 0.001 || obsApi !== obsDb) {
        result.hasChanges = true;
        result.changed.push({
          descricao: apiItem.nm_produto || dbItem.descricao_produto,
          qtdBefore: qtdDb, qtdAfter: qtdApi,
          vlBefore: vlDb, vlAfter: vlApi,
          obsBefore: obsDb, obsAfter: obsApi,
          before: { api_item_id: apiId, quantidade: qtdDb, valor_unitario: vlDb, observacao_producao: obsDb },
          after: { api_item_id: apiId, quantidade: qtdApi, valor_unitario: vlApi, observacao_producao: obsApi },
        });
      }
    } else {
      result.hasChanges = true;
      result.added.push({
        descricao: apiItem.nm_produto || 'Sem descrição',
        qtd: parseInt(apiItem.qt_item) || 1,
        vl: parseFloat(apiItem.vl_unitario) || 0,
        raw: apiItem,
      });
    }
  }

  for (const [, dbItem] of dbMap) {
    if (!apiMap.has(dbItem.api_item_id)) {
      result.hasChanges = true;
      result.removed.push({ descricao: dbItem.descricao_produto, qtd: dbItem.quantidade, raw: dbItem });
    }
  }

  return result;
}

// ── Apply item changes ──

async function applyItemChanges(supabase: any, pedidoId: string, dbItens: any[], apiItens: any[]) {
  const dbMap = new Map<string, any>();
  for (const item of dbItens) {
    if (item.api_item_id) dbMap.set(item.api_item_id, item);
  }

  for (const apiItem of apiItens) {
    const apiId = apiItem.id_item ? String(apiItem.id_item) : null;
    if (!apiId) continue;

    const dbItem = dbMap.get(apiId);
    if (dbItem) {
      await supabase.from('pedido_itens').update({
        quantidade: parseInt(apiItem.qt_item) || 1,
        valor_unitario: parseFloat(apiItem.vl_unitario) || 0,
        valor_unitario_liquido: parseFloat(apiItem.vl_unitario_com_desconto) || 0,
        valor_total: parseFloat(apiItem.vl_total_com_desconto) || 0,
        observacao_producao: apiItem.ds_observacao || null,
        descricao_produto: apiItem.nm_produto || dbItem.descricao_produto,
        referencia_produto: apiItem.nm_referencia || null,
        categoria_produto: apiItem.nm_categoria || null,
      }).eq('id', dbItem.id);
      dbMap.delete(apiId);
    } else {
      await supabase.from('pedido_itens').insert({
        pedido_id: pedidoId,
        api_item_id: apiId,
        produto_api_id: apiItem.id_produto ? String(apiItem.id_produto) : null,
        descricao_produto: apiItem.nm_produto || 'Sem descrição',
        referencia_produto: apiItem.nm_referencia || null,
        categoria_produto: apiItem.nm_categoria || null,
        quantidade: parseInt(apiItem.qt_item) || 1,
        valor_unitario: parseFloat(apiItem.vl_unitario) || 0,
        valor_unitario_liquido: parseFloat(apiItem.vl_unitario_com_desconto) || 0,
        valor_total: parseFloat(apiItem.vl_total_com_desconto) || 0,
        observacao_producao: apiItem.ds_observacao || null,
        unidade_medida: 'UN',
      });
    }
  }

  for (const [, dbItem] of dbMap) {
    await supabase.from('pedido_itens').delete().eq('id', dbItem.id);
  }
}

// ── Insert new order with auto-classification ──

async function inserirNovoPedido(
  supabase: any,
  venda: any,
  statusApi: string,
  pipelineEtapasMap: Record<string, any[]>,
  leadTimeMap: Record<string, number>,
  result: SyncResult
) {
  const apiVendaId = String(venda.id_venda);
  const tipoFluxo = statusApi === 'Em Produção' ? 'PRODUCAO' : 'PRONTA_ENTREGA';
  const statusAtual = statusApi === 'Em Produção' ? 'AGUARDANDO_PRODUCAO' : 'AGUARDANDO_LOJA';
  const shouldCreateOPs = statusApi === 'Em Produção';

  // Usar sequence atômica para evitar race condition em sincronizações simultâneas
  const { data: seqData, error: seqErr } = await supabase.rpc('next_numero_pedido');
  if (seqErr) throw new Error(`Falha ao gerar número de pedido: ${seqErr.message}`);
  const numeroPedido = seqData as string;

  // Calculate lead time from previsao_entrega
  const dataPrevisao = parseDateBR(venda.dt_previsao_entrega);
  let leadTimeDias: number | null = null;
  let dataInicioNecessaria: string | null = null;
  let statusPrazo = 'NO_PRAZO';

  const itens = venda.itens2 || venda.itens || [];

  // Classify items by type
  const tiposProduto = new Set<string>();
  for (const item of (Array.isArray(itens) ? itens : [])) {
    tiposProduto.add(classificarProduto(item.nm_produto || '', item.nm_categoria || '', item.nm_referencia || ''));
  }

  // Calculate max lead time across production types only (exclude OUTROS)
  if (dataPrevisao && tipoFluxo === 'PRODUCAO') {
    let maxLeadTime = 0;
    for (const tp of tiposProduto) {
      if (tp === 'OUTROS') continue; // Adicionais não entram no cálculo de lead time
      const lt = leadTimeMap[tp] || 2;
      if (lt > maxLeadTime) maxLeadTime = lt;
    }
    leadTimeDias = maxLeadTime;

    const previsaoDate = new Date(dataPrevisao);
    const inicioDate = new Date(previsaoDate);
    inicioDate.setDate(inicioDate.getDate() - maxLeadTime);
    dataInicioNecessaria = inicioDate.toISOString().split('T')[0];

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicioCheck = new Date(dataInicioNecessaria);
    if (hoje > inicioCheck) statusPrazo = 'ATRASADO';
    else if (hoje.getTime() === inicioCheck.getTime()) statusPrazo = 'ATENCAO';
    else statusPrazo = 'NO_PRAZO';
  }

  const { data: pedido, error: pedidoErr } = await supabase
    .from('pedidos')
    .insert({
      numero_pedido: numeroPedido,
      api_venda_id: apiVendaId,
      status_atual: statusAtual,
      status_api: statusApi,
      tipo_fluxo: tipoFluxo,
      sincronizacao_bloqueada: true,
      cliente_nome: venda.nm_cliente || 'Sem nome',
      api_cliente_id: venda.id_cliente ? String(venda.id_cliente) : null,
      cliente_endereco: venda.ds_endereco || null,
      vendedor_codigo: venda.cd_responsavel_venda || null,
      vendedor_nome: venda.cd_responsavel_venda || null,
      canal_venda: venda.nm_origem_venda || null,
      valor_bruto: parseFloat(venda.vl_total) || 0,
      valor_desconto: parseFloat(venda.vl_desconto) || 0,
      valor_liquido: parseFloat(venda.vl_total) || 0,
      valor_produtos: parseFloat(venda.vl_produtos) || 0,
      valor_frete: parseFloat(venda.vl_frete) || 0,
      valor_acrescimo: parseFloat(venda.vl_acrescimo) || 0,
      observacao_api: venda.ds_observacao || null,
      observacao_interna_api: venda.ds_observacao_interna || null,
      data_venda_api: venda.dte_venda ? venda.dte_venda.split('T')[0] : null,
      data_previsao_entrega: dataPrevisao,
      data_entrega_api: parseDateBR(venda.dt_entrega),
      lead_time_preparacao_dias: leadTimeDias,
      data_inicio_producao_necessaria: dataInicioNecessaria,
      status_prazo: statusPrazo,
    })
    .select('id')
    .single();

  if (pedidoErr) throw pedidoErr;

  // Insert items
  if (Array.isArray(itens) && itens.length > 0) {
    const itensData = itens.map((item: any) => ({
      pedido_id: pedido.id,
      api_item_id: item.id_item ? String(item.id_item) : null,
      produto_api_id: item.id_produto ? String(item.id_produto) : null,
      descricao_produto: item.nm_produto || 'Sem descrição',
      referencia_produto: item.nm_referencia || null,
      categoria_produto: item.nm_categoria || null,
      quantidade: parseInt(item.qt_item) || 1,
      valor_unitario: parseFloat(item.vl_unitario) || 0,
      valor_unitario_liquido: parseFloat(item.vl_unitario_com_desconto) || 0,
      valor_total: parseFloat(item.vl_total_com_desconto) || 0,
      observacao_producao: item.ds_observacao || null,
      unidade_medida: 'UN',
    }));
    await supabase.from('pedido_itens').insert(itensData);
  }

  // Create production orders only for 'Em Produção'
  if (shouldCreateOPs) {
    const itensByTipo: Record<string, any[]> = {};
    for (const item of (Array.isArray(itens) ? itens : [])) {
      const tipo = classificarProduto(item.nm_produto || '', item.nm_categoria || '', item.nm_referencia || '');
      if (!itensByTipo[tipo]) itensByTipo[tipo] = [];
      itensByTipo[tipo].push(item);
    }

    let sequencia = 1;
    for (const [tipoProduto, _tipoItens] of Object.entries(itensByTipo)) {
      // Adicionais (OUTROS) não geram OP
      if (tipoProduto === 'OUTROS') continue;

      const pipelineId = PIPELINE_IDS[tipoProduto] || PIPELINE_IDS['SINTETICO'];
      const etapas = pipelineEtapasMap[tipoProduto] || pipelineEtapasMap['SINTETICO'] || [];

      const { data: ordem } = await supabase
        .from('ordens_producao')
        .insert({
          pedido_id: pedido.id,
          pipeline_id: pipelineId,
          sequencia,
          status: 'AGUARDANDO',
          tipo_produto: tipoProduto,
        })
        .select('id')
        .single();

      if (ordem && etapas.length > 0) {
        const opEtapas = etapas.map((e: any, idx: number) => ({
          ordem_id: ordem.id,
          pipeline_etapa_id: e.id,
          nome_etapa: e.nome,
          ordem_sequencia: e.ordem,
          status: 'PENDENTE',
        }));
        await supabase.from('op_etapas').insert(opEtapas);
      }

      sequencia++;
    }

    // After creating OPs, set status to EM_PRODUCAO
    await supabase.from('pedidos').update({ status_atual: 'EM_PRODUCAO' }).eq('id', pedido.id);
  }

  await supabase.from('pedido_historico').insert({
    pedido_id: pedido.id,
    tipo_acao: 'TRANSICAO',
    status_anterior: null,
    status_novo: shouldCreateOPs ? 'EM_PRODUCAO' : statusAtual,
    observacao: `Pedido importado da API Simplifica (${statusApi}). Fluxo: ${tipoFluxo}.${tiposProduto.size > 1 ? ` Tipos: ${[...tiposProduto].join(', ')}.` : ''}`,
  });

  result.total_inseridos++;
}

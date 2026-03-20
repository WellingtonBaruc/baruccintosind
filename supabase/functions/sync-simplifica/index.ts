import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_URL = 'https://app.simplificagestao.com.br/simplifica/api/bi/v2/venda_com_item/1MORY0PAW7';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let tipo = 'MANUAL';
  try {
    const body = await req.json().catch(() => ({}));
    tipo = body.tipo || 'MANUAL';
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
    const diasImportacao = isFirstSync ? (config?.dias_importacao_inicial || 15) : 2;

    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasImportacao);
    const dataInicioStr = `${String(dataInicio.getDate()).padStart(2, '0')}/${String(dataInicio.getMonth() + 1).padStart(2, '0')}/${dataInicio.getFullYear()}`;

    const { data: pipeline } = await supabase
      .from('pipeline_producao')
      .select('id')
      .eq('padrao', true)
      .eq('ativo', true)
      .limit(1)
      .single();

    const pipelineId = pipeline?.id;
    let pipelineEtapas: any[] = [];
    if (pipelineId) {
      const { data: etapas } = await supabase
        .from('pipeline_etapas')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('ordem');
      pipelineEtapas = etapas || [];
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
          const statusApi = venda.situacao_texto || '';
          const apiVendaId = String(venda.id_venda);

          const { data: existente } = await supabase
            .from('pedidos')
            .select('id, status_atual, sincronizacao_bloqueada, status_api, numero_pedido')
            .eq('api_venda_id', apiVendaId)
            .maybeSingle();

          if (existente) {
            await processarExistente(supabase, venda, existente, statusApi, result);
          } else if (statusApi === 'Em Produção' || statusApi === 'Pedido Enviado') {
            await inserirNovoPedido(supabase, venda, statusApi, pipelineId, pipelineEtapas, result);
          }
          // Any other status for new records → skip entirely
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

// ── Process existing order: detect changes, diff items ──

async function processarExistente(
  supabase: any,
  venda: any,
  existente: any,
  statusApi: string,
  result: SyncResult
) {
  let hadChanges = false;

  // 1. Check status_api change
  if (existente.status_api !== statusApi) {
    await supabase.from('pedidos').update({ status_api: statusApi }).eq('id', existente.id);
    hadChanges = true;

    if (statusApi === 'Finalizado' && ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO'].includes(existente.status_atual)) {
      await supabase.from('pedido_historico').insert({
        pedido_id: existente.id,
        tipo_acao: 'COMENTARIO',
        observacao: `⚠️ ALERTA: Simplifica marcou como Finalizado mas produção interna ainda está em ${existente.status_atual}.`,
      });
    }
  }

  // 2. Detect item-level changes (only if bloqueada — means we manage it)
  if (existente.sincronizacao_bloqueada) {
    const apiItens = (venda.itens2 || venda.itens || []) as any[];
    const { data: dbItens } = await supabase
      .from('pedido_itens')
      .select('*')
      .eq('pedido_id', existente.id);

    const itemChanges = detectItemChanges(dbItens || [], apiItens);

    if (itemChanges.hasChanges) {
      hadChanges = true;

      // Build human-readable diff
      const diffLines: string[] = [];
      const beforeItems: any[] = [];
      const afterItems: any[] = [];

      for (const changed of itemChanges.changed) {
        const lines = [`Item alterado: ${changed.descricao}`];
        if (changed.qtdBefore !== changed.qtdAfter) {
          lines.push(`  Quantidade: ${changed.qtdBefore} → ${changed.qtdAfter}`);
        }
        if (changed.vlBefore !== changed.vlAfter) {
          lines.push(`  Valor unitário: ${fmtBRL(changed.vlBefore)} → ${fmtBRL(changed.vlAfter)}`);
        }
        if (changed.obsBefore !== changed.obsAfter) {
          lines.push(`  Observação produção alterada`);
        }
        diffLines.push(lines.join('\n'));
        beforeItems.push(changed.before);
        afterItems.push(changed.after);
      }

      for (const added of itemChanges.added) {
        diffLines.push(
          `Item adicionado: ${added.descricao}\n  Quantidade: ${added.qtd} — Valor: ${fmtBRL(added.vl)}`
        );
        afterItems.push(added.raw);
      }

      for (const removed of itemChanges.removed) {
        diffLines.push(
          `Item removido: ${removed.descricao}\n  Quantidade era: ${removed.qtd}`
        );
        beforeItems.push(removed.raw);
      }

      // Register in history
      await supabase.from('pedido_historico').insert({
        pedido_id: existente.id,
        tipo_acao: 'ALTERACAO_ITENS',
        observacao: diffLines.join('\n\n'),
      });

      // Apply item changes to DB
      await applyItemChanges(supabase, existente.id, dbItens || [], apiItens);

      // Alert if order is in production or beyond
      const activeStatuses = [
        'EM_PRODUCAO', 'PRODUCAO_CONCLUIDA', 'AGUARDANDO_COMERCIAL',
        'AGUARDANDO_LOJA', 'LOJA_VERIFICANDO', 'AGUARDANDO_OP_COMPLEMENTAR',
      ];
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

// ── Detect item changes by comparing DB items with API items ──

interface ItemChange {
  hasChanges: boolean;
  changed: { descricao: string; qtdBefore: number; qtdAfter: number; vlBefore: number; vlAfter: number; obsBefore: string | null; obsAfter: string | null; before: any; after: any }[];
  added: { descricao: string; qtd: number; vl: number; raw: any }[];
  removed: { descricao: string; qtd: number; raw: any }[];
}

function detectItemChanges(dbItens: any[], apiItens: any[]): ItemChange {
  const result: ItemChange = { hasChanges: false, changed: [], added: [], removed: [] };

  // Map DB items by api_item_id
  const dbMap = new Map<string, any>();
  for (const item of dbItens) {
    if (item.api_item_id) dbMap.set(item.api_item_id, item);
  }

  // Map API items by id_item
  const apiMap = new Map<string, any>();
  for (const item of apiItens) {
    const key = item.id_item ? String(item.id_item) : null;
    if (key) apiMap.set(key, item);
  }

  // Check for changed and added items
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

  // Check for removed items
  for (const [apiId, dbItem] of dbMap) {
    if (!apiMap.has(apiId)) {
      result.hasChanges = true;
      result.removed.push({
        descricao: dbItem.descricao_produto,
        qtd: dbItem.quantidade,
        raw: dbItem,
      });
    }
  }

  return result;
}

// ── Apply detected item changes to DB ──

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
      // Update existing item
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
      // Insert new item
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

  // Remove items no longer in API
  for (const [, dbItem] of dbMap) {
    await supabase.from('pedido_itens').delete().eq('id', dbItem.id);
  }
}

// ── Insert new order ──

async function inserirNovoPedido(
  supabase: any,
  venda: any,
  statusApi: string,
  pipelineId: string | null,
  pipelineEtapas: any[],
  result: SyncResult
) {
  const apiVendaId = String(venda.id_venda);
  const tipoFluxo = statusApi === 'Em Produção' ? 'PRODUCAO' : 'PRONTA_ENTREGA';
  const statusAtual = statusApi === 'Em Produção' ? 'AGUARDANDO_PRODUCAO' : 'AGUARDANDO_LOJA';

  const { count } = await supabase.from('pedidos').select('*', { count: 'exact', head: true });
  const numeroPedido = `PED-${String((count || 0) + 1).padStart(5, '0')}`;

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
      data_previsao_entrega: parseDateBR(venda.dt_previsao_entrega),
      data_entrega_api: parseDateBR(venda.dt_entrega),
    })
    .select('id')
    .single();

  if (pedidoErr) throw pedidoErr;

  const itens = venda.itens2 || venda.itens || [];
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

  if (tipoFluxo === 'PRODUCAO' && pipelineId) {
    const { data: ordem } = await supabase
      .from('ordens_producao')
      .insert({ pedido_id: pedido.id, pipeline_id: pipelineId, sequencia: 1, status: 'EM_ANDAMENTO' })
      .select('id')
      .single();

    if (ordem && pipelineEtapas.length > 0) {
      const opEtapas = pipelineEtapas.map((e: any, idx: number) => ({
        ordem_id: ordem.id,
        pipeline_etapa_id: e.id,
        nome_etapa: e.nome,
        ordem_sequencia: e.ordem,
        status: idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE',
        ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
      }));
      await supabase.from('op_etapas').insert(opEtapas);
    }

    await supabase.from('pedidos').update({ status_atual: 'EM_PRODUCAO' }).eq('id', pedido.id);
  }

  await supabase.from('pedido_historico').insert({
    pedido_id: pedido.id,
    tipo_acao: 'TRANSICAO',
    status_anterior: null,
    status_novo: tipoFluxo === 'PRODUCAO' ? 'EM_PRODUCAO' : statusAtual,
    observacao: `Pedido importado da API Simplifica (${statusApi}). Fluxo: ${tipoFluxo}.`,
  });

  result.total_inseridos++;
}

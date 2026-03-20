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
  total_erros: number;
  paginas_processadas: number;
  erros: string[];
  alertas: string[];
}

function parseDateBR(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // DD/MM/YYYY → YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
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
    total_erros: 0,
    paginas_processadas: 0,
    erros: [],
    alertas: [],
  };

  try {
    // Get config
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

    // Get default pipeline
    const { data: pipeline } = await supabase
      .from('pipeline_producao')
      .select('id')
      .eq('padrao', true)
      .eq('ativo', true)
      .limit(1)
      .single();

    const pipelineId = pipeline?.id;

    // Get pipeline steps if we have a pipeline
    let pipelineEtapas: any[] = [];
    if (pipelineId) {
      const { data: etapas } = await supabase
        .from('pipeline_etapas')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('ordem');
      pipelineEtapas = etapas || [];
    }

    // Paginate through API
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
          await processarVenda(supabase, venda, pipelineId, pipelineEtapas, result);
        } catch (err: any) {
          result.total_erros++;
          result.erros.push(`Venda ${venda.id_venda}: ${err.message}`);
        }
      }

      hasMore = data.hasMore === true && vendasArray.length === limit;
      offset += limit;
    }

    // Update ultima_sincronizacao
    if (config?.id) {
      await supabase
        .from('integracao_configuracao')
        .update({ ultima_sincronizacao: new Date().toISOString() })
        .eq('id', config.id);
    }

    // Log result
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
      total_erros: result.total_erros,
      paginas_processadas: result.paginas_processadas,
      erro_detalhes: result.erros.length > 0 ? result.erros.join('\\n') : null,
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

async function processarVenda(
  supabase: any,
  venda: any,
  pipelineId: string | null,
  pipelineEtapas: any[],
  result: SyncResult
) {
  const apiVendaId = String(venda.id_venda);
  const statusApi = venda.situacao_texto || '';

  // Check if pedido already exists
  const { data: existente } = await supabase
    .from('pedidos')
    .select('id, status_atual, sincronizacao_bloqueada, status_api')
    .eq('api_venda_id', apiVendaId)
    .maybeSingle();

  if (existente) {
    // Already exists — only update status_api
    if (existente.status_api !== statusApi) {
      await supabase
        .from('pedidos')
        .update({ status_api: statusApi })
        .eq('id', existente.id);

      // Alert: Simplifica marked as Finalizado but production not done
      if (statusApi === 'Finalizado' &&
        ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO'].includes(existente.status_atual)) {
        result.alertas.push(
          `Pedido ${apiVendaId}: Simplifica marcou como Finalizado mas produção ainda não concluiu (status: ${existente.status_atual})`
        );
        // Register alert in history
        await supabase.from('pedido_historico').insert({
          pedido_id: existente.id,
          tipo_acao: 'COMENTARIO',
          observacao: `⚠️ ALERTA: Simplifica marcou como Finalizado mas produção interna ainda está em ${existente.status_atual}.`,
        });
      }
    }
    result.total_atualizados++;
    return;
  }

  // New pedido — determine flow
  let tipoFluxo: string;
  let statusAtual: string;

  if (statusApi === 'Em Produção') {
    tipoFluxo = 'PRODUCAO';
    statusAtual = 'AGUARDANDO_PRODUCAO';
  } else if (statusApi === 'Pedido Enviado') {
    tipoFluxo = 'PRONTA_ENTREGA';
    statusAtual = 'AGUARDANDO_LOJA';
  } else {
    // Other statuses: import as PRODUCAO by default
    tipoFluxo = 'PRODUCAO';
    statusAtual = 'AGUARDANDO_PRODUCAO';
  }

  // Generate numero_pedido
  const { count } = await supabase.from('pedidos').select('*', { count: 'exact', head: true });
  const seq = (count || 0) + 1;
  const numeroPedido = `PED-${String(seq).padStart(5, '0')}`;

  const valorTotal = parseFloat(venda.vl_total) || 0;
  const valorDesconto = parseFloat(venda.vl_desconto) || 0;
  const valorProdutos = parseFloat(venda.vl_produtos) || 0;

  // Insert pedido
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
      valor_bruto: valorTotal,
      valor_desconto: valorDesconto,
      valor_liquido: valorTotal,
      valor_produtos: valorProdutos,
      valor_frete: parseFloat(venda.vl_frete) || 0,
      valor_acrescimo: parseFloat(venda.vl_acrescimo) || 0,
      forma_pagamento: null,
      forma_envio: null,
      observacao_api: venda.ds_observacao || null,
      observacao_interna_api: venda.ds_observacao_interna || null,
      data_venda_api: parseDateBR(venda.dte_venda),
      data_previsao_entrega: parseDateBR(venda.dt_previsao_entrega),
      data_entrega_api: parseDateBR(venda.dt_entrega),
    })
    .select('id')
    .single();

  if (pedidoErr) throw pedidoErr;

  // Insert items
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

  // If PRODUCAO flow and we have a pipeline, create production order
  if (tipoFluxo === 'PRODUCAO' && pipelineId) {
    const { data: ordem } = await supabase
      .from('ordens_producao')
      .insert({
        pedido_id: pedido.id,
        pipeline_id: pipelineId,
        sequencia: 1,
        status: 'EM_ANDAMENTO',
      })
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

    // Update status to EM_PRODUCAO
    await supabase.from('pedidos').update({ status_atual: 'EM_PRODUCAO' }).eq('id', pedido.id);
  }

  // Register history
  await supabase.from('pedido_historico').insert({
    pedido_id: pedido.id,
    tipo_acao: 'TRANSICAO',
    status_anterior: null,
    status_novo: tipoFluxo === 'PRODUCAO' ? 'EM_PRODUCAO' : statusAtual,
    observacao: `Pedido importado da API Simplifica (${statusApi}). Fluxo: ${tipoFluxo}.`,
  });

  result.total_inseridos++;
}

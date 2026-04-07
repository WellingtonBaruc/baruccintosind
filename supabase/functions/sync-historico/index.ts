import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_URL = Deno.env.get('SIMPLIFICA_API_URL') ?? '';

function parseDateBR(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
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

  let tipo = 'HISTORICO_90D';
  let diasBusca = 90;
  try {
    const body = await req.json().catch(() => ({}));
    tipo = body.tipo || 'HISTORICO_90D';
    diasBusca = body.dias || 90;
  } catch { /* default */ }

  const result = {
    total_recebidos: 0,
    total_inseridos: 0,
    total_ignorados: 0,
    total_erros: 0,
    paginas_processadas: 0,
    erros: [] as string[],
  };

  if (!API_URL) {
    await supabase.from('integracao_logs').insert({
      tipo, status: 'ERRO', total_recebidos: 0, total_inseridos: 0,
      total_atualizados: 0, total_ignorados: 0, total_erros: 1,
      paginas_processadas: 0,
      erro_detalhes: 'SIMPLIFICA_API_URL não configurada nas secrets do Supabase.',
      duracao_ms: 0,
    });
    return new Response(JSON.stringify({ success: false, error: 'SIMPLIFICA_API_URL não configurada.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasBusca);
    const dataInicioStr = `${String(dataInicio.getDate()).padStart(2, '0')}/${String(dataInicio.getMonth() + 1).padStart(2, '0')}/${dataInicio.getFullYear()}`;

    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${API_URL}?limit=${limit}&offset=${offset}&dte_venda_ini=${dataInicioStr}`;
      console.log(`[historico] Fetching: ${url}`);

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

          // Only import Finalizados
          if (statusApi !== 'Finalizado') {
            result.total_ignorados++;
            continue;
          }

          const apiVendaId = String(venda.id_venda);

          // Check if already exists
          const { data: existente } = await supabase
            .from('pedidos')
            .select('id')
            .eq('api_venda_id', apiVendaId)
            .maybeSingle();

          if (existente) {
            result.total_ignorados++;
            continue;
          }

          // Usar sequence atômica para evitar race condition
          const { data: seqData, error: seqErr } = await supabase.rpc('next_numero_pedido');
          if (seqErr) throw new Error(`Falha ao gerar número de pedido: ${seqErr.message}`);
          const numeroPedido = seqData as string;

          const itens = venda.itens2 || venda.itens || [];

          const { data: pedido, error: pedidoErr } = await supabase
            .from('pedidos')
            .insert({
              numero_pedido: numeroPedido,
              api_venda_id: apiVendaId,
              status_atual: 'HISTORICO',
              status_api: statusApi,
              tipo_fluxo: 'HISTORICO',
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
              forma_pagamento: venda.nm_forma_pagamento || null,
              forma_envio: venda.nm_forma_envio || null,
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

          result.total_inseridos++;
        } catch (err: any) {
          result.total_erros++;
          result.erros.push(`Venda ${venda.id_venda}: ${err.message}`);
        }
      }

      hasMore = apiHasMore && vendasArray.length === limit;
      offset += limit;
    }

    const duracao = Date.now() - startTime;
    const logStatus = result.total_erros > 0
      ? (result.total_inseridos > 0 ? 'PARCIAL' : 'ERRO')
      : 'SUCESSO';

    await supabase.from('integracao_logs').insert({
      tipo,
      status: logStatus,
      total_recebidos: result.total_recebidos,
      total_inseridos: result.total_inseridos,
      total_atualizados: 0,
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
      total_atualizados: 0,
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

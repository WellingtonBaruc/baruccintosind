import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { classificarProduto } from '@/lib/pcp';
import { adicionarDiasUteis, PcpCalendarData } from '@/lib/pcpCalendario';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ParsedVenda {
  numVenda: string;
  cliente: string;
  data: string;
  origemVenda: string;
  situacao: string;
  consultor: string;
  observacao: string;
  totalVenda: number;
  itens: ParsedItem[];
  status: 'NOVA' | 'ATUALIZAR' | 'IGNORAR';
  motivo?: string;
}

interface ParsedItem {
  referencia: string;
  descricao: string;
  medidas: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

interface ImportResult {
  total: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: number;
}

const PIPELINE_IDS: Record<string, string> = {
  SINTETICO: '00000000-0000-0000-0000-000000000001',
  TECIDO: '00000000-0000-0000-0000-000000000002',
  FIVELA_COBERTA: '00000000-0000-0000-0000-000000000003',
};

function parseNumericValue(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val || '0').replace(/[^\d.,-]/g, '').replace(',', '.');
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

function parseExcelDate(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  const parts = s.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  // Excel serial number
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date((num - 25569) * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export default function ImportPlanilha() {
  const { profile } = useAuth();
  const [vendas, setVendas] = useState<ParsedVenda[]>([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');

  const detectOrderTypes = (itens: ParsedItem[]) => {
    const tipos = new Set<string>();
    for (const item of itens) {
      const tipo = classificarProduto(item.descricao);
      if (tipo !== 'OUTROS') tipos.add(tipo);
    }
    return tipos;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setProcessing(true);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      // Detect duplicate header keys (SheetJS appends _1, _2 for dupes)
      const firstRowKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
      const itemTotalKey = firstRowKeys.find(k => k.startsWith('Total(R$)') && k !== 'Total(R$)') || 'Total(R$)_1';

      // Group rows by # Venda
      const vendaMap = new Map<string, { venda: any; itens: ParsedItem[] }>();
      for (const row of rows) {
        const rawVenda = row['# Venda'] ?? row['#Venda'] ?? row['# venda'] ?? '';
        const numVenda = String(typeof rawVenda === 'number' ? Math.round(rawVenda) : rawVenda).trim();
        if (!numVenda || numVenda === '0') continue;

        if (!vendaMap.has(numVenda)) {
          vendaMap.set(numVenda, {
            venda: row,
            itens: [],
          });
        }

        const ref = String(row['REF.'] || row['Ref.'] || row['REF'] || row['ref'] || '').trim();
        const desc = String(row['Produto'] || row['produto'] || '').trim();
        const qtd = Math.round(Number(row['Qtde'] || row['qtde'] || row['Qtd'] || 0)) || 1;
        const unitario = parseNumericValue(row['Unit.(R$)'] || row['Unit.'] || row['Unitário'] || row['unitario'] || 0);
        // Use the ITEM-level Total column (second occurrence), not the venda-level one
        const total = parseNumericValue(row[itemTotalKey] || row['Total'] || 0);
        const medidas = String(row['Medidas'] || row['medidas'] || '').trim();

        if (desc) {
          vendaMap.get(numVenda)!.itens.push({
            referencia: ref,
            descricao: desc,
            medidas,
            quantidade: qtd,
            valorUnitario: unitario,
            valorTotal: total || unitario * qtd,
          });
        }
      }

      // Check existing pedidos
      const numVendas = Array.from(vendaMap.keys());
      const { data: existingPedidos } = await supabase
        .from('pedidos')
        .select('id, api_venda_id, status_api')
        .in('api_venda_id', numVendas);

      const { data: existingItens } = existingPedidos && existingPedidos.length > 0
        ? await supabase
            .from('pedido_itens')
            .select('pedido_id, referencia_produto, descricao_produto, quantidade')
            .in('pedido_id', existingPedidos.map(p => p.id))
        : { data: [] };

      const existingMap = new Map<string, { id: string; status_api: string | null; itens: any[] }>();
      for (const p of (existingPedidos || [])) {
        existingMap.set(p.api_venda_id!, {
          id: p.id,
          status_api: p.status_api,
          itens: (existingItens || []).filter(i => i.pedido_id === p.id),
        });
      }

      const parsed: ParsedVenda[] = [];
      for (const [numVenda, { venda, itens }] of vendaMap) {
        const situacao = String(venda['Situação'] || venda['Situacao'] || venda['situação'] || '').trim();
        const cliente = String(venda['Cliente'] || venda['cliente'] || '').trim();
        const dataStr = String(venda['Data'] || venda['data'] || '').trim();
        const origem = String(venda['Origem Venda'] || venda['origem_venda'] || '').trim();
        const consultor = String(venda['Consultor'] || venda['consultor'] || '').trim();
        const obs = String(venda['Observação'] || venda['Observacao'] || venda['observação'] || '').trim();
        
        // Total from the first row of that venda
        let totalVenda = 0;
        // Try to get from 'Total(R$)' at the venda level, otherwise sum items
        const vendaTotalStr = String(venda['Total(R$)'] || '0').replace(',', '.');
        totalVenda = Number(vendaTotalStr) || itens.reduce((s, i) => s + i.valorTotal, 0);

        const existing = existingMap.get(numVenda);
        let status: 'NOVA' | 'ATUALIZAR' | 'IGNORAR' = 'NOVA';
        let motivo = '';

        if (existing) {
          const situacaoMudou = existing.status_api !== situacao;
          const itensMudaram = (() => {
            if (existing.itens.length !== itens.length) return true;
            for (const newItem of itens) {
              const match = existing.itens.find(
                (ei: any) => (ei.referencia_produto || '') === newItem.referencia && (ei.descricao_produto || '') === newItem.descricao && ei.quantidade === newItem.quantidade
              );
              if (!match) return true;
            }
            return false;
          })();

          if (situacaoMudou || itensMudaram) {
            status = 'ATUALIZAR';
            motivo = [situacaoMudou && 'Situação mudou', itensMudaram && 'Itens alterados'].filter(Boolean).join(', ');
          } else {
            status = 'IGNORAR';
            motivo = 'Sem alterações';
          }
        }

        parsed.push({
          numVenda,
          cliente,
          data: dataStr,
          origemVenda: origem,
          situacao,
          consultor,
          observacao: obs,
          totalVenda,
          itens,
          status,
          motivo,
        });
      }

      // Sort: NOVA first, then ATUALIZAR, then IGNORAR
      parsed.sort((a, b) => {
        const order = { NOVA: 0, ATUALIZAR: 1, IGNORAR: 2 };
        return order[a.status] - order[b.status];
      });

      setVendas(parsed);
    } catch (err: any) {
      toast.error(`Erro ao processar planilha: ${err.message}`);
    }
    setProcessing(false);
  };

  const handleImport = async () => {
    if (!profile) return;
    setImporting(true);
    const startTime = Date.now();

    const res: ImportResult = { total: vendas.length, inseridos: 0, atualizados: 0, ignorados: 0, erros: 0 };

    try {
      // Fetch PCP calendar data and lead times
      const [semanaRes, feriadosRes, pausasRes, ltRes, pipelinesRes] = await Promise.all([
        supabase.from('pcp_config_semana').select('*').limit(1).maybeSingle(),
        supabase.from('pcp_feriados').select('data'),
        supabase.from('pcp_pausas').select('data_inicio, data_fim'),
        supabase.from('pcp_lead_times').select('tipo, lead_time_dias').eq('ativo', true),
        supabase.from('pipeline_producao').select('id, nome'),
      ]);

      const cal: PcpCalendarData = {
        sabadoAtivo: semanaRes.data?.sabado_ativo ?? false,
        domingoAtivo: semanaRes.data?.domingo_ativo ?? false,
        feriados: (feriadosRes.data || []).map((f: any) => f.data),
        pausas: (pausasRes.data || []).map((p: any) => ({ inicio: p.data_inicio, fim: p.data_fim })),
      };

      const leadTimeMap: Record<string, number> = {};
      for (const lt of (ltRes.data || [])) {
        leadTimeMap[lt.tipo] = lt.lead_time_dias;
      }

      // Build pipeline map from actual DB
      const pipelineMap: Record<string, string> = {};
      for (const p of (pipelinesRes.data || [])) {
        const upper = p.nome.toUpperCase();
        if (upper.includes('SINTÉTICO') || upper.includes('SINTETICO')) pipelineMap['SINTETICO'] = p.id;
        else if (upper.includes('TECIDO')) pipelineMap['TECIDO'] = p.id;
        else if (upper.includes('FIVELA')) pipelineMap['FIVELA_COBERTA'] = p.id;
      }
      // Fallback to hardcoded IDs
      if (!pipelineMap['SINTETICO']) pipelineMap['SINTETICO'] = PIPELINE_IDS.SINTETICO;
      if (!pipelineMap['TECIDO']) pipelineMap['TECIDO'] = PIPELINE_IDS.TECIDO;
      if (!pipelineMap['FIVELA_COBERTA']) pipelineMap['FIVELA_COBERTA'] = PIPELINE_IDS.FIVELA_COBERTA;

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      for (const venda of vendas) {
        try {
          if (venda.status === 'IGNORAR') {
            res.ignorados++;
            continue;
          }

          // Calculate lead time based on dominant product type
          const tipos = detectOrderTypes(venda.itens);
          const maxLeadTime = Math.max(
            ...Array.from(tipos).map(t => leadTimeMap[t] || 5),
            5
          );
          const dataPrevista = adicionarDiasUteis(new Date(hoje), maxLeadTime, cal);
          const dataPrevistaStr = dataPrevista.toISOString().slice(0, 10);

          const dataVendaApi = parseExcelDate(venda.data);

          if (venda.status === 'NOVA') {
            // Create new pedido
            const { data: newPedido, error: pedidoErr } = await supabase.from('pedidos').insert({
              numero_pedido: `V-${venda.numVenda}`,
              api_venda_id: venda.numVenda,
              cliente_nome: venda.cliente || 'Cliente não informado',
              data_venda_api: dataVendaApi,
              canal_venda: venda.origemVenda || null,
              status_api: venda.situacao || null,
              vendedor_nome: venda.consultor || null,
              observacao_api: `[IMPORTADO SEM DATA PREVISTA] ${venda.observacao || ''}`.trim(),
              valor_bruto: venda.totalVenda || 0,
              valor_desconto: 0,
              valor_liquido: venda.totalVenda || 0,
              data_previsao_entrega: dataPrevistaStr,
              status_atual: 'EM_PRODUCAO' as any,
              tipo_fluxo: 'PRODUCAO',
            }).select().single();

            if (pedidoErr || !newPedido) {
              console.error(`Erro ao inserir pedido V-${venda.numVenda}:`, pedidoErr);
              res.erros++;
              continue;
            }

            // Insert itens
            const itensToInsert = venda.itens.map(item => ({
              pedido_id: newPedido.id,
              descricao_produto: item.descricao,
              referencia_produto: item.referencia || null,
              quantidade: item.quantidade,
              valor_unitario: item.valorUnitario,
              valor_total: item.valorTotal,
            }));
            await supabase.from('pedido_itens').insert(itensToInsert);

            // Create production orders
            for (const tipo of tipos) {
              const pid = pipelineMap[tipo];
              if (!pid) continue;

              const { data: newOrdem } = await supabase.from('ordens_producao').insert({
                pedido_id: newPedido.id,
                pipeline_id: pid,
                status: 'AGUARDANDO' as any,
                tipo_produto: tipo,
              }).select().single();

              if (newOrdem) {
                const { data: etapas } = await supabase
                  .from('pipeline_etapas')
                  .select('*')
                  .eq('pipeline_id', pid)
                  .order('ordem');

                if (etapas && etapas.length > 0) {
                  await supabase.from('op_etapas').insert(
                    etapas.map((e, idx) => ({
                      ordem_id: newOrdem.id,
                      pipeline_etapa_id: e.id,
                      nome_etapa: e.nome,
                      ordem_sequencia: e.ordem,
                      status: (idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE') as any,
                      ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
                    }))
                  );
                }
              }
            }

            // If no recognized types, create with default pipeline
            if (tipos.size === 0) {
              const defaultPid = pipelineMap['SINTETICO'];
              const { data: newOrdem } = await supabase.from('ordens_producao').insert({
                pedido_id: newPedido.id,
                pipeline_id: defaultPid,
                status: 'AGUARDANDO' as any,
                tipo_produto: 'SINTETICO',
              }).select().single();

              if (newOrdem) {
                const { data: etapas } = await supabase
                  .from('pipeline_etapas')
                  .select('*')
                  .eq('pipeline_id', defaultPid)
                  .order('ordem');

                if (etapas && etapas.length > 0) {
                  await supabase.from('op_etapas').insert(
                    etapas.map((e, idx) => ({
                      ordem_id: newOrdem.id,
                      pipeline_etapa_id: e.id,
                      nome_etapa: e.nome,
                      ordem_sequencia: e.ordem,
                      status: (idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE') as any,
                      ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
                    }))
                  );
                }
              }
            }

            // Log historico
            await supabase.from('pedido_historico').insert({
              pedido_id: newPedido.id,
              tipo_acao: 'TRANSICAO' as any,
              observacao: 'Pedido importado via planilha XLSX',
            });

            res.inseridos++;
          } else if (venda.status === 'ATUALIZAR') {
            // Find existing pedido
            const { data: existing } = await supabase
              .from('pedidos')
              .select('id, status_api')
              .eq('api_venda_id', venda.numVenda)
              .single();

            if (!existing) { res.erros++; continue; }

            // Update pedido
            await supabase.from('pedidos').update({
              status_api: venda.situacao || existing.status_api,
              cliente_nome: venda.cliente,
              vendedor_nome: venda.consultor || null,
              canal_venda: venda.origemVenda || null,
            }).eq('id', existing.id);

            // Reinsert itens
            await supabase.from('pedido_itens').delete().eq('pedido_id', existing.id);
            const itensToInsert = venda.itens.map(item => ({
              pedido_id: existing.id,
              descricao_produto: item.descricao,
              referencia_produto: item.referencia || null,
              quantidade: item.quantidade,
              valor_unitario: item.valorUnitario,
              valor_total: item.valorTotal,
            }));
            await supabase.from('pedido_itens').insert(itensToInsert);

            await supabase.from('pedido_historico').insert({
              pedido_id: existing.id,
              tipo_acao: 'EDICAO' as any,
              observacao: `Atualizado via planilha: ${venda.motivo}`,
            });

            res.atualizados++;
          }
        } catch (err: any) {
          console.error(`Erro ao importar venda ${venda.numVenda}:`, err);
          res.erros++;
        }
      }

      // Log integration
      await supabase.from('integracao_logs').insert({
        tipo: 'PLANILHA',
        status: res.erros > 0 ? 'PARCIAL' : 'SUCESSO',
        total_recebidos: res.total,
        total_inseridos: res.inseridos,
        total_atualizados: res.atualizados,
        total_ignorados: res.ignorados,
        total_erros: res.erros,
        duracao_ms: Date.now() - startTime,
      });

      setResult(res);
      toast.success(`Importação concluída: ${res.inseridos} novas, ${res.atualizados} atualizadas, ${res.ignorados} ignoradas.`);
    } catch (err: any) {
      toast.error(`Erro na importação: ${err.message}`);
    }
    setImporting(false);
  };

  const novas = vendas.filter(v => v.status === 'NOVA').length;
  const atualizar = vendas.filter(v => v.status === 'ATUALIZAR').length;
  const ignorar = vendas.filter(v => v.status === 'IGNORAR').length;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Importação via Planilha
        </CardTitle>
        <CardDescription>
          Importe vendas a partir de um arquivo XLSX exportado do Simplifica. Vendas já existentes são atualizadas apenas se houver mudança na situação ou nos itens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
              <CheckCircle2 className="h-4 w-4" />
              Importação concluída
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{result.inseridos}</p>
                <p className="text-xs text-muted-foreground">Novas</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{result.atualizados}</p>
                <p className="text-xs text-muted-foreground">Atualizadas</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums text-muted-foreground">{result.ignorados}</p>
                <p className="text-xs text-muted-foreground">Ignoradas</p>
              </div>
              {result.erros > 0 && (
                <div className="rounded-lg border border-destructive/30 p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums text-destructive">{result.erros}</p>
                  <p className="text-xs text-destructive">Erros</p>
                </div>
              )}
            </div>
            <Button variant="outline" onClick={() => { setResult(null); setVendas([]); setFileName(''); }}>
              Nova importação
            </Button>
          </div>
        ) : vendas.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">{novas} novas</Badge>
                <Badge className="bg-warning/15 text-warning border-warning/30">{atualizar} atualizar</Badge>
                <Badge variant="outline" className="text-muted-foreground">{ignorar} ignorar</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setVendas([]); setFileName(''); }}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                </Button>
                <Button onClick={handleImport} disabled={importing || (novas === 0 && atualizar === 0)} size="sm">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  {importing ? 'Importando...' : `Confirmar importação`}
                </Button>
              </div>
            </div>

            <div className="max-h-[400px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead># Venda</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Itens</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendas.map(v => (
                    <TableRow key={v.numVenda} className={
                      v.status === 'NOVA' ? 'bg-[hsl(var(--success))]/5' :
                      v.status === 'ATUALIZAR' ? 'bg-warning/5' :
                      'opacity-50'
                    }>
                      <TableCell>
                        <Badge className={
                          v.status === 'NOVA' ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-0' :
                          v.status === 'ATUALIZAR' ? 'bg-warning/15 text-warning border-0' :
                          'bg-muted text-muted-foreground border-0'
                        }>
                          {v.status === 'NOVA' ? 'Nova' : v.status === 'ATUALIZAR' ? 'Atualizar' : 'Ignorar'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{v.numVenda}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{v.cliente}</TableCell>
                      <TableCell>{v.situacao}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.itens.length}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.totalVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{v.motivo || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              Vendas importadas sem data prevista serão sinalizadas em <span className="text-destructive font-semibold">vermelho</span> nas filas.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border/60 rounded-lg p-8 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">{processing ? 'Processando...' : 'Selecionar planilha (.xlsx)'}</span>
              <span className="text-xs text-muted-foreground mt-1">Formato: relatório de itens vendidos do Simplifica</span>
              {fileName && <span className="text-xs text-primary mt-1">{fileName}</span>}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                disabled={processing}
              />
            </label>
            {processing && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analisando planilha...
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

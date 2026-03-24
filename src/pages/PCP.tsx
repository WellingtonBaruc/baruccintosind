import { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Scissors, AlertTriangle, ChevronRight, Printer } from 'lucide-react';
import { agruparParaCorte, CutGroupItem, TIPO_PRODUTO_LABELS } from '@/lib/pcp';

const PERFIS_PCP = ['supervisor_producao', 'gestor', 'admin'];

const TIPO_KEYWORDS: Record<string, string[]> = {
  SINTETICO: ['CINTO SINTETICO', 'TIRA SINTETICO', 'CINTO SINTÉTICO', 'TIRA SINTÉTICO'],
  TECIDO: ['CINTO TECIDO', 'TIRA TECIDO'],
};

function matchesTipo(descricao: string, tipo: string): boolean {
  const upper = (descricao || '').toUpperCase();
  return (TIPO_KEYWORDS[tipo] || []).some(kw => upper.includes(kw));
}

export default function PCP() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState<CutGroupItem[]>([]);
  const [leadTimeStats, setLeadTimeStats] = useState({ atrasados: 0, atencao: 0, noPrazo: 0 });
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterLargura, setFilterLargura] = useState('all');

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setFilterLargura('all'); }, [filterTipo]);

  const fetchData = async () => {
    const { data: ordens } = await supabase
      .from('ordens_producao')
      .select('id, pedido_id, tipo_produto, pedidos!inner(numero_pedido, api_venda_id, cliente_nome, status_prazo, status_atual, data_venda_api, lead_time_preparacao_dias)')
      .in('tipo_produto', ['SINTETICO', 'TECIDO'])
      .in('status', ['EM_ANDAMENTO', 'AGUARDANDO'])
      .eq('pedidos.status_atual', 'EM_PRODUCAO');

    if (!ordens?.length) { setLoading(false); return; }

    const ordensFiltered = ordens;

    const pedidoIds = [...new Set(ordensFiltered.map(o => o.pedido_id))];
    const { data: itens } = await supabase
      .from('pedido_itens')
      .select('id, pedido_id, descricao_produto, referencia_produto, observacao_producao, quantidade')
      .in('pedido_id', pedidoIds);

    // Map pedido+tipo → info
    const pedidoTipoMap = new Map<string, { numero_venda: string | null; data_venda: string | null; lead_time_dias: number | null }>();
    for (const o of ordensFiltered) {
      const p = o.pedidos as any;
      const key = `${o.pedido_id}|${o.tipo_produto}`;
      if (p && !pedidoTipoMap.has(key)) {
        pedidoTipoMap.set(key, {
          numero_venda: p.api_venda_id || p.numero_pedido,
          data_venda: p.data_venda_api,
          lead_time_dias: p.lead_time_preparacao_dias,
        });
      }
    }

    const cutItems: CutGroupItem[] = [];
    for (const [key, info] of pedidoTipoMap) {
      const [pedidoId, tipo] = key.split('|');
      for (const i of (itens || []).filter(it => it.pedido_id === pedidoId)) {
        if (matchesTipo(i.descricao_produto, tipo)) {
          cutItems.push({
            id: i.id,
            descricao: i.descricao_produto,
            referencia: i.referencia_produto,
            observacao_producao: i.observacao_producao,
            quantidade: i.quantidade,
            numero_venda: info.numero_venda,
            data_venda: info.data_venda,
            lead_time_dias: info.lead_time_dias,
            tipo_produto: tipo,
          });
        }
      }
    }

    setAllItems(cutItems);

    const [r1, r2, r3] = await Promise.all([
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'ATRASADO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'ATENCAO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'NO_PRAZO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
    ]);
    setLeadTimeStats({ atrasados: r1.count || 0, atencao: r2.count || 0, noPrazo: r3.count || 0 });
    setLoading(false);
  };

  // Derived data
  const filteredItems = useMemo(() =>
    filterTipo === 'all' ? allItems : allItems.filter(i => i.tipo_produto === filterTipo),
  [allItems, filterTipo]);

  const cutGroups = useMemo(() => agruparParaCorte(filteredItems), [filteredItems]);
  const larguras = useMemo(() => [...new Set(cutGroups.map(g => g.largura))].sort(), [cutGroups]);
  const filteredGroups = filterLargura === 'all' ? cutGroups : cutGroups.filter(g => g.largura === filterLargura);
  const totalPecas = filteredGroups.reduce((sum, g) => sum + g.quantidadeTotal, 0);

  const handlePrint = () => {
    const tipoLabel = filterTipo === 'all' ? 'Todos' : TIPO_PRODUTO_LABELS[filterTipo] || filterTipo;
    const rows = filteredGroups.map(g => {
      const itensHtml = g.itens.map(i =>
        `${i.descricao} ×${i.quantidade}${i.numero_venda ? ' <span style="color:#666">#' + i.numero_venda + '</span>' : ''}${i.data_venda ? ' <span style="color:#999">' + format(parseISO(i.data_venda), 'dd/MM') + '</span>' : ''}${i.lead_time_dias != null ? ' <span style="color:#999">' + i.lead_time_dias + 'd</span>' : ''}`
      ).join('<br>');
      return `<tr><td>${g.largura}</td><td>${g.material}</td><td>${g.tamanho}</td><td>${g.cor}</td><td style="text-align:right;font-weight:bold">${g.quantidadeTotal}</td><td style="font-size:11px">${itensHtml}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>Corte - ${tipoLabel}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:15mm}
    h1{font-size:16px;margin-bottom:4px}.meta{color:#666;font-size:11px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#f0f0f0;font-size:11px;text-transform:uppercase}@media print{body{padding:10mm}}</style>
    </head><body><h1>Agrupamento de Corte — ${tipoLabel}${filterLargura !== 'all' ? ' — ' + filterLargura : ''}</h1>
    <p class="meta">${filteredGroups.length} grupos • ${totalPecas} peças • ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
    <table><thead><tr><th>Largura</th><th>Material</th><th>Tamanho</th><th>Cor</th><th style="text-align:right">Qtd</th><th>Itens</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  if (!profile || !PERFIS_PCP.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PCP — Planejamento de Produção</h1>
        <p className="text-muted-foreground mt-0.5">Visão consolidada para planejamento de corte e controle de prazos.</p>
      </div>

      {/* Lead time overview */}
      <div className="grid gap-3 grid-cols-3">
        <Card className="border-destructive/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.atrasados}</p>
            <p className="text-xs text-muted-foreground">Atrasados</p>
          </CardContent>
        </Card>
        <Card className="border-warning/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.atencao}</p>
            <p className="text-xs text-muted-foreground">Atenção</p>
          </CardContent>
        </Card>
        <Card className="border-[hsl(var(--success))]/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <Scissors className="h-5 w-5 text-[hsl(var(--success))]" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.noPrazo}</p>
            <p className="text-xs text-muted-foreground">No Prazo</p>
          </CardContent>
        </Card>
      </div>

      {/* Cut grouping */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="h-4 w-4" />
              Agrupamento de Corte
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{filteredGroups.length} grupos • {totalPecas} peças total</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="SINTETICO">Sintético</SelectItem>
                <SelectItem value="TECIDO">Tecido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterLargura} onValueChange={setFilterLargura}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Largura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {larguras.map(l => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={filteredGroups.length === 0}>
              <Printer className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Nenhum item pendente de corte.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Largura</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead className="text-right">Qtd Total</TableHead>
                  <TableHead>Itens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{group.largura}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{group.material}</TableCell>
                    <TableCell className="text-sm">{group.tamanho}</TableCell>
                    <TableCell className="text-sm">{group.cor}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{group.quantidadeTotal}</TableCell>
                    <TableCell>
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                          <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
                          <span>{group.itens.length} {group.itens.length === 1 ? 'item' : 'itens'}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1.5 space-y-1 pl-4.5">
                          {group.itens.map(item => (
                            <div key={item.id} className="text-xs flex items-baseline gap-2 flex-wrap">
                              <span className="text-muted-foreground">{item.descricao}</span>
                              <span className="font-medium">×{item.quantidade}</span>
                              {item.numero_venda && (
                                <span className="text-primary/80 font-mono text-[10px]">#{item.numero_venda}</span>
                              )}
                              {item.data_venda && (
                                <span className="text-muted-foreground/70 text-[10px]">{format(parseISO(item.data_venda), 'dd/MM')}</span>
                              )}
                              {item.lead_time_dias != null && (
                                <span className="text-muted-foreground/70 text-[10px]">{item.lead_time_dias}d</span>
                              )}
                              {item.referencia && <span className="text-muted-foreground/70 text-[10px]">({item.referencia})</span>}
                              {item.observacao_producao && (
                                <div className="mt-0.5 bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5 text-warning text-[10px]">
                                  {item.observacao_producao}
                                </div>
                              )}
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

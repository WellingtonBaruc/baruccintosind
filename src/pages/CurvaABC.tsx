import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { parseItemAttributes } from '@/lib/almoxarifado';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Download, Loader2, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PedidoItem {
  descricao_produto: string;
  categoria_produto: string | null;
  quantidade: number;
  valor_total: number;
  pedido_id: string;
  data_venda: string | null;
}

type Criterio = 'receita' | 'volume' | 'frequencia';
type Nivel = 'categoria' | 'produto' | 'fivela';
type TipoFiltro = 'todos' | 'sintetico' | 'tecido' | 'fivela';

interface ABCRow {
  nome: string;
  total: number;
  percentual: number;
  acumulado: number;
  classe: 'A' | 'B' | 'C';
  unidades: number;
  pedidos: number;
  meses: Record<string, number>;
  produtos?: ABCRow[];
}

const FIVELA_BASES = [
  { keyword: 'MATRIZ', label: 'MATRIZ' },
  { keyword: 'TICI', label: 'TICI' },
  { keyword: 'ERICA', label: 'ERICA' },
  { keyword: 'JADE', label: 'JADE' },
  { keyword: 'LIZ', label: 'LIZ' },
  { keyword: 'ROSY', label: 'ROSY' },
  { keyword: 'SEM FIVELA', label: 'SEM FIVELA' },
];

function extrairFivelaBase(descricao: string): string {
  const upper = (descricao || '').toUpperCase();
  for (const { keyword, label } of FIVELA_BASES) {
    if (upper.includes(keyword)) return label;
  }
  return 'OUTROS';
}

function classificarTipoProduto(nome: string): string {
  const upper = (nome || '').toUpperCase();
  if (upper.includes('FIVELA COBERTA')) return 'fivela';
  if (upper.includes('CINTO SINTETICO') || upper.includes('TIRA SINTETICO') || upper.includes('CINTO SINTÉTICO') || upper.includes('TIRA SINTÉTICO')) return 'sintetico';
  if (upper.includes('CINTO TECIDO') || upper.includes('TIRA TECIDO')) return 'tecido';
  return 'outros';
}

export default function CurvaABC() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState<PedidoItem[]>([]);
  const [periodo, setPeriodo] = useState('3m');
  const [criterio, setCriterio] = useState<Criterio>('receita');
  const [nivel, setNivel] = useState<Nivel>('categoria');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const perfisPermitidos = ['admin', 'gestor'];

  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (periodo) {
      case '1m': start = startOfMonth(now); break;
      case '2m': start = startOfMonth(subMonths(now, 1)); break;
      case '3m': start = startOfMonth(subMonths(now, 2)); break;
      case '6m': start = startOfMonth(subMonths(now, 5)); break;
      default: start = startOfMonth(subMonths(now, 2));
    }
    return { start, end: endOfMonth(now) };
  }, [periodo]);

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    const startStr = format(dateRange.start, 'yyyy-MM-dd');
    const endStr = format(dateRange.end, 'yyyy-MM-dd');

    // Get historical + finalized pedidos
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id, data_venda_api, status_atual, status_api')
      .or('status_atual.eq.HISTORICO,status_api.eq.Finalizado,status_atual.eq.FINALIZADO_SIMPLIFICA')
      .gte('data_venda_api', startStr)
      .lte('data_venda_api', endStr);

    if (!pedidos || pedidos.length === 0) {
      setItens([]);
      setLoading(false);
      return;
    }

    const pedidoIds = pedidos.map(p => p.id);
    const pedidoMap = new Map(pedidos.map(p => [p.id, p.data_venda_api]));

    // Fetch items in batches
    const allItens: PedidoItem[] = [];
    const batchSize = 50;
    for (let i = 0; i < pedidoIds.length; i += batchSize) {
      const batch = pedidoIds.slice(i, i + batchSize);
      const { data: items } = await supabase
        .from('pedido_itens')
        .select('descricao_produto, categoria_produto, quantidade, valor_total, pedido_id')
        .in('pedido_id', batch);

      if (items) {
        for (const item of items) {
          allItens.push({
            ...item,
            data_venda: pedidoMap.get(item.pedido_id) || null,
          });
        }
      }
    }

    setItens(allItens);
    setLoading(false);
  };

  const abcData = useMemo(() => {
    let filtered = itens;
    if (tipoFiltro !== 'todos') {
      filtered = itens.filter(i => classificarTipoProduto(i.descricao_produto) === tipoFiltro);
    }

    // Group by nivel
    const groups = new Map<string, { total: number; unidades: number; pedidoIds: Set<string>; meses: Record<string, number>; produtos: Map<string, { total: number; unidades: number; pedidoIds: Set<string>; meses: Record<string, number> }> }>();

    for (const item of filtered) {
      const key = nivel === 'categoria'
        ? (item.categoria_produto || 'Sem Categoria')
        : nivel === 'fivela'
          ? extrairFivelaBase(item.descricao_produto)
          : item.descricao_produto;
      const mesKey = item.data_venda ? format(new Date(item.data_venda + 'T12:00:00'), 'yyyy-MM') : 'sem-data';

      let val: number;
      switch (criterio) {
        case 'receita': val = item.valor_total; break;
        case 'volume': val = item.quantidade; break;
        case 'frequencia': val = 1; break;
      }

      if (!groups.has(key)) {
        groups.set(key, { total: 0, unidades: 0, pedidoIds: new Set(), meses: {}, produtos: new Map() });
      }
      const g = groups.get(key)!;
      g.total += val;
      g.unidades += item.quantidade;
      g.pedidoIds.add(item.pedido_id);
      g.meses[mesKey] = (g.meses[mesKey] || 0) + val;

      // If grouping by category, track products inside
      if (nivel === 'categoria' || nivel === 'fivela') {
        const prodKey = item.descricao_produto;
        if (!g.produtos.has(prodKey)) {
          g.produtos.set(prodKey, { total: 0, unidades: 0, pedidoIds: new Set(), meses: {} });
        }
        const p = g.produtos.get(prodKey)!;
        p.total += val;
        p.unidades += item.quantidade;
        p.pedidoIds.add(item.pedido_id);
        p.meses[mesKey] = (p.meses[mesKey] || 0) + val;
      }
    }

    // Sort descending
    const sorted = Array.from(groups.entries())
      .map(([nome, g]) => ({ nome, ...g, pedidos: g.pedidoIds.size }))
      .sort((a, b) => b.total - a.total);

    const grandTotal = sorted.reduce((sum, g) => sum + g.total, 0);

    // Classify ABC
    let acumulado = 0;
    const rows: ABCRow[] = sorted.map(g => {
      const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0;
      acumulado += pct;
      const classe: 'A' | 'B' | 'C' = acumulado <= 80 ? 'A' : acumulado <= 95 ? 'B' : 'C';

      const produtos = (nivel === 'categoria' || nivel === 'fivela')
        ? Array.from(g.produtos.entries())
            .map(([pNome, p]) => ({
              nome: pNome,
              total: p.total,
              percentual: grandTotal > 0 ? (p.total / grandTotal) * 100 : 0,
              acumulado: 0,
              classe: classe,
              unidades: p.unidades,
              pedidos: p.pedidoIds.size,
              meses: p.meses,
            }))
            .sort((a, b) => b.total - a.total)
        : undefined;

      return {
        nome: g.nome,
        total: g.total,
        percentual: pct,
        acumulado,
        classe,
        unidades: g.unidades,
        pedidos: g.pedidos,
        meses: g.meses,
        produtos,
      };
    });

    return { rows, grandTotal };
  }, [itens, criterio, nivel, tipoFiltro]);

  const mesesColunas = useMemo(() => {
    const meses = new Set<string>();
    for (const row of abcData.rows) {
      Object.keys(row.meses).forEach(m => meses.add(m));
    }
    return Array.from(meses).sort();
  }, [abcData]);

  const classeStats = useMemo(() => {
    const stats = { A: { count: 0, pct: 0 }, B: { count: 0, pct: 0 }, C: { count: 0, pct: 0 } };
    for (const row of abcData.rows) {
      stats[row.classe].count++;
      stats[row.classe].pct += row.percentual;
    }
    return stats;
  }, [abcData]);

  const chartData = useMemo(() => {
    return mesesColunas.map(mes => {
      let a = 0, b = 0, c = 0;
      for (const row of abcData.rows) {
        const val = row.meses[mes] || 0;
        if (row.classe === 'A') a += val;
        else if (row.classe === 'B') b += val;
        else c += val;
      }
      return {
        mes: format(new Date(mes + '-15'), 'MMM/yy', { locale: ptBR }),
        'Classe A': a,
        'Classe B': b,
        'Classe C': c,
      };
    });
  }, [abcData, mesesColunas]);

  const handleExportCSV = () => {
    const headers = ['Classe', nivel === 'categoria' ? 'Categoria' : 'Produto', ...mesesColunas.map(m => format(new Date(m + '-15'), 'MMM/yy', { locale: ptBR })), 'Total', '% Total', 'Unidades', 'Nº Pedidos'];
    const csvRows = [headers.join(';')];

    for (const row of abcData.rows) {
      const values = [
        row.classe,
        `"${row.nome}"`,
        ...mesesColunas.map(m => (row.meses[m] || 0).toFixed(2)),
        row.total.toFixed(2),
        row.percentual.toFixed(2) + '%',
        row.unidades.toString(),
        row.pedidos.toString(),
      ];
      csvRows.push(values.join(';'));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curva-abc-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (nome: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  };

  const classeBadge = (classe: 'A' | 'B' | 'C') => {
    const colors = { A: 'bg-emerald-500/15 text-emerald-700 border-0', B: 'bg-amber-500/15 text-amber-700 border-0', C: 'bg-red-500/15 text-red-700 border-0' };
    return <Badge className={colors[classe]}>Classe {classe}</Badge>;
  };

  const fmtVal = (v: number) => {
    if (criterio === 'receita') return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return v.toLocaleString('pt-BR');
  };

  const chartConfig = {
    'Classe A': { label: 'Classe A', color: 'hsl(142, 70%, 45%)' },
    'Classe B': { label: 'Classe B', color: 'hsl(40, 90%, 50%)' },
    'Classe C': { label: 'Classe C', color: 'hsl(0, 70%, 50%)' },
  };

  if (!profile || !perfisPermitidos.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="animate-fade-in space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Curva ABC</h1>
          <p className="text-muted-foreground mt-0.5">Análise de produtos por receita, volume ou frequência.</p>
        </div>
        <Button onClick={handleExportCSV} variant="outline" size="sm" disabled={abcData.rows.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">Mês atual</SelectItem>
            <SelectItem value="2m">Último mês</SelectItem>
            <SelectItem value="3m">Últimos 3 meses</SelectItem>
            <SelectItem value="6m">Últimos 6 meses</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex rounded-md border border-input overflow-hidden">
          {(['receita', 'volume', 'frequencia'] as Criterio[]).map(c => (
            <button
              key={c}
              onClick={() => setCriterio(c)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${criterio === c ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
            >
              {c === 'receita' ? 'Receita (R$)' : c === 'volume' ? 'Volume' : 'Frequência'}
            </button>
          ))}
        </div>

        <Select value={nivel} onValueChange={(v) => setNivel(v as Nivel)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="categoria">Categoria</SelectItem>
            <SelectItem value="produto">Produto</SelectItem>
            <SelectItem value="fivela">Fivela</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as TipoFiltro)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="sintetico">Sintético</SelectItem>
            <SelectItem value="tecido">Tecido</SelectItem>
            <SelectItem value="fivela">Fivela Coberta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : abcData.rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum dado histórico encontrado para o período selecionado.</p>
          <p className="text-sm mt-1">Execute a carga histórica de 90 dias na tela de Integração primeiro.</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total analisados</p>
                <p className="text-2xl font-bold mt-1">{abcData.rows.length}</p>
              </CardContent>
            </Card>
            {(['A', 'B', 'C'] as const).map(c => (
              <Card key={c}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2">
                    {classeBadge(c)}
                  </div>
                  <p className="text-2xl font-bold mt-2">{classeStats[c].count} <span className="text-sm font-normal text-muted-foreground">{nivel === 'categoria' ? 'categorias' : nivel === 'fivela' ? 'fivelas' : 'produtos'}</span></p>
                  <p className="text-sm text-muted-foreground">{classeStats[c].pct.toFixed(1)}% do total</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Classe</TableHead>
                      <TableHead>{nivel === 'categoria' ? 'Categoria' : nivel === 'fivela' ? 'Fivela' : 'Produto'}</TableHead>
                      {mesesColunas.map(m => (
                        <TableHead key={m} className="text-right">{format(new Date(m + '-15'), 'MMM', { locale: ptBR })}</TableHead>
                      ))}
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Unid.</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {abcData.rows.map(row => (
                      <>
                        <TableRow key={row.nome} className={row.produtos ? 'cursor-pointer hover:bg-accent/50' : ''} onClick={() => row.produtos && toggleExpand(row.nome)}>
                          <TableCell>{classeBadge(row.classe)}</TableCell>
                          <TableCell className="font-medium flex items-center gap-1">
                            {row.produtos && (expandedRows.has(row.nome) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                            {row.nome}
                          </TableCell>
                          {mesesColunas.map(m => (
                            <TableCell key={m} className="text-right tabular-nums text-sm">{fmtVal(row.meses[m] || 0)}</TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums font-semibold">{fmtVal(row.total)}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.percentual.toFixed(1)}%</TableCell>
                          <TableCell className="text-right tabular-nums">{row.unidades.toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.pedidos}</TableCell>
                        </TableRow>
                        {row.produtos && expandedRows.has(row.nome) && row.produtos.map(p => (
                          <TableRow key={`${row.nome}-${p.nome}`} className="bg-muted/30">
                            <TableCell></TableCell>
                            <TableCell className="text-sm pl-10">{p.nome}</TableCell>
                            {mesesColunas.map(m => (
                              <TableCell key={m} className="text-right tabular-nums text-xs text-muted-foreground">{fmtVal(p.meses[m] || 0)}</TableCell>
                            ))}
                            <TableCell className="text-right tabular-nums text-sm">{fmtVal(p.total)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{p.percentual.toFixed(1)}%</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{p.unidades.toLocaleString('pt-BR')}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{p.pedidos}</TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolução por Classe</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="Classe A" stackId="a" fill="hsl(142, 70%, 45%)" />
                    <Bar dataKey="Classe B" stackId="a" fill="hsl(40, 90%, 50%)" />
                    <Bar dataKey="Classe C" stackId="a" fill="hsl(0, 70%, 50%)" />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

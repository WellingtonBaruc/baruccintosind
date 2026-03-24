import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Scissors, ChevronRight, Printer, Search } from 'lucide-react';
import { CutGroup, TIPO_PRODUTO_LABELS } from '@/lib/pcp';

interface CorteGroupCardProps {
  title: string;
  tipo: string;
  groups: CutGroup[];
  filterLargura: string;
  onFilterLarguraChange: (v: string) => void;
  larguras: string[];
}

export function CorteGroupCard({ title, tipo, groups, filterLargura, onFilterLarguraChange, larguras }: CorteGroupCardProps) {
  const [search, setSearch] = useState('');

  const searchedGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const term = search.trim().toLowerCase();
    return groups
      .map(g => {
        const matchedItens = g.itens.filter(i => {
          const vendaMatch = (i.numero_venda || '').toLowerCase().includes(term);
          const descMatch = (i.descricao || '').toLowerCase().includes(term);
          return vendaMatch || descMatch;
        });
        return matchedItens.length > 0 ? { ...g, itens: matchedItens, quantidadeTotal: matchedItens.reduce((s, i) => s + i.quantidade, 0) } : null;
      })
      .filter(Boolean) as CutGroup[];
  }, [groups, search]);
  const filteredGroups = filterLargura === 'all' ? searchedGroups : searchedGroups.filter(g => g.largura === filterLargura);
  const totalPecas = filteredGroups.reduce((sum, g) => sum + g.quantidadeTotal, 0);

  const handlePrint = () => {
    const rows = filteredGroups.map(g => {
      const itensHtml = g.itens.map(i =>
        `${i.descricao} ×${i.quantidade}${i.numero_venda ? ' <span style="color:#666">#' + i.numero_venda + '</span>' : ''}${i.data_venda ? ' <span style="color:#999">' + format(parseISO(i.data_venda), 'dd/MM') + '</span>' : ''}${i.lead_time_dias != null ? ' <span style="color:#999">' + i.lead_time_dias + 'd</span>' : ''}`
      ).join('<br>');
      return `<tr><td>${g.largura}</td><td>${g.material}</td><td>${g.tamanho}</td><td>${g.cor}</td><td style="text-align:right;font-weight:bold">${g.quantidadeTotal}</td><td style="font-size:11px">${itensHtml}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>Corte - ${title}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:15mm}
    h1{font-size:16px;margin-bottom:4px}.meta{color:#666;font-size:11px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#f0f0f0;font-size:11px;text-transform:uppercase}@media print{body{padding:10mm}}</style>
    </head><body><h1>Agrupamento de Corte — ${title}${filterLargura !== 'all' ? ' — ' + filterLargura : ''}</h1>
    <p class="meta">${filteredGroups.length} grupos • ${totalPecas} peças • ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
    <table><thead><tr><th>Largura</th><th>Material</th><th>Tamanho</th><th>Cor</th><th style="text-align:right">Qtd</th><th>Itens</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            {title}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{filteredGroups.length} grupos • {totalPecas} peças</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cliente ou nº venda..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 w-[180px] text-sm"
            />
          </div>
          <Select value={filterLargura} onValueChange={onFilterLarguraChange}>
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
        {filteredGroups.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Nenhum item pendente.</p>
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
  );
}

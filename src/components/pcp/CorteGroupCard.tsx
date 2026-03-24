import { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Scissors, ChevronRight, Printer, Search, Play, Square, User, Plus, Loader2 } from 'lucide-react';
import { CutGroup, TIPO_PRODUTO_LABELS, ObsCorte } from '@/lib/pcp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface CorteRegistro {
  id: string;
  tipo_produto: string;
  largura: string;
  material: string;
  tamanho: string;
  cor: string;
  status: string;
  operador_id: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
}

interface Operador {
  id: string;
  nome: string;
}

interface CorteGroupCardProps {
  title: string;
  tipo: string;
  groups: CutGroup[];
  filterLargura: string;
  onFilterLarguraChange: (v: string) => void;
  larguras: string[];
}

function groupKey(tipo: string, g: CutGroup) {
  return `${tipo}|${g.largura}|${g.material}|${g.tamanho}|${g.cor}`;
}

export function CorteGroupCard({ title, tipo, groups, filterLargura, onFilterLarguraChange, larguras }: CorteGroupCardProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [registros, setRegistros] = useState<Map<string, CorteRegistro>>(new Map());
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operadorModal, setOperadorModal] = useState<{ open: boolean; group: CutGroup | null }>({ open: false, group: null });
  const [novoOperadorNome, setNovoOperadorNome] = useState('');
  const [savingOperador, setSavingOperador] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [markingRead, setMarkingRead] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchRegistros();
    fetchOperadores();
  }, [tipo]);

  const fetchRegistros = async () => {
    const { data } = await supabase
      .from('pcp_corte_registro')
      .select('*')
      .eq('tipo_produto', tipo);
    if (data) {
      const map = new Map<string, CorteRegistro>();
      for (const r of data) {
        map.set(`${r.tipo_produto}|${r.largura}|${r.material}|${r.tamanho}|${r.cor}`, r);
      }
      setRegistros(map);
    }
  };

  const fetchOperadores = async () => {
    const { data } = await supabase
      .from('pcp_operadores_corte')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    setOperadores(data || []);
  };

  const handleIniciar = async (g: CutGroup) => {
    const key = groupKey(tipo, g);
    setActionLoading(prev => new Set(prev).add(key));
    try {
      const existing = registros.get(key);
      if (existing) {
        await supabase.from('pcp_corte_registro').update({ status: 'INICIADO', iniciado_em: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await supabase.from('pcp_corte_registro').insert({
          tipo_produto: tipo, largura: g.largura, material: g.material, tamanho: g.tamanho, cor: g.cor,
          status: 'INICIADO', iniciado_em: new Date().toISOString(),
        });
      }
      toast.success('Corte iniciado');
      await fetchRegistros();
    } catch { toast.error('Erro ao iniciar'); }
    setActionLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const handleConcluir = async (g: CutGroup) => {
    const key = groupKey(tipo, g);
    setActionLoading(prev => new Set(prev).add(key));
    try {
      const existing = registros.get(key);
      if (existing) {
        await supabase.from('pcp_corte_registro').update({ status: 'CONCLUIDO', concluido_em: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await supabase.from('pcp_corte_registro').insert({
          tipo_produto: tipo, largura: g.largura, material: g.material, tamanho: g.tamanho, cor: g.cor,
          status: 'CONCLUIDO', iniciado_em: new Date().toISOString(), concluido_em: new Date().toISOString(),
        });
      }
      toast.success('Corte concluído');
      await fetchRegistros();
    } catch { toast.error('Erro ao concluir'); }
    setActionLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const handleSelectOperador = async (operadorId: string) => {
    if (!operadorModal.group) return;
    const g = operadorModal.group;
    const key = groupKey(tipo, g);
    try {
      const existing = registros.get(key);
      if (existing) {
        await supabase.from('pcp_corte_registro').update({ operador_id: operadorId }).eq('id', existing.id);
      } else {
        await supabase.from('pcp_corte_registro').insert({
          tipo_produto: tipo, largura: g.largura, material: g.material, tamanho: g.tamanho, cor: g.cor,
          operador_id: operadorId,
        });
      }
      toast.success('Operador atribuído');
      setOperadorModal({ open: false, group: null });
      await fetchRegistros();
    } catch { toast.error('Erro ao atribuir operador'); }
  };

  const handleCriarOperador = async () => {
    if (!novoOperadorNome.trim()) return;
    setSavingOperador(true);
    try {
      const { error } = await supabase.from('pcp_operadores_corte').insert({ nome: novoOperadorNome.trim() });
      if (error) throw error;
      toast.success(`Operador "${novoOperadorNome.trim()}" cadastrado`);
      setNovoOperadorNome('');
      await fetchOperadores();
    } catch { toast.error('Erro ao cadastrar operador'); }
    setSavingOperador(false);
  };

  const handleMarcarCiente = async (obsId: string) => {
    if (!profile) return;
    setMarkingRead(prev => new Set(prev).add(obsId));
    try {
      await supabase.from('pedido_item_obs_corte').update({
        lido: true,
        lido_em: new Date().toISOString(),
        lido_por: profile.id,
      }).eq('id', obsId);
      toast.success('Observação marcada como lida');
      // Trigger parent refresh would be ideal, but for now we update locally
      // The parent PCP.tsx will refresh on next load
    } catch { toast.error('Erro ao marcar como lida'); }
    setMarkingRead(prev => { const n = new Set(prev); n.delete(obsId); return n; });
  };

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

  const getOperadorNome = (operadorId: string | null | undefined) => {
    if (!operadorId) return null;
    return operadores.find(o => o.id === operadorId)?.nome || null;
  };

  return (
    <>
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
                  <TableHead>Operador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Itens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group, idx) => {
                  const key = groupKey(tipo, group);
                  const reg = registros.get(key);
                  const status = reg?.status || 'PENDENTE';
                  const isLoading = actionLoading.has(key);
                  const operadorNome = getOperadorNome(reg?.operador_id);

                  return (
                    <TableRow key={idx} className={status === 'CONCLUIDO' ? 'bg-blue-50/50' : status === 'INICIADO' ? 'bg-yellow-50/30' : ''}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{group.largura}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{group.material}</TableCell>
                      <TableCell className="text-sm">{group.tamanho}</TableCell>
                      <TableCell className="text-sm">{group.cor}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{group.quantidadeTotal}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 px-2"
                          onClick={() => setOperadorModal({ open: true, group })}
                        >
                          <User className="h-3 w-3" />
                          {operadorNome ? (
                            <span className="truncate max-w-[80px]">{operadorNome}</span>
                          ) : (
                            <span className="text-muted-foreground">Atribuir</span>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {status === 'PENDENTE' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 border-[hsl(var(--success))]/50 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10"
                              onClick={() => handleIniciar(group)}
                              disabled={isLoading}
                            >
                              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                              Início
                            </Button>
                          )}
                          {status === 'INICIADO' && (
                            <>
                              <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border-yellow-300">
                                Em andamento
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 border-blue-400 text-blue-600 hover:bg-blue-50"
                                onClick={() => handleConcluir(group)}
                                disabled={isLoading}
                              >
                                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                                Fim
                              </Button>
                            </>
                          )}
                          {status === 'CONCLUIDO' && (
                            <Badge className="text-[10px] bg-blue-500 text-white border-blue-600 font-bold">
                              Corte OK
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                            <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
                            <span>{group.itens.length} {group.itens.length === 1 ? 'item' : 'itens'}</span>
                            {(() => {
                              const unreadCount = group.itens.reduce((acc, item) => {
                                const unread = (item.obs_corte || []).filter(o => !o.lido).length;
                                return acc + unread;
                              }, 0);
                              if (unreadCount > 0) {
                                return (
                                  <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold animate-pulse">
                                    {unreadCount}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1.5 space-y-1.5 pl-4.5">
                            {group.itens.map(item => {
                              const obsCorteList = item.obs_corte || [];
                              const hasUnread = obsCorteList.some(o => !o.lido);
                              return (
                                <div key={item.id} className={`text-xs rounded-md p-1.5 ${hasUnread ? 'bg-destructive/5 border border-destructive/20' : ''}`}>
                                  <div className="flex items-baseline gap-2 flex-wrap">
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
                                  </div>
                                  {item.observacao_producao && (
                                    <div className="mt-0.5 bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5 text-warning text-[10px]">
                                      {item.observacao_producao}
                                    </div>
                                  )}
                                  {obsCorteList.map(obs => (
                                    <div key={obs.id} className={`mt-1 rounded px-2 py-1.5 text-[10px] flex items-start justify-between gap-2 ${obs.lido ? 'bg-muted/40 border border-border/50' : 'bg-destructive/10 border border-destructive/30'}`}>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <Scissors className={`h-3 w-3 shrink-0 ${obs.lido ? 'text-muted-foreground' : 'text-destructive'}`} />
                                          <span className={`font-semibold ${obs.lido ? 'text-muted-foreground' : 'text-destructive'}`}>
                                            {obs.lido ? 'Obs. Corte (lida)' : '⚠️ Obs. Corte'}
                                          </span>
                                          <span className="text-muted-foreground/60 ml-auto">{format(parseISO(obs.criado_em), 'dd/MM HH:mm')}</span>
                                        </div>
                                        <p className={obs.lido ? 'text-muted-foreground' : 'text-foreground font-medium'}>{obs.observacao}</p>
                                      </div>
                                      {!obs.lido && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-6 text-[9px] px-2 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                                          onClick={() => handleMarcarCiente(obs.id)}
                                          disabled={markingRead.has(obs.id)}
                                        >
                                          {markingRead.has(obs.id) ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Ciente'}
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </CollapsibleContent>
                        </Collapsible>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Operador Modal */}
      <Dialog open={operadorModal.open} onOpenChange={open => !open && setOperadorModal({ open: false, group: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Atribuir Operador</DialogTitle>
            <DialogDescription className="text-xs">
              {operadorModal.group && `${operadorModal.group.largura} • ${operadorModal.group.material} • ${operadorModal.group.cor}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {operadores.map(op => {
              const isSelected = operadorModal.group && registros.get(groupKey(tipo, operadorModal.group))?.operador_id === op.id;
              return (
                <Button
                  key={op.id}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className="w-full justify-start gap-2 h-9"
                  onClick={() => handleSelectOperador(op.id)}
                >
                  <User className="h-3.5 w-3.5" />
                  {op.nome}
                </Button>
              );
            })}
          </div>
          <div className="border-t pt-3 mt-2 space-y-2">
            <Label className="text-xs font-medium">Cadastrar novo operador</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do operador..."
                value={novoOperadorNome}
                onChange={e => setNovoOperadorNome(e.target.value)}
                className="h-9 text-sm"
                onKeyDown={e => e.key === 'Enter' && handleCriarOperador()}
              />
              <Button
                size="sm"
                onClick={handleCriarOperador}
                disabled={!novoOperadorNome.trim() || savingOperador}
                className="h-9 gap-1"
              >
                {savingOperador ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

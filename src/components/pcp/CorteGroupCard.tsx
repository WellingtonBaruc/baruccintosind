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
import { Textarea } from '@/components/ui/textarea';
import { Scissors, ChevronRight, Printer, Search, Play, Square, User, Plus, Loader2, CalendarDays, Package, Layers, Hash, ArrowUp, ArrowDown, ArrowUpDown, EyeOff } from 'lucide-react';
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
  quantidade_cortada: number | null;
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
  janelaDias: number | null;
  onJanelaDiasChange: (v: number | null) => void;
  onManualAdded?: () => void;
}

const JANELA_OPTIONS: { label: string; value: string }[] = [
  { label: 'Padrão', value: 'padrao' },
  { label: 'Mesmo dia', value: '0' },
  { label: '2 dias', value: '2' },
  { label: '3 dias', value: '3' },
  { label: '5 dias', value: '5' },
];

function groupKey(tipo: string, g: CutGroup) {
  if (g.is_manual && g.manual_id) return `manual|${g.manual_id}`;
  return `${tipo}|${g.largura}|${g.material}|${g.tamanho}|${g.cor}${g.faixa_data ? '|' + g.faixa_data : ''}`;
}

export function CorteGroupCard({ title, tipo, groups, filterLargura, onFilterLarguraChange, larguras, janelaDias, onJanelaDiasChange, onManualAdded }: CorteGroupCardProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [registros, setRegistros] = useState<Map<string, CorteRegistro>>(new Map());
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operadorModal, setOperadorModal] = useState<{ open: boolean; group: CutGroup | null }>({ open: false, group: null });
  const [novoOperadorNome, setNovoOperadorNome] = useState('');
  const [savingOperador, setSavingOperador] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [markingRead, setMarkingRead] = useState<Set<string>>(new Set());
  // Sorting
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Hide completed toggle
  const [hideCompleted, setHideCompleted] = useState(false);
  // Manual OP modal
  const [manualModal, setManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ descricao: '', quantidade: '', dataInicio: '', dataFim: '', observacao: '' });
  const [savingManual, setSavingManual] = useState(false);

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
      if (g.is_manual && g.manual_id) {
        await supabase.from('pcp_corte_manual').update({ status: 'INICIADO', iniciado_em: new Date().toISOString() }).eq('id', g.manual_id);
      } else {
        const existing = registros.get(key);
        if (existing) {
          await supabase.from('pcp_corte_registro').update({ status: 'INICIADO', iniciado_em: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await supabase.from('pcp_corte_registro').insert({
            tipo_produto: tipo, largura: g.largura, material: g.material, tamanho: g.tamanho, cor: g.cor,
            status: 'INICIADO', iniciado_em: new Date().toISOString(),
          });
        }
      }
      toast.success('Corte iniciado');
      await fetchRegistros();
      if (g.is_manual) onManualAdded?.();
    } catch { toast.error('Erro ao iniciar'); }
    setActionLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const handleConcluir = async (g: CutGroup) => {
    const key = groupKey(tipo, g);
    setActionLoading(prev => new Set(prev).add(key));
    try {
      if (g.is_manual && g.manual_id) {
        await supabase.from('pcp_corte_manual').update({
          status: 'CONCLUIDO', concluido_em: new Date().toISOString(),
        }).eq('id', g.manual_id);
      } else {
        const existing = registros.get(key);
        if (existing) {
          await supabase.from('pcp_corte_registro').update({
            status: 'CONCLUIDO',
            concluido_em: new Date().toISOString(),
            quantidade_cortada: g.quantidadeTotal,
          }).eq('id', existing.id);
        } else {
          await supabase.from('pcp_corte_registro').insert({
            tipo_produto: tipo, largura: g.largura, material: g.material, tamanho: g.tamanho, cor: g.cor,
            status: 'CONCLUIDO', iniciado_em: new Date().toISOString(), concluido_em: new Date().toISOString(),
            quantidade_cortada: g.quantidadeTotal,
          });
        }
      }
      toast.success('Corte concluído');
      await fetchRegistros();
      if (g.is_manual) onManualAdded?.();
    } catch { toast.error('Erro ao concluir'); }
    setActionLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const handleSelectOperador = async (operadorId: string) => {
    if (!operadorModal.group) return;
    const g = operadorModal.group;
    const key = groupKey(tipo, g);
    try {
      if (g.is_manual && g.manual_id) {
        await supabase.from('pcp_corte_manual').update({ operador_id: operadorId }).eq('id', g.manual_id);
      } else {
        const existing = registros.get(key);
        if (existing) {
          await supabase.from('pcp_corte_registro').update({ operador_id: operadorId }).eq('id', existing.id);
        } else {
          await supabase.from('pcp_corte_registro').insert({
            tipo_produto: tipo, largura: g.largura, material: g.material, tamanho: g.tamanho, cor: g.cor,
            operador_id: operadorId,
          });
        }
      }
      toast.success('Operador atribuído');
      setOperadorModal({ open: false, group: null });
      await fetchRegistros();
      if (g.is_manual) onManualAdded?.();
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
    } catch { toast.error('Erro ao marcar como lida'); }
    setMarkingRead(prev => { const n = new Set(prev); n.delete(obsId); return n; });
  };

  const handleCriarManual = async () => {
    if (!manualForm.descricao.trim() || !manualForm.quantidade) return;
    setSavingManual(true);
    try {
      const { error } = await supabase.from('pcp_corte_manual').insert({
        tipo_produto: tipo,
        descricao: manualForm.descricao.trim(),
        quantidade: parseInt(manualForm.quantidade) || 0,
        data_inicio: manualForm.dataInicio || null,
        data_fim: manualForm.dataFim || null,
        observacao: manualForm.observacao.trim() || null,
        criado_por: profile?.id || null,
      });
      if (error) throw error;
      toast.success('OP Manual criada com sucesso');
      setManualModal(false);
      setManualForm({ descricao: '', quantidade: '', dataInicio: '', dataFim: '', observacao: '' });
      onManualAdded?.();
    } catch { toast.error('Erro ao criar OP Manual'); }
    setSavingManual(false);
  };

  const searchedGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const term = search.trim().toLowerCase();
    return groups
      .map(g => {
        if (g.is_manual) {
          const match = (g.manual_descricao || '').toLowerCase().includes(term);
          return match ? g : null;
        }
        const matchedItens = g.itens.filter(i => {
          const vendaMatch = (i.numero_venda || '').toLowerCase().includes(term);
          const descMatch = (i.descricao || '').toLowerCase().includes(term);
          return vendaMatch || descMatch;
        });
        return matchedItens.length > 0 ? { ...g, itens: matchedItens, quantidadeTotal: matchedItens.reduce((s, i) => s + i.quantidade, 0) } : null;
      })
      .filter(Boolean) as CutGroup[];
  }, [groups, search]);

  const filteredUnsorted = filterLargura === 'all' ? searchedGroups : searchedGroups.filter(g => g.largura === filterLargura);

  const filteredGroups = useMemo(() => {
    if (!sortCol) return filteredUnsorted;
    return [...filteredUnsorted].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'largura': cmp = a.largura.localeCompare(b.largura); break;
        case 'material': cmp = a.material.localeCompare(b.material); break;
        case 'tamanho': cmp = a.tamanho.localeCompare(b.tamanho); break;
        case 'cor': cmp = a.cor.localeCompare(b.cor); break;
        case 'qtd': cmp = a.quantidadeTotal - b.quantidadeTotal; break;
        default: cmp = 0;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [filteredUnsorted, sortCol, sortDir]);

  const totalPecas = filteredGroups.reduce((sum, g) => sum + g.quantidadeTotal, 0);
  const totalItens = filteredGroups.reduce((sum, g) => sum + g.itens.length, 0);
  const totalGrupos = filteredGroups.length;

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortCol(null); setSortDir('asc'); }
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const isDateMode = janelaDias != null;

  const handlePrint = () => {
    const rows = filteredGroups.map(g => {
      const manualTag = g.is_manual ? '<span style="background:#fed7aa;color:#c2410c;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:bold">OP MANUAL</span> ' : '';
      const itensHtml = g.is_manual
        ? `${manualTag}${g.manual_descricao || g.itens[0]?.descricao || '-'} ×${g.quantidadeTotal}`
        : g.itens.map(i =>
          `${i.descricao} ×${i.quantidade}${i.numero_venda ? ' <span style="color:#666">#' + i.numero_venda + '</span>' : ''}${i.data_venda ? ' <span style="color:#999">' + format(parseISO(i.data_venda), 'dd/MM') + '</span>' : ''}${i.lead_time_dias != null ? ' <span style="color:#999">' + i.lead_time_dias + 'd</span>' : ''}`
        ).join('<br>');
      const faixaTd = isDateMode ? `<td style="font-weight:bold;white-space:nowrap">${g.faixa_data || 'SEM DATA'}</td>` : '';
      return `<tr${g.is_manual ? ' style="background:#fff7ed"' : ''}><td>${g.largura}</td><td>${g.material}</td><td>${g.tamanho}</td><td>${g.cor}</td>${faixaTd}<td style="text-align:right;font-weight:bold">${g.quantidadeTotal}</td><td style="font-size:11px">${itensHtml}</td></tr>`;
    }).join('');

    const janelaLabel = isDateMode ? ` — Agrupado por ${janelaDias === 0 ? 'mesmo dia' : janelaDias + ' dias'}` : '';
    const faixaTh = isDateMode ? '<th>Faixa Data</th>' : '';
    const html = `<!DOCTYPE html><html><head><title>Corte - ${title}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:15mm}
    h1{font-size:16px;margin-bottom:4px}.meta{color:#666;font-size:11px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#f0f0f0;font-size:11px;text-transform:uppercase}@media print{body{padding:10mm}}</style>
    </head><body><h1>Agrupamento de Corte — ${title}${filterLargura !== 'all' ? ' — ' + filterLargura : ''}${janelaLabel}</h1>
    <p class="meta">${totalGrupos} grupos • ${totalPecas} peças • ${totalItens} itens • ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
    <table><thead><tr><th>Largura</th><th>Material</th><th>Tamanho</th><th>Cor</th>${faixaTh}<th style="text-align:right">Qtd</th><th>Itens</th></tr></thead>
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

  const getManualStatus = (g: CutGroup) => {
    if (!g.is_manual) return null;
    // For manual OPs, status comes from the group data (loaded from pcp_corte_manual)
    // We check via manual fields
    return (g as any)._manual_status || 'PENDENTE';
  };

  return (
    <>
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-col gap-3">
          <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Scissors className="h-4 w-4" />
                {title}
              </CardTitle>
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
              <Select
                value={janelaDias != null ? String(janelaDias) : 'padrao'}
                onValueChange={v => onJanelaDiasChange(v === 'padrao' ? null : Number(v))}
              >
                <SelectTrigger className="w-[140px]">
                  <CalendarDays className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Agrup. data" />
                </SelectTrigger>
                <SelectContent>
                  {JANELA_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handlePrint} disabled={filteredGroups.length === 0}>
                <Printer className="h-4 w-4 mr-1" />
                PDF
              </Button>
              <Button variant="outline" size="sm" className="border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => setManualModal(true)}>
                <Plus className="h-4 w-4 mr-1" />
                OP Manual
              </Button>
            </div>
          </div>
          {/* Fase 2: Indicator mini-cards */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5">
              <Package className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Peças</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{totalPecas}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Grupos</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{totalGrupos}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5">
              <Hash className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Itens</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{totalItens}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredGroups.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Nenhum item pendente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('largura')}>
                    <span className="flex items-center gap-1">Largura <SortIcon col="largura" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('material')}>
                    <span className="flex items-center gap-1">Material <SortIcon col="material" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('tamanho')}>
                    <span className="flex items-center gap-1">Tamanho <SortIcon col="tamanho" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('cor')}>
                    <span className="flex items-center gap-1">Cor <SortIcon col="cor" /></span>
                  </TableHead>
                  {isDateMode && <TableHead>Faixa Data</TableHead>}
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('qtd')}>
                    <span className="flex items-center gap-1 justify-end">Qtd Total <SortIcon col="qtd" /></span>
                  </TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Itens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group, idx) => {
                  const key = groupKey(tipo, group);
                  const isManual = !!group.is_manual;
                  const reg = isManual ? null : registros.get(key);
                  const status = isManual ? ((group as any)._manual_status || 'PENDENTE') : (reg?.status || 'PENDENTE');
                  const isLoading = actionLoading.has(key);
                  const operadorNome = isManual
                    ? getOperadorNome((group as any)._manual_operador_id)
                    : getOperadorNome(reg?.operador_id);

                  const rowClass = isManual
                    ? 'bg-orange-50/70 border-l-4 border-l-orange-400'
                    : status === 'CONCLUIDO'
                      ? 'bg-blue-50/50'
                      : status === 'INICIADO'
                        ? 'bg-yellow-50/30'
                        : '';

                  return (
                    <TableRow key={key + idx} className={rowClass}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="font-mono">{group.largura}</Badge>
                          {isManual && (
                            <Badge className="text-[9px] bg-orange-100 text-orange-700 border-orange-300 font-bold">
                              OP Manual
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{group.material}</TableCell>
                      <TableCell className="text-sm">{group.tamanho}</TableCell>
                      <TableCell className="text-sm">{group.cor}</TableCell>
                      {isDateMode && (
                        <TableCell>
                          <Badge variant="outline" className={`font-mono text-[10px] ${group.faixa_data === 'SEM DATA' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary border-primary/30'}`}>
                            <CalendarDays className="h-3 w-3 mr-1" />
                            {group.faixa_data || 'SEM DATA'}
                          </Badge>
                        </TableCell>
                      )}
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
                        {isManual ? (
                          <div className="text-xs space-y-0.5">
                            <span className="font-bold text-foreground">{group.manual_descricao || '-'}</span>
                            {group.manual_data_inicio && (
                              <div className="text-foreground/70 text-[10px]">
                                {format(parseISO(group.manual_data_inicio), 'dd/MM')}
                                {group.manual_data_fim && ` → ${format(parseISO(group.manual_data_fim), 'dd/MM')}`}
                              </div>
                            )}
                            {group.manual_observacao && (
                              <div className="bg-orange-100/60 border border-orange-200 rounded px-1.5 py-0.5 text-orange-700 text-[10px]">
                                {group.manual_observacao}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                              <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
                              <span>{group.itens.length} {group.itens.length === 1 ? 'item' : 'itens'}</span>
                              {(() => {
                                const totalObs = group.itens.reduce((acc, item) => acc + (item.obs_corte || []).length, 0);
                                const unreadCount = group.itens.reduce((acc, item) => acc + (item.obs_corte || []).filter(o => !o.lido).length, 0);
                                if (totalObs === 0) return null;
                                if (unreadCount > 0) {
                                  return (
                                    <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold animate-pulse">
                                      {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive/20 text-destructive text-[9px] font-semibold">
                                    {totalObs} obs
                                  </span>
                                );
                              })()}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1.5 space-y-1.5 pl-4.5">
                              {[...group.itens].sort((a, b) => {
                                const aHas = (a.obs_corte || []).length > 0 ? 1 : 0;
                                const bHas = (b.obs_corte || []).length > 0 ? 1 : 0;
                                if (aHas !== bHas) return bHas - aHas;
                                const aUnread = (a.obs_corte || []).some(o => !o.lido) ? 1 : 0;
                                const bUnread = (b.obs_corte || []).some(o => !o.lido) ? 1 : 0;
                                return bUnread - aUnread;
                              }).map(item => {
                                const obsCorteList = item.obs_corte || [];
                                const hasObs = obsCorteList.length > 0;
                                const hasUnread = obsCorteList.some(o => !o.lido);
                                const itemBg = hasUnread
                                  ? 'bg-destructive/8 border border-destructive/30'
                                  : hasObs
                                    ? 'bg-destructive/4 border border-destructive/15'
                                    : '';
                                return (
                                  <div key={item.id} className={`text-xs rounded-md p-1.5 ${itemBg}`}>
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                      <span className="font-bold text-foreground">{item.descricao}</span>
                                      <span className="font-semibold text-foreground/90">×{item.quantidade}</span>
                                      {item.numero_venda && (
                                        <span className="text-primary font-semibold font-mono text-[10px]">#{item.numero_venda}</span>
                                      )}
                                      {item.data_venda && (
                                        <span className="text-foreground/70 font-semibold text-[10px]">{format(parseISO(item.data_venda), 'dd/MM')}</span>
                                      )}
                                      {item.lead_time_dias != null && (
                                        <span className="text-foreground/70 font-semibold text-[10px]">{item.lead_time_dias}d</span>
                                      )}
                                      {item.referencia && <span className="text-foreground/70 font-semibold text-[10px]">({item.referencia})</span>}
                                    </div>
                                    {item.observacao_producao && (
                                      <div className="mt-0.5 bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5 text-warning text-[10px]">
                                        {item.observacao_producao}
                                      </div>
                                    )}
                                    {obsCorteList.map(obs => (
                                      <div key={obs.id} className={`mt-1 rounded px-2 py-1.5 text-[10px] flex items-start justify-between gap-2 ${obs.lido ? 'bg-destructive/5 border border-destructive/15' : 'bg-destructive/10 border border-destructive/30'}`}>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1 mb-0.5">
                                            <Scissors className={`h-3 w-3 shrink-0 ${obs.lido ? 'text-destructive/60' : 'text-destructive'}`} />
                                            <span className={`font-semibold ${obs.lido ? 'text-destructive/60' : 'text-destructive'}`}>
                                              {obs.lido ? 'Obs. Corte ✓' : '⚠️ Obs. Corte'}
                                            </span>
                                            <span className="text-muted-foreground/60 ml-auto">{format(parseISO(obs.criado_em), 'dd/MM HH:mm')}</span>
                                          </div>
                                          <p className={obs.lido ? 'text-destructive/70' : 'text-foreground font-medium'}>{obs.observacao}</p>
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
                        )}
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
              const isSelected = operadorModal.group && !operadorModal.group.is_manual && registros.get(groupKey(tipo, operadorModal.group))?.operador_id === op.id;
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

      {/* Manual OP Modal */}
      <Dialog open={manualModal} onOpenChange={setManualModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-400" />
              Nova OP Manual — {TIPO_PRODUTO_LABELS[tipo] || tipo}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Essa OP será adicionada à fila de corte com destaque em laranja.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Descrição *</Label>
              <Input
                placeholder="Ex: Cinto Sintético 35MM Preto..."
                value={manualForm.descricao}
                onChange={e => setManualForm(f => ({ ...f, descricao: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Quantidade *</Label>
              <Input
                type="number"
                placeholder="0"
                value={manualForm.quantidade}
                onChange={e => setManualForm(f => ({ ...f, quantidade: e.target.value }))}
                className="mt-1 w-32"
                min={1}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data Início</Label>
                <Input
                  type="date"
                  value={manualForm.dataInicio}
                  onChange={e => setManualForm(f => ({ ...f, dataInicio: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Data Fim</Label>
                <Input
                  type="date"
                  value={manualForm.dataFim}
                  onChange={e => setManualForm(f => ({ ...f, dataFim: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea
                placeholder="Observação opcional..."
                value={manualForm.observacao}
                onChange={e => setManualForm(f => ({ ...f, observacao: e.target.value }))}
                className="mt-1 h-16"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualModal(false)}>Cancelar</Button>
            <Button
              onClick={handleCriarManual}
              disabled={!manualForm.descricao.trim() || !manualForm.quantidade || savingManual}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {savingManual ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar OP Manual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

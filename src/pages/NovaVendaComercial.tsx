import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, ArrowLeft, ShoppingBag, Download, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ItemForm {
  descricao_produto: string;
  referencia_produto: string;
  categoria_produto: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  observacao_producao: string;
}

const CATEGORIAS = ['Cinto Sintético', 'Cinto Tecido', 'Fivela Coberta', 'Acessório', 'Outros'];
const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de Crédito', 'Depósito Bancário', 'Cheque', 'Outros'];
const FORMAS_ENVIO = ['Correios', 'Transportadora', 'Retirada na loja', 'Motoboy', 'Outros'];
const CANAIS_VENDA = ['Loja Física', 'WhatsApp', 'Instagram', 'Site', 'Marketplace', 'Representante', 'Outros'];

const PIPELINE_IDS: Record<string, string> = {
  SINTETICO: '00000000-0000-0000-0000-000000000001',
  TECIDO: '00000000-0000-0000-0000-000000000002',
  FIVELA_COBERTA: '00000000-0000-0000-0000-000000000003',
};

function classificarProduto(nome: string, categoria?: string, referencia?: string): string {
  const upper = (nome || '').toUpperCase();
  const catUpper = (categoria || '').toUpperCase();
  const refUpper = (referencia || '').toUpperCase();
  if (upper.includes('FIVELA COBERTA') || upper.includes('FIVELA MATRIZ') || catUpper === 'FIVELA COBERTA' || catUpper === 'FIVELA_COBERTA' || refUpper.startsWith('FVC')) return 'FIVELA_COBERTA';
  if (upper.includes('CINTO SINTETICO') || upper.includes('TIRA SINTETICO') || upper.includes('CINTO SINTÉTICO') || upper.includes('TIRA SINTÉTICO') || catUpper.includes('SINTÉTICO') || catUpper.includes('SINTETICO')) return 'SINTETICO';
  if (upper.includes('CINTO TECIDO') || upper.includes('TIRA TECIDO') || catUpper.includes('TECIDO')) return 'TECIDO';
  return 'OUTROS';
}

const TIPO_LABELS: Record<string, string> = {
  SINTETICO: 'Sintético',
  TECIDO: 'Tecido',
  FIVELA_COBERTA: 'Fivela Coberta',
  OUTROS: 'Outros',
};

const emptyItem = (): ItemForm => ({
  descricao_produto: '',
  referencia_produto: '',
  categoria_produto: '',
  unidade_medida: 'UN',
  quantidade: 1,
  valor_unitario: 0,
  observacao_producao: '',
});

export default function NovaVendaComercial() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [vendaCriada, setVendaCriada] = useState<{ numeroPedido: string } | null>(null);
  // Tipo de fluxo
  const [tipoFluxo, setTipoFluxo] = useState<'PRODUCAO' | 'PRONTA_ENTREGA'>('PRODUCAO');

  // Client data
  const [clienteNome, setClienteNome] = useState('');
  const [clienteCpf, setClienteCpf] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');

  // Sale data
  const [vendedorNome, setVendedorNome] = useState('');
  const [canalVenda, setCanalVenda] = useState('');
  const [dataPrevisaoEntrega, setDataPrevisaoEntrega] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [formaEnvio, setFormaEnvio] = useState('');
  const [observacaoComercial, setObservacaoComercial] = useState('');

  // Valores extras
  const [valorFrete, setValorFrete] = useState(0);
  const [valorDesconto, setValorDesconto] = useState(0);
  const [valorAcrescimo, setValorAcrescimo] = useState(0);

  // Items
  const [itens, setItens] = useState<ItemForm[]>([emptyItem()]);

  // Lead times
  const [leadTimeMap, setLeadTimeMap] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase.from('pcp_configuracao').select('*').then(({ data }) => {
      const map: Record<string, number> = {};
      for (const cfg of (data || [])) map[cfg.tipo_produto] = cfg.lead_time_dias;
      setLeadTimeMap(map);
    });
  }, []);

  if (!profile || !['admin', 'gestor', 'comercial'].includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const addItem = () => setItens([...itens, emptyItem()]);
  const removeItem = (idx: number) => setItens(itens.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof ItemForm, value: string | number) => {
    const updated = [...itens];
    (updated[idx] as any)[field] = value;
    setItens(updated);
  };

  const valorProdutos = itens.reduce((sum, i) => sum + i.quantidade * i.valor_unitario, 0);
  const valorBruto = valorProdutos + valorFrete + valorAcrescimo;
  const valorLiquido = valorBruto - valorDesconto;

  // Classify items for preview
  const tiposDetectados = new Set(itens.filter(i => i.descricao_produto.trim()).map(i => classificarProduto(i.descricao_produto, i.categoria_produto, i.referencia_produto)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome.trim()) { toast.error('Nome do cliente é obrigatório.'); return; }
    if (itens.some(i => !i.descricao_produto.trim())) { toast.error('Preencha a descrição de todos os itens.'); return; }
    if (itens.length === 0) { toast.error('Adicione ao menos um item.'); return; }

    setSaving(true);
    try {
      // Generate order number
      const { count } = await supabase.from('pedidos').select('*', { count: 'exact', head: true });
      const numeroPedido = `PED-${String((count || 0) + 1).padStart(5, '0')}`;

      const statusAtual = tipoFluxo === 'PRODUCAO' ? 'AGUARDANDO_PRODUCAO' : 'AGUARDANDO_LOJA';

      // Calculate lead time
      let leadTimeDias: number | null = null;
      let dataInicioNecessaria: string | null = null;
      let statusPrazo = 'NO_PRAZO';

      if (dataPrevisaoEntrega && tipoFluxo === 'PRODUCAO') {
        let maxLeadTime = 0;
        for (const tp of tiposDetectados) {
          const lt = leadTimeMap[tp] || 2;
          if (lt > maxLeadTime) maxLeadTime = lt;
        }
        leadTimeDias = maxLeadTime;
        const previsaoDate = new Date(dataPrevisaoEntrega);
        const inicioDate = new Date(previsaoDate);
        inicioDate.setDate(inicioDate.getDate() - maxLeadTime);
        dataInicioNecessaria = inicioDate.toISOString().split('T')[0];

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const inicioCheck = new Date(dataInicioNecessaria);
        if (hoje > inicioCheck) statusPrazo = 'ATRASADO';
        else if (hoje.getTime() === inicioCheck.getTime()) statusPrazo = 'ATENCAO';
      }

      // 1. Create pedido
      const { data: pedido, error: pedidoErr } = await supabase
        .from('pedidos')
        .insert({
          numero_pedido: numeroPedido,
          status_atual: statusAtual,
          tipo_fluxo: tipoFluxo,
          sincronizacao_bloqueada: true,
          cliente_nome: clienteNome,
          cliente_cpf_cnpj: clienteCpf || null,
          cliente_telefone: clienteTelefone || null,
          cliente_email: clienteEmail || null,
          cliente_endereco: clienteEndereco || null,
          vendedor_nome: vendedorNome || null,
          canal_venda: canalVenda || null,
          valor_bruto: valorBruto,
          valor_produtos: valorProdutos,
          valor_frete: valorFrete,
          valor_acrescimo: valorAcrescimo,
          valor_desconto: valorDesconto,
          valor_liquido: valorLiquido,
          forma_pagamento: formaPagamento || null,
          forma_envio: formaEnvio || null,
          data_previsao_entrega: dataPrevisaoEntrega || null,
          data_venda_api: new Date().toISOString().split('T')[0],
          lead_time_preparacao_dias: leadTimeDias,
          data_inicio_producao_necessaria: dataInicioNecessaria,
          status_prazo: statusPrazo,
          observacao_comercial: observacaoComercial || null,
          pagamento_confirmado: false,
          usuario_responsavel_id: profile.id,
        } as any)
        .select('id')
        .single();

      if (pedidoErr || !pedido) throw pedidoErr || new Error('Falha ao criar pedido');

      // 2. Insert items
      const itensData = itens.map(i => ({
        pedido_id: pedido.id,
        descricao_produto: i.descricao_produto,
        referencia_produto: i.referencia_produto || null,
        categoria_produto: i.categoria_produto || null,
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
        valor_unitario_liquido: i.valor_unitario,
        valor_total: i.quantidade * i.valor_unitario,
        observacao_producao: i.observacao_producao || null,
        unidade_medida: i.unidade_medida,
      }));
      const { error: itensErr } = await supabase.from('pedido_itens').insert(itensData as any);
      if (itensErr) throw itensErr;

      // 3. For PRODUCAO flow: create orders per product type (like Simplifica)
      if (tipoFluxo === 'PRODUCAO') {
        const itensByTipo: Record<string, ItemForm[]> = {};
        for (const item of itens) {
          const tipo = classificarProduto(item.descricao_produto, item.categoria_produto, item.referencia_produto);
          if (!itensByTipo[tipo]) itensByTipo[tipo] = [];
          itensByTipo[tipo].push(item);
        }

        // Load pipeline steps
        const pipelineEtapasMap: Record<string, any[]> = {};
        for (const [tipo, pId] of Object.entries(PIPELINE_IDS)) {
          const { data: etapas } = await supabase
            .from('pipeline_etapas')
            .select('*')
            .eq('pipeline_id', pId)
            .order('ordem');
          pipelineEtapasMap[tipo] = etapas || [];
        }

        let sequencia = 1;
        for (const [tipoProduto] of Object.entries(itensByTipo)) {
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
            const opEtapas = etapas.map((e: any) => ({
              ordem_id: ordem.id,
              pipeline_etapa_id: e.id,
              nome_etapa: e.nome,
              ordem_sequencia: e.ordem,
              status: 'PENDENTE',
            }));
            await supabase.from('op_etapas').insert(opEtapas as any);
          }
          sequencia++;
        }

        await supabase.from('pedidos').update({ status_atual: 'EM_PRODUCAO' }).eq('id', pedido.id);
      }

      // 4. History
      await supabase.from('pedido_historico').insert({
        pedido_id: pedido.id,
        usuario_id: profile.id,
        tipo_acao: 'TRANSICAO',
        status_anterior: null,
        status_novo: tipoFluxo === 'PRODUCAO' ? 'EM_PRODUCAO' : statusAtual,
        observacao: `Venda criada manualmente pelo comercial. Fluxo: ${tipoFluxo}.${tiposDetectados.size > 0 ? ` Tipos: ${[...tiposDetectados].join(', ')}.` : ''}`,
      });

      toast.success('Venda criada com sucesso! Pedido inserido no sistema.');
      setVendaCriada({ numeroPedido });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao criar venda.');
    }
    setSaving(false);
  };

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const gerarPDF = () => {
    if (!vendaCriada) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('BARUC - Pedido de Venda', pw / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Pedido: ${vendaCriada.numeroPedido}`, 14, 32);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, pw - 14, 32, { align: 'right' });
    doc.text(`Fluxo: ${tipoFluxo === 'PRODUCAO' ? 'Produção' : 'Pronta Entrega'}`, 14, 38);

    // Line
    doc.setDrawColor(200);
    doc.line(14, 42, pw - 14, 42);

    // Client info
    let y = 50;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados do Cliente', 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nome: ${clienteNome}`, 14, y); y += 5;
    if (clienteCpf) { doc.text(`CPF/CNPJ: ${clienteCpf}`, 14, y); y += 5; }
    if (clienteTelefone) { doc.text(`Telefone: ${clienteTelefone}`, 14, y); y += 5; }
    if (clienteEmail) { doc.text(`Email: ${clienteEmail}`, 14, y); y += 5; }
    if (clienteEndereco) { doc.text(`Endereço: ${clienteEndereco}`, 14, y); y += 5; }

    // Sale info
    y += 4;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados da Venda', 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (vendedorNome) { doc.text(`Vendedor: ${vendedorNome}`, 14, y); y += 5; }
    if (canalVenda) { doc.text(`Canal: ${canalVenda}`, 14, y); y += 5; }
    if (dataPrevisaoEntrega) { doc.text(`Previsão entrega: ${new Date(dataPrevisaoEntrega + 'T12:00:00').toLocaleDateString('pt-BR')}`, 14, y); y += 5; }
    if (formaPagamento) { doc.text(`Pagamento: ${formaPagamento}`, 14, y); y += 5; }
    if (formaEnvio) { doc.text(`Envio: ${formaEnvio}`, 14, y); y += 5; }
    if (observacaoComercial) { doc.text(`Obs: ${observacaoComercial}`, 14, y); y += 5; }

    // Items table
    y += 4;
    const tableData = itens.map((item, idx) => [
      String(idx + 1),
      item.descricao_produto,
      item.referencia_produto || '-',
      item.categoria_produto || '-',
      String(item.quantidade),
      fmtBRL(item.valor_unitario),
      fmtBRL(item.quantidade * item.valor_unitario),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Descrição', 'Ref.', 'Categoria', 'Qtd', 'Vl. Un.', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 50 },
        4: { halign: 'center', cellWidth: 15 },
        5: { halign: 'right', cellWidth: 25 },
        6: { halign: 'right', cellWidth: 25 },
      },
      margin: { left: 14, right: 14 },
    });

    // Totals
    const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
    let ty = finalY + 8;
    doc.setFontSize(9);
    const rx = pw - 14;
    doc.text(`Produtos: ${fmtBRL(valorProdutos)}`, rx, ty, { align: 'right' }); ty += 5;
    if (valorFrete > 0) { doc.text(`Frete: ${fmtBRL(valorFrete)}`, rx, ty, { align: 'right' }); ty += 5; }
    if (valorAcrescimo > 0) { doc.text(`Acréscimo: ${fmtBRL(valorAcrescimo)}`, rx, ty, { align: 'right' }); ty += 5; }
    if (valorDesconto > 0) { doc.text(`Desconto: -${fmtBRL(valorDesconto)}`, rx, ty, { align: 'right' }); ty += 5; }
    doc.setDrawColor(200);
    doc.line(rx - 60, ty, rx, ty); ty += 4;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: ${fmtBRL(valorLiquido)}`, rx, ty, { align: 'right' });

    doc.save(`${vendaCriada.numeroPedido}.pdf`);
  };

  const handleNovaVenda = () => {
    setVendaCriada(null);
    setClienteNome(''); setClienteCpf(''); setClienteTelefone(''); setClienteEmail(''); setClienteEndereco('');
    setVendedorNome(''); setCanalVenda(''); setDataPrevisaoEntrega(''); setFormaPagamento(''); setFormaEnvio('');
    setObservacaoComercial(''); setValorFrete(0); setValorDesconto(0); setValorAcrescimo(0);
    setItens([emptyItem()]); setTipoFluxo('PRODUCAO');
  };

  if (vendaCriada) {
    return (
      <div className="animate-fade-in space-y-6 max-w-lg mx-auto mt-12">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold">Venda criada com sucesso!</h2>
              <p className="text-muted-foreground">Pedido <span className="font-medium text-foreground">{vendaCriada.numeroPedido}</span> inserido no sistema.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Button onClick={gerarPDF} className="min-h-[48px]" variant="default">
                <Download className="h-4 w-4 mr-2" /> Baixar PDF da Venda
              </Button>
              <Button onClick={handleNovaVenda} variant="outline" className="min-h-[48px]">
                <Plus className="h-4 w-4 mr-2" /> Nova Venda
              </Button>
            </div>
            <Button variant="ghost" className="text-muted-foreground" onClick={() => navigate(tipoFluxo === 'PRODUCAO' ? '/producao' : '/kanban-venda')}>
              Ir para a fila
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nova Venda</h1>
          <p className="text-muted-foreground mt-0.5">Crie uma venda manual com as mesmas características do Simplifica.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo de fluxo */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Tipo de Fluxo</CardTitle></CardHeader>
          <CardContent>
            <Select value={tipoFluxo} onValueChange={(v) => setTipoFluxo(v as 'PRODUCAO' | 'PRONTA_ENTREGA')}>
              <SelectTrigger className="min-h-[48px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRODUCAO">Produção — entra na fila de produção</SelectItem>
                <SelectItem value="PRONTA_ENTREGA">Pronta Entrega — vai para a loja</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Client */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Dados do Cliente</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome do cliente *</Label>
              <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome completo" required />
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input value={clienteCpf} onChange={e => setClienteCpf(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={clienteTelefone} onChange={e => setClienteTelefone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Canal de Venda</Label>
              <Select value={canalVenda} onValueChange={setCanalVenda}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CANAIS_VENDA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Endereço de entrega</Label>
              <Textarea value={clienteEndereco} onChange={e => setClienteEndereco(e.target.value)} placeholder="Endereço completo..." rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Sale details */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Dados da Venda</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Input value={vendedorNome} onChange={e => setVendedorNome(e.target.value)} placeholder="Nome do vendedor" />
            </div>
            <div className="space-y-2">
              <Label>Previsão de Entrega</Label>
              <Input type="date" value={dataPrevisaoEntrega} onChange={e => setDataPrevisaoEntrega(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Forma de Envio</Label>
              <Select value={formaEnvio} onValueChange={setFormaEnvio}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {FORMAS_ENVIO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Observação Comercial</Label>
              <Textarea value={observacaoComercial} onChange={e => setObservacaoComercial(e.target.value)} placeholder="Observações internas..." rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itens do Pedido</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addItem}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {itens.map((item, idx) => (
              <div key={idx} className="space-y-3 p-3 rounded-lg border border-border/40 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    {item.descricao_produto.trim() && (
                      <Badge variant="outline" className="text-[10px]">
                        {TIPO_LABELS[classificarProduto(item.descricao_produto, item.categoria_produto, item.referencia_produto)] || 'Outros'}
                      </Badge>
                    )}
                    {itens.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-5 space-y-1">
                    <Label className="text-xs">Descrição do produto *</Label>
                    <Input value={item.descricao_produto} onChange={e => updateItem(idx, 'descricao_produto', e.target.value)} placeholder="Ex: Cinto Sintético 35mm Preto" />
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    <Label className="text-xs">Referência</Label>
                    <Input value={item.referencia_produto} onChange={e => updateItem(idx, 'referencia_produto', e.target.value)} placeholder="REF-001" />
                  </div>
                  <div className="sm:col-span-4 space-y-1">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={item.categoria_produto} onValueChange={v => updateItem(idx, 'categoria_produto', v)}>
                      <SelectTrigger className="min-h-[40px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Un.</Label>
                    <Input value={item.unidade_medida} onChange={e => updateItem(idx, 'unidade_medida', e.target.value)} />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Qtd</Label>
                    <Input type="number" min={1} value={item.quantidade} onChange={e => updateItem(idx, 'quantidade', parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    <Label className="text-xs">Valor un. (R$)</Label>
                    <Input type="number" min={0} step="0.01" value={item.valor_unitario} onChange={e => updateItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="sm:col-span-2 flex items-end">
                    <span className="text-sm font-semibold">
                      {(item.quantidade * item.valor_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    <Label className="text-xs">Obs. produção</Label>
                    <Input value={item.observacao_producao} onChange={e => updateItem(idx, 'observacao_producao', e.target.value)} placeholder="Obs..." />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Valores</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Frete (R$)</Label>
                <Input type="number" min={0} step="0.01" value={valorFrete} onChange={e => setValorFrete(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>Acréscimo (R$)</Label>
                <Input type="number" min={0} step="0.01" value={valorAcrescimo} onChange={e => setValorAcrescimo(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>Desconto (R$)</Label>
                <Input type="number" min={0} step="0.01" value={valorDesconto} onChange={e => setValorDesconto(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <Separator />
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Produtos</span>
                <span>{valorProdutos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
              {valorFrete > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{valorFrete.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
              {valorAcrescimo > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Acréscimo</span><span>{valorAcrescimo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
              {valorDesconto > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="text-destructive">-{valorDesconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
              <Separator />
              <div className="flex justify-between font-semibold text-base">
                <span>Total</span>
                <span>{valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
            </div>

            {tipoFluxo === 'PRODUCAO' && tiposDetectados.size > 0 && (
              <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border/40">
                <p className="text-xs text-muted-foreground mb-2">Ordens de produção que serão criadas:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...tiposDetectados].map(t => (
                    <Badge key={t} variant="secondary" className="text-xs">
                      {TIPO_LABELS[t] || t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pb-8">
          <Button type="button" variant="outline" className="min-h-[48px]" onClick={() => navigate(-1)}>Cancelar</Button>
          <Button type="submit" disabled={saving} className="min-h-[48px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShoppingBag className="h-4 w-4 mr-1" />}
            Criar Venda
          </Button>
        </div>
      </form>
    </div>
  );
}

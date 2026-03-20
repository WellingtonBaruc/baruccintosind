import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { criarPedidoCompleto, gerarNumeroPedido } from '@/lib/producao';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface ItemForm {
  descricao_produto: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
}

export default function NovoPedido() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Pipeline selection
  const [pipelines, setPipelines] = useState<{ id: string; nome: string; padrao: boolean }[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState('');

  // Pedido form
  const [clienteNome, setClienteNome] = useState('');
  const [clienteCpf, setClienteCpf] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');
  const [vendedorNome, setVendedorNome] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [formaEnvio, setFormaEnvio] = useState('');

  // Items
  const [itens, setItens] = useState<ItemForm[]>([
    { descricao_produto: '', unidade_medida: 'UN', quantidade: 1, valor_unitario: 0 },
  ]);

  useEffect(() => {
    supabase.from('pipeline_producao').select('id, nome, padrao').eq('ativo', true).order('padrao', { ascending: false }).then(({ data }) => {
      setPipelines(data || []);
      const padrao = data?.find(p => p.padrao);
      if (padrao) setSelectedPipeline(padrao.id);
    });
  }, []);

  if (!profile || !['admin', 'gestor'].includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const addItem = () => setItens([...itens, { descricao_produto: '', unidade_medida: 'UN', quantidade: 1, valor_unitario: 0 }]);
  const removeItem = (idx: number) => setItens(itens.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof ItemForm, value: string | number) => {
    const updated = [...itens];
    (updated[idx] as any)[field] = value;
    setItens(updated);
  };

  const valorTotal = itens.reduce((sum, i) => sum + i.quantidade * i.valor_unitario, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome.trim()) { toast.error('Nome do cliente é obrigatório.'); return; }
    if (!selectedPipeline) { toast.error('Selecione um pipeline.'); return; }
    if (itens.some(i => !i.descricao_produto.trim())) { toast.error('Preencha a descrição de todos os itens.'); return; }

    setSaving(true);
    try {
      const numero = await gerarNumeroPedido();
      await criarPedidoCompleto(
        {
          numero_pedido: numero,
          api_venda_id: null,
          status_atual: 'AGUARDANDO_PRODUCAO',
          cliente_nome: clienteNome,
          cliente_cpf_cnpj: clienteCpf || null,
          cliente_telefone: clienteTelefone || null,
          cliente_email: clienteEmail || null,
          cliente_endereco: clienteEndereco || null,
          vendedor_nome: vendedorNome || null,
          valor_bruto: valorTotal,
          valor_desconto: 0,
          valor_liquido: valorTotal,
          forma_pagamento: formaPagamento || null,
          forma_envio: formaEnvio || null,
          pagamento_confirmado: false,
          observacao_comercial: null,
          observacao_financeiro: null,
          observacao_logistica: null,
          usuario_responsavel_id: profile.id,
        },
        itens.map(i => ({
          produto_api_id: null,
          descricao_produto: i.descricao_produto,
          unidade_medida: i.unidade_medida,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
          valor_total: i.quantidade * i.valor_unitario,
        })),
        selectedPipeline,
        profile.id
      );
      toast.success('Pedido criado com sucesso!');
      navigate('/producao');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar pedido.');
    }
    setSaving(false);
  };

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/producao')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Novo Pedido</h1>
          <p className="text-muted-foreground mt-0.5">Crie um pedido manualmente e inicie a produção.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Pipeline */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Pipeline de Produção</CardTitle></CardHeader>
          <CardContent>
            <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
              <SelectTrigger><SelectValue placeholder="Selecione o pipeline..." /></SelectTrigger>
              <SelectContent>
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}{p.padrao ? ' (padrão)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Client data */}
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
              <Label>Vendedor</Label>
              <Input value={vendedorNome} onChange={e => setVendedorNome(e.target.value)} placeholder="Nome do vendedor" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Endereço de entrega</Label>
              <Textarea value={clienteEndereco} onChange={e => setClienteEndereco(e.target.value)} placeholder="Endereço completo..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Input value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} placeholder="Ex: Boleto, Cartão..." />
            </div>
            <div className="space-y-2">
              <Label>Forma de envio</Label>
              <Input value={formaEnvio} onChange={e => setFormaEnvio(e.target.value)} placeholder="Ex: Correios, Transportadora..." />
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
              <div key={idx} className="grid gap-3 sm:grid-cols-12 items-end">
                <div className="sm:col-span-4 space-y-1">
                  {idx === 0 && <Label className="text-xs">Descrição *</Label>}
                  <Input
                    value={item.descricao_produto}
                    onChange={e => updateItem(idx, 'descricao_produto', e.target.value)}
                    placeholder="Produto..."
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  {idx === 0 && <Label className="text-xs">Unidade</Label>}
                  <Input value={item.unidade_medida} onChange={e => updateItem(idx, 'unidade_medida', e.target.value)} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  {idx === 0 && <Label className="text-xs">Qtd</Label>}
                  <Input type="number" min={1} value={item.quantidade} onChange={e => updateItem(idx, 'quantidade', parseInt(e.target.value) || 1)} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  {idx === 0 && <Label className="text-xs">Valor un.</Label>}
                  <Input type="number" min={0} step="0.01" value={item.valor_unitario} onChange={e => updateItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="sm:col-span-1 text-right text-sm font-medium pt-1">
                  {(item.quantidade * item.valor_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                <div className="sm:col-span-1">
                  {itens.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Separator />
            <div className="flex justify-end text-sm">
              <span className="text-muted-foreground mr-2">Total:</span>
              <span className="font-semibold">{valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/producao')}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Criar Pedido e Iniciar Produção
          </Button>
        </div>
      </form>
    </div>
  );
}

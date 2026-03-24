import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2 } from 'lucide-react';

const FORMAS_PAGAMENTO = [
  'PIX', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito',
  'Transferência Bancária', 'Dinheiro', 'Cheque', 'Outro',
];

const FORMAS_ENVIO = [
  'Correios', 'Transportadora', 'Motoboy', 'Retirada no local',
  'Entrega própria', 'Outro',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedidoId: string;
  vendaId: string;
  currentPagamento?: string | null;
  currentEnvio?: string | null;
  onConfirm: (formaPagamento: string, formaEnvio: string) => Promise<void>;
}

export default function ValidarComercialDialog({
  open, onOpenChange, pedidoId, vendaId,
  currentPagamento, currentEnvio, onConfirm,
}: Props) {
  const [formaPagamento, setFormaPagamento] = useState(currentPagamento || '');
  const [formaEnvio, setFormaEnvio] = useState(currentEnvio || '');
  const [customPagamento, setCustomPagamento] = useState('');
  const [customEnvio, setCustomEnvio] = useState('');
  const [saving, setSaving] = useState(false);

  const finalPagamento = formaPagamento === 'Outro' ? customPagamento.trim() : formaPagamento;
  const finalEnvio = formaEnvio === 'Outro' ? customEnvio.trim() : formaEnvio;
  const isValid = finalPagamento.length > 0 && finalEnvio.length > 0;

  const handleConfirm = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onConfirm(finalPagamento, finalEnvio);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Validar Comercial — {vendaId}</DialogTitle>
          <DialogDescription>
            Preencha os campos obrigatórios para validar este pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Forma de Pagamento *</Label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formaPagamento === 'Outro' && (
              <Input
                placeholder="Especifique a forma de pagamento..."
                value={customPagamento}
                onChange={e => setCustomPagamento(e.target.value)}
                className="mt-1"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Forma de Envio *</Label>
            <Select value={formaEnvio} onValueChange={setFormaEnvio}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {FORMAS_ENVIO.map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formaEnvio === 'Outro' && (
              <Input
                placeholder="Especifique a forma de envio..."
                value={customEnvio}
                onChange={e => setCustomEnvio(e.target.value)}
                className="mt-1"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Validar Comercial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



# Importacao via Planilha — Plano

## Resumo

Adicionar na tela de Integracao um card para upload de planilha XLSX (formato do relatorio Simplifica). O sistema faz importacao inteligente: vendas novas entram, vendas ja existentes so atualizam se a Situacao ou itens mudaram, e vendas sem alteracao sao ignoradas. Como a planilha nao tem data prevista, o sistema calcula automaticamente usando o lead time do produto e sinaliza em vermelho que foi importada sem data prevista.

## Mapeamento Planilha → Sistema

```text
Planilha              →  Sistema (pedidos / pedido_itens)
─────────────────────────────────────────────────────────
# Venda               →  api_venda_id (chave de dedup)
Cliente               →  cliente_nome
Data                   →  data_venda_api
Origem Venda          →  canal_venda
Situação              →  status_api
Consultor             →  vendedor_nome
Observação            →  observacao_api
Total(R$) [venda]     →  valor_liquido / valor_bruto
REF.                  →  referencia_produto
Produto               →  descricao_produto
Medidas               →  (ignorado se vazio)
Qtde                  →  quantidade
Unit.(R$)             →  valor_unitario
Total(R$) [item]      →  valor_total
(ausente)             →  data_previsao_entrega = hoje + lead_time
```

## Logica de Importacao Inteligente

1. **Agrupar linhas por # Venda** — cada # Venda unico = 1 pedido com N itens
2. **Verificar se ja existe** — consultar `pedidos` WHERE `api_venda_id = #Venda`
3. **Se NAO existe** → criar pedido + itens + ordens de producao (mesma logica do sync-simplifica)
4. **Se JA existe**:
   - Comparar `status_api` atual vs `Situação` da planilha → se mudou, atualizar
   - Comparar itens (por referencia+descricao+quantidade) → se mudou, atualizar itens e recriar ordens se necessario
   - Se nada mudou → ignorar (contabilizar como "ignorado")
5. **Data prevista**: buscar lead time do `pcp_lead_times` pelo tipo classificado do produto, somar dias uteis a partir de hoje usando o calendario PCP. Marcar campo `importado_sem_data_prevista` (novo campo ou usar convencao existente).

## Sinalizacao Visual (Vermelho)

- Pedidos importados sem data prevista terao a `data_previsao_entrega` calculada pelo lead time mas serao sinalizados:
  - Opcao: usar `observacao_api` com prefixo "[SEM DATA PREVISTA]" ou adicionar campo booleano
  - Na Fila Mestre e KanbanProducao, mostrar badge/indicador vermelho quando detectar esse marcador

## Alteracoes

### 1. `src/pages/Integracao.tsx`
- Adicionar novo Card "Importacao via Planilha" com:
  - Input file (.xlsx)
  - Botao "Processar Planilha"
  - Preview dos dados agrupados por venda antes de importar
  - Resumo: X novas, Y atualizadas, Z ignoradas
  - Botao "Confirmar Importacao"
- Usar biblioteca `xlsx` (SheetJS) para ler o arquivo no frontend
- Implementar toda a logica de dedup e classificacao client-side
- Reusar `detectOrderTypes` ja existente na mesma pagina

### 2. Dependencia
- Instalar `xlsx` (SheetJS) via package.json

### 3. Logica de calculo da data prevista
- Buscar `pcp_lead_times`, `pcp_config_semana`, `pcp_feriados`, `pcp_pausas` 
- Usar `adicionarDiasUteis` de `src/lib/pcpCalendario.ts` para calcular `data_previsao_entrega = hoje + lead_time`
- Salvar `observacao_api` com marcador "[IMPORTADO SEM DATA PREVISTA]" para rastreabilidade

### 4. Sinalizacao visual nas filas
- Na Fila Mestre e Kanban, detectar pedidos com observacao contendo "[IMPORTADO SEM DATA PREVISTA]" e renderizar badge vermelho

### 5. Log de importacao
- Registrar na tabela `integracao_logs` com tipo = 'PLANILHA' os totais de recebidos, inseridos, atualizados, ignorados

## Fluxo do Usuario

1. Admin acessa Integracao
2. Clica em "Selecionar Planilha" e escolhe o .xlsx
3. Sistema processa e mostra preview: lista de vendas com status (Nova / Atualizar / Ignorar)
4. Usuario confirma
5. Sistema importa, gera ordens, calcula datas e mostra resumo final


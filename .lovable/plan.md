

# Kanban Central Unificado

## Resumo

Substituir os 3 Kanbans separados (Sintético, Tecido, Fivela Coberta) por um Kanban único com filtros por tipo de produto. As colunas serão unificadas e a etapa "Preparação" terá sub-etapas (checklist) diferentes conforme o tipo do produto.

## Mudanças

### 1. Colunas unificadas

Remover `PIPELINE_COLUMNS` com 3 tipos separados e usar uma única lista:

```text
Aguardando Início → Conferência → Fusionagem → Preparação → Montagem → Embalagem → Concluído
```

### 2. Filtros em vez de Tabs

Substituir o `<Tabs>` de 3 abas por filtros horizontais (botões/toggles):
- **Todos** (padrão)
- **Sintético**
- **Tecido**
- **Fivela Coberta**

Os cards aparecem todos no mesmo board, filtrados conforme seleção.

### 3. Mapeamento de etapas (mapEtapaToColumn)

Atualizar a função para mapear as etapas de cada pipeline nas colunas unificadas:
- Tecido: Conferência → Conferência, Fusionagem → Fusionagem, Colagem/Viração → Preparação, Finalização → Montagem
- Sintético: Corte → Conferência (ou pular), Preparação → Preparação, Montagem → Montagem, Embalagem → Embalagem
- Fivela Coberta: Em Andamento → Preparação
- Produção Finalizada / Concluído → Concluído

### 4. Sub-etapas na Preparação (checklist no card)

Quando um card está na coluna **Preparação**, exibir um checklist expandido dentro do card ou via dialog:

**Sintético:**
1. Costura
2. Ilhós
3. Máq. Fechar
4. Outros (campo de adição)

**Tecido:**
1. Colagem/Viração
2. Forração
3. Costura
4. Ilhós
5. Outros (campo de adição)

Usa a tabela `op_etapa_subetapas` existente para persistir o estado dos checkboxes. Ao clicar para avançar da Preparação, exige que pelo menos as sub-etapas obrigatórias estejam marcadas.

### 5. Lógica de drag-and-drop

- Manter a mesma lógica: só avança uma coluna por vez, apenas supervisores arrastam.
- O `handleDragEnd` usa a lista unificada de colunas.
- A transferência Tecido→Sintético continua funcionando (quando Tecido chega em Concluído).

### 6. Transferências cross-pipeline

- Mantidas como estão (Tecido→Sintético, Fivela→Embalagem).
- Badges de transferência continuam visíveis na coluna Concluído.

### Arquivos modificados

- **`src/pages/KanbanProducao.tsx`** — reescrita significativa: remover Tabs, unificar colunas, adicionar filtro por tipo, adicionar checklist de sub-etapas na Preparação.

### Detalhes técnicos

- `PIPELINE_COLUMNS` passa a ser um array único: `['Aguardando Início', 'Conferência', 'Fusionagem', 'Preparação', 'Montagem', 'Embalagem', 'Concluído']`
- `mapEtapaToColumn` recebe `tipoProduto` e faz o mapping correto para cada tipo nas colunas unificadas
- O filtro por tipo é um state `filterTipo: 'all' | 'SINTETICO' | 'TECIDO' | 'FIVELA_COBERTA'`
- Sub-etapas da Preparação: ao abrir dialog ou expandir card, busca/cria registros em `op_etapa_subetapas` com os nomes padrão conforme tipo; permite adicionar "Outros"
- O checklist salva em `op_etapa_subetapas` (tabela já existe no schema)


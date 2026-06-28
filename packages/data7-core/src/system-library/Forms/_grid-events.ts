import type { SystemSymbolInfo, SystemContainer } from "../types";

/**
 * Stubs dos delegates de evento expostos pelo componente Grid (TAdvColumnGrid /
 * TAdvStringGrid da TMS Software, com extensões Data7) e por outros controles
 * herdados.
 *
 * Cada entrada é declarada com `kind: 'delegate'` e `containerName: 'Forms'`
 * para que:
 *   - referências do tipo `Dim h As TDrawCellEvent` resolvam silenciosamente
 *     em vez de cair em "tipo desconhecido";
 *   - hover/autocomplete exibam a assinatura com a forma `Sender As TObject` +
 *     parâmetros nomeados quando conhecidos;
 *   - o linter de `event-signature-mismatch` consiga checar aridade contra um
 *     handler atribuído (ex.: `g.OnDrawCell = AddressOf MyDraw`).
 *
 * Quando uma assinatura não é conhecida ao certo (eventos pouco usados,
 * derivados do TMS), declaramos com `parameters: []` e `inheritsFrom` aponta
 * para `TNotifyEvent` por convenção. Atualize conforme novos levantamentos.
 *
 * Esses delegates seguem o padrão Delphi: o primeiro parâmetro é sempre
 * `Sender As TObject`. Parâmetros adicionais são `Variant` quando o tipo
 * concreto ainda não foi catalogado — o linter aceita Variant sem reclamar.
 */

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;
const FORMS: SystemContainer = "Forms";

interface ParamSpec {
  readonly name: string;
  readonly type: string;
  readonly isByRef?: boolean;
}

interface EventSpec {
  /** Delegate name as exposed by the original autocomplete (TMS/VCL/Data7). */
  readonly name: string;
  /** Parameters of the delegate. Empty array means "unknown — treated as no-args". */
  readonly params: readonly ParamSpec[];
  /** Optional return type (omit for Sub-style delegates returning Void). */
  readonly returns?: string;
  /** Short description for hover. */
  readonly description: string;
}

const events: readonly EventSpec[] = [
  // ───────── VCL eventos clássicos ainda sem stub no Globals ─────────
  {
    name: "TContextPopupEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "MousePos", type: "TPoint" },
      { name: "Handled", type: "Boolean", isByRef: true },
    ],
    description: "Disparado quando o usuário invoca o popup contextual do controle.",
  },
  {
    name: "TDragDropEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "Source", type: "TObject" },
      { name: "X", type: "Integer" },
      { name: "Y", type: "Integer" },
    ],
    description: "Disparado ao soltar um objeto sobre o controle durante drag-and-drop VCL.",
  },
  {
    name: "TEndDragEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "Target", type: "TObject" },
      { name: "X", type: "Integer" },
      { name: "Y", type: "Integer" },
    ],
    description: "Disparado quando uma operação de drag-and-drop termina.",
  },
  {
    name: "TMouseMoveEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "Shift", type: "TShiftState" },
      { name: "X", type: "Integer" },
      { name: "Y", type: "Integer" },
    ],
    description: "Movimento do mouse sobre o controle.",
  },
  {
    name: "TMouseWheelUpDownEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "Shift", type: "TShiftState" },
      { name: "MousePos", type: "TPoint" },
      { name: "Handled", type: "Boolean", isByRef: true },
    ],
    description: "Roda do mouse para cima/baixo sobre o controle.",
  },

  // ───────── TMS — desenho e renderização de células ─────────
  {
    name: "TDrawCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Rect", type: "TRect" },
      { name: "State", type: "TGridDrawState" },
    ],
    description:
      "Disparado para cada célula desenhada, permitindo customizar o conteúdo no Canvas.",
  },
  {
    name: "TCustomCellDrawEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACanvas", type: "TCanvas" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "ARect", type: "TRect" },
    ],
    description: "Pintura customizada do fundo ou conteúdo da célula (background/foreground).",
  },
  {
    name: "TCustomCellSizeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AWidth", type: "Integer", isByRef: true },
      { name: "AHeight", type: "Integer", isByRef: true },
    ],
    description: "Permite definir manualmente largura/altura de uma célula específica.",
  },
  {
    name: "TGridColorEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AColor", type: "Integer", isByRef: true },
      { name: "ABrushColor", type: "Integer", isByRef: true },
    ],
    description: "Permite alterar a cor de fundo/texto da célula em tempo de pintura.",
  },
  {
    name: "TGridBorderPropEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Permite definir propriedades de borda por célula.",
  },
  {
    name: "TWordWrapEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "WordWrap", type: "Boolean", isByRef: true },
    ],
    description: "Permite forçar/inibir word-wrap por célula.",
  },
  {
    name: "TGridPrintNewPageEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "PageNo", type: "Integer" },
    ],
    description: "Disparado a cada nova página gerada durante o print.",
  },
  {
    name: "TGridPrintColumnWidthEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AWidth", type: "Integer", isByRef: true },
    ],
    description: "Permite ajustar a largura da coluna durante o print.",
  },
  {
    name: "TGridPrintRowHeightEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "AHeight", type: "Integer", isByRef: true },
    ],
    description: "Permite ajustar a altura da linha durante o print.",
  },

  // ───────── TMS — edição e navegação ─────────
  {
    name: "TFixedCellClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Clique em uma célula fixa (header/footer) da grade.",
  },
  {
    name: "TGetEditEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "String", isByRef: true },
    ],
    description: "Permite ler/escrever o texto do editor inline antes/durante a edição.",
  },
  {
    name: "TSetEditEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "String" },
    ],
    description: "Disparado ao gravar o texto digitado no editor inline.",
  },
  {
    name: "TMovedEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "FromIndex", type: "Integer" },
      { name: "ToIndex", type: "Integer" },
    ],
    description: "Movimentação de linha/coluna por drag.",
  },
  {
    name: "TSelectCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "CanSelect", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a seleção de uma célula específica.",
  },
  {
    name: "TGetDisplTextEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "String", isByRef: true },
    ],
    description: "Permite reescrever o texto exibido pela célula sem alterar o storage.",
  },
  {
    name: "TGetDisplWideTextEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "String", isByRef: true },
    ],
    description: "Versão wide-string de TGetDisplTextEvent.",
  },
  {
    name: "TAutoAdvanceEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "ACanAdvance", type: "Boolean", isByRef: true },
    ],
    description: "Permite controlar se o foco avança após uma edição.",
  },
  {
    name: "TBeforeEditEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AllowEdit", type: "Boolean", isByRef: true },
    ],
    description: "Disparado antes de iniciar a edição da célula.",
  },

  // ───────── TMS — filtros, ordenação e árvore ─────────
  {
    name: "TCustomFilterEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "Value", type: "String" },
      { name: "Accept", type: "Boolean", isByRef: true },
    ],
    description: "Permite implementar filtros customizados.",
  },
  {
    name: "TGetColumnFilterEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AStrings", type: "TStringList" },
    ],
    description: "Permite popular a lista de itens do filtro dropdown da coluna.",
  },
  {
    name: "TClickSortEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
    ],
    description: "Clique no header da coluna para ordenar.",
  },
  {
    name: "TCanSortEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "DoSort", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a ordenação por uma coluna.",
  },
  {
    name: "TCustomCompareEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "Cell1", type: "String" },
      { name: "Cell2", type: "String" },
      { name: "Result", type: "Integer", isByRef: true },
    ],
    description: "Comparador customizado de strings entre duas células.",
  },
  {
    name: "TRawCompareEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "Row1", type: "Integer" },
      { name: "Row2", type: "Integer" },
      { name: "Result", type: "Integer", isByRef: true },
    ],
    description: "Comparador customizado por índice de linha (acesso direto a dados).",
  },
  {
    name: "TNodeClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Clique para expandir/contrair um nó da árvore.",
  },
  {
    name: "TNodeAllowEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "Allow", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a expansão/contração de um nó.",
  },
  {
    name: "TDropDownButtonClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
    ],
    description: "Clique no botão dropdown de uma coluna.",
  },

  // ───────── TMS — inserção/remoção de linhas/colunas ─────────
  {
    name: "TCanAddColEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "DoAdd", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a inclusão de coluna.",
  },
  {
    name: "TCanAddRowEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "DoAdd", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a inclusão de linha.",
  },
  {
    name: "TAutoAddRowEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Linha adicionada automaticamente.",
  },
  {
    name: "TCanInsertRowEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "DoInsert", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a inserção de linha em posição específica.",
  },
  {
    name: "TCanDisunctRowSelectDragEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "Allow", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar arrasto em modo disjunto de seleção de linhas.",
  },
  {
    name: "TAutoInsertRowEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Linha inserida automaticamente.",
  },
  {
    name: "TAutoInsertColEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
    ],
    description: "Coluna inserida automaticamente.",
  },
  {
    name: "TCanDeleteRowEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "DoDelete", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a exclusão de uma linha.",
  },
  {
    name: "TAutoDeleteRowEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Linha excluída automaticamente.",
  },
  {
    name: "TRowCountChangeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "RowCount", type: "Integer" },
    ],
    description: "Mudança no número total de linhas.",
  },

  // ───────── TMS — busca e search footer ─────────
  {
    name: "TSearchEditChangeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "AValue", type: "String" },
    ],
    description: "Mudança no texto do search footer.",
  },
  {
    name: "TSearchFooterSearchEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "AValue", type: "String" },
      { name: "Found", type: "Boolean", isByRef: true },
    ],
    description: "Disparado durante busca incremental no search footer.",
  },
  {
    name: "TSearchFooterSearchEndEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "AValue", type: "String" },
    ],
    description: "Disparado ao encerrar a busca no search footer.",
  },
  {
    name: "TFindNoResultEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "AValue", type: "String" },
    ],
    description: "Busca não retornou resultado.",
  },

  // ───────── TMS — interação com células ─────────
  {
    name: "TCanShowFixedDropDownEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AllowShow", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a abertura do dropdown de filtro fixo.",
  },
  {
    name: "TClickCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Clique em uma célula normal.",
  },
  {
    name: "TDblClickCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Duplo-clique em uma célula normal.",
  },
  {
    name: "TCanClickCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Allow", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar o clique em uma célula.",
  },
  {
    name: "TCanEditCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "CanEdit", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a edição de uma célula.",
  },
  {
    name: "TIsFixedCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "IsFixed", type: "Boolean", isByRef: true },
    ],
    description: "Permite tratar uma célula como fixa (header/footer) dinamicamente.",
  },
  {
    name: "TIsPasswordCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "IsPassword", type: "Boolean", isByRef: true },
    ],
    description: "Permite renderizar uma célula como senha (caracteres mascarados).",
  },

  // ───────── TMS — anchor / hover ─────────
  {
    name: "TAnchorClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Anchor", type: "String" },
    ],
    description: "Clique em uma âncora (link HTML) dentro da célula.",
  },
  {
    name: "TAnchorEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Anchor", type: "String" },
    ],
    description: "Mouse entrou/saiu de uma âncora HTML em uma célula.",
  },
  {
    name: "TAnchorHintEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Anchor", type: "String" },
      { name: "Hint", type: "String", isByRef: true },
    ],
    description: "Permite fornecer hint customizado para uma âncora.",
  },

  // ───────── TMS — controles inline (combo/check/radio/image/...) ─────────
  {
    name: "TCellControlEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Interação com um controle embarcado na célula.",
  },
  {
    name: "TCellComboControlEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AItems", type: "TStringList" },
    ],
    description: "Permite preencher um combo embarcado na célula.",
  },
  {
    name: "TCellComboControlSelectEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AItemIndex", type: "Integer" },
    ],
    description: "Seleção feita em um combo embarcado.",
  },
  {
    name: "TButtonClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Clique em botão embarcado na célula.",
  },
  {
    name: "TCheckBoxCanToggleEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "CanToggle", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar o toggle de um checkbox da célula.",
  },
  {
    name: "TCheckBoxClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "State", type: "Boolean" },
    ],
    description: "Clique em checkbox embarcado.",
  },
  {
    name: "TColDisunctSelectEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "Selected", type: "Boolean", isByRef: true },
    ],
    description: "Permite controlar seleção disjunta por coluna.",
  },
  {
    name: "TColDisunctSelectedEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
    ],
    description: "Coluna foi adicionada à seleção disjunta.",
  },
  {
    name: "TRowDisunctSelectEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "Selected", type: "Boolean", isByRef: true },
    ],
    description: "Permite controlar seleção disjunta por linha.",
  },
  {
    name: "TExpandClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Clique no expand/collapse do node.",
  },
  {
    name: "TImageSelectedEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AImageIndex", type: "Integer" },
    ],
    description: "Imagem selecionada via image picker.",
  },
  {
    name: "TImageSelectEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Image picker iniciou seleção.",
  },
  {
    name: "TRadioClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AIndex", type: "Integer" },
    ],
    description: "Clique em radio embarcado.",
  },
  {
    name: "TRadioButtonClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AIndex", type: "Integer" },
    ],
    description: "Clique em radio button embarcado.",
  },
  {
    name: "TComboChangeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AItemIndex", type: "Integer" },
    ],
    description: "Mudança de seleção em combo embarcado.",
  },
  {
    name: "TComboObjectChangeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AObject", type: "TObject" },
    ],
    description: "Mudança de combo com objeto associado.",
  },
  {
    name: "TSpinClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "Integer" },
    ],
    description: "Clique no spin embarcado.",
  },
  {
    name: "TFloatSpinClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "Double" },
    ],
    description: "Clique no float-spin embarcado.",
  },
  {
    name: "TDateTimeSpinClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "TDateTime" },
    ],
    description: "Clique no spin de data/hora embarcado.",
  },

  // ───────── TMS — clipboard ─────────
  {
    name: "TClipboardEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "AllowClipboard", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a operação de clipboard (copy/paste/cut).",
  },
  {
    name: "TAfterCellPasteEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AValue", type: "String" },
    ],
    description: "Disparado depois de colar uma célula.",
  },
  {
    name: "TAfterCellPasteWideEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AValue", type: "String" },
    ],
    description: "Versão wide-string de TAfterCellPasteEvent.",
  },
  {
    name: "TBeforeCellPasteEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AValue", type: "String", isByRef: true },
      { name: "AllowPaste", type: "Boolean", isByRef: true },
    ],
    description: "Disparado antes de colar uma célula, permitindo transformar o valor.",
  },
  {
    name: "TBeforeCellPasteWideEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AValue", type: "String", isByRef: true },
      { name: "AllowPaste", type: "Boolean", isByRef: true },
    ],
    description: "Versão wide-string de TBeforeCellPasteEvent.",
  },

  // ───────── TMS — validação ─────────
  {
    name: "TCellValidateEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AValue", type: "String" },
      { name: "AValid", type: "Boolean", isByRef: true },
    ],
    description: "Permite validar o valor digitado em uma célula.",
  },
  {
    name: "TCellValidateWideEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AValue", type: "String" },
      { name: "AValid", type: "Boolean", isByRef: true },
    ],
    description: "Versão wide-string de TCellValidateEvent.",
  },
  {
    name: "TCellsChangedEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARect", type: "TRect" },
    ],
    description: "Notifica que um intervalo de células mudou de valor.",
  },

  // ───────── TMS — progress, edição genérica ─────────
  {
    name: "TGridProgressEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "AProgress", type: "Integer" },
    ],
    description: "Reporta progresso de uma operação longa (load/save/filter).",
  },
  {
    name: "THasComboEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "HasCombo", type: "Boolean", isByRef: true },
    ],
    description: "Indica se uma célula deve receber um combo.",
  },
  {
    name: "THasEditBtnEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "HasBtn", type: "Boolean", isByRef: true },
    ],
    description: "Indica se uma célula deve mostrar botão de edição.",
  },
  {
    name: "THasFilterEditEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "HasFilterEdit", type: "Boolean", isByRef: true },
    ],
    description: "Indica se a coluna deve mostrar campo de filtro.",
  },
  {
    name: "THasSpinEditEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "HasSpin", type: "Boolean", isByRef: true },
    ],
    description: "Indica se uma célula deve receber spin edit.",
  },
  {
    name: "THoverButtonsShowEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "Show", type: "Boolean", isByRef: true },
    ],
    description: "Controla a exibição dos hover-buttons por linha.",
  },
  {
    name: "TGetEditorTypeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AEditor", type: "TEditorType", isByRef: true },
    ],
    description: "Permite escolher dinamicamente o tipo de editor da célula.",
  },
  {
    name: "TGetEditorPropEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Permite ajustar propriedades do editor (cor, fonte) por célula.",
  },
  {
    name: "TFloatFormatEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AFormat", type: "String", isByRef: true },
    ],
    description: "Permite definir o formato de exibição de uma célula numérica.",
  },
  {
    name: "TEllipsClickEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Clique no botão de elipse (...) do editor inline.",
  },

  // ───────── TMS — footer ─────────
  {
    name: "TFooterPaintEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACanvas", type: "TCanvas" },
      { name: "ARect", type: "TRect" },
    ],
    description: "Pintura customizada do footer.",
  },
  {
    name: "TCalcFooterEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AValue", type: "String", isByRef: true },
    ],
    description: "Calculadora customizada do footer.",
  },

  // ───────── TMS — edição de célula concluída ─────────
  {
    name: "TEditCellDoneEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Edição da célula concluída (commit).",
  },
  {
    name: "TEditChangeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AValue", type: "String" },
    ],
    description: "Mudança no texto durante a edição.",
  },
  {
    name: "TDateTimeChangeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "TDateTime" },
    ],
    description: "Mudança de valor em editor de data/hora.",
  },
  {
    name: "TUnitChangedEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AUnit", type: "String" },
    ],
    description: "Unidade do editor com unidades mudou.",
  },
  {
    name: "TShowFilterEditEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AllowShow", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar a exibição do filtro de uma coluna.",
  },

  // ───────── TMS — seleção e resize ─────────
  {
    name: "TSelectionChanged",
    params: [{ name: "Sender", type: "TObject" }],
    description: "Mudança na seleção (linha/coluna/célula).",
  },
  {
    name: "TChangeScaleEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "M", type: "Integer" },
      { name: "D", type: "Integer" },
    ],
    description: "Mudança de escala (DPI) do controle.",
  },
  {
    name: "TColumnSizeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AWidth", type: "Integer" },
    ],
    description: "Largura da coluna foi alterada (commit).",
  },
  {
    name: "TColumnSizingEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AWidth", type: "Integer" },
    ],
    description: "Largura da coluna está sendo arrastada.",
  },
  {
    name: "TRowSizeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "AHeight", type: "Integer" },
    ],
    description: "Altura da linha foi alterada (commit).",
  },
  {
    name: "TRowSizingEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "AHeight", type: "Integer" },
    ],
    description: "Altura da linha está sendo arrastada.",
  },
  {
    name: "TEndColumnSizeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AWidth", type: "Integer" },
    ],
    description: "Fim do redimensionamento da coluna.",
  },
  {
    name: "TUpdateColumnSizeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "AWidth", type: "Integer", isByRef: true },
    ],
    description: "Permite ajustar largura final ao terminar resize.",
  },
  {
    name: "TEndRowSizeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "AHeight", type: "Integer" },
    ],
    description: "Fim do redimensionamento da linha.",
  },
  {
    name: "TScrollCellEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Célula focada via scroll.",
  },
  {
    name: "TScrollHintEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AHint", type: "String", isByRef: true },
    ],
    description: "Texto do hint exibido durante scroll.",
  },

  // ───────── TMS — persistência (save/load por célula) ─────────
  {
    name: "TCellSaveLoadEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AValue", type: "String", isByRef: true },
    ],
    description: "Permite serializar/deserializar uma célula em fluxos persistentes.",
  },
  {
    name: "TAfterColumnMoved",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "FromCol", type: "Integer" },
      { name: "ToCol", type: "Integer" },
    ],
    description: "Coluna foi movida (commit).",
  },

  // ───────── TMS — Inplace editor avançado ─────────
  {
    name: "TGridGetInplaceEditorPropertiesEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Permite ajustar as propriedades do inplace editor por célula.",
  },
  {
    name: "TGridGetInplaceEditorEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AEditor", type: "TWinControl", isByRef: true },
    ],
    description: "Permite fornecer um inplace editor customizado para a célula.",
  },

  // ───────── TMS — OLE drag & drop ─────────
  {
    name: "TOleDragDropEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "X", type: "Integer" },
      { name: "Y", type: "Integer" },
      { name: "AData", type: "String" },
    ],
    description: "Drop de objeto OLE no controle.",
  },
  {
    name: "TOleDragOverEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "X", type: "Integer" },
      { name: "Y", type: "Integer" },
      { name: "Accept", type: "Boolean", isByRef: true },
    ],
    description: "Drag-over OLE com decisão de aceitar/rejeitar.",
  },
  {
    name: "TOleDragStartEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "Allow", type: "Boolean", isByRef: true },
    ],
    description: "Permite vetar o início de drag OLE.",
  },
  {
    name: "TOleDragStopEvent",
    params: [{ name: "Sender", type: "TObject" }],
    description:
      "Disparado quando a operação OLE de drag iniciada por este controle é encerrada (cancelada ou concluída).",
  },
  {
    name: "TOleDropColEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
    ],
    description: "Drop OLE caiu em uma coluna específica.",
  },
  {
    name: "TOleDropFileEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "FileName", type: "String" },
    ],
    description:
      "Disparado quando o usuário solta um único arquivo do Explorer (formato CF_HDROP) sobre o controle via OLE drop.",
  },
  {
    name: "TOleDropFilesEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "Files", type: "TStringList" },
    ],
    description: "Drop OLE de múltiplos arquivos.",
  },
  {
    name: "TOleDropURLEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "URL", type: "String" },
    ],
    description:
      "Disparado quando o usuário solta uma URL (formato CF_HTML / hyperlink) arrastada de um browser sobre o controle via OLE drop.",
  },

  // ───────── TMS — outros ─────────
  {
    name: "TRatingChangeEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "ARating", type: "Integer" },
    ],
    description: "Mudança no controle de rating embarcado.",
  },

  // ───────── Data7 ─────────
  {
    name: "TMarcaDesmarcaLinhaParaExclusaoEvent",
    params: [
      { name: "Sender", type: "TObject" },
      { name: "ARow", type: "Integer" },
      { name: "Marcado", type: "Boolean" },
    ],
    description: "Evento Data7 disparado ao marcar/desmarcar uma linha para exclusão.",
  },

  // ───────── Genérico TMethod (placeholder Delphi) ─────────
  {
    name: "TMethod",
    params: [{ name: "Sender", type: "TObject" }],
    description:
      "Placeholder Delphi (record com Code+Data) usado por handlers que não têm assinatura específica conhecida no autocomplete original. Tratado como TNotifyEvent pelo linter.",
  },
];

export const symbols: SystemSymbolInfo[] = events.map((e) => ({
  name: e.name,
  kind: "delegate",
  type: e.returns ?? "Void",
  isShared: false,
  isPrivate: false,
  parameters: e.params.map((p) => ({
    name: p.name,
    type: p.type,
    isByRef: p.isByRef ?? false,
    isOptional: false,
  })),
  range: range,
  fileUri: "system://library",
  containerName: FORMS,
  description: e.description,
}));

import type { SystemSymbolInfo, SystemContainer } from "../types";

/**
 * Forms.Grid — wrapper Data7 sobre TAdvColumnGrid (TMS) com extensões da
 * Se7e Sistemas. A herança real, em ordem, é:
 *
 *   Grid → TGrade → TAdvColumnGrid → TAdvStringGrid → TBaseGrid
 *        → TObjStringGrid → TStringGrid → TDrawGrid → TCustomDrawGrid
 *        → TCustomGrid → TCustomControl → TWinControl → TControl
 *        → TComponent → TPersistent → TObject
 *
 * Esses ancestrais estão modelados em `_aliases.ts`; ao apontar `inheritsFrom`
 * para `TGrade` aqui, os membros declarados em `TCustomControl/TWinControl/
 * TControl/TComponent/TObject` ficam visíveis via cadeia (não precisamos
 * repeti-los neste arquivo).
 *
 * Itens marcados `isUnsupported: true` aparecem no autocomplete oficial da
 * linguagem original (TMS/DevExpress) mas o compilador Data7 não traduz seu
 * uso. O linter emite o diagnóstico `unsupported-member` quando esses membros
 * são referenciados em código `.bas` (ver `src/diagnostic-codes.ts`).
 *
 * Para identificar a origem do levantamento, ver `docs/levantamentos/grid.txt`.
 */

const RANGE = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;
const FORMS: SystemContainer = "Forms";
const GRID_CONTAINER = "Grid";

interface ParamSpec {
  readonly name: string;
  readonly type: string;
  readonly isByRef?: boolean;
  readonly isOptional?: boolean;
  readonly defaultValue?: string;
}

interface PropertySpec {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly isUnsupported?: boolean;
}

interface MethodSpec {
  readonly name: string;
  readonly returns: string;
  readonly params: readonly ParamSpec[];
  readonly description: string;
  readonly isUnsupported?: boolean;
  /**
   * Marca os acessores que são *indexed properties* em Delphi (ex.: `Cells`,
   * `ColWidth`, `CellColor`). Eles ficam no mesmo storage de `methods` para
   * permitir a declaração de parâmetros, mas são emitidos com
   * `kind: 'indexed-property'`, o que dá hover/SignatureHelp adequados.
   */
  readonly indexed?: boolean;
  /** Overloads adicionais (assinaturas alternativas) do mesmo símbolo. */
  readonly overloads?: readonly (readonly ParamSpec[])[];
}

const UNSUP_NOTE =
  " Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member.";

// ───────────────────────────────────────────────────────────────────────────
// Properties — exclusivas do Grid (ou que sobrescrevem ancestrais como
// `unsupported`). Membros já declarados em TControl/TWinControl/TCustomControl/
// TComponent/TObject/TPersistent foram intencionalmente omitidos.
// ───────────────────────────────────────────────────────────────────────────
const properties: readonly PropertySpec[] = [
  // ───────── Override de ancestrais marcados como "Não" ─────────
  {
    name: "CustomHint",
    type: "Variant",
    description: "Hint personalizado herdado de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Constraints",
    type: "Variant",
    description: "Restrições de tamanho herdadas de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "PopupMenu",
    type: "Variant",
    description: "Menu popup associado à grade." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Touch",
    type: "Variant",
    description: "Touch manager herdado de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TabOrder",
    type: "Integer",
    description: "Posição do controle na ordem de tabulação do parent." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Padding",
    type: "TMargins",
    description: "Padding interno herdado de TWinControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DockManager",
    type: "Variant",
    description: "Gerenciador de docking herdado de TWinControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ControlState",
    type: "Integer",
    description: "Estado atual herdado de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ControlStyle",
    type: "Integer",
    description: "Estilo de controle herdado de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DockOrientation",
    type: "Integer",
    description: "Orientação de docking herdada de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FloatingDockSiteClass",
    type: "Variant",
    description: "Classe do dock site flutuante herdada de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "WindowProc",
    type: "Variant",
    description:
      "Procedimento de janela do controle (handler do message pump Windows)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Action",
    type: "Variant",
    description: "TAction associada ao controle (action link)." + UNSUP_NOTE,
    isUnsupported: true,
  },

  // ───────── Bevel / borda / cor ─────────
  {
    name: "BevelEdges",
    type: "TBevelEdges",
    description: "Set indicando quais bordas exibem bevel (beLeft/Top/Right/Bottom).",
  },
  {
    name: "BevelInner",
    type: "TBevelCut",
    description: "Estilo do bevel interno (bvNone, bvLowered, bvRaised).",
  },
  {
    name: "BevelKind",
    type: "TBevelKind",
    description: "Modo de renderização do bevel (bkNone, bkTile, bkSoft, bkFlat).",
  },
  {
    name: "BevelOuter",
    type: "TBevelCut",
    description: "Estilo do bevel externo (bvNone, bvLowered, bvRaised).",
  },
  {
    name: "BevelWidth",
    type: "Integer",
    description: "Largura em pixels do bevel desenhado em torno da grade.",
  },
  {
    name: "BorderStyle",
    type: "TBorderStyle",
    description: "Estilo de borda externa do controle (bsNone, bsSingle).",
  },
  { name: "BorderColor", type: "Integer", description: "Cor da borda externa do grid." },
  { name: "Color", type: "Integer", description: "Cor de fundo das células normais da grade." },

  // ───────── Estrutura da grade ─────────
  {
    name: "ColCount",
    type: "Integer",
    description: "Quantidade total de colunas (incluindo fixas).",
  },
  {
    name: "RowCount",
    type: "Integer",
    description: "Quantidade total de linhas (incluindo fixas).",
  },
  {
    name: "FixedCols",
    type: "Integer",
    description: "Quantidade de colunas fixas à esquerda (cabeçalho lateral).",
  },
  {
    name: "FixedRows",
    type: "Integer",
    description: "Quantidade de linhas fixas no topo (cabeçalho superior).",
  },
  {
    name: "FixedRightCols",
    type: "Integer",
    description: "Quantidade de colunas fixas à direita.",
  },
  { name: "FixedFooters", type: "Integer", description: "Quantidade de linhas fixas no rodapé." },
  { name: "FixedColWidth", type: "Integer", description: "Largura padrão das colunas fixas." },
  { name: "FixedRowHeight", type: "Integer", description: "Altura padrão das linhas fixas." },
  {
    name: "FixedRowAlways",
    type: "Boolean",
    description: "Mantém as linhas fixas sempre visíveis durante scroll vertical.",
  },
  {
    name: "FixedColAlways",
    type: "Boolean",
    description: "Mantém as colunas fixas sempre visíveis durante scroll horizontal.",
  },
  { name: "FixedColor", type: "Integer", description: "Cor de fundo das células fixas." },
  { name: "FixedFont", type: "TFont", description: "Fonte usada nas células fixas." },
  {
    name: "FixedAsButtons",
    type: "Boolean",
    description: "Renderiza as células fixas como botões clicáveis.",
  },
  {
    name: "DefaultColWidth",
    type: "Integer",
    description: "Largura padrão atribuída a novas colunas.",
  },
  {
    name: "DefaultRowHeight",
    type: "Integer",
    description: "Altura padrão atribuída a novas linhas.",
  },
  {
    name: "DefaultColAlignment",
    type: "TAlignment",
    description: "Alinhamento horizontal padrão de novas colunas.",
  },
  {
    name: "DefaultAlignment",
    type: "TAlignment",
    description: "Alinhamento horizontal padrão das células normais.",
  },
  {
    name: "DefaultDrawing",
    type: "Boolean",
    description:
      "Controla se o grid pinta as células com o algoritmo padrão (false delega tudo a OnDrawCell).",
  },
  {
    name: "DefaultEditor",
    type: "TEditorType",
    description: "Tipo de editor inline padrão para células sem editor explícito.",
  },
  {
    name: "DisabledFontColor",
    type: "Integer",
    description: "Cor da fonte quando a grade está com Enabled=False.",
  },
  {
    name: "DrawingStyle",
    type: "TGridDrawingStyle",
    description: "Estilo geral de pintura do grid (gdsClassic, gdsThemed, gdsGradient).",
  },
  {
    name: "Ctl3D",
    type: "Boolean",
    description: "Renderiza o grid com aparência 3D legada (Windows clássico).",
  },
  { name: "Flat", type: "Boolean", description: "Renderiza o grid sem borda 3D (visual flat)." },
  {
    name: "GradientStartColor",
    type: "Integer",
    description: "Cor inicial do gradiente quando DrawingStyle=gdsGradient.",
  },
  {
    name: "GradientEndColor",
    type: "Integer",
    description: "Cor final do gradiente quando DrawingStyle=gdsGradient.",
  },

  // ───────── Linhas de grade e visual ─────────
  {
    name: "GridLineWidth",
    type: "Integer",
    description: "Espessura das linhas de grade em pixels.",
  },
  {
    name: "GridLineColor",
    type: "Integer",
    description: "Cor das linhas de grade entre células normais.",
  },
  {
    name: "GridFixedLineColor",
    type: "Integer",
    description: "Cor das linhas de grade entre células fixas.",
  },
  {
    name: "GridFixedLineWidth",
    type: "Integer",
    description: "Espessura das linhas de grade entre células fixas.",
  },
  { name: "Font", type: "TFont", description: "Fonte usada nas células normais da grade." },
  {
    name: "Options",
    type: "TGridOptions",
    description: "Set TMS com flags de comportamento e interação (TAdvStringGridOptions).",
  },
  {
    name: "DoubleBufferedMode",
    type: "TDoubleBufferedMode",
    description: "Modo de double buffering (dbmDefault, dbmDisabled, dbmEnabled).",
  },
  {
    name: "DragCursor",
    type: "Integer",
    description: "Cursor exibido durante drag-and-drop iniciado a partir deste controle.",
  },
  {
    name: "DragKind",
    type: "TDragKind",
    description: "Tipo de operação de arrasto (dkDrag ou dkDock).",
  },
  {
    name: "DragMode",
    type: "TDragMode",
    description: "Como o arrasto é iniciado (dmManual ou dmAutomatic).",
  },
  {
    name: "ScrollBars",
    type: "TScrollStyle",
    description: "Quais scrollbars são exibidas (ssNone, ssHorizontal, ssVertical, ssBoth).",
  },
  {
    name: "StyleName",
    type: "UnicodeString",
    description: "Nome do style VCL aplicado ao controle.",
  },

  // ───────── Visibilidade ─────────
  {
    name: "VisibleColCount",
    type: "Integer",
    description: "Quantidade de colunas visíveis na viewport atual.",
  },
  {
    name: "VisibleRowCount",
    type: "Integer",
    description: "Quantidade de linhas visíveis na viewport atual.",
  },

  // ───────── Parents (controle de propagação) ─────────
  {
    name: "ParentBiDiMode",
    type: "Boolean",
    description: "Faz a propriedade BiDiMode seguir o valor do parent.",
  },
  {
    name: "ParentColor",
    type: "Boolean",
    description: "Faz a propriedade Color seguir o valor do parent.",
  },
  {
    name: "ParentCtl3D",
    type: "Boolean",
    description: "Faz a propriedade Ctl3D seguir o valor do parent.",
  },
  {
    name: "ParentFont",
    type: "Boolean",
    description: "Faz a propriedade Font seguir o valor do parent.",
  },
  {
    name: "ParentShowHint",
    type: "Boolean",
    description: "Faz a propriedade ShowHint seguir o valor do parent.",
  },

  // ───────── Active row/cell highlight ─────────
  {
    name: "ActiveRowShow",
    type: "Boolean",
    description: "Destaca visualmente a linha atualmente focada.",
  },
  { name: "ActiveRowColor", type: "Integer", description: "Cor de destaque da linha ativa." },
  {
    name: "ActiveCellShow",
    type: "Boolean",
    description: "Destaca visualmente a célula atualmente focada.",
  },
  { name: "ActiveCellFont", type: "TFont", description: "Fonte usada na célula ativa." },
  { name: "ActiveCellColor", type: "Integer", description: "Cor de fundo da célula ativa." },
  {
    name: "ActiveCellColorTo",
    type: "Integer",
    description: "Cor final do gradiente da célula ativa.",
  },

  // ───────── Hover ─────────
  { name: "HoverRow", type: "Boolean", description: "Destaca a linha sob o cursor do mouse." },
  {
    name: "HoverRowColor",
    type: "Integer",
    description: "Cor inicial do destaque da linha sob hover.",
  },
  {
    name: "HoverRowColorTo",
    type: "Integer",
    description: "Cor final do gradiente do destaque da linha sob hover.",
  },
  {
    name: "HoverRowCells",
    type: "THoverRowCells",
    description: "Set que indica quais células acompanham o destaque do hover na linha.",
  },
  {
    name: "Hovering",
    type: "Boolean",
    description: "Ativa o efeito de hover por célula (não apenas por linha).",
  },
  {
    name: "HoverFixedCells",
    type: "THoverFixedCells",
    description: "Set que indica quais células fixas reagem ao hover do mouse.",
  },

  // ───────── Highlight, hint, design helper ─────────
  {
    name: "HighlightColor",
    type: "Integer",
    description: "Cor de destaque (highlight) usada na barra inplace edit.",
  },
  {
    name: "HighlightTextColor",
    type: "Integer",
    description: "Cor do texto sob destaque na barra inplace edit.",
  },
  { name: "HintColor", type: "Integer", description: "Cor de fundo do hint." },
  {
    name: "HintShowCells",
    type: "Boolean",
    description: "Exibe hint automaticamente em células com conteúdo truncado.",
  },
  {
    name: "HintShowLargeText",
    type: "Boolean",
    description: "Permite exibir hint expandido com texto grande de células.",
  },
  {
    name: "HintShowLargeTextPos",
    type: "THintShowLargeTextPos",
    description: "Posição do hint de texto grande (hpRight, hpBottom, etc.).",
  },
  {
    name: "HintShowSizing",
    type: "Boolean",
    description: "Exibe hint ao redimensionar colunas/linhas.",
  },
  { name: "HTMLHint", type: "Boolean", description: "Permite que hints contenham marcação HTML." },
  {
    name: "HTMLKeepLineBreak",
    type: "Boolean",
    description: "Preserva quebras de linha ao renderizar HTML em hints.",
  },
  {
    name: "OemConvert",
    type: "Boolean",
    description: "Converte o texto digitado em formato OEM (compatibilidade Windows legada).",
  },
  {
    name: "AnchorHint",
    type: "Boolean",
    description: "Exibe hint personalizado quando o mouse sobre âncoras HTML em células.",
  },
  {
    name: "ShowDesignHelper",
    type: "Boolean",
    description: "Mostra auxiliares visuais úteis em tempo de design (não impactam runtime).",
  },
  {
    name: "ShowFocusedSelectionColor",
    type: "Boolean",
    description: "Mantém a cor de seleção mesmo quando o grid perde o foco.",
  },

  // ───────── Auto behavior ─────────
  {
    name: "AutoHideSelection",
    type: "Boolean",
    description: "Esconde o retângulo de seleção quando o grid perde o foco.",
  },
  {
    name: "AutoNumAlign",
    type: "Boolean",
    description: "Alinha automaticamente células numéricas à direita.",
  },
  {
    name: "AutoSize",
    type: "Boolean",
    description: "Reorganiza colunas para preencher a área do controle.",
  },
  {
    name: "AutoThemeAdapt",
    type: "Boolean",
    description: "Ajusta automaticamente as cores do grid ao theme corrente do Windows.",
  },
  {
    name: "AutoFilterUpdate",
    type: "Boolean",
    description: "Atualiza filtros automaticamente ao mudar dados.",
  },
  {
    name: "AutoFilterDisplay",
    type: "Boolean",
    description: "Exibe ícones de filtro automaticamente nas colunas filtráveis.",
  },

  // ───────── Filter ─────────
  {
    name: "FilterActive",
    type: "Boolean",
    description: "Indica se o filtro está atualmente aplicado.",
  },
  {
    name: "FilterDropDownAuto",
    type: "Boolean",
    description: "Abre o dropdown de filtro automaticamente ao clicar no ícone.",
  },
  {
    name: "FilterDropDownMultiCol",
    type: "Boolean",
    description: "Permite seleção múltipla no dropdown de filtro.",
  },
  {
    name: "FilterDropDownClear",
    type: "UnicodeString",
    description: 'Texto exibido no item "limpar filtro" do dropdown.',
  },
  {
    name: "FilterDropDownCheck",
    type: "Boolean",
    description: "Exibe checkboxes em vez de seleção simples no dropdown de filtro.",
  },
  {
    name: "FilterDropDownCheckUnCheckAll",
    type: "UnicodeString",
    description: 'Texto exibido no item "marcar/desmarcar tudo" do dropdown.',
  },
  {
    name: "FilterDropDownColumns",
    type: "TFilterDropDownColumns",
    description: "Set que indica quais colunas exibem o botão de filtro dropdown.",
  },
  {
    name: "FilterDropDownRow",
    type: "Integer",
    description: "Linha onde aparece o botão de filtro dropdown.",
  },
  {
    name: "FilterNormalCellsOnly",
    type: "Boolean",
    description: "Aplica filtros apenas em células normais (ignora células mescladas).",
  },
  {
    name: "FilterType",
    type: "TGridFilterType",
    description: "Como o filtro trata strings (fcNormal, fcCaseSensitive, fcNoCase).",
  },
  {
    name: "FilterList",
    type: "TStringList",
    description: "Lista de strings a serem usadas no filtro corrente.",
  },
  {
    name: "FilterIncremental",
    type: "Boolean",
    description: "Aplica o filtro caractere a caractere durante a digitação.",
  },

  // ───────── HTML & Excel & CSV ─────────
  {
    name: "EnableHTML",
    type: "Boolean",
    description: "Permite renderizar células com marcação HTML.",
  },
  {
    name: "EnableBlink",
    type: "Boolean",
    description: "Permite células com texto piscando (tag <blink>).",
  },
  { name: "EnableWheel", type: "Boolean", description: "Permite scroll via mouse-wheel." },
  {
    name: "EnhTextSize",
    type: "Boolean",
    description: "Recálculo aprimorado de tamanho de texto multilinha.",
  },
  {
    name: "EnhRowColMove",
    type: "Boolean",
    description: "Permite arrastar para reordenar linhas e colunas com visual aprimorado.",
  },
  {
    name: "ExcelStyleDecimalSeparator",
    type: "Boolean",
    description: "Usa o separador decimal do Excel ao colar valores.",
  },
  {
    name: "ExcelClipboardFormat",
    type: "Boolean",
    description: "Usa o formato do clipboard do Excel ao copiar células.",
  },
  {
    name: "FloatFormat",
    type: "UnicodeString",
    description:
      "Formato Delphi (FormatFloat) usado para renderização de números reais nas células.",
  },
  {
    name: "FormatType",
    type: "TFormatType",
    description: "Tipo de formatação automática aplicada (ftNumeric, ftFloat, ftDateTime, etc.).",
  },
  {
    name: "ForceDecimalSeparator",
    type: "Boolean",
    description: "Força o uso do separador decimal configurado, ignorando locale.",
  },

  // ───────── Edição e validação ─────────
  {
    name: "EditWithTags",
    type: "Boolean",
    description: "Permite editar valores preservando tags HTML inline.",
  },
  {
    name: "EditActive",
    type: "Boolean",
    description: "Indica se a célula corrente está em modo de edição.",
  },
  {
    name: "EditMask",
    type: "UnicodeString",
    description: "Máscara de entrada (igual à de TEdit) aplicada ao editor inline.",
  },
  {
    name: "EditLink",
    type: "TEditLink",
    description:
      "Vínculo entre células e editores customizados (GridEditorLink especializa este tipo).",
  },
  { name: "EditorMode", type: "Boolean", description: "Mantém o grid em modo de edição contínua." },
  {
    name: "MaxEditLength",
    type: "Integer",
    description: "Comprimento máximo aceito pelo editor inline.",
  },
  {
    name: "MaxComboLength",
    type: "Integer",
    description: "Comprimento máximo aceito pelo editor combo.",
  },
  {
    name: "ValidChars",
    type: "UnicodeString",
    description: "Conjunto de caracteres aceitos pelo editor inline.",
  },
  {
    name: "AlwaysValidate",
    type: "Boolean",
    description: "Executa OnCellValidate em toda mudança de célula.",
  },
  {
    name: "InvalidEntryTitle",
    type: "UnicodeString",
    description: "Título da mensagem mostrada quando uma entrada é rejeitada.",
  },
  {
    name: "InvalidEntryIcon",
    type: "TInvalidEntryIcon",
    description: "Ícone exibido quando uma entrada é rejeitada.",
  },
  {
    name: "InvalidEntryText",
    type: "UnicodeString",
    description: "Texto exibido quando uma entrada é rejeitada.",
  },
  {
    name: "OriginalCellValue",
    type: "UnicodeString",
    description: "Valor original da célula antes da edição corrente (usado em OnCellValidate).",
  },
  {
    name: "VirtualEdit",
    type: "Boolean",
    description: "Permite editar em modo virtual sem armazenar dados no grid.",
  },
  {
    name: "ClearTextOnly",
    type: "Boolean",
    description: "Ao limpar células, mantém formatação (cor/fonte) e zera apenas o texto.",
  },
  {
    name: "Multilinecells",
    type: "Boolean",
    description: "Permite células com múltiplas linhas (quebra automática).",
  },
  {
    name: "WordWrap",
    type: "Boolean",
    description: "Quebra automática de palavras dentro das células.",
  },
  {
    name: "NoImageAndText",
    type: "Boolean",
    description: "Impede que célula contenha simultaneamente imagem e texto.",
  },

  // ───────── Lookup ─────────
  {
    name: "Lookup",
    type: "Boolean",
    description: "Ativa lookup incremental durante digitação no editor inline.",
  },
  {
    name: "LookupItems",
    type: "TStringList",
    description: "Lista de itens disponíveis para o lookup.",
  },
  {
    name: "LookupCaseSensitive",
    type: "Boolean",
    description: "Lookup considera maiúsculas/minúsculas.",
  },
  {
    name: "LookupHistory",
    type: "Boolean",
    description: "Mantém histórico de seleções do lookup.",
  },

  // ───────── Headers ─────────
  {
    name: "ColumnHeaders",
    type: "TStringList",
    description: "Textos exibidos nos cabeçalhos das colunas.",
  },
  {
    name: "RowHeaders",
    type: "TStringList",
    description: "Textos exibidos nos cabeçalhos das linhas.",
  },

  // ───────── Look & UIStyle ─────────
  {
    name: "Look",
    type: "TGridLook",
    description: "Aparência global do grid (glClassic, glOffice, glStandard, etc.).",
  },
  {
    name: "UIStyle",
    type: "TTMSStyle",
    description: "Estilo TMS aplicado (tsOffice2003Blue, tsWhidbey, etc.).",
  },
  {
    name: "IsThemed",
    type: "Boolean",
    description: "Indica se o grid está usando o estilo do Windows themes ativo.",
  },
  {
    name: "UseStyleServices",
    type: "Boolean",
    description: "Habilita Style Services VCL na pintura do grid.",
  },
  {
    name: "HideFocusRect",
    type: "Boolean",
    description: "Esconde o retângulo de foco ao redor da célula selecionada.",
  },
  {
    name: "ScrollBarAlways",
    type: "TScrollBarAlways",
    description: "Controla a visibilidade das scrollbars (sbAuto, sbAlwaysVisible).",
  },
  {
    name: "ScrollColor",
    type: "Integer",
    description: "Cor das scrollbars (quando customizadas).",
  },
  {
    name: "ScrollProportional",
    type: "Boolean",
    description: "Mantém o thumb das scrollbars proporcional à viewport.",
  },
  {
    name: "ScrollSynch",
    type: "Boolean",
    description: "Sincroniza scroll com grids vinculados via SyncGrid.",
  },
  {
    name: "ScrollType",
    type: "TScrollType",
    description: "Granularidade do scroll (ssLineByLine, ssLineByPage, ssPixel).",
  },
  { name: "ScrollWidth", type: "Integer", description: "Largura das scrollbars customizadas." },
  {
    name: "ScrollHints",
    type: "TScrollHintType",
    description: "Tipo de hint exibido durante scroll.",
  },

  // ───────── IntelliZoom / IntelliPan ─────────
  {
    name: "IntelliPan",
    type: "TIntelliPan",
    description: "Modos de pan inteligente (ipNone, ipVertical, ipHorizontal, ipBoth).",
  },
  { name: "IntelliZoom", type: "Boolean", description: "Ativa zoom inteligente via Ctrl+wheel." },
  {
    name: "IntegralHeight",
    type: "Boolean",
    description: "Ajusta a altura do grid para mostrar linhas inteiras (sem corte).",
  },
  {
    name: "PopupToolBarMode",
    type: "TPopupToolBarMode",
    description: "Modo de exibição do popup toolbar (tbAutoShow, tbManual, tbNever).",
  },

  // ───────── Selection ─────────
  {
    name: "SelectionColor",
    type: "Integer",
    description: "Cor de fundo das células selecionadas.",
  },
  { name: "SelectionColorTo", type: "Integer", description: "Cor final do gradiente da seleção." },
  {
    name: "SelectionColorMixer",
    type: "Boolean",
    description: "Mistura a cor da seleção com a cor original da célula.",
  },
  {
    name: "SelectionColorMixerFactor",
    type: "Integer",
    description: "Intensidade do mixer (0–100).",
  },
  {
    name: "SelectionMirrorColor",
    type: "Integer",
    description: "Cor de espelhamento da seleção (efeito visual).",
  },
  {
    name: "SelectionMirrorColorTo",
    type: "Integer",
    description: "Cor final do gradiente do mirror.",
  },
  { name: "SelectionRectangle", type: "Boolean", description: "Desenha retângulo de seleção." },
  {
    name: "SelectionResizer",
    type: "Boolean",
    description: "Mostra resizer de seleção (estilo Excel).",
  },
  {
    name: "SelectionRTFKeep",
    type: "Boolean",
    description: "Preserva formatação RTF ao copiar células selecionadas.",
  },
  {
    name: "SelectionTextColor",
    type: "Integer",
    description: "Cor do texto nas células selecionadas.",
  },
  {
    name: "ShowSelection",
    type: "Boolean",
    description: "Mostra/oculta o destaque visual da seleção.",
  },
  {
    name: "UseSelectionTextColor",
    type: "Boolean",
    description:
      "Usa SelectionTextColor para pintar o texto selecionado (em vez de manter a cor original).",
  },

  // ───────── URL / HTML ─────────
  { name: "URLColor", type: "Integer", description: "Cor dos links HTML em células." },
  { name: "URLShow", type: "Boolean", description: "Renderiza links HTML clicáveis nas células." },
  {
    name: "URLShowInText",
    type: "Boolean",
    description: "Permite URLs embutidas em texto também serem clicáveis.",
  },
  { name: "URLUnderline", type: "Boolean", description: "Sublinha URLs renderizadas." },
  {
    name: "URLUnderlineOnHover",
    type: "Boolean",
    description: "Sublinha URLs apenas quando o mouse passa sobre elas.",
  },
  {
    name: "URLFull",
    type: "Boolean",
    description: "Exige URL completa (com protocolo) para ser clicável.",
  },
  { name: "URLEdit", type: "Boolean", description: "Permite editar URLs diretamente na célula." },
  {
    name: "UseFixedFont",
    type: "Boolean",
    description: "Usa FixedFont mesmo em células não-fixas (fontes monoespaçadas).",
  },
  {
    name: "UseInternalHintClass",
    type: "Boolean",
    description: "Usa a classe interna de hint do grid (em vez do hint padrão da VCL).",
  },
  {
    name: "UseHTMLHints",
    type: "Boolean",
    description: "Permite que hints contenham marcação HTML.",
  },
  {
    name: "UseDisabledFont",
    type: "Boolean",
    description: "Usa DisabledFontColor quando Enabled=False.",
  },
  {
    name: "OwnsObjects",
    type: "Boolean",
    description:
      "Indica se o grid possui (e libera) os objetos associados às células via Objects[].",
  },
  {
    name: "Version",
    type: "UnicodeString",
    description: "Versão do componente TMS subjacente (string).",
  },
  {
    name: "VAlignment",
    type: "TVAlignment",
    description: "Alinhamento vertical do conteúdo das células (vtaCenter, vtaTop, vtaBottom).",
  },

  // ───────── Sizing limits ─────────
  {
    name: "SizeGrowOnly",
    type: "Boolean",
    description: "Auto-resize só permite crescer, nunca encolher colunas/linhas.",
  },
  {
    name: "SizeWithForm",
    type: "Boolean",
    description: "Redimensiona o grid junto com o form quando este muda de tamanho.",
  },
  { name: "MaxRowHeight", type: "Integer", description: "Altura máxima permitida por linha." },
  { name: "MinRowHeight", type: "Integer", description: "Altura mínima permitida por linha." },
  { name: "MaxColWidth", type: "Integer", description: "Largura máxima permitida por coluna." },
  { name: "MinColWidth", type: "Integer", description: "Largura mínima permitida por coluna." },

  // ───────── Numeração automática ─────────
  {
    name: "AutoNumberOffset",
    type: "Integer",
    description: "Deslocamento aplicado à coluna de numeração automática.",
  },
  {
    name: "AutoNumberStart",
    type: "Integer",
    description: "Valor inicial da numeração automática.",
  },

  // ───────── Data7 / row management ─────────
  {
    name: "PermitirApagarUltimaLinhaEmBranco",
    type: "Boolean",
    description: "Permite que o usuário apague a última linha em branco (extensão Data7).",
  },
  {
    name: "PermiteMarcarExclusao",
    type: "Boolean",
    description: "Habilita o fluxo Data7 de marcar/desmarcar linhas para exclusão.",
  },
  {
    name: "SortHeader",
    type: "Boolean",
    description: "Ativa ordenação ao clicar no cabeçalho da coluna.",
  },

  // ───────── Posição / cursor ─────────
  { name: "Row", type: "Integer", description: "Índice (1-based) da linha atualmente focada." },
  { name: "Col", type: "Integer", description: "Índice (1-based) da coluna atualmente focada." },
  {
    name: "TopRow",
    type: "Integer",
    description: "Índice da primeira linha visível no topo da viewport.",
  },
  {
    name: "LeftCol",
    type: "Integer",
    description: "Índice da primeira coluna visível à esquerda da viewport.",
  },
  {
    name: "RealRow",
    type: "Integer",
    description: "Índice real da linha (independente de filtros/ocultação).",
  },
  { name: "RealCol", type: "Integer", description: "Índice real da coluna." },
  { name: "LastCol", type: "Integer", description: "Índice da última coluna acessível." },
  { name: "LastRow", type: "Integer", description: "Índice da última linha acessível." },
  { name: "AllColCount", type: "Integer", description: "Total de colunas, incluindo ocultas." },
  { name: "AllRowCount", type: "Integer", description: "Total de linhas, incluindo ocultas." },
  { name: "RowSelectCount", type: "Integer", description: "Quantidade de linhas selecionadas." },
  { name: "ColSelectCount", type: "Integer", description: "Quantidade de colunas selecionadas." },
  {
    name: "SelectedCellsCount",
    type: "Integer",
    description: "Quantidade total de células selecionadas.",
  },
  {
    name: "SelectedRowCount",
    type: "Integer",
    description: "Total de linhas com pelo menos uma célula selecionada.",
  },
  {
    name: "SelectedColCount",
    type: "Integer",
    description: "Total de colunas com pelo menos uma célula selecionada.",
  },
  {
    name: "CurrentCell",
    type: "UnicodeString",
    description: 'Coordenada string da célula corrente ("A1", "B2", ...).',
  },
  { name: "CurrentEditor", type: "TEditorType", description: "Tipo do editor inline corrente." },

  // ───────── Print / Preview ─────────
  {
    name: "IsPrintPreview",
    type: "Boolean",
    description: "Indica se o grid está em modo de preview de impressão.",
  },
  {
    name: "FitCellsInGrid",
    type: "Boolean",
    description: "Ajusta automaticamente as células para caberem na grade impressa.",
  },
  {
    name: "ZoomFactor",
    type: "Integer",
    description: "Fator de zoom (em %) aplicado no preview/impressão.",
  },
  {
    name: "PrintPageRect",
    type: "TRect",
    description: "Retângulo da página corrente durante o print.",
  },
  { name: "PrintPageWidth", type: "Integer", description: "Largura útil da página atual." },
  { name: "PrintColStart", type: "Integer", description: "Índice da primeira coluna impressa." },
  { name: "PrintColEnd", type: "Integer", description: "Índice da última coluna impressa." },
  {
    name: "PrintNrOfPages",
    type: "Integer",
    description: "Quantidade de páginas geradas pelo print.",
  },
  { name: "PreviewPage", type: "Integer", description: "Página atualmente exibida no preview." },
  {
    name: "PrinterDriverFix",
    type: "Boolean",
    description: "Aplica workaround para drivers de impressora problemáticos.",
  },
  {
    name: "FastPrint",
    type: "Boolean",
    description: "Imprime com renderização simplificada (ganho de performance).",
  },
  {
    name: "SpreadSheet",
    type: "Boolean",
    description: "Habilita modo planilha (similar ao Excel).",
  },

  // ───────── CSV / persistence ─────────
  {
    name: "CSVLineBreak",
    type: "UnicodeString",
    description: "Sequência usada para quebrar linhas ao exportar CSV.",
  },
  { name: "Delimiter", type: "WideChar", description: "Caractere delimitador usado em CSV." },
  {
    name: "JavaCSV",
    type: "Boolean",
    description: "Usa convenção CSV Java (sem cabeçalhos, etc.).",
  },
  {
    name: "PasswordChar",
    type: "WideChar",
    description: "Caractere usado para mascarar valores em células password.",
  },
  {
    name: "LoadFirstRow",
    type: "Boolean",
    description: "Carrega a primeira linha do arquivo como cabeçalho.",
  },
  { name: "SaveFixedCells", type: "Boolean", description: "Inclui células fixas ao salvar." },
  { name: "SaveFixedCols", type: "Boolean", description: "Inclui colunas fixas ao salvar." },
  { name: "SaveFixedRows", type: "Boolean", description: "Inclui linhas fixas ao salvar." },
  { name: "SaveHiddenCells", type: "Boolean", description: "Inclui células ocultas ao salvar." },
  { name: "SaveVirtCells", type: "Boolean", description: "Inclui células virtuais ao salvar." },
  { name: "SaveWithHTML", type: "Boolean", description: "Preserva formatação HTML ao salvar." },
  { name: "SaveWithRTF", type: "Boolean", description: "Preserva formatação RTF ao salvar." },
  { name: "SaveMergedCells", type: "Boolean", description: "Mantém células mescladas ao salvar." },
  {
    name: "SaveStartCol",
    type: "Integer",
    description: "Coluna inicial considerada na exportação.",
  },
  {
    name: "SaveStartRow",
    type: "Integer",
    description: "Linha inicial considerada na exportação.",
  },
  { name: "SaveEndCol", type: "Integer", description: "Coluna final considerada na exportação." },
  { name: "SaveEndRow", type: "Integer", description: "Linha final considerada na exportação." },
  { name: "SaveColCount", type: "Integer", description: "Total de colunas exportadas." },
  { name: "SaveRowCount", type: "Integer", description: "Total de linhas exportadas." },
  {
    name: "QuoteEmptyCells",
    type: "Boolean",
    description: "Adiciona aspas em células vazias ao exportar.",
  },
  {
    name: "QuoteQuoteCells",
    type: "Boolean",
    description: "Adiciona aspas em células que contêm aspas.",
  },
  {
    name: "AlwaysQuotes",
    type: "Boolean",
    description: "Adiciona aspas em todas as células ao exportar.",
  },
  {
    name: "CSVMultilineCellImport",
    type: "Boolean",
    description: "Permite importar células multilinha do CSV.",
  },
  {
    name: "CSVTrimSpaces",
    type: "Boolean",
    description: "Remove espaços extras das células lidas do CSV.",
  },
  { name: "XMLEncoding", type: "UnicodeString", description: "Encoding declarado na saída XML." },

  // ───────── Search / find ─────────
  {
    name: "FindCol",
    type: "Integer",
    description: "Coluna em que a busca atual encontrou resultado.",
  },
  {
    name: "FindRow",
    type: "Integer",
    description: "Linha em que a busca atual encontrou resultado.",
  },
  { name: "FindBusy", type: "Boolean", description: "Indica se há busca em andamento." },
  {
    name: "Modified",
    type: "Boolean",
    description: "Indica se houve alteração desde o último Save/Load.",
  },
  {
    name: "SearchCell",
    type: "TPoint",
    description: "Posição da última célula encontrada na busca.",
  },
  {
    name: "IncrSearchText",
    type: "UnicodeString",
    description: "Texto da busca incremental corrente.",
  },
  {
    name: "NarrowDownFromStart",
    type: "Boolean",
    description: "Reinicia a busca incremental a cada caractere digitado.",
  },
  {
    name: "DoAutoEditFilter",
    type: "Boolean",
    description: "Aplica filtro automaticamente ao começar a digitar.",
  },

  // ───────── Tag values for checkbox cells ─────────
  {
    name: "CheckTrue",
    type: "UnicodeString",
    description: "Texto que representa o valor True em células checkbox.",
  },
  {
    name: "CheckFalse",
    type: "UnicodeString",
    description: "Texto que representa o valor False em células checkbox.",
  },

  // ───────── Helpers / canvases / sub-controles ─────────
  {
    name: "FooterCanvas",
    type: "TCanvas",
    description: "Canvas do footer (rodapé) — usado em OnFooterPaint.",
  },
  {
    name: "CellEditor",
    type: "TWinControl",
    description: "Controle de edição inline atualmente vinculado à célula.",
  },
  {
    name: "ShowNullDates",
    type: "Boolean",
    description: "Exibe datas nulas em vez de células em branco.",
  },
  {
    name: "VersionNr",
    type: "Integer",
    description: "Número de versão (inteiro) do TMS Software subjacente.",
  },
  {
    name: "VersionString",
    type: "UnicodeString",
    description: "Versão (string) do TMS Software subjacente.",
  },
  {
    name: "XYOffset",
    type: "TPoint",
    description: "Offset XY (em pixels) aplicado ao conteúdo das células.",
  },
  {
    name: "XYRTOffset",
    type: "TPoint",
    description: "Offset XY usado quando o controle está em modo RightToLeft.",
  },
  {
    name: "XYOffsetTopLeftOnly",
    type: "Boolean",
    description: "Aplica XYOffset apenas no canto superior-esquerdo da célula.",
  },

  // ───────── Lock / update ─────────
  {
    name: "LockUpdate",
    type: "Boolean",
    description: "Suspende a atualização visual enquanto há alterações em lote.",
  },
  {
    name: "IsUpdating",
    type: "Boolean",
    description: "Indica se o grid está em BeginUpdate/EndUpdate corrente.",
  },
  {
    name: "IsDrawingLocked",
    type: "Boolean",
    description: "Indica se a pintura está bloqueada (durante batch update).",
  },
  {
    name: "RedrawDisabled",
    type: "Boolean",
    description: "Indica que a repintura está desativada via WM_SETREDRAW.",
  },
  {
    name: "GridHeight",
    type: "Integer",
    description: "Altura útil do grid (sem scrollbars/cabeçalhos).",
  },
  {
    name: "GridWidth",
    type: "Integer",
    description: "Largura útil do grid (sem scrollbars/cabeçalhos).",
  },

  // ───────── Auto-numbering / extras ─────────
  {
    name: "GroupColumn",
    type: "Integer",
    description: "Índice da coluna usada para agrupar linhas.",
  },
  {
    name: "NoDefaultDraw",
    type: "Boolean",
    description: "Inibe o desenho padrão das células (delega tudo ao usuário).",
  },
  {
    name: "PixelsPerInch",
    type: "Integer",
    description: "PPI corrente usado nas conversões DPI-aware.",
  },
  {
    name: "CurrentPPI",
    type: "Integer",
    description: "PPI corrente do monitor onde o controle está exibido.",
  },
  {
    name: "ScaleFactor",
    type: "Single",
    description: "Fator de escala DPI aplicado ao controle (1.0 = 96 DPI).",
  },

  // ───────── Configuração Data7 ─────────
  {
    name: "GridOptions",
    type: "GridConfigs",
    description:
      "Configurações Data7 do grid (agrega opções de layout, scrollbars, ordenação, agrupamento e estilo).",
  },

  // ───────── ComObject / VCL Com / Pointer ─────────
  {
    name: "ComObject",
    type: "IInterface",
    description: "Interface COM associada ao componente (quando aplicável).",
  },
  {
    name: "VCLComObject",
    type: "Pointer",
    description: "Ponteiro Win32 para o COM object associado ao componente.",
  },

  // ───────── Containers vazios (não suportados pelo Data7) ─────────
  //
  // Esses são sub-objetos / coleções do TMS/DevExpress que aparecem no
  // autocomplete original (ex.: `Grid.UndoRedo.Active`) mas que o compilador
  // Data7 não traduz. Tipamos como `Variant` para que o linter (a) silencie a
  // verificação de membros encadeados (`UndoRedo.X` cai em "Variant — tipo
  // permissivo"), e (b) ainda assim emita o aviso `unsupported-member` na
  // primeira chamada (raiz do encadeamento). O sinal de aviso suficiente fica
  // na propriedade-raiz; navegação interna em Variant é, intencionalmente,
  // silenciada para evitar cascata de mensagens.
  {
    name: "UndoRedo",
    type: "Variant",
    description: "Configurações de Undo/Redo do TAdvStringGrid." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DragDropSettings",
    type: "Variant",
    description: "Configurações de drag-and-drop do TMS." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "OfficeHint",
    type: "Variant",
    description: "Configuração do hint estilo Office." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "AutoColor",
    type: "Variant",
    description: "Sub-objeto de cor automática por linha." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Balloon",
    type: "Variant",
    description: "Balloon-tip exibido em validação inválida." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Bands",
    type: "Variant",
    description: "Configuração de bandas (faixas) de cor alternada." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "BackGround",
    type: "Variant",
    description: "Imagem/cor de fundo do grid." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "CellNode",
    type: "Variant",
    description: "Configuração de árvore (cell node) por linha." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "CellChecker",
    type: "Variant",
    description: "Verificador automático de dados por célula." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ColumnSize",
    type: "Variant",
    description: "Configurações de tamanho de coluna persistidas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ControlLook",
    type: "Variant",
    description: "Aparência fina do grid (sub-objeto)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DragScrollOptions",
    type: "Variant",
    description: "Opções de scroll durante drag-and-drop." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Filter",
    type: "Variant",
    description: "Sub-objeto de filtro avançado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FilterDropDown",
    type: "Variant",
    description: "Sub-objeto do dropdown de filtro." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FilterEdit",
    type: "Variant",
    description: "Sub-objeto do filtro embarcado em editor." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FixedDropDownMenu",
    type: "Variant",
    description: "Menu dropdown de células fixas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FloatingFooter",
    type: "Variant",
    description: "Footer flutuante do grid." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FocusHelper",
    type: "Variant",
    description: "Helper visual de foco." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "GridImages",
    type: "Variant",
    description: "ImageList interna do grid." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Grouping",
    type: "Variant",
    description: "Configurações de agrupamento dinâmico." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "HoverButtons",
    type: "Variant",
    description: "Botões exibidos ao passar o mouse sobre linha." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "HTMLSettings",
    type: "Variant",
    description: "Configurações de renderização HTML." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "MouseActions",
    type: "Variant",
    description: "Mapeamento customizado de ações por botão do mouse." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Navigation",
    type: "Variant",
    description: "Sub-objeto de navegação (atalhos, teclas, etc.)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "PictureContainer",
    type: "Variant",
    description: "Container externo de imagens." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "PopupToolBar",
    type: "Variant",
    description: "Toolbar popup contextual." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "PrintSettings",
    type: "Variant",
    description: "Configurações de impressão." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ProgressAppearance",
    type: "Variant",
    description: "Aparência da barra de progresso embarcada." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "RowIndicator",
    type: "Variant",
    description: "Indicador visual da linha corrente." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SearchFooter",
    type: "Variant",
    description: "Sub-objeto do footer de busca." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ShowModified",
    type: "Variant",
    description: "Indica visualmente as linhas modificadas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SizeWhileTyping",
    type: "Variant",
    description: "Auto-redimensionamento da célula durante digitação." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SortSettings",
    type: "Variant",
    description: "Configurações de ordenação." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SyncGrid",
    type: "Variant",
    description: "Grid vinculado para sincronização de scroll/seleção." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Columns",
    type: "Variant",
    description: "Coleção de colunas tipadas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Encoding",
    type: "Variant",
    description: "Encoding usado na (de)serialização do grid." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "UsedCells",
    type: "Variant",
    description: "Lista de células usadas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FilterImageList",
    type: "Variant",
    description: "Lista de ícones para indicadores de filtro." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SortIndexes",
    type: "Variant",
    description: "Índices auxiliares de ordenação." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DateTimePicker",
    type: "Variant",
    description: "DateTimePicker embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DateAndTimePicker",
    type: "Variant",
    description: "DateAndTimePicker embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Combobox",
    type: "Variant",
    description: "ComboBox embarcado padrão." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FixedEdit",
    type: "Variant",
    description: "Editor inline de células fixas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FixedComboBox",
    type: "Variant",
    description: "ComboBox embarcado em células fixas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DropList",
    type: "Variant",
    description: "Lista dropdown de seleção simples." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DropCheckList",
    type: "Variant",
    description: "Lista dropdown de seleção múltipla com check." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TrackbarDropDown",
    type: "Variant",
    description: "Trackbar dropdown embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "MemoDropDown",
    type: "Variant",
    description: "Memo dropdown embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "CalculatorDropDown",
    type: "Variant",
    description: "Calculadora dropdown embarcada." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TimePickerDropDown",
    type: "Variant",
    description: "Relógio dropdown embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DetailPickerDropDown",
    type: "Variant",
    description: "Picker com detalhe (imagem+caption+nota) dropdown." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "GridDropDown",
    type: "Variant",
    description: "Grid em dropdown embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ColorPickerDropDown",
    type: "Variant",
    description: "Color picker dropdown embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ImagePickerDropDown",
    type: "Variant",
    description: "Image picker dropdown embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "AdvGridDropDown",
    type: "Variant",
    description: "TAdvStringGrid em dropdown embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ControlDropDown",
    type: "Variant",
    description: "Controle customizado em dropdown embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "UniCombo",
    type: "Variant",
    description: "ComboBox Unicode embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SpinEdit",
    type: "Variant",
    description: "Spin edit embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "BtnEdit",
    type: "Variant",
    description: "Editor com botão lateral embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Btn",
    type: "Variant",
    description: "Botão embarcado em célula." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "BtnUnitEdit",
    type: "Variant",
    description: "Editor com botão + unidade embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "RichEdit",
    type: "Variant",
    description: "Rich-edit embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FooterPanel",
    type: "Variant",
    description: "Painel customizado do footer." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "InplaceRichEdit",
    type: "Variant",
    description: "Rich-edit inline na célula." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "NormalEdit",
    type: "Variant",
    description: "Configuração do editor inline padrão." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SearchPanel",
    type: "Variant",
    description: "Painel de busca embarcado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "IgnoreColumns",
    type: "Variant",
    description: "Lista de colunas a serem ignoradas em cálculos/exportação." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ArrowColor",
    type: "Variant",
    description: "Cor das setas do auto-numbering / sort indicator." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SelectionRectangleColor",
    type: "Variant",
    description: "Cor do retângulo de seleção." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Selection",
    type: "Variant",
    description: "Sub-objeto de configuração da seleção." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ImageCache",
    type: "Variant",
    description: "Cache de imagens renderizadas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "MergedColumns",
    type: "Variant",
    description: "Conjunto de colunas mescladas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientFrom",
    type: "Variant",
    description: "Cor inicial do gradiente TMS — normal." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientTo",
    type: "Variant",
    description: "Cor final do gradiente TMS — normal." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientMirrorFrom",
    type: "Variant",
    description: "Cor inicial do gradiente mirror TMS." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientMirrorTo",
    type: "Variant",
    description: "Cor final do gradiente mirror TMS." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientHoverFrom",
    type: "Variant",
    description: "Cor inicial do gradiente TMS — hover." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientHoverTo",
    type: "Variant",
    description: "Cor final do gradiente TMS — hover." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientHoverMirrorFrom",
    type: "Variant",
    description: "Cor inicial do gradiente mirror TMS — hover." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientHoverMirrorTo",
    type: "Variant",
    description: "Cor final do gradiente mirror TMS — hover." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientHoverBorder",
    type: "Variant",
    description: "Borda do gradiente TMS — hover." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientDownFrom",
    type: "Variant",
    description: "Cor inicial do gradiente TMS — pressed." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientDownTo",
    type: "Variant",
    description: "Cor final do gradiente TMS — pressed." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientDownMirrorFrom",
    type: "Variant",
    description: "Cor inicial do gradiente mirror TMS — pressed." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientDownMirrorTo",
    type: "Variant",
    description: "Cor final do gradiente mirror TMS — pressed." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "TMSGradientDownBorder",
    type: "Variant",
    description: "Borda do gradiente TMS — pressed." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "AutoNumberDirection",
    type: "Variant",
    description: "Direção da numeração automática (ascendente/descendente)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ValidCharSet",
    type: "Variant",
    description: "Set de caracteres aceitos (alternativa a ValidChars)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ColumnOrder",
    type: "Variant",
    description: "Ordem corrente das colunas (persistida)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "VisibleCol",
    type: "Variant",
    description: "Array de visibilidade por coluna." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SelectionStyle",
    type: "Variant",
    description: "Estilo visual da seleção." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ActiveRowColorTo",
    type: "Variant",
    description: "Cor final do gradiente da linha ativa." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ActiveRowMirrorColor",
    type: "Variant",
    description: "Cor mirror da linha ativa." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ActiveRowMirrorColorTo",
    type: "Variant",
    description: "Cor final mirror da linha ativa." + UNSUP_NOTE,
    isUnsupported: true,
  },

  // ───────── Eventos legados expostos como UnicodeString (Data7) ─────────
  {
    name: "OnExitEvent",
    type: "UnicodeString",
    description:
      "Nome do método (string) chamado no evento OnExit — atribuição via string em vez de delegate.",
  },
  {
    name: "OnEnterEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnEnter.",
  },
  {
    name: "OnClickEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnClick.",
  },
  {
    name: "OnDblClickEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnDblClick.",
  },
  {
    name: "OnKeyPressEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnKeyPress.",
  },
  {
    name: "OnDrawCellEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnDrawCell.",
  },
  {
    name: "OnSelectCellEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnSelectCell.",
  },
  {
    name: "OnCanEditCellEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnCanEditCell.",
  },
  {
    name: "OnCanClickCellEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnCanClickCell.",
  },
  {
    name: "OnCanDeleteRowEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnCanDeleteRow.",
  },
  {
    name: "OnCanInsertRowEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnCanInsertRow.",
  },
  {
    name: "OnCanAddRowEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnCanAddRow.",
  },
  {
    name: "OnSetEditTextEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnSetEditText.",
  },
  {
    name: "OnGetEditTextEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnGetEditText.",
  },
  {
    name: "OnCellValidateEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnCellValidate.",
  },
  {
    name: "OnCellsChangedEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnCellsChanged.",
  },
  {
    name: "OnEditChangeEvent",
    type: "UnicodeString",
    description: "Nome do método (string) chamado no evento OnEditChange.",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Eventos (kind: property) com delegate associado.
// ───────────────────────────────────────────────────────────────────────────
const events: readonly PropertySpec[] = [
  {
    name: "OnColumnMoved",
    type: "TMovedEvent",
    description: "Coluna foi movida via drag — recebe os índices antigo e novo.",
  },
  {
    name: "OnContextPopup",
    type: "TContextPopupEvent",
    description: "Disparado ao invocar popup contextual sobre o grid.",
  },
  {
    name: "OnDragDrop",
    type: "TDragDropEvent",
    description: "Disparado ao soltar um objeto VCL sobre o grid.",
  },
  {
    name: "OnDragOver",
    type: "TMethod",
    description: "Drag-over VCL — placeholder para método genérico.",
  },
  { name: "OnDrawCell", type: "TDrawCellEvent", description: "Pintura customizada por célula." },
  {
    name: "OnEndDock",
    type: "TEndDragEvent",
    description: "Disparado ao terminar uma operação de dock.",
  },
  {
    name: "OnEndDrag",
    type: "TEndDragEvent",
    description: "Disparado ao terminar uma operação de drag.",
  },
  {
    name: "OnFixedCellClick",
    type: "TFixedCellClickEvent",
    description: "Clique em célula fixa (header/footer).",
  },
  {
    name: "OnGetEditMask",
    type: "TGetEditEvent",
    description: "Permite definir uma máscara de edição customizada para a célula corrente.",
  },
  {
    name: "OnGetEditText",
    type: "TGetEditEvent",
    description: "Permite definir o texto inicial mostrado no editor inline.",
  },
  {
    name: "OnMouseActivate",
    type: "TMethod",
    description: "Disparado quando o controle é ativado por clique do mouse — placeholder TMethod.",
  },
  {
    name: "OnMouseWheelDown",
    type: "TMouseWheelUpDownEvent",
    description: "Roda do mouse para baixo sobre o controle.",
  },
  {
    name: "OnMouseWheelUp",
    type: "TMouseWheelUpDownEvent",
    description: "Roda do mouse para cima sobre o controle.",
  },
  {
    name: "OnRowMoved",
    type: "TMovedEvent",
    description: "Linha foi movida via drag — recebe os índices antigo e novo.",
  },
  {
    name: "OnSelectCell",
    type: "TSelectCellEvent",
    description: "Disparado ao selecionar uma célula — permite vetar a seleção.",
  },
  {
    name: "OnSetEditText",
    type: "TSetEditEvent",
    description: "Disparado ao gravar o texto digitado pelo editor inline.",
  },
  {
    name: "OnStartDock",
    type: "TMethod",
    description: "Início de operação de dock — placeholder TMethod.",
  },
  {
    name: "OnStartDrag",
    type: "TMethod",
    description: "Início de operação de drag — placeholder TMethod.",
  },
  {
    name: "OnTopLeftChanged",
    type: "TNotifyEvent",
    description: "TopRow/LeftCol mudaram (scroll).",
  },
  {
    name: "OnGetDisplText",
    type: "TGetDisplTextEvent",
    description: "Permite reescrever o texto exibido pela célula.",
  },
  {
    name: "OnGetDisplWideText",
    type: "TGetDisplWideTextEvent",
    description: "Versão wide-string de OnGetDisplText.",
  },
  {
    name: "OnAutoAdvance",
    type: "TAutoAdvanceEvent",
    description: "Permite controlar o auto-advance após edição.",
  },
  {
    name: "OnBeforeFilter",
    type: "TNotifyEvent",
    description: "Disparado antes de aplicar o filtro corrente.",
  },
  {
    name: "OnBeforeEdit",
    type: "TBeforeEditEvent",
    description: "Disparado antes de iniciar a edição de uma célula.",
  },
  {
    name: "OnCustomCellBkgDraw",
    type: "TCustomCellDrawEvent",
    description: "Pintura customizada do fundo da célula.",
  },
  {
    name: "OnCustomCellDraw",
    type: "TCustomCellDrawEvent",
    description: "Pintura customizada do conteúdo da célula.",
  },
  {
    name: "OnCustomCellSize",
    type: "TCustomCellSizeEvent",
    description: "Permite definir tamanho customizado de célula.",
  },
  {
    name: "OnCustomFilter",
    type: "TCustomFilterEvent",
    description: "Filtro customizado por coluna.",
  },
  {
    name: "OnGetCellColor",
    type: "TGridColorEvent",
    description: "Permite alterar cor de fundo/texto durante pintura.",
  },
  {
    name: "OnGetCellCursor",
    type: "TMethod",
    description: "Permite alterar o cursor exibido sobre a célula.",
  },
  {
    name: "OnGetCellGradient",
    type: "TMethod",
    description: "Permite definir gradiente customizado por célula.",
  },
  {
    name: "OnGetCellPrintColor",
    type: "TGridColorEvent",
    description: "Define cor da célula durante impressão.",
  },
  {
    name: "OnGetCellPrintBorder",
    type: "TMethod",
    description: "Define borda da célula durante impressão.",
  },
  { name: "OnGetCellBorder", type: "TMethod", description: "Define borda da célula em runtime." },
  {
    name: "OnGetCellBorderProp",
    type: "TGridBorderPropEvent",
    description: "Define propriedades de borda por célula.",
  },
  {
    name: "OnGetAlignment",
    type: "TMethod",
    description: "Permite definir alinhamento por célula.",
  },
  {
    name: "OnGetWordWrap",
    type: "TWordWrapEvent",
    description: "Permite definir word-wrap por célula.",
  },
  {
    name: "OnGetColumnFilter",
    type: "TGetColumnFilterEvent",
    description: "Permite popular a lista de filtro dropdown da coluna.",
  },
  {
    name: "OnFilterDone",
    type: "TNotifyEvent",
    description: "Disparado ao concluir a aplicação de um filtro.",
  },
  {
    name: "OnPrintNewPage",
    type: "TGridPrintNewPageEvent",
    description: "Disparado a cada nova página do print.",
  },
  {
    name: "OnPrintSetColumnWidth",
    type: "TGridPrintColumnWidthEvent",
    description: "Permite ajustar a largura da coluna durante o print.",
  },
  {
    name: "OnPrintSetRowHeight",
    type: "TGridPrintRowHeightEvent",
    description: "Permite ajustar a altura da linha durante o print.",
  },
  {
    name: "OnCanAddCol",
    type: "TCanAddColEvent",
    description: "Permite vetar a inclusão de coluna.",
  },
  {
    name: "OnCanAddRow",
    type: "TCanAddRowEvent",
    description: "Permite vetar a inclusão de linha.",
  },
  {
    name: "OnAutoAddRow",
    type: "TAutoAddRowEvent",
    description: "Linha adicionada automaticamente.",
  },
  {
    name: "OnCanInsertRow",
    type: "TCanInsertRowEvent",
    description: "Permite vetar a inserção de linha em posição específica.",
  },
  {
    name: "OnCanDisunctRowSelectDrag",
    type: "TCanDisunctRowSelectDragEvent",
    description: "Permite vetar drag em seleção disjunta de linhas.",
  },
  {
    name: "OnAutoInsertRow",
    type: "TAutoInsertRowEvent",
    description: "Linha inserida automaticamente.",
  },
  {
    name: "OnAutoInsertCol",
    type: "TAutoInsertColEvent",
    description: "Coluna inserida automaticamente.",
  },
  {
    name: "OnCanDeleteRow",
    type: "TCanDeleteRowEvent",
    description: "Permite vetar a exclusão de uma linha.",
  },
  {
    name: "OnAutoDeleteRow",
    type: "TAutoDeleteRowEvent",
    description: "Linha excluída automaticamente.",
  },
  {
    name: "OnClickSort",
    type: "TClickSortEvent",
    description: "Clique no header de coluna para ordenar.",
  },
  {
    name: "OnCanSort",
    type: "TCanSortEvent",
    description: "Permite vetar a ordenação por uma coluna.",
  },
  { name: "OnExpandNode", type: "TNodeClickEvent", description: "Nó da árvore foi expandido." },
  { name: "OnContractNode", type: "TNodeClickEvent", description: "Nó da árvore foi contraído." },
  {
    name: "OnDropDownHeaderButtonClick",
    type: "TDropDownButtonClickEvent",
    description: "Clique no botão dropdown do header.",
  },
  {
    name: "OnDropDownFooterButtonClick",
    type: "TDropDownButtonClickEvent",
    description: "Clique no botão dropdown do footer.",
  },
  {
    name: "OnBeforeExpandNode",
    type: "TNodeAllowEvent",
    description: "Permite vetar a expansão de um nó.",
  },
  {
    name: "OnBeforeContractNode",
    type: "TNodeAllowEvent",
    description: "Permite vetar a contração de um nó.",
  },
  {
    name: "OnCustomCompare",
    type: "TCustomCompareEvent",
    description: "Comparador customizado de strings entre células.",
  },
  {
    name: "OnRawCompare",
    type: "TRawCompareEvent",
    description: "Comparador customizado por índice de linha.",
  },
  {
    name: "OnSearchEditChange",
    type: "TSearchEditChangeEvent",
    description: "Mudança no texto do search footer.",
  },
  {
    name: "OnSearchFooterAction",
    type: "TMethod",
    description: "Ação do search footer (placeholder TMethod).",
  },
  {
    name: "OnSearchFooterSearch",
    type: "TSearchFooterSearchEvent",
    description: "Busca incremental no search footer.",
  },
  {
    name: "OnSearchFooterClose",
    type: "TNotifyEvent",
    description: "Fechamento do search footer.",
  },
  {
    name: "OnSearchFooterSearchEnd",
    type: "TSearchFooterSearchEndEvent",
    description: "Encerramento da busca no search footer.",
  },
  {
    name: "OnCanShowFixedDropDown",
    type: "TCanShowFixedDropDownEvent",
    description: "Permite vetar a abertura do dropdown fixo.",
  },
  {
    name: "OnFixedDropDownClick",
    type: "TMethod",
    description: "Clique no dropdown fixo (placeholder TMethod).",
  },
  { name: "OnClickCell", type: "TClickCellEvent", description: "Clique em célula normal." },
  {
    name: "OnRightClickCell",
    type: "TClickCellEvent",
    description: "Clique com botão direito em célula.",
  },
  { name: "OnDblClickCell", type: "TDblClickCellEvent", description: "Duplo-clique em célula." },
  {
    name: "OnCanClickCell",
    type: "TCanClickCellEvent",
    description: "Permite vetar o clique em uma célula.",
  },
  {
    name: "OnCanEditCell",
    type: "TCanEditCellEvent",
    description: "Permite vetar a edição de uma célula.",
  },
  {
    name: "OnFixedEdit",
    type: "TMethod",
    description: "Edição em célula fixa (placeholder TMethod).",
  },
  {
    name: "OnIsFixedCell",
    type: "TIsFixedCellEvent",
    description: "Permite tratar uma célula como fixa dinamicamente.",
  },
  {
    name: "OnIsFixedHoverCell",
    type: "TIsFixedCellEvent",
    description: "Permite tratar uma célula fixa como hover dinamicamente.",
  },
  {
    name: "OnIsPasswordCell",
    type: "TIsPasswordCellEvent",
    description: "Permite tratar uma célula como password dinamicamente.",
  },
  {
    name: "OnAnchorClick",
    type: "TAnchorClickEvent",
    description: "Clique em âncora HTML dentro de célula.",
  },
  { name: "OnAnchorEnter", type: "TAnchorEvent", description: "Mouse entrou em uma âncora HTML." },
  { name: "OnAnchorExit", type: "TAnchorEvent", description: "Mouse saiu de uma âncora HTML." },
  {
    name: "OnAnchorHint",
    type: "TAnchorHintEvent",
    description: "Permite fornecer hint customizado para uma âncora HTML.",
  },
  {
    name: "OnControlClick",
    type: "TCellControlEvent",
    description: "Clique em controle embarcado na célula.",
  },
  {
    name: "OnControlEditDone",
    type: "TCellControlEvent",
    description: "Edição em controle embarcado terminada.",
  },
  {
    name: "OnControlComboList",
    type: "TCellComboControlEvent",
    description: "Permite popular o combo embarcado em célula.",
  },
  {
    name: "OnControlComboSelect",
    type: "TCellComboControlSelectEvent",
    description: "Seleção feita em combo embarcado em célula.",
  },
  {
    name: "OnClipboardPaste",
    type: "TClipboardEvent",
    description: "Permite vetar operação de paste do clipboard.",
  },
  { name: "OnClipboardPasteDone", type: "TMethod", description: "Paste do clipboard concluído." },
  {
    name: "OnClipboardCopy",
    type: "TClipboardEvent",
    description: "Permite vetar operação de copy do clipboard.",
  },
  { name: "OnClipboardCopyDone", type: "TMethod", description: "Copy do clipboard concluído." },
  {
    name: "OnClipboardCut",
    type: "TClipboardEvent",
    description: "Permite vetar operação de cut do clipboard.",
  },
  { name: "OnClipboardCutDone", type: "TMethod", description: "Cut do clipboard concluído." },
  {
    name: "OnClipboardAfterPasteCell",
    type: "TAfterCellPasteEvent",
    description: "Disparado após colar célula.",
  },
  {
    name: "OnClipboardAfterPasteWideCell",
    type: "TAfterCellPasteWideEvent",
    description: "Versão wide-string de OnClipboardAfterPasteCell.",
  },
  {
    name: "OnClipboardBeforePasteCell",
    type: "TBeforeCellPasteEvent",
    description: "Disparado antes de colar célula.",
  },
  {
    name: "OnClipboardBeforePasteWideCell",
    type: "TBeforeCellPasteWideEvent",
    description: "Versão wide-string de OnClipboardBeforePasteCell.",
  },
  {
    name: "OnCellValidate",
    type: "TCellValidateEvent",
    description: "Permite validar o valor digitado em uma célula.",
  },
  {
    name: "OnCellValidateWide",
    type: "TCellValidateWideEvent",
    description: "Versão wide-string de OnCellValidate.",
  },
  {
    name: "OnCellsChanged",
    type: "TCellsChangedEvent",
    description: "Notifica que um intervalo de células mudou de valor.",
  },
  {
    name: "OnFileProgress",
    type: "TGridProgressEvent",
    description: "Reporta progresso durante load/save de arquivo.",
  },
  {
    name: "OnFilterProgress",
    type: "TGridProgressEvent",
    description: "Reporta progresso durante aplicação de filtro.",
  },
  {
    name: "OnFilterEditDone",
    type: "TMethod",
    description: "Edição em campo de filtro concluída.",
  },
  { name: "OnFilterEditUpdate", type: "TMethod", description: "Atualização em campo de filtro." },
  {
    name: "OnHasComboBox",
    type: "THasComboEvent",
    description: "Indica se uma célula deve receber combo.",
  },
  {
    name: "OnHasEditBtn",
    type: "THasEditBtnEvent",
    description: "Indica se uma célula deve mostrar botão de edição.",
  },
  {
    name: "OnHasFilterEdit",
    type: "THasFilterEditEvent",
    description: "Indica se a coluna deve mostrar campo de filtro.",
  },
  {
    name: "OnHasSpinEdit",
    type: "THasSpinEditEvent",
    description: "Indica se uma célula deve receber spin edit.",
  },
  {
    name: "OnHoverButtonsShow",
    type: "THoverButtonsShowEvent",
    description: "Controla a exibição dos hover-buttons por linha.",
  },
  {
    name: "OnGetEditorType",
    type: "TGetEditorTypeEvent",
    description: "Permite escolher dinamicamente o tipo de editor da célula.",
  },
  {
    name: "OnGetEditorProp",
    type: "TGetEditorPropEvent",
    description: "Permite ajustar propriedades do editor por célula.",
  },
  {
    name: "OnGetFloatFormat",
    type: "TFloatFormatEvent",
    description: "Permite definir o formato de exibição de células numéricas.",
  },
  {
    name: "OnEllipsClick",
    type: "TEllipsClickEvent",
    description: "Clique no botão de elipse (...) do editor inline.",
  },
  {
    name: "OnIntelliZoom",
    type: "TNotifyEvent",
    description: "Mudança de IntelliZoom (Ctrl+wheel).",
  },
  {
    name: "OnButtonClick",
    type: "TButtonClickEvent",
    description: "Clique em botão embarcado em célula.",
  },
  {
    name: "OnCheckBoxCanToggle",
    type: "TCheckBoxCanToggleEvent",
    description: "Permite vetar o toggle de um checkbox da célula.",
  },
  {
    name: "OnCheckBoxChange",
    type: "TCheckBoxClickEvent",
    description: "Mudança no estado de checkbox embarcado.",
  },
  {
    name: "OnCheckBoxClick",
    type: "TCheckBoxClickEvent",
    description: "Clique em checkbox embarcado.",
  },
  {
    name: "OnCheckBoxMouseUp",
    type: "TCheckBoxClickEvent",
    description: "Mouse up sobre checkbox embarcado.",
  },
  {
    name: "OnColorSelected",
    type: "TMethod",
    description: "Cor selecionada no color picker (placeholder TMethod).",
  },
  {
    name: "OnColorSelect",
    type: "TMethod",
    description: "Color picker iniciou seleção (placeholder TMethod).",
  },
  {
    name: "OnColDisunctSelect",
    type: "TColDisunctSelectEvent",
    description: "Permite controlar seleção disjunta por coluna.",
  },
  {
    name: "OnColDisunctSelected",
    type: "TColDisunctSelectedEvent",
    description: "Coluna foi adicionada à seleção disjunta.",
  },
  {
    name: "OnExpandClick",
    type: "TExpandClickEvent",
    description: "Clique no expand/collapse de node.",
  },
  {
    name: "OnImageSelected",
    type: "TImageSelectedEvent",
    description: "Imagem selecionada via image picker.",
  },
  {
    name: "OnImageSelect",
    type: "TImageSelectEvent",
    description: "Image picker iniciou seleção.",
  },
  { name: "OnRadioClick", type: "TRadioClickEvent", description: "Clique em radio embarcado." },
  {
    name: "OnRadioMouseUp",
    type: "TRadioClickEvent",
    description: "Mouse up sobre radio embarcado.",
  },
  {
    name: "OnRadioButtonClick",
    type: "TRadioButtonClickEvent",
    description: "Clique em radio button embarcado.",
  },
  {
    name: "OnDatePickerCloseUp",
    type: "TClickCellEvent",
    description: "DatePicker embarcado fechou.",
  },
  {
    name: "OnDatePickerDropDown",
    type: "TClickCellEvent",
    description: "DatePicker embarcado abriu.",
  },
  {
    name: "OnComboChange",
    type: "TComboChangeEvent",
    description: "Seleção de combo embarcado mudou.",
  },
  { name: "OnComboCloseUp", type: "TClickCellEvent", description: "Combo embarcado fechou." },
  { name: "OnComboDropDown", type: "TClickCellEvent", description: "Combo embarcado abriu." },
  {
    name: "OnComboObjectChange",
    type: "TComboObjectChangeEvent",
    description: "Mudança de combo com objeto associado.",
  },
  { name: "OnSpinClick", type: "TSpinClickEvent", description: "Clique no spin embarcado." },
  {
    name: "OnFloatSpinClick",
    type: "TFloatSpinClickEvent",
    description: "Clique no float-spin embarcado.",
  },
  {
    name: "OnTimeSpinClick",
    type: "TDateTimeSpinClickEvent",
    description: "Clique no spin de hora embarcado.",
  },
  {
    name: "OnDateSpinClick",
    type: "TDateTimeSpinClickEvent",
    description: "Clique no spin de data embarcado.",
  },
  {
    name: "OnRichEditSelectionChange",
    type: "TNotifyEvent",
    description: "Mudança na seleção do RichEdit embarcado.",
  },
  {
    name: "OnRowCountChange",
    type: "TRowCountChangeEvent",
    description: "Mudança no número total de linhas.",
  },
  {
    name: "OnToggleSwitchClick",
    type: "TCheckBoxClickEvent",
    description: "Clique em toggle switch embarcado.",
  },
  {
    name: "OnDragScroll",
    type: "TMethod",
    description: "Scroll durante drag (placeholder TMethod).",
  },
  { name: "OnEditingDone", type: "TNotifyEvent", description: "Edição corrente terminada." },
  {
    name: "OnEditCellDone",
    type: "TEditCellDoneEvent",
    description: "Edição de célula concluída (commit).",
  },
  {
    name: "OnEditChange",
    type: "TEditChangeEvent",
    description: "Mudança no texto durante a edição.",
  },
  {
    name: "OnDateTimeChange",
    type: "TDateTimeChangeEvent",
    description: "Mudança de valor em editor de data/hora.",
  },
  {
    name: "OnFooterPaint",
    type: "TFooterPaintEvent",
    description: "Pintura customizada do footer.",
  },
  {
    name: "OnFooterCalc",
    type: "TCalcFooterEvent",
    description: "Calculadora customizada do footer.",
  },
  {
    name: "OnHoverButtonClick",
    type: "TMethod",
    description: "Clique em hover button (placeholder TMethod).",
  },
  {
    name: "OnProgressColor",
    type: "TMethod",
    description: "Define a cor da barra de progresso (placeholder TMethod).",
  },
  { name: "OnResize", type: "TNotifyEvent", description: "Tamanho do grid mudou." },
  {
    name: "OnRowDisunctSelect",
    type: "TRowDisunctSelectEvent",
    description: "Permite controlar seleção disjunta por linha.",
  },
  {
    name: "OnRowDisunctSelected",
    type: "TAutoInsertRowEvent",
    description: "Linha foi adicionada à seleção disjunta.",
  },
  {
    name: "OnSelectionChanged",
    type: "TSelectionChanged",
    description: "Mudança na seleção (linha/coluna/célula).",
  },
  {
    name: "OnShowFilterEdit",
    type: "TShowFilterEditEvent",
    description: "Permite vetar a exibição do filtro de uma coluna.",
  },
  {
    name: "OnUnitChanged",
    type: "TUnitChangedEvent",
    description: "Unidade do editor com unidades mudou.",
  },
  { name: "OnOleDrop", type: "TOleDragDropEvent", description: "Drop OLE no controle." },
  {
    name: "OnOleDropped",
    type: "TMethod",
    description: "Drop OLE concluído (placeholder TMethod).",
  },
  { name: "OnOleDrag", type: "TOleDragDropEvent", description: "Drag OLE em andamento." },
  {
    name: "OnOleDragOver",
    type: "TOleDragOverEvent",
    description: "Drag-over OLE com decisão de aceitar/rejeitar.",
  },
  { name: "OnOleDragStart", type: "TOleDragStartEvent", description: "Início de drag OLE." },
  { name: "OnOleDragStop", type: "TOleDragStopEvent", description: "Fim de drag OLE." },
  {
    name: "OnOleDropCol",
    type: "TOleDropColEvent",
    description: "Drop OLE em uma coluna específica.",
  },
  { name: "OnOleDropFile", type: "TOleDropFileEvent", description: "Drop OLE de um arquivo." },
  {
    name: "OnOleDropFiles",
    type: "TOleDropFilesEvent",
    description: "Drop OLE de múltiplos arquivos.",
  },
  { name: "OnOleDropURL", type: "TOleDropURLEvent", description: "Drop OLE de uma URL." },
  {
    name: "OnPainted",
    type: "TNotifyEvent",
    description: "Disparado após pintura completa do controle.",
  },
  {
    name: "OnRatingChange",
    type: "TRatingChangeEvent",
    description: "Mudança no controle de rating embarcado.",
  },
  {
    name: "OnScrollHint",
    type: "TScrollHintEvent",
    description: "Texto do hint exibido durante scroll.",
  },
  {
    name: "OnChangeScale",
    type: "TChangeScaleEvent",
    description: "Mudança de escala (DPI) do controle.",
  },
  {
    name: "OnColumnSize",
    type: "TColumnSizeEvent",
    description: "Largura da coluna foi alterada.",
  },
  {
    name: "OnColumnSizing",
    type: "TColumnSizingEvent",
    description: "Largura da coluna está sendo arrastada.",
  },
  { name: "OnColumnMove", type: "TColumnSizeEvent", description: "Coluna está sendo movida." },
  {
    name: "OnColumnMoving",
    type: "TColumnSizeEvent",
    description: "Movimentação contínua da coluna.",
  },
  { name: "OnRowSize", type: "TRowSizeEvent", description: "Altura da linha foi alterada." },
  {
    name: "OnRowSizing",
    type: "TRowSizingEvent",
    description: "Altura da linha está sendo arrastada.",
  },
  { name: "OnRowMove", type: "TRowSizeEvent", description: "Linha está sendo movida." },
  { name: "OnRowMoving", type: "TRowSizeEvent", description: "Movimentação contínua da linha." },
  {
    name: "OnEndColumnSize",
    type: "TEndColumnSizeEvent",
    description: "Fim do redimensionamento da coluna.",
  },
  {
    name: "OnUpdateColumnSize",
    type: "TUpdateColumnSizeEvent",
    description: "Permite ajustar a largura final ao terminar resize.",
  },
  {
    name: "OnEndRowSize",
    type: "TEndRowSizeEvent",
    description: "Fim do redimensionamento da linha.",
  },
  { name: "OnScrollCell", type: "TScrollCellEvent", description: "Célula focada via scroll." },
  {
    name: "OnSelectionResize",
    type: "TMethod",
    description: "Início do resize de uma seleção (placeholder TMethod).",
  },
  {
    name: "OnSelectionResized",
    type: "TMethod",
    description: "Resize de seleção concluído (placeholder TMethod).",
  },
  {
    name: "OnCreatedFloatingFooter",
    type: "TNotifyEvent",
    description: "Footer flutuante criado.",
  },
  { name: "OnCreatedSearchFooter", type: "TNotifyEvent", description: "Search footer criado." },
  {
    name: "OnSaveCell",
    type: "TCellSaveLoadEvent",
    description: "Serialização customizada por célula.",
  },
  {
    name: "OnLoadCell",
    type: "TCellSaveLoadEvent",
    description: "Deserialização customizada por célula.",
  },
  {
    name: "OnAfterColumnMoved",
    type: "TAfterColumnMoved",
    description: "Coluna foi movida (commit).",
  },
  {
    name: "OnColumnPopup",
    type: "TMethod",
    description: "Popup contextual de coluna (placeholder TMethod).",
  },
  {
    name: "OnMarcaDesmarcaLinhaParaExclusao",
    type: "TMarcaDesmarcaLinhaParaExclusaoEvent",
    description: "Evento Data7 disparado ao marcar/desmarcar uma linha para exclusão.",
  },
  {
    name: "OnFindNoResult",
    type: "TFindNoResultEvent",
    description: "Busca não retornou resultado.",
  },
  {
    name: "OnGetInplaceEditorProperties",
    type: "TGridGetInplaceEditorPropertiesEvent",
    description: "Permite ajustar as propriedades do inplace editor por célula.",
  },
  {
    name: "OnGetInplaceEditor",
    type: "TGridGetInplaceEditorEvent",
    description: "Permite fornecer um inplace editor customizado para a célula.",
  },
  {
    name: "OnGetEditorPropInt",
    type: "TClickCellEvent",
    description: "Ajuste interno de propriedades do editor (Data7).",
  },

  // ───────── Evento \"OnEnumerateControl\" marcado como não suportado ─────────
  // Tipado como TMethod (placeholder de delegate) em vez de Variant para
  // satisfazer o audit-system-library (que exige delegate em OnXxx).
  {
    name: "OnEnumerateControl",
    type: "TMethod",
    description: "Enumerador de controles embarcados na célula." + UNSUP_NOTE,
    isUnsupported: true,
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Methods (Sub/Function) específicos da Grid (e propriedades indexadas como
// `Cells`, `CellColor`, ...). Já filtrados contra TControl/TWinControl/
// TCustomControl/TComponent/TObject/TPersistent.
// ───────────────────────────────────────────────────────────────────────────
const methods: readonly MethodSpec[] = [
  // ───────── Canvas / acesso direto ─────────
  {
    name: "GetCanvas",
    returns: "TCanvas",
    params: [],
    description: "Retorna o Canvas do grid para desenho direto.",
  },

  // ───────── Cells / colunas / linhas ─────────
  {
    name: "SetCelulas",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "String" },
    ],
    description:
      "Atalho Data7 para definir o valor de uma célula (equivalente a Cells[ACol, ARow] = Value).",
  },
  {
    name: "GetCelulas",
    returns: "String",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Atalho Data7 para ler o valor de uma célula.",
  },
  {
    name: "SetColWidth",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "Value", type: "Integer" },
    ],
    description: "Define a largura de uma coluna.",
  },
  {
    name: "SetRowHeight",
    returns: "Void",
    params: [
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "Integer" },
    ],
    description: "Define a altura de uma linha.",
  },
  {
    name: "GetColWidth",
    returns: "Integer",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Retorna a largura de uma coluna.",
  },
  {
    name: "ColWidth",
    returns: "Integer",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Define ou retorna a largura de uma coluna.",
    indexed: true,
  },
  {
    name: "RowHeight",
    returns: "Integer",
    params: [{ name: "ARow", type: "Integer" }],
    description: "Define ou retorna a altura de uma linha.",
    indexed: true,
  },
  {
    name: "Cells",
    returns: "String",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Define ou retorna o valor da célula (ACol, ARow).",
    indexed: true,
  },
  {
    name: "SetColAlignment",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "Value", type: "TAlignment" },
    ],
    description: "Define o alinhamento de uma coluna.",
  },
  {
    name: "GetColAlignment",
    returns: "TAlignment",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Retorna o alinhamento de uma coluna.",
  },
  {
    name: "ColAlignment",
    returns: "TAlignment",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Define ou retorna o alinhamento de uma coluna.",
    indexed: true,
  },
  {
    name: "SetCellColor",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "Integer" },
    ],
    description: "Define a cor de fundo de uma célula.",
  },
  {
    name: "GetCellColor",
    returns: "Integer",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Retorna a cor de fundo de uma célula.",
  },
  {
    name: "CellColor",
    returns: "Integer",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Define ou retorna a cor de fundo de uma célula.",
    indexed: true,
  },
  {
    name: "SetFontSize",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "Integer" },
    ],
    description: "Define o tamanho da fonte de uma célula.",
  },
  {
    name: "GetFontSize",
    returns: "Integer",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Retorna o tamanho da fonte de uma célula.",
  },
  {
    name: "FontSize",
    returns: "Integer",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Define ou retorna o tamanho da fonte de uma célula.",
    indexed: true,
  },
  {
    name: "SetFontColor",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "Integer" },
    ],
    description: "Define a cor da fonte de uma célula.",
  },
  {
    name: "GetFontColor",
    returns: "Integer",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Retorna a cor da fonte de uma célula.",
  },
  {
    name: "FontColor",
    returns: "Integer",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Define ou retorna a cor da fonte de uma célula.",
    indexed: true,
  },
  {
    name: "SetFontName",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "Value", type: "UnicodeString" },
    ],
    description: "Define o nome da fonte de uma célula.",
  },
  {
    name: "FontName",
    returns: "UnicodeString",
    params: [{ name: "ARow", type: "Integer" }],
    description: "Define ou retorna o nome da fonte.",
    indexed: true,
  },
  {
    name: "SetMergeCells",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "X", type: "Integer" },
      { name: "Y", type: "Integer" },
    ],
    description: "Mescla um retângulo de células a partir da posição (ACol, ARow).",
  },

  // ───────── Remoção / exclusão ─────────
  {
    name: "RemoveRows",
    returns: "Void",
    params: [
      { name: "RowIndex", type: "Integer" },
      { name: "RCount", type: "Integer" },
    ],
    description: "Remove RCount linhas a partir de RowIndex.",
  },
  {
    name: "RemoveCols",
    returns: "Void",
    params: [
      { name: "ColIndex", type: "Integer" },
      { name: "CCount", type: "Integer" },
    ],
    description: "Remove CCount colunas a partir de ColIndex.",
  },
  {
    name: "DeleteRow",
    returns: "Void",
    params: [{ name: "ARow", type: "Longint" }],
    description: "Exclui uma linha específica.",
  },
  {
    name: "DeleteColumn",
    returns: "Void",
    params: [{ name: "ACol", type: "Longint" }],
    description: "Exclui uma coluna específica.",
  },
  {
    name: "RemoveSelectedRows",
    returns: "Void",
    params: [],
    description: "Remove todas as linhas selecionadas.",
  },
  {
    name: "RemoveUnselectedRows",
    returns: "Void",
    params: [],
    description: "Remove todas as linhas NÃO selecionadas.",
  },
  {
    name: "ClearNormalCells",
    returns: "Void",
    params: [],
    description: "Limpa o conteúdo das células normais (preserva fixas).",
  },
  {
    name: "LoadFromXLS",
    returns: "Void",
    params: [{ name: "Filename", type: "UnicodeString" }],
    description: "Carrega o conteúdo de um arquivo XLS para o grid.",
  },

  // ───────── Índices reais ↔ exibidos ─────────
  {
    name: "RealRowIndex",
    returns: "Integer",
    params: [{ name: "ARow", type: "Integer" }],
    description: "Retorna o índice real (raw) de uma linha exibida.",
  },
  {
    name: "RealColIndex",
    returns: "Integer",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Retorna o índice real (raw) de uma coluna exibida.",
  },
  {
    name: "DisplRowIndex",
    returns: "Integer",
    params: [{ name: "ARow", type: "Integer" }],
    description: "Retorna o índice exibido (display) de uma linha real.",
  },
  {
    name: "DisplColIndex",
    returns: "Integer",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Retorna o índice exibido (display) de uma coluna real.",
  },
  {
    name: "ColumnPosition",
    returns: "Integer",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Posição visual atual de uma coluna.",
  },
  {
    name: "ColumnAtPosition",
    returns: "Integer",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Coluna na posição visual indicada.",
  },
  {
    name: "ColumnByHeader",
    returns: "Integer",
    params: [{ name: "AValue", type: "UnicodeString" }],
    description: "Retorna o índice da coluna cujo header bate com AValue.",
  },
  {
    name: "UnSortedRowIndex",
    returns: "Integer",
    params: [{ name: "ARow", type: "Integer" }],
    description: "Converte índice exibido em índice antes da ordenação.",
  },
  {
    name: "SortedRowIndex",
    returns: "Integer",
    params: [{ name: "ARow", type: "Integer" }],
    description: "Converte índice raw em índice após a ordenação corrente.",
  },
  {
    name: "GetRealCol",
    returns: "Integer",
    params: [],
    description: "Retorna o índice real da coluna corrente.",
  },
  {
    name: "GetRealRow",
    returns: "Integer",
    params: [],
    description: "Retorna o índice real da linha corrente.",
  },
  {
    name: "GetRowEx",
    returns: "Integer",
    params: [],
    description: "Retorna o índice da linha corrente (extendido).",
  },
  {
    name: "SetRowEx",
    returns: "Void",
    params: [{ name: "Value", type: "Integer" }],
    description: "Define a linha corrente (extendido).",
  },
  {
    name: "GetTopRowEx",
    returns: "Integer",
    params: [],
    description: "Retorna o índice da TopRow corrente (extendido).",
  },
  {
    name: "SetTopRowEx",
    returns: "Void",
    params: [{ name: "Value", type: "Integer" }],
    description: "Define a TopRow corrente (extendido).",
  },

  // ───────── Conversões e navegação ─────────
  {
    name: "ScreenToCell",
    returns: "Void",
    params: [
      { name: "pt", type: "TPoint" },
      { name: "ACol", type: "Integer", isByRef: true },
      { name: "ARow", type: "Integer", isByRef: true },
    ],
    description: "Converte coordenadas de tela em coordenadas (ACol, ARow) de uma célula.",
  },
  {
    name: "HideSelection",
    returns: "Void",
    params: [],
    description: "Oculta o destaque visual da seleção corrente.",
  },
  {
    name: "UnHideSelection",
    returns: "Void",
    params: [],
    description: "Reexibe o destaque visual da seleção corrente.",
  },
  {
    name: "IsSelectionHidden",
    returns: "Boolean",
    params: [],
    description: "Retorna se a seleção está oculta.",
  },
  {
    name: "NextEdit",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
      { name: "AForward", type: "Boolean", isOptional: true, defaultValue: "True" },
    ],
    description: "Move o foco de edição para a próxima célula (ou anterior se AForward=False).",
  },
  {
    name: "UpdateEditMode",
    returns: "Void",
    params: [],
    description: "Sincroniza o editor inline com o estado corrente.",
  },
  {
    name: "UpdateFooter",
    returns: "Void",
    params: [],
    description: "Repinta o footer (recalculando totais).",
  },
  {
    name: "UpdateSearchPanel",
    returns: "Void",
    params: [],
    description: "Repinta o painel de busca.",
  },
  {
    name: "ScrollInView",
    returns: "Void",
    params: [
      { name: "ColIndex", type: "Integer" },
      { name: "RowIndex", type: "Integer" },
      { name: "pPosiotn", type: "Variant", isOptional: true, defaultValue: "spMiddle" },
    ],
    description: "Faz scroll para que a célula (ColIndex, RowIndex) fique visível.",
  },

  // ───────── Movimentação ─────────
  {
    name: "MoveRow",
    returns: "Void",
    params: [
      { name: "FromIndex", type: "Integer" },
      { name: "ToIndex", type: "Integer" },
    ],
    description: "Move uma linha de FromIndex para ToIndex.",
  },
  {
    name: "MoveRows",
    returns: "Void",
    params: [
      { name: "FromIndex", type: "Integer" },
      { name: "ToIndex", type: "Integer" },
      { name: "RCount", type: "Integer" },
    ],
    description: "Move RCount linhas a partir de FromIndex para ToIndex.",
  },
  {
    name: "MoveColumn",
    returns: "Void",
    params: [
      { name: "FromIndex", type: "Integer" },
      { name: "ToIndex", type: "Integer" },
    ],
    description: "Move uma coluna.",
  },
  {
    name: "SwapRows",
    returns: "Void",
    params: [
      { name: "ARow1", type: "Integer" },
      { name: "ARow2", type: "Integer" },
    ],
    description: "Troca duas linhas de posição.",
  },
  {
    name: "SortSwapRows",
    returns: "Void",
    params: [
      { name: "ARow1", type: "Integer" },
      { name: "ARow2", type: "Integer" },
    ],
    description: "Troca duas linhas de posição mantendo a ordenação corrente.",
  },

  // ───────── Operações de retângulo ─────────
  {
    name: "ColorRect",
    returns: "Void",
    params: [
      { name: "ACol1", type: "Integer" },
      { name: "ARow1", type: "Integer" },
      { name: "ACol2", type: "Integer" },
      { name: "aRow2", type: "Integer" },
      { name: "aColor", type: "Integer" },
    ],
    description: "Pinta um retângulo de células com uma cor.",
  },
  // ClearRect tem 2 overloads: 4-coords (suportado) e TRect (não suportado).
  // O overload "Não" do levantamento aparece como entrada `isUnsupported`
  // separada — mantemos as duas declarações para que o linter emita
  // unsupported-member ao detectar a versão TRect.
  {
    name: "ClearRect",
    returns: "Void",
    params: [
      { name: "ACol1", type: "Integer" },
      { name: "ARow1", type: "Integer" },
      { name: "ACol2", type: "Integer" },
      { name: "aRow2", type: "Integer" },
    ],
    description: "Limpa um retângulo de células (4 coordenadas).",
  },
  {
    name: "Clear",
    returns: "Void",
    params: [],
    description: "Limpa o conteúdo de todas as células (preserva headers).",
  },
  {
    name: "ClearAll",
    returns: "Void",
    params: [],
    description: "Limpa absolutamente todo o conteúdo do grid.",
  },
  {
    name: "ClearRows",
    returns: "Void",
    params: [
      { name: "RowIndex", type: "Integer" },
      { name: "RCount", type: "Integer" },
    ],
    description: "Limpa o conteúdo de RCount linhas a partir de RowIndex.",
  },
  {
    name: "ClearCols",
    returns: "Void",
    params: [
      { name: "ColIndex", type: "Integer" },
      { name: "CCount", type: "Integer" },
    ],
    description: "Limpa o conteúdo de CCount colunas a partir de ColIndex.",
  },
  {
    name: "ClearNormalRows",
    returns: "Void",
    params: [
      { name: "RowIndex", type: "Integer" },
      { name: "RCount", type: "Integer" },
    ],
    description: "Limpa apenas as linhas normais (não fixas) em RCount.",
  },
  {
    name: "ClearNormalCols",
    returns: "Void",
    params: [
      { name: "ColIndex", type: "Integer" },
      { name: "CCount", type: "Integer" },
    ],
    description: "Limpa apenas as colunas normais (não fixas) em CCount.",
  },
  {
    name: "ClearSelection",
    returns: "Void",
    params: [],
    description: "Cancela a seleção corrente.",
  },
  {
    name: "ClearRowSelect",
    returns: "Void",
    params: [],
    description: "Cancela a seleção de linhas.",
  },
  {
    name: "ClearColSelect",
    returns: "Void",
    params: [],
    description: "Cancela a seleção de colunas.",
  },
  {
    name: "TrimRect",
    returns: "Void",
    params: [
      { name: "ACol1", type: "Integer" },
      { name: "ARow1", type: "Integer" },
      { name: "ACol2", type: "Integer" },
      { name: "ARow2", type: "Integer" },
    ],
    description: "Faz Trim() (remove espaços) em todas as células do retângulo.",
  },
  {
    name: "TrimColumn",
    returns: "Void",
    params: [{ name: "ACol", type: "Integer" }],
    description: "Faz Trim() em todas as células de uma coluna.",
  },
  {
    name: "TrimRow",
    returns: "Void",
    params: [{ name: "ARow", type: "Integer" }],
    description: "Faz Trim() em todas as células de uma linha.",
  },
  {
    name: "TrimAll",
    returns: "Void",
    params: [],
    description: "Faz Trim() em todas as células do grid.",
  },

  // ───────── Edit / Focus ─────────
  {
    name: "EditCell",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Entra em modo de edição na célula (ACol, ARow).",
  },
  {
    name: "FocusCell",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Move o foco para a célula (ACol, ARow) sem editar.",
  },
  {
    name: "GotoCell",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Posiciona o cursor na célula (ACol, ARow).",
  },
  {
    name: "LaunchEdit",
    returns: "Void",
    params: [
      { name: "ACol", type: "Integer" },
      { name: "ARow", type: "Integer" },
    ],
    description: "Inicia o editor inline da célula (ACol, ARow).",
  },

  // ───────── Seleção ─────────
  {
    name: "SelectAll",
    returns: "Void",
    params: [],
    description: "Seleciona todas as células do grid.",
  },
  {
    name: "SelectRows",
    returns: "Void",
    params: [
      { name: "RowIndex", type: "Integer" },
      { name: "RCount", type: "Integer" },
    ],
    description: "Seleciona RCount linhas a partir de RowIndex.",
  },
  {
    name: "UnSelectRows",
    returns: "Void",
    params: [
      { name: "RowIndex", type: "Integer" },
      { name: "RCount", type: "Integer" },
    ],
    description: "Cancela a seleção de RCount linhas a partir de RowIndex.",
  },
  {
    name: "SelectCols",
    returns: "Void",
    params: [
      { name: "ColIndex", type: "Integer" },
      { name: "CCount", type: "Integer" },
    ],
    description: "Seleciona CCount colunas a partir de ColIndex.",
  },
  {
    name: "UnSelectCols",
    returns: "Void",
    params: [
      { name: "ColIndex", type: "Integer" },
      { name: "CCount", type: "Integer" },
    ],
    description: "Cancela a seleção de CCount colunas a partir de ColIndex.",
  },
  {
    name: "SelectRange",
    returns: "Void",
    params: [
      { name: "FromCol", type: "Integer" },
      { name: "ToCol", type: "Integer" },
      { name: "FromRow", type: "Integer" },
      { name: "ToRow", type: "Integer" },
    ],
    description: "Seleciona o retângulo (FromCol..ToCol) × (FromRow..ToRow).",
  },
  {
    name: "ClearSelectedCells",
    returns: "Void",
    params: [],
    description: "Limpa o conteúdo das células atualmente selecionadas.",
  },
  {
    name: "ClearModifiedRows",
    returns: "Void",
    params: [],
    description: 'Reseta o sinal de "modificado" em todas as linhas.',
  },
  {
    name: "ModifiedRowCount",
    returns: "Integer",
    params: [],
    description: "Retorna o total de linhas marcadas como modificadas.",
  },

  // ───────── Add / Hide ─────────
  {
    name: "AddColumn",
    returns: "Void",
    params: [],
    description: "Adiciona uma nova coluna ao final.",
  },
  {
    name: "HideColumn",
    returns: "Void",
    params: [{ name: "Colindex", type: "Integer" }],
    description: "Oculta uma coluna específica.",
  },
  {
    name: "HideColumns",
    returns: "Void",
    params: [
      { name: "FromCol", type: "Integer" },
      { name: "ToCol", type: "Integer" },
    ],
    description: "Oculta o intervalo de colunas [FromCol, ToCol].",
  },
  {
    name: "UnHideColumn",
    returns: "Void",
    params: [{ name: "Colindex", type: "Integer" }],
    description: "Reexibe uma coluna previamente oculta.",
  },
  {
    name: "UnHideColumns",
    returns: "Void",
    params: [
      { name: "FromCol", type: "Integer" },
      { name: "ToCol", type: "Integer" },
    ],
    description: "Reexibe o intervalo de colunas [FromCol, ToCol].",
  },
  {
    name: "UnHideColumnsAll",
    returns: "Void",
    params: [],
    description: "Reexibe todas as colunas ocultas.",
  },
  {
    name: "IsHiddenRow",
    returns: "Boolean",
    params: [{ name: "Rowindex", type: "Integer" }],
    description: "Indica se uma linha está oculta.",
  },
  {
    name: "IsHiddenColumn",
    returns: "Boolean",
    params: [{ name: "Colindex", type: "Integer" }],
    description: "Indica se uma coluna está oculta.",
  },
  { name: "AddRow", returns: "Void", params: [], description: "Adiciona uma nova linha ao final." },
  {
    name: "HideRow",
    returns: "Void",
    params: [{ name: "Rowindex", type: "Integer" }],
    description: "Oculta uma linha específica.",
  },
  {
    name: "TotalRowCount",
    returns: "Integer",
    params: [],
    description: "Retorna o total de linhas (incluindo ocultas).",
  },
  {
    name: "TotalColCount",
    returns: "Integer",
    params: [],
    description: "Retorna o total de colunas (incluindo ocultas).",
  },
  {
    name: "HideRows",
    returns: "Void",
    params: [
      { name: "FromRow", type: "Integer" },
      { name: "ToRow", type: "Integer" },
    ],
    description: "Oculta o intervalo de linhas [FromRow, ToRow].",
  },
  {
    name: "HideSelectedRows",
    returns: "Void",
    params: [],
    description: "Oculta as linhas atualmente selecionadas.",
  },
  {
    name: "HideUnselectedRows",
    returns: "Void",
    params: [],
    description: "Oculta as linhas NÃO selecionadas.",
  },
  {
    name: "UnHideRow",
    returns: "Void",
    params: [{ name: "Rowindex", type: "Integer" }],
    description: "Reexibe uma linha previamente oculta.",
  },
  {
    name: "UnHideRows",
    returns: "Void",
    params: [
      { name: "FromRow", type: "Integer" },
      { name: "ToRow", type: "Integer" },
    ],
    description: "Reexibe o intervalo de linhas [FromRow, ToRow].",
  },

  // ───────── Update / Lock ─────────
  {
    name: "BeginUpdate",
    returns: "Void",
    params: [],
    description: "Suspende o redraw para realizar várias alterações em lote.",
  },
  {
    name: "EndUpdate",
    returns: "Void",
    params: [],
    description: "Retoma o redraw após um BeginUpdate.",
  },

  // ───────── Export ─────────
  {
    name: "ExportToExcel",
    returns: "Void",
    params: [{ name: "FilePath", type: "UnicodeString" }],
    description: "Exporta o conteúdo do grid para um arquivo Excel.",
  },
  {
    name: "ExportToJson",
    returns: "Void",
    params: [{ name: "FilePath", type: "UnicodeString" }],
    description: "Exporta o conteúdo do grid para um arquivo JSON.",
  },
  {
    name: "ExportToXml",
    returns: "Void",
    params: [{ name: "FilePath", type: "UnicodeString" }],
    description: "Exporta o conteúdo do grid para um arquivo XML.",
  },
  {
    name: "ExportToTxt",
    returns: "Void",
    params: [
      { name: "FilePath", type: "UnicodeString" },
      { name: "delimitador", type: "UnicodeString" },
    ],
    description: "Exporta o conteúdo do grid para um arquivo TXT.",
  },
  {
    name: "ExportToCsv",
    returns: "Void",
    params: [
      { name: "FilePath", type: "UnicodeString" },
      { name: "delimitador", type: "UnicodeString" },
    ],
    description: "Exporta o conteúdo do grid para um arquivo CSV.",
  },

  // ───────── Internal / Data7 ─────────
  {
    name: "GetEditorLink",
    returns: "GridEditorLink",
    params: [],
    description: "Retorna o GridEditorLink atualmente vinculado ao grid.",
  },
  {
    name: "_GetParent",
    returns: "TWinControl",
    params: [],
    description: "Acesso interno ao parent do controle (uso interno Data7).",
  },
  {
    name: "_SetParent",
    returns: "Void",
    params: [{ name: "Value", type: "TWinControl" }],
    description: "Define o parent do controle (uso interno Data7).",
  },

  // Membros legados de TObject (ClassType, InstanceSize, AfterConstruction,
  // Dispatch, DefaultHandler, NewInstance, FreeInstance, Equals, FieldAddress,
  // MethodAddress, MethodName) foram movidos para `Globals/TObject.ts` — toda
  // classe que herda de TObject (todo o universo Data7) agora os enxerga.

  // ───────── Métodos / overloads não suportados ─────────
  {
    name: "ClearRect",
    returns: "Void",
    params: [{ name: "ARect", type: "TRect" }],
    description: "Overload de ClearRect aceitando TRect." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SwapCells",
    returns: "Void",
    params: [
      { name: "FromCell", type: "Integer" },
      { name: "ToCell", type: "Integer" },
    ],
    description: "Troca duas células de posição." + UNSUP_NOTE,
    isUnsupported: true,
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Builders → SystemSymbolInfo
// ───────────────────────────────────────────────────────────────────────────
function toProperty(spec: PropertySpec): SystemSymbolInfo {
  return {
    name: spec.name,
    kind: "property",
    type: spec.type,
    isShared: false,
    isPrivate: false,
    range: RANGE,
    fileUri: "system://library",
    containerName: GRID_CONTAINER,
    description: spec.description,
    ...(spec.isUnsupported ? { isUnsupported: true } : {}),
  };
}

interface MappedParam {
  name: string;
  type: string;
  isByRef: boolean;
  isOptional: boolean;
  defaultValue?: string;
}

function mapParams(params: readonly ParamSpec[]): MappedParam[] {
  return params.map((p) => ({
    name: p.name,
    type: p.type,
    isByRef: p.isByRef ?? false,
    isOptional: p.isOptional ?? false,
    ...(p.defaultValue !== undefined ? { defaultValue: p.defaultValue } : {}),
  }));
}

function toMethod(spec: MethodSpec): SystemSymbolInfo {
  return {
    name: spec.name,
    kind: spec.indexed ? "indexed-property" : "method",
    type: spec.returns,
    isShared: false,
    isPrivate: false,
    parameters: mapParams(spec.params),
    ...(spec.overloads && spec.overloads.length > 0
      ? { overloads: spec.overloads.map((o) => mapParams(o)) }
      : {}),
    range: RANGE,
    fileUri: "system://library",
    containerName: GRID_CONTAINER,
    description: spec.description,
    ...(spec.isUnsupported ? { isUnsupported: true } : {}),
  };
}

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Grid",
    kind: "class",
    type: "Grid",
    isShared: false,
    isPrivate: false,
    range: RANGE,
    fileUri: "system://library",
    containerName: FORMS,
    inheritsFrom: "TGrade",
    description:
      "Componente de grade (Grid) para exibição e manipulação tabular de dados. Wrapper Data7 sobre TGrade (especialização TMS TAdvColumnGrid). Herda toda a cadeia VCL/TMS — ver `_aliases.ts`.",
  },
  ...properties.map(toProperty),
  ...events.map(toProperty),
  ...methods.map(toMethod),
];

# Namespace `Forms`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Namespace para manipulação da interface de formulários e caixas de diálogo do ERP.

**Como importar:**

```basic
Imports Forms
```

## 2. Árvore de herança das classes

```
TObject  (externo)
└─ TMargins
TPersistent  (externo)
└─ TComponent
   ├─ TControl
   │  ├─ TGraphicControl
   │  │  ├─ Border
   │  │  ├─ ControlGroup
   │  │  ├─ FlatButton
   │  │  ├─ Imagem
   │  │  ├─ TBevel
   │  │  ├─ TControlGroup
   │  │  ├─ TCustomLabel
   │  │  │  └─ TRotulo
   │  │  ├─ TCustomSpeedButton
   │  │  │  └─ TSpeedButton
   │  │  │     └─ TSpeedBotao
   │  │  ├─ TImage
   │  │  └─ TShape
   │  │     ├─ Ellipse
   │  │     ├─ Line
   │  │     └─ Rectangle
   │  └─ TWinControl
   │     ├─ ProgressBar
   │     ├─ StaticText
   │     ├─ TBoundLabel
   │     ├─ TButtonControl
   │     │  ├─ ButtonCancel
   │     │  ├─ ButtonOk
   │     │  ├─ CommandButton
   │     │  └─ TSSCustomButton
   │     │     └─ TBotao
   │     ├─ TCustomControl
   │     │  ├─ CustomControl
   │     │  ├─ PageControl
   │     │  ├─ Panel
   │     │  ├─ TabSheet
   │     │  ├─ TCustomGrid
   │     │  │  └─ TCustomDrawGrid
   │     │  │     └─ TDrawGrid
   │     │  │        └─ TStringGrid
   │     │  │           └─ TObjStringGrid
   │     │  │              └─ TBaseGrid
   │     │  │                 └─ TAdvStringGrid
   │     │  │                    └─ TAdvColumnGrid
   │     │  │                       └─ TGrade
   │     │  │                          └─ Grid
   │     │  ├─ TCustomPanel
   │     │  ├─ TcxCustomEdit
   │     │  │  ├─ CheckBox
   │     │  │  ├─ TcxCustomCheckBox
   │     │  │  │  └─ TcxCheckBox
   │     │  │  │     └─ THCheckBox
   │     │  │  └─ TcxCustomTextEdit
   │     │  │     ├─ ButtonTextBox
   │     │  │     ├─ DateTextBox
   │     │  │     ├─ HComboBox
   │     │  │     ├─ MemoTextBox
   │     │  │     ├─ NumberTextBox
   │     │  │     ├─ PasswordTextBox
   │     │  │     ├─ SearchTextBox
   │     │  │     ├─ TcxCustomCurrencyEdit
   │     │  │     │  └─ TcxCurrencyEdit
   │     │  │     │     └─ TValorEditor
   │     │  │     ├─ TcxCustomMaskEdit
   │     │  │     │  ├─ TcxCustomButtonEdit
   │     │  │     │  │  └─ TcxButtonEdit
   │     │  │     │  │     ├─ TEditorBotao
   │     │  │     │  │     └─ TPesquisaEditor
   │     │  │     │  ├─ TcxCustomDropDownEdit
   │     │  │     │  │  ├─ TcxCustomComboBox
   │     │  │     │  │  │  └─ TcxComboBox
   │     │  │     │  │  │     └─ THComboBox
   │     │  │     │  │  └─ TcxCustomPopupEdit
   │     │  │     │  │     ├─ TcxCustomCalcEdit
   │     │  │     │  │     │  └─ TcxCalcEdit
   │     │  │     │  │     │     └─ TNumeroEditor
   │     │  │     │  │     └─ TcxCustomDateEdit
   │     │  │     │  │        └─ TcxDateEdit
   │     │  │     │  │           └─ TDataEditor
   │     │  │     │  └─ TcxMaskEdit
   │     │  │     │     └─ TMascaraEditor
   │     │  │     ├─ TcxCustomMemo
   │     │  │     │  └─ TcxMemo
   │     │  │     │     └─ TMemoEditor
   │     │  │     ├─ TcxTextEdit
   │     │  │     │  └─ TEditor
   │     │  │     ├─ TextBox
   │     │  │     └─ ValueTextBox
   │     │  ├─ TRzCustomTabControl
   │     │  │  └─ TRzPageControl
   │     │  └─ TRzTabSheet
   │     ├─ TCustomEdit
   │     │  └─ TCustomButtonedEdit
   │     │     └─ TButtonedEdit
   │     ├─ TLabeledEdit
   │     └─ TScrollingWinControl
   │        ├─ TCustomForm
   │        ├─ TCustomFrame
   │        ├─ TForm
   │        │  ├─ Form
   │        │  ├─ FormButtons
   │        │  └─ TfrmFormulario
   │        │     └─ TfrmPaiCadastro
   │        └─ TFrame
   │           ├─ Calendar
   │           ├─ TFrameCalendario
   │           ├─ TFrameTopbar
   │           └─ Topbar
   ├─ Timer
   └─ TTimer
TEditLink
└─ GridEditorLink
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `Border`

**Herda de:** [`TGraphicControl`](#tgraphiccontrol)

**Cadeia completa:** [`TGraphicControl`](#tgraphiccontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Borda decorativa (wrapper sobre TBevel) usada para separar visualmente seções de um formulário.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Shape` | `Integer` | Forma da borda (bsBox, bsFrame, bsTopLine, bsBottomLine, bsLeftLine, bsRightLine, bsSpacer). |
| `Style` | `Integer` | Estilo visual: bsLowered (rebaixada) ou bsRaised (elevada). |

#### `CheckBox`

**Herda de:** [`TcxCustomEdit`](#tcxcustomedit)

**Cadeia completa:** [`TcxCustomEdit`](#tcxcustomedit) → [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Caixa de seleção (verdadeiro/falso/grayed) padrão Data7. Wrapper sobre TcxCheckBox.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Checked` | `Boolean` | Indica se a caixa está marcada (True) ou desmarcada (False). Atalho para State = cbsChecked. |
| `State` | `Integer` | Estado da caixa: cbsUnchecked (0), cbsChecked (1) ou cbsGrayed (2 — apenas quando AllowGrayed = True). |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Toggle` | `Void` | `()` | Alterna o estado da caixa entre marcado e desmarcado (e cinza, quando AllowGrayed = True). |

#### `DateTextBox`

**Herda de:** [`TcxCustomTextEdit`](#tcxcustomtextedit)

**Cadeia completa:** [`TcxCustomTextEdit`](#tcxcustomtextedit) → [`TcxCustomEdit`](#tcxcustomedit) → [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Caixa de texto especializada em entrada de datas (TDataEditor) com botão de calendário (dropdown). Wrapper sobre TcxDateEdit.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `AsDate` | `TDateTime` | Valor atual do editor como TDateTime — atalho para Date. |
| `Date` | `TDateTime` | Data selecionada no editor (parte de hora zerada). |

#### `FlatButton`

**Herda de:** [`TGraphicControl`](#tgraphiccontrol)

**Cadeia completa:** [`TGraphicControl`](#tgraphiccontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Botão visual chato (flat) baseado em TSpeedButton — renderizado pelo Canvas do pai, sem janela própria. Ideal para barras de ferramentas.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `AllowAllUp` | `Boolean` | Se todos os botões do grupo podem estar simultaneamente desativados. |
| `Caption` | `String` | Texto exibido no botão. |
| `Down` | `Boolean` | Estado pressionado do botão (quando GroupIndex > 0). |
| `Flat` | `Boolean` | Se o botão é renderizado em estilo flat (sem borda 3D destacada). |
| `Glyph` | `Variant` | Imagem (bitmap) exibida no botão. Pode conter até 4 estados (normal, disabled, clicked, down). |
| `GroupIndex` | `Integer` | Identifica o grupo de botões mutualmente exclusivos (radio behavior). 0 = sem grupo. |
| `Layout` | `Integer` | Posição do glyph em relação ao caption (blGlyphLeft, blGlyphRight, blGlyphTop, blGlyphBottom). |
| `NumGlyphs` | `Integer` | Quantidade de imagens contidas em Glyph (1 a 4). |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnClick` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o botão é clicado. |

#### `Grid`

**Herda de:** [`TGrade`](#tgrade)

**Cadeia completa:** [`TGrade`](#tgrade) → [`TAdvColumnGrid`](#tadvcolumngrid) → [`TAdvStringGrid`](#tadvstringgrid) → [`TBaseGrid`](#tbasegrid) → [`TObjStringGrid`](#tobjstringgrid) → [`TStringGrid`](#tstringgrid) → [`TDrawGrid`](#tdrawgrid) → [`TCustomDrawGrid`](#tcustomdrawgrid) → [`TCustomGrid`](#tcustomgrid) → [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Componente de grade (Grid) para exibição e manipulação tabular de dados. Wrapper Data7 sobre TGrade (especialização TMS TAdvColumnGrid). Herda toda a cadeia VCL/TMS — ver `_aliases.ts`.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Action` | `Variant` | TAction associada ao controle (action link). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ActiveCellColor` | `Integer` | Cor de fundo da célula ativa. |
| `ActiveCellColorTo` | `Integer` | Cor final do gradiente da célula ativa. |
| `ActiveCellFont` | [`TFont`](#tfont) | Fonte usada na célula ativa. |
| `ActiveCellShow` | `Boolean` | Destaca visualmente a célula atualmente focada. |
| `ActiveRowColor` | `Integer` | Cor de destaque da linha ativa. |
| `ActiveRowColorTo` | `Variant` | Cor final do gradiente da linha ativa. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ActiveRowMirrorColor` | `Variant` | Cor mirror da linha ativa. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ActiveRowMirrorColorTo` | `Variant` | Cor final mirror da linha ativa. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ActiveRowShow` | `Boolean` | Destaca visualmente a linha atualmente focada. |
| `AdvGridDropDown` | `Variant` | TAdvStringGrid em dropdown embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `AllColCount` | `Integer` | Total de colunas, incluindo ocultas. |
| `AllRowCount` | `Integer` | Total de linhas, incluindo ocultas. |
| `AlwaysQuotes` | `Boolean` | Adiciona aspas em todas as células ao exportar. |
| `AlwaysValidate` | `Boolean` | Executa OnCellValidate em toda mudança de célula. |
| `AnchorHint` | `Boolean` | Exibe hint personalizado quando o mouse sobre âncoras HTML em células. |
| `ArrowColor` | `Variant` | Cor das setas do auto-numbering / sort indicator. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `AutoColor` | `Variant` | Sub-objeto de cor automática por linha. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `AutoFilterDisplay` | `Boolean` | Exibe ícones de filtro automaticamente nas colunas filtráveis. |
| `AutoFilterUpdate` | `Boolean` | Atualiza filtros automaticamente ao mudar dados. |
| `AutoHideSelection` | `Boolean` | Esconde o retângulo de seleção quando o grid perde o foco. |
| `AutoNumAlign` | `Boolean` | Alinha automaticamente células numéricas à direita. |
| `AutoNumberDirection` | `Variant` | Direção da numeração automática (ascendente/descendente). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `AutoNumberOffset` | `Integer` | Deslocamento aplicado à coluna de numeração automática. |
| `AutoNumberStart` | `Integer` | Valor inicial da numeração automática. |
| `AutoSize` | `Boolean` | Reorganiza colunas para preencher a área do controle. |
| `AutoThemeAdapt` | `Boolean` | Ajusta automaticamente as cores do grid ao theme corrente do Windows. |
| `BackGround` | `Variant` | Imagem/cor de fundo do grid. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Balloon` | `Variant` | Balloon-tip exibido em validação inválida. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Bands` | `Variant` | Configuração de bandas (faixas) de cor alternada. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `BevelEdges` | [`TBevelEdges`](#tbeveledges) | Set indicando quais bordas exibem bevel (beLeft/Top/Right/Bottom). |
| `BevelInner` | [`TBevelCut`](#tbevelcut) | Estilo do bevel interno (bvNone, bvLowered, bvRaised). |
| `BevelKind` | [`TBevelKind`](#tbevelkind) | Modo de renderização do bevel (bkNone, bkTile, bkSoft, bkFlat). |
| `BevelOuter` | [`TBevelCut`](#tbevelcut) | Estilo do bevel externo (bvNone, bvLowered, bvRaised). |
| `BevelWidth` | `Integer` | Largura em pixels do bevel desenhado em torno da grade. |
| `BorderColor` | `Integer` | Cor da borda externa do grid. |
| `BorderStyle` | [`TBorderStyle`](#tborderstyle) | Estilo de borda externa do controle (bsNone, bsSingle). |
| `Btn` | `Variant` | Botão embarcado em célula. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `BtnEdit` | `Variant` | Editor com botão lateral embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `BtnUnitEdit` | `Variant` | Editor com botão + unidade embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CalculatorDropDown` | `Variant` | Calculadora dropdown embarcada. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CellChecker` | `Variant` | Verificador automático de dados por célula. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CellEditor` | [`TWinControl`](#twincontrol) | Controle de edição inline atualmente vinculado à célula. |
| `CellNode` | `Variant` | Configuração de árvore (cell node) por linha. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CheckFalse` | `UnicodeString` | Texto que representa o valor False em células checkbox. |
| `CheckTrue` | `UnicodeString` | Texto que representa o valor True em células checkbox. |
| `ClearTextOnly` | `Boolean` | Ao limpar células, mantém formatação (cor/fonte) e zera apenas o texto. |
| `Col` | `Integer` | Índice (1-based) da coluna atualmente focada. |
| `ColCount` | `Integer` | Quantidade total de colunas (incluindo fixas). |
| `Color` | `Integer` | Cor de fundo das células normais da grade. |
| `ColorPickerDropDown` | `Variant` | Color picker dropdown embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ColSelectCount` | `Integer` | Quantidade de colunas selecionadas. |
| `ColumnHeaders` | `TStringList` | Textos exibidos nos cabeçalhos das colunas. |
| `ColumnOrder` | `Variant` | Ordem corrente das colunas (persistida). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Columns` | `Variant` | Coleção de colunas tipadas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ColumnSize` | `Variant` | Configurações de tamanho de coluna persistidas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Combobox` | `Variant` | ComboBox embarcado padrão. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ComObject` | `IInterface` | Interface COM associada ao componente (quando aplicável). |
| `Constraints` | `Variant` | Restrições de tamanho herdadas de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ControlDropDown` | `Variant` | Controle customizado em dropdown embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ControlLook` | `Variant` | Aparência fina do grid (sub-objeto). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ControlState` | `Integer` | Estado atual herdado de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ControlStyle` | `Integer` | Estilo de controle herdado de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CSVLineBreak` | `UnicodeString` | Sequência usada para quebrar linhas ao exportar CSV. |
| `CSVMultilineCellImport` | `Boolean` | Permite importar células multilinha do CSV. |
| `CSVTrimSpaces` | `Boolean` | Remove espaços extras das células lidas do CSV. |
| `Ctl3D` | `Boolean` | Renderiza o grid com aparência 3D legada (Windows clássico). |
| `CurrentCell` | `UnicodeString` | Coordenada string da célula corrente ("A1", "B2", ...). |
| `CurrentEditor` | [`TEditorType`](#teditortype) | Tipo do editor inline corrente. |
| `CurrentPPI` | `Integer` | PPI corrente do monitor onde o controle está exibido. |
| `CustomHint` | `Variant` | Hint personalizado herdado de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DateAndTimePicker` | `Variant` | DateAndTimePicker embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DateTimePicker` | `Variant` | DateTimePicker embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DefaultAlignment` | [`TAlignment`](#talignment) | Alinhamento horizontal padrão das células normais. |
| `DefaultColAlignment` | [`TAlignment`](#talignment) | Alinhamento horizontal padrão de novas colunas. |
| `DefaultColWidth` | `Integer` | Largura padrão atribuída a novas colunas. |
| `DefaultDrawing` | `Boolean` | Controla se o grid pinta as células com o algoritmo padrão (false delega tudo a OnDrawCell). |
| `DefaultEditor` | [`TEditorType`](#teditortype) | Tipo de editor inline padrão para células sem editor explícito. |
| `DefaultRowHeight` | `Integer` | Altura padrão atribuída a novas linhas. |
| `Delimiter` | `WideChar` | Caractere delimitador usado em CSV. |
| `DetailPickerDropDown` | `Variant` | Picker com detalhe (imagem+caption+nota) dropdown. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DisabledFontColor` | `Integer` | Cor da fonte quando a grade está com Enabled=False. |
| `DoAutoEditFilter` | `Boolean` | Aplica filtro automaticamente ao começar a digitar. |
| `DockManager` | `Variant` | Gerenciador de docking herdado de TWinControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DockOrientation` | `Integer` | Orientação de docking herdada de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DoubleBufferedMode` | [`TDoubleBufferedMode`](#tdoublebufferedmode) | Modo de double buffering (dbmDefault, dbmDisabled, dbmEnabled). |
| `DragCursor` | `Integer` | Cursor exibido durante drag-and-drop iniciado a partir deste controle. |
| `DragDropSettings` | `Variant` | Configurações de drag-and-drop do TMS. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DragKind` | [`TDragKind`](#tdragkind) | Tipo de operação de arrasto (dkDrag ou dkDock). |
| `DragMode` | [`TDragMode`](#tdragmode) | Como o arrasto é iniciado (dmManual ou dmAutomatic). |
| `DragScrollOptions` | `Variant` | Opções de scroll durante drag-and-drop. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DrawingStyle` | [`TGridDrawingStyle`](#tgriddrawingstyle) | Estilo geral de pintura do grid (gdsClassic, gdsThemed, gdsGradient). |
| `DropCheckList` | `Variant` | Lista dropdown de seleção múltipla com check. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DropList` | `Variant` | Lista dropdown de seleção simples. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `EditActive` | `Boolean` | Indica se a célula corrente está em modo de edição. |
| `EditLink` | [`TEditLink`](#teditlink) | Vínculo entre células e editores customizados (GridEditorLink especializa este tipo). |
| `EditMask` | `UnicodeString` | Máscara de entrada (igual à de TEdit) aplicada ao editor inline. |
| `EditorMode` | `Boolean` | Mantém o grid em modo de edição contínua. |
| `EditWithTags` | `Boolean` | Permite editar valores preservando tags HTML inline. |
| `EnableBlink` | `Boolean` | Permite células com texto piscando (tag <blink>). |
| `EnableHTML` | `Boolean` | Permite renderizar células com marcação HTML. |
| `EnableWheel` | `Boolean` | Permite scroll via mouse-wheel. |
| `Encoding` | `Variant` | Encoding usado na (de)serialização do grid. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `EnhRowColMove` | `Boolean` | Permite arrastar para reordenar linhas e colunas com visual aprimorado. |
| `EnhTextSize` | `Boolean` | Recálculo aprimorado de tamanho de texto multilinha. |
| `ExcelClipboardFormat` | `Boolean` | Usa o formato do clipboard do Excel ao copiar células. |
| `ExcelStyleDecimalSeparator` | `Boolean` | Usa o separador decimal do Excel ao colar valores. |
| `FastPrint` | `Boolean` | Imprime com renderização simplificada (ganho de performance). |
| `Filter` | `Variant` | Sub-objeto de filtro avançado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FilterActive` | `Boolean` | Indica se o filtro está atualmente aplicado. |
| `FilterDropDown` | `Variant` | Sub-objeto do dropdown de filtro. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FilterDropDownAuto` | `Boolean` | Abre o dropdown de filtro automaticamente ao clicar no ícone. |
| `FilterDropDownCheck` | `Boolean` | Exibe checkboxes em vez de seleção simples no dropdown de filtro. |
| `FilterDropDownCheckUnCheckAll` | `UnicodeString` | Texto exibido no item "marcar/desmarcar tudo" do dropdown. |
| `FilterDropDownClear` | `UnicodeString` | Texto exibido no item "limpar filtro" do dropdown. |
| `FilterDropDownColumns` | [`TFilterDropDownColumns`](#tfilterdropdowncolumns) | Set que indica quais colunas exibem o botão de filtro dropdown. |
| `FilterDropDownMultiCol` | `Boolean` | Permite seleção múltipla no dropdown de filtro. |
| `FilterDropDownRow` | `Integer` | Linha onde aparece o botão de filtro dropdown. |
| `FilterEdit` | `Variant` | Sub-objeto do filtro embarcado em editor. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FilterImageList` | `Variant` | Lista de ícones para indicadores de filtro. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FilterIncremental` | `Boolean` | Aplica o filtro caractere a caractere durante a digitação. |
| `FilterList` | `TStringList` | Lista de strings a serem usadas no filtro corrente. |
| `FilterNormalCellsOnly` | `Boolean` | Aplica filtros apenas em células normais (ignora células mescladas). |
| `FilterType` | [`TGridFilterType`](#tgridfiltertype) | Como o filtro trata strings (fcNormal, fcCaseSensitive, fcNoCase). |
| `FindBusy` | `Boolean` | Indica se há busca em andamento. |
| `FindCol` | `Integer` | Coluna em que a busca atual encontrou resultado. |
| `FindRow` | `Integer` | Linha em que a busca atual encontrou resultado. |
| `FitCellsInGrid` | `Boolean` | Ajusta automaticamente as células para caberem na grade impressa. |
| `FixedAsButtons` | `Boolean` | Renderiza as células fixas como botões clicáveis. |
| `FixedColAlways` | `Boolean` | Mantém as colunas fixas sempre visíveis durante scroll horizontal. |
| `FixedColor` | `Integer` | Cor de fundo das células fixas. |
| `FixedCols` | `Integer` | Quantidade de colunas fixas à esquerda (cabeçalho lateral). |
| `FixedColWidth` | `Integer` | Largura padrão das colunas fixas. |
| `FixedComboBox` | `Variant` | ComboBox embarcado em células fixas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FixedDropDownMenu` | `Variant` | Menu dropdown de células fixas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FixedEdit` | `Variant` | Editor inline de células fixas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FixedFont` | [`TFont`](#tfont) | Fonte usada nas células fixas. |
| `FixedFooters` | `Integer` | Quantidade de linhas fixas no rodapé. |
| `FixedRightCols` | `Integer` | Quantidade de colunas fixas à direita. |
| `FixedRowAlways` | `Boolean` | Mantém as linhas fixas sempre visíveis durante scroll vertical. |
| `FixedRowHeight` | `Integer` | Altura padrão das linhas fixas. |
| `FixedRows` | `Integer` | Quantidade de linhas fixas no topo (cabeçalho superior). |
| `Flat` | `Boolean` | Renderiza o grid sem borda 3D (visual flat). |
| `FloatFormat` | `UnicodeString` | Formato Delphi (FormatFloat) usado para renderização de números reais nas células. |
| `FloatingDockSiteClass` | `Variant` | Classe do dock site flutuante herdada de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FloatingFooter` | `Variant` | Footer flutuante do grid. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FocusHelper` | `Variant` | Helper visual de foco. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Font` | [`TFont`](#tfont) | Fonte usada nas células normais da grade. |
| `FooterCanvas` | `TCanvas` | Canvas do footer (rodapé) — usado em OnFooterPaint. |
| `FooterPanel` | `Variant` | Painel customizado do footer. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ForceDecimalSeparator` | `Boolean` | Força o uso do separador decimal configurado, ignorando locale. |
| `FormatType` | [`TFormatType`](#tformattype) | Tipo de formatação automática aplicada (ftNumeric, ftFloat, ftDateTime, etc.). |
| `GradientEndColor` | `Integer` | Cor final do gradiente quando DrawingStyle=gdsGradient. |
| `GradientStartColor` | `Integer` | Cor inicial do gradiente quando DrawingStyle=gdsGradient. |
| `GridDropDown` | `Variant` | Grid em dropdown embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `GridFixedLineColor` | `Integer` | Cor das linhas de grade entre células fixas. |
| `GridFixedLineWidth` | `Integer` | Espessura das linhas de grade entre células fixas. |
| `GridHeight` | `Integer` | Altura útil do grid (sem scrollbars/cabeçalhos). |
| `GridImages` | `Variant` | ImageList interna do grid. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `GridLineColor` | `Integer` | Cor das linhas de grade entre células normais. |
| `GridLineWidth` | `Integer` | Espessura das linhas de grade em pixels. |
| `GridOptions` | [`GridConfigs`](#gridconfigs) | Configurações Data7 do grid (agrega opções de layout, scrollbars, ordenação, agrupamento e estilo). |
| `GridWidth` | `Integer` | Largura útil do grid (sem scrollbars/cabeçalhos). |
| `GroupColumn` | `Integer` | Índice da coluna usada para agrupar linhas. |
| `Grouping` | `Variant` | Configurações de agrupamento dinâmico. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `HideFocusRect` | `Boolean` | Esconde o retângulo de foco ao redor da célula selecionada. |
| `HighlightColor` | `Integer` | Cor de destaque (highlight) usada na barra inplace edit. |
| `HighlightTextColor` | `Integer` | Cor do texto sob destaque na barra inplace edit. |
| `HintColor` | `Integer` | Cor de fundo do hint. |
| `HintShowCells` | `Boolean` | Exibe hint automaticamente em células com conteúdo truncado. |
| `HintShowLargeText` | `Boolean` | Permite exibir hint expandido com texto grande de células. |
| `HintShowLargeTextPos` | [`THintShowLargeTextPos`](#thintshowlargetextpos) | Posição do hint de texto grande (hpRight, hpBottom, etc.). |
| `HintShowSizing` | `Boolean` | Exibe hint ao redimensionar colunas/linhas. |
| `HoverButtons` | `Variant` | Botões exibidos ao passar o mouse sobre linha. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `HoverFixedCells` | [`THoverFixedCells`](#thoverfixedcells) | Set que indica quais células fixas reagem ao hover do mouse. |
| `Hovering` | `Boolean` | Ativa o efeito de hover por célula (não apenas por linha). |
| `HoverRow` | `Boolean` | Destaca a linha sob o cursor do mouse. |
| `HoverRowCells` | [`THoverRowCells`](#thoverrowcells) | Set que indica quais células acompanham o destaque do hover na linha. |
| `HoverRowColor` | `Integer` | Cor inicial do destaque da linha sob hover. |
| `HoverRowColorTo` | `Integer` | Cor final do gradiente do destaque da linha sob hover. |
| `HTMLHint` | `Boolean` | Permite que hints contenham marcação HTML. |
| `HTMLKeepLineBreak` | `Boolean` | Preserva quebras de linha ao renderizar HTML em hints. |
| `HTMLSettings` | `Variant` | Configurações de renderização HTML. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `IgnoreColumns` | `Variant` | Lista de colunas a serem ignoradas em cálculos/exportação. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ImageCache` | `Variant` | Cache de imagens renderizadas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ImagePickerDropDown` | `Variant` | Image picker dropdown embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `IncrSearchText` | `UnicodeString` | Texto da busca incremental corrente. |
| `InplaceRichEdit` | `Variant` | Rich-edit inline na célula. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `IntegralHeight` | `Boolean` | Ajusta a altura do grid para mostrar linhas inteiras (sem corte). |
| `IntelliPan` | [`TIntelliPan`](#tintellipan) | Modos de pan inteligente (ipNone, ipVertical, ipHorizontal, ipBoth). |
| `IntelliZoom` | `Boolean` | Ativa zoom inteligente via Ctrl+wheel. |
| `InvalidEntryIcon` | [`TInvalidEntryIcon`](#tinvalidentryicon) | Ícone exibido quando uma entrada é rejeitada. |
| `InvalidEntryText` | `UnicodeString` | Texto exibido quando uma entrada é rejeitada. |
| `InvalidEntryTitle` | `UnicodeString` | Título da mensagem mostrada quando uma entrada é rejeitada. |
| `IsDrawingLocked` | `Boolean` | Indica se a pintura está bloqueada (durante batch update). |
| `IsPrintPreview` | `Boolean` | Indica se o grid está em modo de preview de impressão. |
| `IsThemed` | `Boolean` | Indica se o grid está usando o estilo do Windows themes ativo. |
| `IsUpdating` | `Boolean` | Indica se o grid está em BeginUpdate/EndUpdate corrente. |
| `JavaCSV` | `Boolean` | Usa convenção CSV Java (sem cabeçalhos, etc.). |
| `LastCol` | `Integer` | Índice da última coluna acessível. |
| `LastRow` | `Integer` | Índice da última linha acessível. |
| `LeftCol` | `Integer` | Índice da primeira coluna visível à esquerda da viewport. |
| `LoadFirstRow` | `Boolean` | Carrega a primeira linha do arquivo como cabeçalho. |
| `LockUpdate` | `Boolean` | Suspende a atualização visual enquanto há alterações em lote. |
| `Look` | [`TGridLook`](#tgridlook) | Aparência global do grid (glClassic, glOffice, glStandard, etc.). |
| `Lookup` | `Boolean` | Ativa lookup incremental durante digitação no editor inline. |
| `LookupCaseSensitive` | `Boolean` | Lookup considera maiúsculas/minúsculas. |
| `LookupHistory` | `Boolean` | Mantém histórico de seleções do lookup. |
| `LookupItems` | `TStringList` | Lista de itens disponíveis para o lookup. |
| `MaxColWidth` | `Integer` | Largura máxima permitida por coluna. |
| `MaxComboLength` | `Integer` | Comprimento máximo aceito pelo editor combo. |
| `MaxEditLength` | `Integer` | Comprimento máximo aceito pelo editor inline. |
| `MaxRowHeight` | `Integer` | Altura máxima permitida por linha. |
| `MemoDropDown` | `Variant` | Memo dropdown embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `MergedColumns` | `Variant` | Conjunto de colunas mescladas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `MinColWidth` | `Integer` | Largura mínima permitida por coluna. |
| `MinRowHeight` | `Integer` | Altura mínima permitida por linha. |
| `Modified` | `Boolean` | Indica se houve alteração desde o último Save/Load. |
| `MouseActions` | `Variant` | Mapeamento customizado de ações por botão do mouse. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Multilinecells` | `Boolean` | Permite células com múltiplas linhas (quebra automática). |
| `NarrowDownFromStart` | `Boolean` | Reinicia a busca incremental a cada caractere digitado. |
| `Navigation` | `Variant` | Sub-objeto de navegação (atalhos, teclas, etc.). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `NoDefaultDraw` | `Boolean` | Inibe o desenho padrão das células (delega tudo ao usuário). |
| `NoImageAndText` | `Boolean` | Impede que célula contenha simultaneamente imagem e texto. |
| `NormalEdit` | `Variant` | Configuração do editor inline padrão. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `OemConvert` | `Boolean` | Converte o texto digitado em formato OEM (compatibilidade Windows legada). |
| `OfficeHint` | `Variant` | Configuração do hint estilo Office. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Options` | [`TGridOptions`](#tgridoptions) | Set TMS com flags de comportamento e interação (TAdvStringGridOptions). |
| `OriginalCellValue` | `UnicodeString` | Valor original da célula antes da edição corrente (usado em OnCellValidate). |
| `OwnsObjects` | `Boolean` | Indica se o grid possui (e libera) os objetos associados às células via Objects[]. |
| `Padding` | [`TMargins`](#tmargins) | Padding interno herdado de TWinControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ParentBiDiMode` | `Boolean` | Faz a propriedade BiDiMode seguir o valor do parent. |
| `ParentColor` | `Boolean` | Faz a propriedade Color seguir o valor do parent. |
| `ParentCtl3D` | `Boolean` | Faz a propriedade Ctl3D seguir o valor do parent. |
| `ParentFont` | `Boolean` | Faz a propriedade Font seguir o valor do parent. |
| `ParentShowHint` | `Boolean` | Faz a propriedade ShowHint seguir o valor do parent. |
| `PasswordChar` | `WideChar` | Caractere usado para mascarar valores em células password. |
| `PermiteMarcarExclusao` | `Boolean` | Habilita o fluxo Data7 de marcar/desmarcar linhas para exclusão. |
| `PermitirApagarUltimaLinhaEmBranco` | `Boolean` | Permite que o usuário apague a última linha em branco (extensão Data7). |
| `PictureContainer` | `Variant` | Container externo de imagens. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `PixelsPerInch` | `Integer` | PPI corrente usado nas conversões DPI-aware. |
| `PopupMenu` | `Variant` | Menu popup associado à grade. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `PopupToolBar` | `Variant` | Toolbar popup contextual. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `PopupToolBarMode` | [`TPopupToolBarMode`](#tpopuptoolbarmode) | Modo de exibição do popup toolbar (tbAutoShow, tbManual, tbNever). |
| `PreviewPage` | `Integer` | Página atualmente exibida no preview. |
| `PrintColEnd` | `Integer` | Índice da última coluna impressa. |
| `PrintColStart` | `Integer` | Índice da primeira coluna impressa. |
| `PrinterDriverFix` | `Boolean` | Aplica workaround para drivers de impressora problemáticos. |
| `PrintNrOfPages` | `Integer` | Quantidade de páginas geradas pelo print. |
| `PrintPageRect` | `TRect` | Retângulo da página corrente durante o print. |
| `PrintPageWidth` | `Integer` | Largura útil da página atual. |
| `PrintSettings` | `Variant` | Configurações de impressão. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ProgressAppearance` | `Variant` | Aparência da barra de progresso embarcada. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `QuoteEmptyCells` | `Boolean` | Adiciona aspas em células vazias ao exportar. |
| `QuoteQuoteCells` | `Boolean` | Adiciona aspas em células que contêm aspas. |
| `RealCol` | `Integer` | Índice real da coluna. |
| `RealRow` | `Integer` | Índice real da linha (independente de filtros/ocultação). |
| `RedrawDisabled` | `Boolean` | Indica que a repintura está desativada via WM_SETREDRAW. |
| `RichEdit` | `Variant` | Rich-edit embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Row` | `Integer` | Índice (1-based) da linha atualmente focada. |
| `RowCount` | `Integer` | Quantidade total de linhas (incluindo fixas). |
| `RowHeaders` | `TStringList` | Textos exibidos nos cabeçalhos das linhas. |
| `RowIndicator` | `Variant` | Indicador visual da linha corrente. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `RowSelectCount` | `Integer` | Quantidade de linhas selecionadas. |
| `SaveColCount` | `Integer` | Total de colunas exportadas. |
| `SaveEndCol` | `Integer` | Coluna final considerada na exportação. |
| `SaveEndRow` | `Integer` | Linha final considerada na exportação. |
| `SaveFixedCells` | `Boolean` | Inclui células fixas ao salvar. |
| `SaveFixedCols` | `Boolean` | Inclui colunas fixas ao salvar. |
| `SaveFixedRows` | `Boolean` | Inclui linhas fixas ao salvar. |
| `SaveHiddenCells` | `Boolean` | Inclui células ocultas ao salvar. |
| `SaveMergedCells` | `Boolean` | Mantém células mescladas ao salvar. |
| `SaveRowCount` | `Integer` | Total de linhas exportadas. |
| `SaveStartCol` | `Integer` | Coluna inicial considerada na exportação. |
| `SaveStartRow` | `Integer` | Linha inicial considerada na exportação. |
| `SaveVirtCells` | `Boolean` | Inclui células virtuais ao salvar. |
| `SaveWithHTML` | `Boolean` | Preserva formatação HTML ao salvar. |
| `SaveWithRTF` | `Boolean` | Preserva formatação RTF ao salvar. |
| `ScaleFactor` | `Single` | Fator de escala DPI aplicado ao controle (1.0 = 96 DPI). |
| `ScrollBarAlways` | [`TScrollBarAlways`](#tscrollbaralways) | Controla a visibilidade das scrollbars (sbAuto, sbAlwaysVisible). |
| `ScrollBars` | [`TScrollStyle`](#tscrollstyle) | Quais scrollbars são exibidas (ssNone, ssHorizontal, ssVertical, ssBoth). |
| `ScrollColor` | `Integer` | Cor das scrollbars (quando customizadas). |
| `ScrollHints` | [`TScrollHintType`](#tscrollhinttype) | Tipo de hint exibido durante scroll. |
| `ScrollProportional` | `Boolean` | Mantém o thumb das scrollbars proporcional à viewport. |
| `ScrollSynch` | `Boolean` | Sincroniza scroll com grids vinculados via SyncGrid. |
| `ScrollType` | [`TScrollType`](#tscrolltype) | Granularidade do scroll (ssLineByLine, ssLineByPage, ssPixel). |
| `ScrollWidth` | `Integer` | Largura das scrollbars customizadas. |
| `SearchCell` | `TPoint` | Posição da última célula encontrada na busca. |
| `SearchFooter` | `Variant` | Sub-objeto do footer de busca. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SearchPanel` | `Variant` | Painel de busca embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SelectedCellsCount` | `Integer` | Quantidade total de células selecionadas. |
| `SelectedColCount` | `Integer` | Total de colunas com pelo menos uma célula selecionada. |
| `SelectedRowCount` | `Integer` | Total de linhas com pelo menos uma célula selecionada. |
| `Selection` | `Variant` | Sub-objeto de configuração da seleção. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SelectionColor` | `Integer` | Cor de fundo das células selecionadas. |
| `SelectionColorMixer` | `Boolean` | Mistura a cor da seleção com a cor original da célula. |
| `SelectionColorMixerFactor` | `Integer` | Intensidade do mixer (0–100). |
| `SelectionColorTo` | `Integer` | Cor final do gradiente da seleção. |
| `SelectionMirrorColor` | `Integer` | Cor de espelhamento da seleção (efeito visual). |
| `SelectionMirrorColorTo` | `Integer` | Cor final do gradiente do mirror. |
| `SelectionRectangle` | `Boolean` | Desenha retângulo de seleção. |
| `SelectionRectangleColor` | `Variant` | Cor do retângulo de seleção. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SelectionResizer` | `Boolean` | Mostra resizer de seleção (estilo Excel). |
| `SelectionRTFKeep` | `Boolean` | Preserva formatação RTF ao copiar células selecionadas. |
| `SelectionStyle` | `Variant` | Estilo visual da seleção. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SelectionTextColor` | `Integer` | Cor do texto nas células selecionadas. |
| `ShowDesignHelper` | `Boolean` | Mostra auxiliares visuais úteis em tempo de design (não impactam runtime). |
| `ShowFocusedSelectionColor` | `Boolean` | Mantém a cor de seleção mesmo quando o grid perde o foco. |
| `ShowModified` | `Variant` | Indica visualmente as linhas modificadas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ShowNullDates` | `Boolean` | Exibe datas nulas em vez de células em branco. |
| `ShowSelection` | `Boolean` | Mostra/oculta o destaque visual da seleção. |
| `SizeGrowOnly` | `Boolean` | Auto-resize só permite crescer, nunca encolher colunas/linhas. |
| `SizeWhileTyping` | `Variant` | Auto-redimensionamento da célula durante digitação. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SizeWithForm` | `Boolean` | Redimensiona o grid junto com o form quando este muda de tamanho. |
| `SortHeader` | `Boolean` | Ativa ordenação ao clicar no cabeçalho da coluna. |
| `SortIndexes` | `Variant` | Índices auxiliares de ordenação. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SortSettings` | `Variant` | Configurações de ordenação. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SpinEdit` | `Variant` | Spin edit embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SpreadSheet` | `Boolean` | Habilita modo planilha (similar ao Excel). |
| `StyleName` | `UnicodeString` | Nome do style VCL aplicado ao controle. |
| `SyncGrid` | `Variant` | Grid vinculado para sincronização de scroll/seleção. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TabOrder` | `Integer` | Posição do controle na ordem de tabulação do parent. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TimePickerDropDown` | `Variant` | Relógio dropdown embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientDownBorder` | `Variant` | Borda do gradiente TMS — pressed. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientDownFrom` | `Variant` | Cor inicial do gradiente TMS — pressed. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientDownMirrorFrom` | `Variant` | Cor inicial do gradiente mirror TMS — pressed. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientDownMirrorTo` | `Variant` | Cor final do gradiente mirror TMS — pressed. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientDownTo` | `Variant` | Cor final do gradiente TMS — pressed. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientFrom` | `Variant` | Cor inicial do gradiente TMS — normal. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientHoverBorder` | `Variant` | Borda do gradiente TMS — hover. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientHoverFrom` | `Variant` | Cor inicial do gradiente TMS — hover. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientHoverMirrorFrom` | `Variant` | Cor inicial do gradiente mirror TMS — hover. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientHoverMirrorTo` | `Variant` | Cor final do gradiente mirror TMS — hover. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientHoverTo` | `Variant` | Cor final do gradiente TMS — hover. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientMirrorFrom` | `Variant` | Cor inicial do gradiente mirror TMS. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientMirrorTo` | `Variant` | Cor final do gradiente mirror TMS. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TMSGradientTo` | `Variant` | Cor final do gradiente TMS — normal. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TopRow` | `Integer` | Índice da primeira linha visível no topo da viewport. |
| `Touch` | `Variant` | Touch manager herdado de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `TrackbarDropDown` | `Variant` | Trackbar dropdown embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `UIStyle` | [`TTMSStyle`](#ttmsstyle) | Estilo TMS aplicado (tsOffice2003Blue, tsWhidbey, etc.). |
| `UndoRedo` | `Variant` | Configurações de Undo/Redo do TAdvStringGrid. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `UniCombo` | `Variant` | ComboBox Unicode embarcado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `URLColor` | `Integer` | Cor dos links HTML em células. |
| `URLEdit` | `Boolean` | Permite editar URLs diretamente na célula. |
| `URLFull` | `Boolean` | Exige URL completa (com protocolo) para ser clicável. |
| `URLShow` | `Boolean` | Renderiza links HTML clicáveis nas células. |
| `URLShowInText` | `Boolean` | Permite URLs embutidas em texto também serem clicáveis. |
| `URLUnderline` | `Boolean` | Sublinha URLs renderizadas. |
| `URLUnderlineOnHover` | `Boolean` | Sublinha URLs apenas quando o mouse passa sobre elas. |
| `UsedCells` | `Variant` | Lista de células usadas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `UseDisabledFont` | `Boolean` | Usa DisabledFontColor quando Enabled=False. |
| `UseFixedFont` | `Boolean` | Usa FixedFont mesmo em células não-fixas (fontes monoespaçadas). |
| `UseHTMLHints` | `Boolean` | Permite que hints contenham marcação HTML. |
| `UseInternalHintClass` | `Boolean` | Usa a classe interna de hint do grid (em vez do hint padrão da VCL). |
| `UseSelectionTextColor` | `Boolean` | Usa SelectionTextColor para pintar o texto selecionado (em vez de manter a cor original). |
| `UseStyleServices` | `Boolean` | Habilita Style Services VCL na pintura do grid. |
| `ValidChars` | `UnicodeString` | Conjunto de caracteres aceitos pelo editor inline. |
| `ValidCharSet` | `Variant` | Set de caracteres aceitos (alternativa a ValidChars). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `VAlignment` | [`TVAlignment`](#tvalignment) | Alinhamento vertical do conteúdo das células (vtaCenter, vtaTop, vtaBottom). |
| `VCLComObject` | `Pointer` | Ponteiro Win32 para o COM object associado ao componente. |
| `Version` | `UnicodeString` | Versão do componente TMS subjacente (string). |
| `VersionNr` | `Integer` | Número de versão (inteiro) do TMS Software subjacente. |
| `VersionString` | `UnicodeString` | Versão (string) do TMS Software subjacente. |
| `VirtualEdit` | `Boolean` | Permite editar em modo virtual sem armazenar dados no grid. |
| `VisibleCol` | `Variant` | Array de visibilidade por coluna. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `VisibleColCount` | `Integer` | Quantidade de colunas visíveis na viewport atual. |
| `VisibleRowCount` | `Integer` | Quantidade de linhas visíveis na viewport atual. |
| `WindowProc` | `Variant` | Procedimento de janela do controle (handler do message pump Windows). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `WordWrap` | `Boolean` | Quebra automática de palavras dentro das células. |
| `XMLEncoding` | `UnicodeString` | Encoding declarado na saída XML. |
| `XYOffset` | `TPoint` | Offset XY (em pixels) aplicado ao conteúdo das células. |
| `XYOffsetTopLeftOnly` | `Boolean` | Aplica XYOffset apenas no canto superior-esquerdo da célula. |
| `XYRTOffset` | `TPoint` | Offset XY usado quando o controle está em modo RightToLeft. |
| `ZoomFactor` | `Integer` | Fator de zoom (em %) aplicado no preview/impressão. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `_GetParent` | [`TWinControl`](#twincontrol) | `()` | Acesso interno ao parent do controle (uso interno Data7). |
| `_SetParent` | `Void` | `(Value As TWinControl)` | Define o parent do controle (uso interno Data7). |
| `AddColumn` | `Void` | `()` | Adiciona uma nova coluna ao final. |
| `AddRow` | `Void` | `()` | Adiciona uma nova linha ao final. |
| `BeginUpdate` | `Void` | `()` | Suspende o redraw para realizar várias alterações em lote. |
| `Clear` | `Void` | `()` | Limpa o conteúdo de todas as células (preserva headers). |
| `ClearAll` | `Void` | `()` | Limpa absolutamente todo o conteúdo do grid. |
| `ClearCols` | `Void` | `(ColIndex As Integer, CCount As Integer)` | Limpa o conteúdo de CCount colunas a partir de ColIndex. |
| `ClearColSelect` | `Void` | `()` | Cancela a seleção de colunas. |
| `ClearModifiedRows` | `Void` | `()` | Reseta o sinal de "modificado" em todas as linhas. |
| `ClearNormalCells` | `Void` | `()` | Limpa o conteúdo das células normais (preserva fixas). |
| `ClearNormalCols` | `Void` | `(ColIndex As Integer, CCount As Integer)` | Limpa apenas as colunas normais (não fixas) em CCount. |
| `ClearNormalRows` | `Void` | `(RowIndex As Integer, RCount As Integer)` | Limpa apenas as linhas normais (não fixas) em RCount. |
| `ClearRect` | `Void` | `(ACol1 As Integer, ARow1 As Integer, ACol2 As Integer, aRow2 As Integer)` | Limpa um retângulo de células (4 coordenadas). |
| `ClearRect` | `Void` | `(ARect As TRect)` | Overload de ClearRect aceitando TRect. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ClearRows` | `Void` | `(RowIndex As Integer, RCount As Integer)` | Limpa o conteúdo de RCount linhas a partir de RowIndex. |
| `ClearRowSelect` | `Void` | `()` | Cancela a seleção de linhas. |
| `ClearSelectedCells` | `Void` | `()` | Limpa o conteúdo das células atualmente selecionadas. |
| `ClearSelection` | `Void` | `()` | Cancela a seleção corrente. |
| `ColorRect` | `Void` | `(ACol1 As Integer, ARow1 As Integer, ACol2 As Integer, aRow2 As Integer, aColor As Integer)` | Pinta um retângulo de células com uma cor. |
| `ColumnAtPosition` | `Integer` | `(ACol As Integer)` | Coluna na posição visual indicada. |
| `ColumnByHeader` | `Integer` | `(AValue As UnicodeString)` | Retorna o índice da coluna cujo header bate com AValue. |
| `ColumnPosition` | `Integer` | `(ACol As Integer)` | Posição visual atual de uma coluna. |
| `DeleteColumn` | `Void` | `(ACol As Longint)` | Exclui uma coluna específica. |
| `DeleteRow` | `Void` | `(ARow As Longint)` | Exclui uma linha específica. |
| `DisplColIndex` | `Integer` | `(ACol As Integer)` | Retorna o índice exibido (display) de uma coluna real. |
| `DisplRowIndex` | `Integer` | `(ARow As Integer)` | Retorna o índice exibido (display) de uma linha real. |
| `EditCell` | `Void` | `(ACol As Integer, ARow As Integer)` | Entra em modo de edição na célula (ACol, ARow). |
| `EndUpdate` | `Void` | `()` | Retoma o redraw após um BeginUpdate. |
| `ExportToCsv` | `Void` | `(FilePath As UnicodeString, delimitador As UnicodeString)` | Exporta o conteúdo do grid para um arquivo CSV. |
| `ExportToExcel` | `Void` | `(FilePath As UnicodeString)` | Exporta o conteúdo do grid para um arquivo Excel. |
| `ExportToJson` | `Void` | `(FilePath As UnicodeString)` | Exporta o conteúdo do grid para um arquivo JSON. |
| `ExportToTxt` | `Void` | `(FilePath As UnicodeString, delimitador As UnicodeString)` | Exporta o conteúdo do grid para um arquivo TXT. |
| `ExportToXml` | `Void` | `(FilePath As UnicodeString)` | Exporta o conteúdo do grid para um arquivo XML. |
| `FocusCell` | `Void` | `(ACol As Integer, ARow As Integer)` | Move o foco para a célula (ACol, ARow) sem editar. |
| `GetCanvas` | `TCanvas` | `()` | Retorna o Canvas do grid para desenho direto. |
| `GetCellColor` | `Integer` | `(ACol As Integer, ARow As Integer)` | Retorna a cor de fundo de uma célula. |
| `GetCelulas` | `String` | `(ACol As Integer, ARow As Integer)` | Atalho Data7 para ler o valor de uma célula. |
| `GetColAlignment` | [`TAlignment`](#talignment) | `(ACol As Integer)` | Retorna o alinhamento de uma coluna. |
| `GetColWidth` | `Integer` | `(ACol As Integer)` | Retorna a largura de uma coluna. |
| `GetEditorLink` | [`GridEditorLink`](#grideditorlink) | `()` | Retorna o GridEditorLink atualmente vinculado ao grid. |
| `GetFontColor` | `Integer` | `(ACol As Integer, ARow As Integer)` | Retorna a cor da fonte de uma célula. |
| `GetFontSize` | `Integer` | `(ACol As Integer, ARow As Integer)` | Retorna o tamanho da fonte de uma célula. |
| `GetRealCol` | `Integer` | `()` | Retorna o índice real da coluna corrente. |
| `GetRealRow` | `Integer` | `()` | Retorna o índice real da linha corrente. |
| `GetRowEx` | `Integer` | `()` | Retorna o índice da linha corrente (extendido). |
| `GetTopRowEx` | `Integer` | `()` | Retorna o índice da TopRow corrente (extendido). |
| `GotoCell` | `Void` | `(ACol As Integer, ARow As Integer)` | Posiciona o cursor na célula (ACol, ARow). |
| `HideColumn` | `Void` | `(Colindex As Integer)` | Oculta uma coluna específica. |
| `HideColumns` | `Void` | `(FromCol As Integer, ToCol As Integer)` | Oculta o intervalo de colunas [FromCol, ToCol]. |
| `HideRow` | `Void` | `(Rowindex As Integer)` | Oculta uma linha específica. |
| `HideRows` | `Void` | `(FromRow As Integer, ToRow As Integer)` | Oculta o intervalo de linhas [FromRow, ToRow]. |
| `HideSelectedRows` | `Void` | `()` | Oculta as linhas atualmente selecionadas. |
| `HideSelection` | `Void` | `()` | Oculta o destaque visual da seleção corrente. |
| `HideUnselectedRows` | `Void` | `()` | Oculta as linhas NÃO selecionadas. |
| `IsHiddenColumn` | `Boolean` | `(Colindex As Integer)` | Indica se uma coluna está oculta. |
| `IsHiddenRow` | `Boolean` | `(Rowindex As Integer)` | Indica se uma linha está oculta. |
| `IsSelectionHidden` | `Boolean` | `()` | Retorna se a seleção está oculta. |
| `LaunchEdit` | `Void` | `(ACol As Integer, ARow As Integer)` | Inicia o editor inline da célula (ACol, ARow). |
| `LoadFromXLS` | `Void` | `(Filename As UnicodeString)` | Carrega o conteúdo de um arquivo XLS para o grid. |
| `ModifiedRowCount` | `Integer` | `()` | Retorna o total de linhas marcadas como modificadas. |
| `MoveColumn` | `Void` | `(FromIndex As Integer, ToIndex As Integer)` | Move uma coluna. |
| `MoveRow` | `Void` | `(FromIndex As Integer, ToIndex As Integer)` | Move uma linha de FromIndex para ToIndex. |
| `MoveRows` | `Void` | `(FromIndex As Integer, ToIndex As Integer, RCount As Integer)` | Move RCount linhas a partir de FromIndex para ToIndex. |
| `NextEdit` | `Void` | `(ACol As Integer, ARow As Integer, AForward As Boolean = True)` | Move o foco de edição para a próxima célula (ou anterior se AForward=False). |
| `RealColIndex` | `Integer` | `(ACol As Integer)` | Retorna o índice real (raw) de uma coluna exibida. |
| `RealRowIndex` | `Integer` | `(ARow As Integer)` | Retorna o índice real (raw) de uma linha exibida. |
| `RemoveCols` | `Void` | `(ColIndex As Integer, CCount As Integer)` | Remove CCount colunas a partir de ColIndex. |
| `RemoveRows` | `Void` | `(RowIndex As Integer, RCount As Integer)` | Remove RCount linhas a partir de RowIndex. |
| `RemoveSelectedRows` | `Void` | `()` | Remove todas as linhas selecionadas. |
| `RemoveUnselectedRows` | `Void` | `()` | Remove todas as linhas NÃO selecionadas. |
| `ScreenToCell` | `Void` | `(pt As TPoint, ByRef ACol As Integer, ByRef ARow As Integer)` | Converte coordenadas de tela em coordenadas (ACol, ARow) de uma célula. |
| `ScrollInView` | `Void` | `(ColIndex As Integer, RowIndex As Integer, pPosiotn As Variant = spMiddle)` | Faz scroll para que a célula (ColIndex, RowIndex) fique visível. |
| `SelectAll` | `Void` | `()` | Seleciona todas as células do grid. |
| `SelectCols` | `Void` | `(ColIndex As Integer, CCount As Integer)` | Seleciona CCount colunas a partir de ColIndex. |
| `SelectRange` | `Void` | `(FromCol As Integer, ToCol As Integer, FromRow As Integer, ToRow As Integer)` | Seleciona o retângulo (FromCol..ToCol) × (FromRow..ToRow). |
| `SelectRows` | `Void` | `(RowIndex As Integer, RCount As Integer)` | Seleciona RCount linhas a partir de RowIndex. |
| `SetCellColor` | `Void` | `(ACol As Integer, ARow As Integer, Value As Integer)` | Define a cor de fundo de uma célula. |
| `SetCelulas` | `Void` | `(ACol As Integer, ARow As Integer, Value As String)` | Atalho Data7 para definir o valor de uma célula (equivalente a Cells[ACol, ARow] = Value). |
| `SetColAlignment` | `Void` | `(ACol As Integer, Value As TAlignment)` | Define o alinhamento de uma coluna. |
| `SetColWidth` | `Void` | `(ACol As Integer, Value As Integer)` | Define a largura de uma coluna. |
| `SetFontColor` | `Void` | `(ACol As Integer, ARow As Integer, Value As Integer)` | Define a cor da fonte de uma célula. |
| `SetFontName` | `Void` | `(ACol As Integer, ARow As Integer, Value As UnicodeString)` | Define o nome da fonte de uma célula. |
| `SetFontSize` | `Void` | `(ACol As Integer, ARow As Integer, Value As Integer)` | Define o tamanho da fonte de uma célula. |
| `SetMergeCells` | `Void` | `(ACol As Integer, ARow As Integer, X As Integer, Y As Integer)` | Mescla um retângulo de células a partir da posição (ACol, ARow). |
| `SetRowEx` | `Void` | `(Value As Integer)` | Define a linha corrente (extendido). |
| `SetRowHeight` | `Void` | `(ARow As Integer, Value As Integer)` | Define a altura de uma linha. |
| `SetTopRowEx` | `Void` | `(Value As Integer)` | Define a TopRow corrente (extendido). |
| `SortedRowIndex` | `Integer` | `(ARow As Integer)` | Converte índice raw em índice após a ordenação corrente. |
| `SortSwapRows` | `Void` | `(ARow1 As Integer, ARow2 As Integer)` | Troca duas linhas de posição mantendo a ordenação corrente. |
| `SwapCells` | `Void` | `(FromCell As Integer, ToCell As Integer)` | Troca duas células de posição. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SwapRows` | `Void` | `(ARow1 As Integer, ARow2 As Integer)` | Troca duas linhas de posição. |
| `TotalColCount` | `Integer` | `()` | Retorna o total de colunas (incluindo ocultas). |
| `TotalRowCount` | `Integer` | `()` | Retorna o total de linhas (incluindo ocultas). |
| `TrimAll` | `Void` | `()` | Faz Trim() em todas as células do grid. |
| `TrimColumn` | `Void` | `(ACol As Integer)` | Faz Trim() em todas as células de uma coluna. |
| `TrimRect` | `Void` | `(ACol1 As Integer, ARow1 As Integer, ACol2 As Integer, ARow2 As Integer)` | Faz Trim() (remove espaços) em todas as células do retângulo. |
| `TrimRow` | `Void` | `(ARow As Integer)` | Faz Trim() em todas as células de uma linha. |
| `UnHideColumn` | `Void` | `(Colindex As Integer)` | Reexibe uma coluna previamente oculta. |
| `UnHideColumns` | `Void` | `(FromCol As Integer, ToCol As Integer)` | Reexibe o intervalo de colunas [FromCol, ToCol]. |
| `UnHideColumnsAll` | `Void` | `()` | Reexibe todas as colunas ocultas. |
| `UnHideRow` | `Void` | `(Rowindex As Integer)` | Reexibe uma linha previamente oculta. |
| `UnHideRows` | `Void` | `(FromRow As Integer, ToRow As Integer)` | Reexibe o intervalo de linhas [FromRow, ToRow]. |
| `UnHideSelection` | `Void` | `()` | Reexibe o destaque visual da seleção corrente. |
| `UnSelectCols` | `Void` | `(ColIndex As Integer, CCount As Integer)` | Cancela a seleção de CCount colunas a partir de ColIndex. |
| `UnSelectRows` | `Void` | `(RowIndex As Integer, RCount As Integer)` | Cancela a seleção de RCount linhas a partir de RowIndex. |
| `UnSortedRowIndex` | `Integer` | `(ARow As Integer)` | Converte índice exibido em índice antes da ordenação. |
| `UpdateEditMode` | `Void` | `()` | Sincroniza o editor inline com o estado corrente. |
| `UpdateFooter` | `Void` | `()` | Repinta o footer (recalculando totais). |
| `UpdateSearchPanel` | `Void` | `()` | Repinta o painel de busca. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnAfterColumnMoved` | `TAfterColumnMoved` | `(Sender As TObject, FromCol As Integer, ToCol As Integer)` | Coluna foi movida (commit). |
| `OnAnchorClick` | `TAnchorClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Anchor As String)` | Clique em âncora HTML dentro de célula. |
| `OnAnchorEnter` | `TAnchorEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Anchor As String)` | Mouse entrou em uma âncora HTML. |
| `OnAnchorExit` | `TAnchorEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Anchor As String)` | Mouse saiu de uma âncora HTML. |
| `OnAnchorHint` | `TAnchorHintEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Anchor As String, ByRef Hint As String)` | Permite fornecer hint customizado para uma âncora HTML. |
| `OnAutoAddRow` | `TAutoAddRowEvent` | `(Sender As TObject, ARow As Integer)` | Linha adicionada automaticamente. |
| `OnAutoAdvance` | `TAutoAdvanceEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef ACanAdvance As Boolean)` | Permite controlar o auto-advance após edição. |
| `OnAutoDeleteRow` | `TAutoDeleteRowEvent` | `(Sender As TObject, ARow As Integer)` | Linha excluída automaticamente. |
| `OnAutoInsertCol` | `TAutoInsertColEvent` | `(Sender As TObject, ACol As Integer)` | Coluna inserida automaticamente. |
| `OnAutoInsertRow` | `TAutoInsertRowEvent` | `(Sender As TObject, ARow As Integer)` | Linha inserida automaticamente. |
| `OnBeforeContractNode` | `TNodeAllowEvent` | `(Sender As TObject, ARow As Integer, ByRef Allow As Boolean)` | Permite vetar a contração de um nó. |
| `OnBeforeEdit` | `TBeforeEditEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AllowEdit As Boolean)` | Disparado antes de iniciar a edição de uma célula. |
| `OnBeforeExpandNode` | `TNodeAllowEvent` | `(Sender As TObject, ARow As Integer, ByRef Allow As Boolean)` | Permite vetar a expansão de um nó. |
| `OnBeforeFilter` | `TNotifyEvent` | `(Sender As TObject)` | Disparado antes de aplicar o filtro corrente. |
| `OnButtonClick` | `TButtonClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Clique em botão embarcado em célula. |
| `OnCanAddCol` | `TCanAddColEvent` | `(Sender As TObject, ACol As Integer, ByRef DoAdd As Boolean)` | Permite vetar a inclusão de coluna. |
| `OnCanAddRow` | `TCanAddRowEvent` | `(Sender As TObject, ARow As Integer, ByRef DoAdd As Boolean)` | Permite vetar a inclusão de linha. |
| `OnCanAddRowEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnCanAddRow. |
| `OnCanClickCell` | `TCanClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Allow As Boolean)` | Permite vetar o clique em uma célula. |
| `OnCanClickCellEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnCanClickCell. |
| `OnCanDeleteRow` | `TCanDeleteRowEvent` | `(Sender As TObject, ARow As Integer, ByRef DoDelete As Boolean)` | Permite vetar a exclusão de uma linha. |
| `OnCanDeleteRowEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnCanDeleteRow. |
| `OnCanDisunctRowSelectDrag` | `TCanDisunctRowSelectDragEvent` | `(Sender As TObject, ARow As Integer, ByRef Allow As Boolean)` | Permite vetar drag em seleção disjunta de linhas. |
| `OnCanEditCell` | `TCanEditCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef CanEdit As Boolean)` | Permite vetar a edição de uma célula. |
| `OnCanEditCellEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnCanEditCell. |
| `OnCanInsertRow` | `TCanInsertRowEvent` | `(Sender As TObject, ARow As Integer, ByRef DoInsert As Boolean)` | Permite vetar a inserção de linha em posição específica. |
| `OnCanInsertRowEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnCanInsertRow. |
| `OnCanShowFixedDropDown` | `TCanShowFixedDropDownEvent` | `(Sender As TObject, ACol As Integer, ByRef AllowShow As Boolean)` | Permite vetar a abertura do dropdown fixo. |
| `OnCanSort` | `TCanSortEvent` | `(Sender As TObject, ACol As Integer, ByRef DoSort As Boolean)` | Permite vetar a ordenação por uma coluna. |
| `OnCellsChanged` | `TCellsChangedEvent` | `(Sender As TObject, ARect As TRect)` | Notifica que um intervalo de células mudou de valor. |
| `OnCellsChangedEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnCellsChanged. |
| `OnCellValidate` | `TCellValidateEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String, ByRef AValid As Boolean)` | Permite validar o valor digitado em uma célula. |
| `OnCellValidateEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnCellValidate. |
| `OnCellValidateWide` | `TCellValidateWideEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String, ByRef AValid As Boolean)` | Versão wide-string de OnCellValidate. |
| `OnChangeScale` | `TChangeScaleEvent` | `(Sender As TObject, M As Integer, D As Integer)` | Mudança de escala (DPI) do controle. |
| `OnCheckBoxCanToggle` | `TCheckBoxCanToggleEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef CanToggle As Boolean)` | Permite vetar o toggle de um checkbox da célula. |
| `OnCheckBoxChange` | `TCheckBoxClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, State As Boolean)` | Mudança no estado de checkbox embarcado. |
| `OnCheckBoxClick` | `TCheckBoxClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, State As Boolean)` | Clique em checkbox embarcado. |
| `OnCheckBoxMouseUp` | `TCheckBoxClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, State As Boolean)` | Mouse up sobre checkbox embarcado. |
| `OnClickCell` | `TClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Clique em célula normal. |
| `OnClickEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnClick. |
| `OnClickSort` | `TClickSortEvent` | `(Sender As TObject, ACol As Integer)` | Clique no header de coluna para ordenar. |
| `OnClipboardAfterPasteCell` | `TAfterCellPasteEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String)` | Disparado após colar célula. |
| `OnClipboardAfterPasteWideCell` | `TAfterCellPasteWideEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String)` | Versão wide-string de OnClipboardAfterPasteCell. |
| `OnClipboardBeforePasteCell` | `TBeforeCellPasteEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AValue As String, ByRef AllowPaste As Boolean)` | Disparado antes de colar célula. |
| `OnClipboardBeforePasteWideCell` | `TBeforeCellPasteWideEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AValue As String, ByRef AllowPaste As Boolean)` | Versão wide-string de OnClipboardBeforePasteCell. |
| `OnClipboardCopy` | `TClipboardEvent` | `(Sender As TObject, ByRef AllowClipboard As Boolean)` | Permite vetar operação de copy do clipboard. |
| `OnClipboardCopyDone` | `TMethod` | `(Sender As TObject)` | Copy do clipboard concluído. |
| `OnClipboardCut` | `TClipboardEvent` | `(Sender As TObject, ByRef AllowClipboard As Boolean)` | Permite vetar operação de cut do clipboard. |
| `OnClipboardCutDone` | `TMethod` | `(Sender As TObject)` | Cut do clipboard concluído. |
| `OnClipboardPaste` | `TClipboardEvent` | `(Sender As TObject, ByRef AllowClipboard As Boolean)` | Permite vetar operação de paste do clipboard. |
| `OnClipboardPasteDone` | `TMethod` | `(Sender As TObject)` | Paste do clipboard concluído. |
| `OnColDisunctSelect` | `TColDisunctSelectEvent` | `(Sender As TObject, ACol As Integer, ByRef Selected As Boolean)` | Permite controlar seleção disjunta por coluna. |
| `OnColDisunctSelected` | `TColDisunctSelectedEvent` | `(Sender As TObject, ACol As Integer)` | Coluna foi adicionada à seleção disjunta. |
| `OnColorSelect` | `TMethod` | `(Sender As TObject)` | Color picker iniciou seleção (placeholder TMethod). |
| `OnColorSelected` | `TMethod` | `(Sender As TObject)` | Cor selecionada no color picker (placeholder TMethod). |
| `OnColumnMove` | `TColumnSizeEvent` | `(Sender As TObject, ACol As Integer, AWidth As Integer)` | Coluna está sendo movida. |
| `OnColumnMoved` | `TMovedEvent` | `(Sender As TObject, FromIndex As Integer, ToIndex As Integer)` | Coluna foi movida via drag — recebe os índices antigo e novo. |
| `OnColumnMoving` | `TColumnSizeEvent` | `(Sender As TObject, ACol As Integer, AWidth As Integer)` | Movimentação contínua da coluna. |
| `OnColumnPopup` | `TMethod` | `(Sender As TObject)` | Popup contextual de coluna (placeholder TMethod). |
| `OnColumnSize` | `TColumnSizeEvent` | `(Sender As TObject, ACol As Integer, AWidth As Integer)` | Largura da coluna foi alterada. |
| `OnColumnSizing` | `TColumnSizingEvent` | `(Sender As TObject, ACol As Integer, AWidth As Integer)` | Largura da coluna está sendo arrastada. |
| `OnComboChange` | `TComboChangeEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AItemIndex As Integer)` | Seleção de combo embarcado mudou. |
| `OnComboCloseUp` | `TClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Combo embarcado fechou. |
| `OnComboDropDown` | `TClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Combo embarcado abriu. |
| `OnComboObjectChange` | `TComboObjectChangeEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AObject As TObject)` | Mudança de combo com objeto associado. |
| `OnContextPopup` | `TContextPopupEvent` | `(Sender As TObject, MousePos As TPoint, ByRef Handled As Boolean)` | Disparado ao invocar popup contextual sobre o grid. |
| `OnContractNode` | `TNodeClickEvent` | `(Sender As TObject, ARow As Integer)` | Nó da árvore foi contraído. |
| `OnControlClick` | `TCellControlEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Clique em controle embarcado na célula. |
| `OnControlComboList` | `TCellComboControlEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AItems As TStringList)` | Permite popular o combo embarcado em célula. |
| `OnControlComboSelect` | `TCellComboControlSelectEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AItemIndex As Integer)` | Seleção feita em combo embarcado em célula. |
| `OnControlEditDone` | `TCellControlEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Edição em controle embarcado terminada. |
| `OnCreatedFloatingFooter` | `TNotifyEvent` | `(Sender As TObject)` | Footer flutuante criado. |
| `OnCreatedSearchFooter` | `TNotifyEvent` | `(Sender As TObject)` | Search footer criado. |
| `OnCustomCellBkgDraw` | `TCustomCellDrawEvent` | `(Sender As TObject, ACanvas As TCanvas, ACol As Integer, ARow As Integer, ARect As TRect)` | Pintura customizada do fundo da célula. |
| `OnCustomCellDraw` | `TCustomCellDrawEvent` | `(Sender As TObject, ACanvas As TCanvas, ACol As Integer, ARow As Integer, ARect As TRect)` | Pintura customizada do conteúdo da célula. |
| `OnCustomCellSize` | `TCustomCellSizeEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AWidth As Integer, ByRef AHeight As Integer)` | Permite definir tamanho customizado de célula. |
| `OnCustomCompare` | `TCustomCompareEvent` | `(Sender As TObject, ACol As Integer, Cell1 As String, Cell2 As String, ByRef Result As Integer)` | Comparador customizado de strings entre células. |
| `OnCustomFilter` | `TCustomFilterEvent` | `(Sender As TObject, ACol As Integer, Value As String, ByRef Accept As Boolean)` | Filtro customizado por coluna. |
| `OnDatePickerCloseUp` | `TClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | DatePicker embarcado fechou. |
| `OnDatePickerDropDown` | `TClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | DatePicker embarcado abriu. |
| `OnDateSpinClick` | `TDateTimeSpinClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Value As TDateTime)` | Clique no spin de data embarcado. |
| `OnDateTimeChange` | `TDateTimeChangeEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Value As TDateTime)` | Mudança de valor em editor de data/hora. |
| `OnDblClickCell` | `TDblClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Duplo-clique em célula. |
| `OnDblClickEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnDblClick. |
| `OnDragDrop` | `TDragDropEvent` | `(Sender As TObject, Source As TObject, X As Integer, Y As Integer)` | Disparado ao soltar um objeto VCL sobre o grid. |
| `OnDragOver` | `TMethod` | `(Sender As TObject)` | Drag-over VCL — placeholder para método genérico. |
| `OnDragScroll` | `TMethod` | `(Sender As TObject)` | Scroll durante drag (placeholder TMethod). |
| `OnDrawCell` | `TDrawCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Rect As TRect, State As TGridDrawState)` | Pintura customizada por célula. |
| `OnDrawCellEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnDrawCell. |
| `OnDropDownFooterButtonClick` | `TDropDownButtonClickEvent` | `(Sender As TObject, ACol As Integer)` | Clique no botão dropdown do footer. |
| `OnDropDownHeaderButtonClick` | `TDropDownButtonClickEvent` | `(Sender As TObject, ACol As Integer)` | Clique no botão dropdown do header. |
| `OnEditCellDone` | `TEditCellDoneEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Edição de célula concluída (commit). |
| `OnEditChange` | `TEditChangeEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String)` | Mudança no texto durante a edição. |
| `OnEditChangeEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnEditChange. |
| `OnEditingDone` | `TNotifyEvent` | `(Sender As TObject)` | Edição corrente terminada. |
| `OnEllipsClick` | `TEllipsClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Clique no botão de elipse (...) do editor inline. |
| `OnEndColumnSize` | `TEndColumnSizeEvent` | `(Sender As TObject, ACol As Integer, AWidth As Integer)` | Fim do redimensionamento da coluna. |
| `OnEndDock` | `TEndDragEvent` | `(Sender As TObject, Target As TObject, X As Integer, Y As Integer)` | Disparado ao terminar uma operação de dock. |
| `OnEndDrag` | `TEndDragEvent` | `(Sender As TObject, Target As TObject, X As Integer, Y As Integer)` | Disparado ao terminar uma operação de drag. |
| `OnEndRowSize` | `TEndRowSizeEvent` | `(Sender As TObject, ARow As Integer, AHeight As Integer)` | Fim do redimensionamento da linha. |
| `OnEnterEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnEnter. |
| `OnEnumerateControl` | `TMethod` | `(Sender As TObject)` | Enumerador de controles embarcados na célula. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `OnExitEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnExit — atribuição via string em vez de delegate. |
| `OnExpandClick` | `TExpandClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Clique no expand/collapse de node. |
| `OnExpandNode` | `TNodeClickEvent` | `(Sender As TObject, ARow As Integer)` | Nó da árvore foi expandido. |
| `OnFileProgress` | `TGridProgressEvent` | `(Sender As TObject, AProgress As Integer)` | Reporta progresso durante load/save de arquivo. |
| `OnFilterDone` | `TNotifyEvent` | `(Sender As TObject)` | Disparado ao concluir a aplicação de um filtro. |
| `OnFilterEditDone` | `TMethod` | `(Sender As TObject)` | Edição em campo de filtro concluída. |
| `OnFilterEditUpdate` | `TMethod` | `(Sender As TObject)` | Atualização em campo de filtro. |
| `OnFilterProgress` | `TGridProgressEvent` | `(Sender As TObject, AProgress As Integer)` | Reporta progresso durante aplicação de filtro. |
| `OnFindNoResult` | `TFindNoResultEvent` | `(Sender As TObject, AValue As String)` | Busca não retornou resultado. |
| `OnFixedCellClick` | `TFixedCellClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Clique em célula fixa (header/footer). |
| `OnFixedDropDownClick` | `TMethod` | `(Sender As TObject)` | Clique no dropdown fixo (placeholder TMethod). |
| `OnFixedEdit` | `TMethod` | `(Sender As TObject)` | Edição em célula fixa (placeholder TMethod). |
| `OnFloatSpinClick` | `TFloatSpinClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Value As Double)` | Clique no float-spin embarcado. |
| `OnFooterCalc` | `TCalcFooterEvent` | `(Sender As TObject, ACol As Integer, ByRef AValue As String)` | Calculadora customizada do footer. |
| `OnFooterPaint` | `TFooterPaintEvent` | `(Sender As TObject, ACanvas As TCanvas, ARect As TRect)` | Pintura customizada do footer. |
| `OnGetAlignment` | `TMethod` | `(Sender As TObject)` | Permite definir alinhamento por célula. |
| `OnGetCellBorder` | `TMethod` | `(Sender As TObject)` | Define borda da célula em runtime. |
| `OnGetCellBorderProp` | `TGridBorderPropEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Define propriedades de borda por célula. |
| `OnGetCellColor` | `TGridColorEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AColor As Integer, ByRef ABrushColor As Integer)` | Permite alterar cor de fundo/texto durante pintura. |
| `OnGetCellCursor` | `TMethod` | `(Sender As TObject)` | Permite alterar o cursor exibido sobre a célula. |
| `OnGetCellGradient` | `TMethod` | `(Sender As TObject)` | Permite definir gradiente customizado por célula. |
| `OnGetCellPrintBorder` | `TMethod` | `(Sender As TObject)` | Define borda da célula durante impressão. |
| `OnGetCellPrintColor` | `TGridColorEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AColor As Integer, ByRef ABrushColor As Integer)` | Define cor da célula durante impressão. |
| `OnGetColumnFilter` | `TGetColumnFilterEvent` | `(Sender As TObject, ACol As Integer, AStrings As TStringList)` | Permite popular a lista de filtro dropdown da coluna. |
| `OnGetDisplText` | `TGetDisplTextEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Value As String)` | Permite reescrever o texto exibido pela célula. |
| `OnGetDisplWideText` | `TGetDisplWideTextEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Value As String)` | Versão wide-string de OnGetDisplText. |
| `OnGetEditMask` | `TGetEditEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Value As String)` | Permite definir uma máscara de edição customizada para a célula corrente. |
| `OnGetEditorProp` | `TGetEditorPropEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Permite ajustar propriedades do editor por célula. |
| `OnGetEditorPropInt` | `TClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Ajuste interno de propriedades do editor (Data7). |
| `OnGetEditorType` | `TGetEditorTypeEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AEditor As TEditorType)` | Permite escolher dinamicamente o tipo de editor da célula. |
| `OnGetEditText` | `TGetEditEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Value As String)` | Permite definir o texto inicial mostrado no editor inline. |
| `OnGetEditTextEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnGetEditText. |
| `OnGetFloatFormat` | `TFloatFormatEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AFormat As String)` | Permite definir o formato de exibição de células numéricas. |
| `OnGetInplaceEditor` | `TGridGetInplaceEditorEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AEditor As TWinControl)` | Permite fornecer um inplace editor customizado para a célula. |
| `OnGetInplaceEditorProperties` | `TGridGetInplaceEditorPropertiesEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Permite ajustar as propriedades do inplace editor por célula. |
| `OnGetWordWrap` | `TWordWrapEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef WordWrap As Boolean)` | Permite definir word-wrap por célula. |
| `OnHasComboBox` | `THasComboEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef HasCombo As Boolean)` | Indica se uma célula deve receber combo. |
| `OnHasEditBtn` | `THasEditBtnEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef HasBtn As Boolean)` | Indica se uma célula deve mostrar botão de edição. |
| `OnHasFilterEdit` | `THasFilterEditEvent` | `(Sender As TObject, ACol As Integer, ByRef HasFilterEdit As Boolean)` | Indica se a coluna deve mostrar campo de filtro. |
| `OnHasSpinEdit` | `THasSpinEditEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef HasSpin As Boolean)` | Indica se uma célula deve receber spin edit. |
| `OnHoverButtonClick` | `TMethod` | `(Sender As TObject)` | Clique em hover button (placeholder TMethod). |
| `OnHoverButtonsShow` | `THoverButtonsShowEvent` | `(Sender As TObject, ARow As Integer, ByRef Show As Boolean)` | Controla a exibição dos hover-buttons por linha. |
| `OnImageSelect` | `TImageSelectEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Image picker iniciou seleção. |
| `OnImageSelected` | `TImageSelectedEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AImageIndex As Integer)` | Imagem selecionada via image picker. |
| `OnIntelliZoom` | `TNotifyEvent` | `(Sender As TObject)` | Mudança de IntelliZoom (Ctrl+wheel). |
| `OnIsFixedCell` | `TIsFixedCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef IsFixed As Boolean)` | Permite tratar uma célula como fixa dinamicamente. |
| `OnIsFixedHoverCell` | `TIsFixedCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef IsFixed As Boolean)` | Permite tratar uma célula fixa como hover dinamicamente. |
| `OnIsPasswordCell` | `TIsPasswordCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef IsPassword As Boolean)` | Permite tratar uma célula como password dinamicamente. |
| `OnKeyPressEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnKeyPress. |
| `OnLoadCell` | `TCellSaveLoadEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AValue As String)` | Deserialização customizada por célula. |
| `OnMarcaDesmarcaLinhaParaExclusao` | `TMarcaDesmarcaLinhaParaExclusaoEvent` | `(Sender As TObject, ARow As Integer, Marcado As Boolean)` | Evento Data7 disparado ao marcar/desmarcar uma linha para exclusão. |
| `OnMouseActivate` | `TMethod` | `(Sender As TObject)` | Disparado quando o controle é ativado por clique do mouse — placeholder TMethod. |
| `OnMouseWheelDown` | `TMouseWheelUpDownEvent` | `(Sender As TObject, Shift As TShiftState, MousePos As TPoint, ByRef Handled As Boolean)` | Roda do mouse para baixo sobre o controle. |
| `OnMouseWheelUp` | `TMouseWheelUpDownEvent` | `(Sender As TObject, Shift As TShiftState, MousePos As TPoint, ByRef Handled As Boolean)` | Roda do mouse para cima sobre o controle. |
| `OnOleDrag` | `TOleDragDropEvent` | `(Sender As TObject, X As Integer, Y As Integer, AData As String)` | Drag OLE em andamento. |
| `OnOleDragOver` | `TOleDragOverEvent` | `(Sender As TObject, X As Integer, Y As Integer, ByRef Accept As Boolean)` | Drag-over OLE com decisão de aceitar/rejeitar. |
| `OnOleDragStart` | `TOleDragStartEvent` | `(Sender As TObject, ByRef Allow As Boolean)` | Início de drag OLE. |
| `OnOleDragStop` | `TOleDragStopEvent` | `(Sender As TObject)` | Fim de drag OLE. |
| `OnOleDrop` | `TOleDragDropEvent` | `(Sender As TObject, X As Integer, Y As Integer, AData As String)` | Drop OLE no controle. |
| `OnOleDropCol` | `TOleDropColEvent` | `(Sender As TObject, ACol As Integer)` | Drop OLE em uma coluna específica. |
| `OnOleDropFile` | `TOleDropFileEvent` | `(Sender As TObject, FileName As String)` | Drop OLE de um arquivo. |
| `OnOleDropFiles` | `TOleDropFilesEvent` | `(Sender As TObject, Files As TStringList)` | Drop OLE de múltiplos arquivos. |
| `OnOleDropped` | `TMethod` | `(Sender As TObject)` | Drop OLE concluído (placeholder TMethod). |
| `OnOleDropURL` | `TOleDropURLEvent` | `(Sender As TObject, URL As String)` | Drop OLE de uma URL. |
| `OnPainted` | `TNotifyEvent` | `(Sender As TObject)` | Disparado após pintura completa do controle. |
| `OnPrintNewPage` | `TGridPrintNewPageEvent` | `(Sender As TObject, PageNo As Integer)` | Disparado a cada nova página do print. |
| `OnPrintSetColumnWidth` | `TGridPrintColumnWidthEvent` | `(Sender As TObject, ACol As Integer, ByRef AWidth As Integer)` | Permite ajustar a largura da coluna durante o print. |
| `OnPrintSetRowHeight` | `TGridPrintRowHeightEvent` | `(Sender As TObject, ARow As Integer, ByRef AHeight As Integer)` | Permite ajustar a altura da linha durante o print. |
| `OnProgressColor` | `TMethod` | `(Sender As TObject)` | Define a cor da barra de progresso (placeholder TMethod). |
| `OnRadioButtonClick` | `TRadioButtonClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AIndex As Integer)` | Clique em radio button embarcado. |
| `OnRadioClick` | `TRadioClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AIndex As Integer)` | Clique em radio embarcado. |
| `OnRadioMouseUp` | `TRadioClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AIndex As Integer)` | Mouse up sobre radio embarcado. |
| `OnRatingChange` | `TRatingChangeEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ARating As Integer)` | Mudança no controle de rating embarcado. |
| `OnRawCompare` | `TRawCompareEvent` | `(Sender As TObject, ACol As Integer, Row1 As Integer, Row2 As Integer, ByRef Result As Integer)` | Comparador customizado por índice de linha. |
| `OnResize` | `TNotifyEvent` | `(Sender As TObject)` | Tamanho do grid mudou. |
| `OnRichEditSelectionChange` | `TNotifyEvent` | `(Sender As TObject)` | Mudança na seleção do RichEdit embarcado. |
| `OnRightClickCell` | `TClickCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Clique com botão direito em célula. |
| `OnRowCountChange` | `TRowCountChangeEvent` | `(Sender As TObject, RowCount As Integer)` | Mudança no número total de linhas. |
| `OnRowDisunctSelect` | `TRowDisunctSelectEvent` | `(Sender As TObject, ARow As Integer, ByRef Selected As Boolean)` | Permite controlar seleção disjunta por linha. |
| `OnRowDisunctSelected` | `TAutoInsertRowEvent` | `(Sender As TObject, ARow As Integer)` | Linha foi adicionada à seleção disjunta. |
| `OnRowMove` | `TRowSizeEvent` | `(Sender As TObject, ARow As Integer, AHeight As Integer)` | Linha está sendo movida. |
| `OnRowMoved` | `TMovedEvent` | `(Sender As TObject, FromIndex As Integer, ToIndex As Integer)` | Linha foi movida via drag — recebe os índices antigo e novo. |
| `OnRowMoving` | `TRowSizeEvent` | `(Sender As TObject, ARow As Integer, AHeight As Integer)` | Movimentação contínua da linha. |
| `OnRowSize` | `TRowSizeEvent` | `(Sender As TObject, ARow As Integer, AHeight As Integer)` | Altura da linha foi alterada. |
| `OnRowSizing` | `TRowSizingEvent` | `(Sender As TObject, ARow As Integer, AHeight As Integer)` | Altura da linha está sendo arrastada. |
| `OnSaveCell` | `TCellSaveLoadEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AValue As String)` | Serialização customizada por célula. |
| `OnScrollCell` | `TScrollCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer)` | Célula focada via scroll. |
| `OnScrollHint` | `TScrollHintEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AHint As String)` | Texto do hint exibido durante scroll. |
| `OnSearchEditChange` | `TSearchEditChangeEvent` | `(Sender As TObject, AValue As String)` | Mudança no texto do search footer. |
| `OnSearchFooterAction` | `TMethod` | `(Sender As TObject)` | Ação do search footer (placeholder TMethod). |
| `OnSearchFooterClose` | `TNotifyEvent` | `(Sender As TObject)` | Fechamento do search footer. |
| `OnSearchFooterSearch` | `TSearchFooterSearchEvent` | `(Sender As TObject, AValue As String, ByRef Found As Boolean)` | Busca incremental no search footer. |
| `OnSearchFooterSearchEnd` | `TSearchFooterSearchEndEvent` | `(Sender As TObject, AValue As String)` | Encerramento da busca no search footer. |
| `OnSelectCell` | `TSelectCellEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, ByRef CanSelect As Boolean)` | Disparado ao selecionar uma célula — permite vetar a seleção. |
| `OnSelectCellEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnSelectCell. |
| `OnSelectionChanged` | `TSelectionChanged` | `(Sender As TObject)` | Mudança na seleção (linha/coluna/célula). |
| `OnSelectionResize` | `TMethod` | `(Sender As TObject)` | Início do resize de uma seleção (placeholder TMethod). |
| `OnSelectionResized` | `TMethod` | `(Sender As TObject)` | Resize de seleção concluído (placeholder TMethod). |
| `OnSetEditText` | `TSetEditEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Value As String)` | Disparado ao gravar o texto digitado pelo editor inline. |
| `OnSetEditTextEvent` | `UnicodeString` | `(...)` | Nome do método (string) chamado no evento OnSetEditText. |
| `OnShowFilterEdit` | `TShowFilterEditEvent` | `(Sender As TObject, ACol As Integer, ByRef AllowShow As Boolean)` | Permite vetar a exibição do filtro de uma coluna. |
| `OnSpinClick` | `TSpinClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Value As Integer)` | Clique no spin embarcado. |
| `OnStartDock` | `TMethod` | `(Sender As TObject)` | Início de operação de dock — placeholder TMethod. |
| `OnStartDrag` | `TMethod` | `(Sender As TObject)` | Início de operação de drag — placeholder TMethod. |
| `OnTimeSpinClick` | `TDateTimeSpinClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, Value As TDateTime)` | Clique no spin de hora embarcado. |
| `OnToggleSwitchClick` | `TCheckBoxClickEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, State As Boolean)` | Clique em toggle switch embarcado. |
| `OnTopLeftChanged` | `TNotifyEvent` | `(Sender As TObject)` | TopRow/LeftCol mudaram (scroll). |
| `OnUnitChanged` | `TUnitChangedEvent` | `(Sender As TObject, ACol As Integer, ARow As Integer, AUnit As String)` | Unidade do editor com unidades mudou. |
| `OnUpdateColumnSize` | `TUpdateColumnSizeEvent` | `(Sender As TObject, ACol As Integer, ByRef AWidth As Integer)` | Permite ajustar a largura final ao terminar resize. |

#### `HComboBox`

**Herda de:** [`TcxCustomTextEdit`](#tcxcustomtextedit)

**Cadeia completa:** [`TcxCustomTextEdit`](#tcxcustomtextedit) → [`TcxCustomEdit`](#tcxcustomedit) → [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Caixa de seleção dropdown (combobox) padrão Data7. Wrapper sobre TcxComboBox.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `CanDropDown` | `Boolean` | Identifica se a lista dropdown pode ser aberta no estado atual do editor. |
| `Items` | `TStringList` | Lista de itens visíveis do combobox (TStrings). Cada string é uma opção exibida. |
| `ListaOpcoes` | `String` | Lista de opções no formato 'codigo:descricao;codigo:descricao;...' — atribuição em massa via string. |
| `PopupWindow` | `Variant` | Acesso à janela popup que exibe a lista de itens do combobox. |
| `SelectedItem` | `String` | Texto do item atualmente selecionado na lista. |
| `ValueList` | `TStringList` | Lista paralela de valores associados a cada item visível (chaves). |
| `ValueSelect` | `String` | Valor (chave) correspondente ao item atualmente selecionado. |

#### `Imagem`

**Herda de:** [`TGraphicControl`](#tgraphiccontrol)

**Cadeia completa:** [`TGraphicControl`](#tgraphiccontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Componente gráfico para exibição de imagens (bitmap, JPEG, PNG, ICO, etc.) e desenhos em tela. Wrapper sobre TImage do Delphi — sem janela própria, renderiza no Canvas do pai.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Canvas` | `TCanvas` | Superfície de desenho do componente gráfico. |
| `Center` | `Boolean` | Se a imagem é centralizada quando ela é menor que o controle. |
| `IncrementalDisplay` | `Boolean` | Se a imagem é renderizada incrementalmente durante o carregamento (útil para imagens grandes). |
| `Picture` | `Variant` | Imagem exibida pelo controle (TPicture). |
| `Proportional` | `Boolean` | Se a imagem mantém a proporção quando redimensionada (com Stretch ativo). |
| `Stretch` | `Boolean` | Se a imagem é redimensionada para preencher o controle. |
| `Transparent` | `Boolean` | Se o fundo da imagem é renderizado de forma transparente. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnProgress` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre periodicamente durante operações lentas que afetam a imagem (carregamento/conversão). |

#### `MemoTextBox`

**Herda de:** [`TcxCustomTextEdit`](#tcxcustomtextedit)

**Cadeia completa:** [`TcxCustomTextEdit`](#tcxcustomtextedit) → [`TcxCustomEdit`](#tcxcustomedit) → [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Caixa de texto multilinha do Data7 (TMemoEditor). Wrapper sobre TcxMemo.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Lines` | `TStringList` | Lista de linhas do memo (TStrings). Cada item corresponde a uma linha textual. |
| `ScrollBars` | `Integer` | Quais barras de rolagem exibir (ssNone, ssHorizontal, ssVertical, ssBoth). |
| `WantReturns` | `Boolean` | Se ENTER insere quebra de linha no memo (True) ou é roteado para o form (False). |
| `WantTabs` | `Boolean` | Se TAB insere caractere de tabulação no memo (True) ou avança o foco (False). |
| `WordWrap` | `Boolean` | Se linhas longas quebram automaticamente no fim da área visível. |

#### `MessageBox`

Classe de exibição de mensagens.

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Confirmation` | `Boolean` | `(pMessage As String)` | Exibe uma caixa de confirmação (Sim/Não). Retorna True se o usuário escolheu Sim. |
| `Show` | `Integer` | `(pMessage As String)` | Exibe uma caixa de diálogo informativa com a mensagem informada. |

#### `ProgressBar`

**Herda de:** [`TWinControl`](#twincontrol)

**Cadeia completa:** [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Barra de progresso nativa do Windows. Exibe o avanço de uma operação entre Min e Max. Wrapper sobre TProgressBar (Vcl.ComCtrls).

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `BackgroundColor` | `Integer` | Cor de fundo da barra de progresso. |
| `BarColor` | `Integer` | Cor da parte preenchida (highlight) da barra de progresso. |
| `MarqueeInterval` | `Integer` | Tempo em milissegundos entre updates da animação marquee. |
| `Max` | `Integer` | Limite superior do intervalo de posições possíveis. |
| `Min` | `Integer` | Limite inferior do intervalo de posições possíveis. |
| `Orientation` | `Integer` | Se a barra é horizontal (pbHorizontal) ou vertical (pbVertical). |
| `Position` | `Integer` | Posição atual da barra de progresso (entre Min e Max). |
| `Smooth` | `Boolean` | Se a barra é renderizada de forma contínua (True) ou segmentada/blocos (False). |
| `SmoothReverse` | `Boolean` | Se permite mostrar o decréscimo de progresso de forma suave. |
| `State` | `Integer` | Estado atual: pbsNormal (verde), pbsError (vermelho) ou pbsPaused (amarelo). |
| `Step` | `Integer` | Quantidade pela qual Position é incrementada quando StepIt é chamado. |
| `Style` | `Integer` | Como o progresso é ilustrado (pbstNormal — barra padrão, pbstMarquee — animação contínua). |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `StepBy` | `Void` | `(Delta As Integer)` | Avança Position em uma quantidade específica (delta). |
| `StepIt` | `Void` | `()` | Avança Position pela quantidade especificada em Step. |

#### `SearchTextBox`

**Herda de:** [`TcxCustomTextEdit`](#tcxcustomtextedit)

**Cadeia completa:** [`TcxCustomTextEdit`](#tcxcustomtextedit) → [`TcxCustomEdit`](#tcxcustomedit) → [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Caixa de texto com botão lateral para pesquisa padrão Data7 (TPesquisaEditor). Wrapper sobre TcxButtonEdit.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `AsInteger` | `Integer` | Valor selecionado como Integer. |
| `AsString` | `String` | Valor selecionado como String (geralmente o código do registro). |
| `CodPesquisa` | `Integer` | Código da pesquisa padrão Data7 vinculada a este editor (referência à PesquisaPadrao da Data7 API). |
| `EditorDescricao` | [`TextBox`](#textbox) | Editor de texto auxiliar que exibe a descrição do registro selecionado pela pesquisa. |

#### `StaticText`

**Herda de:** [`TWinControl`](#twincontrol)

**Cadeia completa:** [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Componente que exibe um texto estático ou rótulo (Label).

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Alignment` | [`TAlignment`](#talignment) | Alinhamento horizontal do texto. |
| `AutoSize` | `Boolean` | Determina se o componente redimensiona automaticamente de acordo com o texto. |
| `Caption` | `String` | Texto exibido no componente. |
| `WordWrap` | `Boolean` | Especifica se o texto deve quebrar linhas caso ultrapasse a largura do controle. |

#### `TabSheet`

**Herda de:** [`TCustomControl`](#tcustomcontrol)

**Cadeia completa:** [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Página/aba individual dentro de um PageControl. Wrapper sobre TRzTabSheet/TTabSheet (Vcl.ComCtrls).

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Caption` | `String` | Texto exibido no rótulo da aba. |
| `Highlighted` | `Boolean` | Indica se a aba aparece destacada visualmente. |
| `ImageIndex` | `Integer` | Índice da imagem exibida na aba (referenciando o ImageList do PageControl). |
| `PageControl` | [`PageControl`](#pagecontrol) | Referência ao PageControl que contém esta aba. |
| `PageIndex` | `Integer` | Índice da aba na lista de todas as abas mantida pelo PageControl. |
| `TabIndex` | `Integer` | Posição da aba no conjunto de abas visíveis do PageControl (TPageControl). |
| `TabVisible` | `Boolean` | Se a aba aparece (ou está oculta) no PageControl. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnHide` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando a propriedade TabVisible muda para False. |
| `OnShow` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando a propriedade TabVisible muda para True. |

#### `TBoundLabel`

**Herda de:** [`TWinControl`](#twincontrol)

**Cadeia completa:** [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Rótulo associado a um controle de edição (TLabeledEdit).

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Caption` | `String` | Texto exibido no rótulo. |

#### `TButtonControl`

**Herda de:** [`TWinControl`](#twincontrol)

**Cadeia completa:** [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Classe base dos botões nativos do Windows (consolidando TButtonControl + TCustomButton + TButton + TBotao do Data7). Introduz comportamento de clique, foco com TAB, atalhos via acelerador (&), botões default/cancel, ícones e estilos.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Cancel` | `Boolean` | Se o OnClick do botão é executado quando a tecla Escape é pressionada. |
| `Caption` | `String` | Texto exibido no botão. Use & para acelerador (ex: "&Ok"). |
| `CommandLinkHint` | `String` | Texto exibido como hint abaixo do caption (Command Link). |
| `Default` | `Boolean` | Se o OnClick do botão é executado quando a tecla Enter é pressionada. |
| `DisabledImageIndex` | `Integer` | Índice da imagem usada no estado desabilitado. |
| `DropDownMenu` | `Variant` | Menu drop-down do split button. |
| `ElevationRequired` | `Boolean` | Coloca o ícone de escudo no botão, indicando que é necessária elevação UAC. |
| `HotImageIndex` | `Integer` | Índice da imagem usada no estado hot (hover). |
| `ImageAlignment` | `Integer` | Alinhamento da imagem no botão. |
| `ImageIndex` | `Integer` | Índice da imagem usada no estado normal. |
| `ImageMargins` | [`TMargins`](#tmargins) | Margens da imagem no botão. |
| `Images` | `Variant` | Lista de imagens (ImageList) usada pelo botão. |
| `ModalResult` | `Integer` | Determina como o botão fecha seu formulário pai (mrOk, mrCancel, mrYes, mrNo, etc.). |
| `PressedImageIndex` | `Integer` | Índice da imagem usada no estado pressionado. |
| `SelectedImageIndex` | `Integer` | Índice da imagem usada no estado selecionado. |
| `Style` | `Integer` | Estilo do botão (bsPushButton, bsCommandLink, bsSplitButton). |
| `StylusHotImageIndex` | `Integer` | Índice da imagem usada no estado hot via stylus (caneta touch). |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Click` | `Void` | `()` | Simula um clique do mouse, como se o usuário tivesse clicado no botão. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnClick` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o usuário clica no botão. |
| `OnDropDownClick` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando a parte da seta para baixo de um split button (estilo Vista+) é clicada. |

#### `TComponent`

**Herda de:** `TPersistent`

**Cadeia completa:** `TPersistent` → `TObject` → `System.Classes.TObject`

Ancestral comum de todos os componentes Delphi (visuais e não visuais). Introduz integração com a IDE, sistema de ownership, streaming/persistência e suporte a COM.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `ComponentCount` | `Integer` | Quantidade de componentes que este componente possui (é dono). |
| `ComponentIndex` | `Integer` | Posição do componente no array Components do seu Owner. |
| `Components` | [`TComponent`](#tcomponent) | Lista todos os componentes de propriedade (owned) deste componente. |
| `ComponentState` | `Integer` | Estado atual do componente — indica quando o componente deve evitar certas ações (carregando, destruindo, etc.). |
| `ComponentStyle` | `Integer` | Governa o comportamento do componente (csInheritable, csCheckPropAvail, csSubComponent, csTransient, etc.). |
| `DesignInfo` | `Integer` | Informações usadas pelo Form Designer (posição na palette/grid). |
| `Name` | `String` | Nome do componente como ele é referenciado em código. |
| `Observers` | `TObject` | Indica o objeto TObservers anexado ao componente (padrão Observer). |
| `Owner` | [`TComponent`](#tcomponent) | Componente responsável por liberar este componente da memória (streaming + ownership). |
| `Tag` | `Integer` | Valor inteiro de uso geral, armazenado junto ao componente para conveniência do desenvolvedor. |
| `VCLComObject` | `Pointer` | Ponteiro para a instância COM/VCL associada ao componente (usado por servidores Automation). |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `BeforeDestruction` | `Void` | `()` | Executa ações necessárias antes do primeiro destrutor ser chamado. |
| `BeginInvoke` | `Variant` | `()` | Chamada assíncrona do método especificado por AProc ou AFunc. |
| `Create` | [`TComponent`](#tcomponent) | `(AOwner As TComponent)` | Aloca memória e constrói uma instância de componente inicializada com segurança. |
| `Destroy` | `Void` | `()` | Destrói o componente e seus componentes de propriedade (owned). |
| `DestroyComponents` | `Void` | `()` | Destrói todos os componentes de propriedade (owned). |
| `Destroying` | `Void` | `()` | Indica que o componente e seus owned estão prestes a serem destruídos. |
| `EndFunctionInvoke` | `Variant` | `()` | Bloqueia o chamador até que o ASyncResult especificado seja concluído. |
| `EndInvoke` | `Void` | `()` | Bloqueia o chamador até que o ASyncResult especificado seja concluído. |
| `ExecuteAction` | `Boolean` | `(Action As TObject)` | Executa uma Action associada ao componente. |
| `FindComponent` | [`TComponent`](#tcomponent) | `(AName As String)` | Indica se um componente específico é de propriedade deste componente. |
| `FreeNotification` | `Void` | `(AComponent As TComponent)` | Garante que AComponent será notificado quando este componente for destruído. |
| `FreeOnRelease` | `Void` | `()` | Libera a referência de interface para componentes criados a partir de classes COM. |
| `GetEnumerator` | `TObject` | `()` | Retorna um enumerador sobre os Components do componente. |
| `GetNamePath` | `String` | `()` | Retorna a string usada pelo Object Inspector para representar o componente. |
| `GetParentComponent` | [`TComponent`](#tcomponent) | `()` | Retorna o componente que contém este componente (parent). |
| `HasParent` | `Boolean` | `()` | Verifica se o componente possui um parent. |
| `InsertComponent` | `Void` | `(AComponent As TComponent)` | Estabelece este componente como o owner do componente especificado. |
| `IsImplementorOf` | `Boolean` | `(I As Variant)` | Indica se o componente implementa uma interface especificada. |
| `ReferenceInterface` | `Boolean` | `()` | Estabelece ou remove links internos que fazem este componente ser notificado quando o implementador de uma interface for destruído. |
| `RemoveComponent` | `Void` | `(AComponent As TComponent)` | Remove o componente especificado da lista Components. |
| `RemoveFreeNotification` | `Void` | `(AComponent As TComponent)` | Desativa a notificação de destruição registrada por FreeNotification. |
| `SafeCallException` | `Integer` | `()` | Trata exceções em métodos declarados com a convenção de chamada safecall. |
| `SetSubComponent` | `Void` | `(IsSubComponent As Boolean)` | Identifica se o componente é um subcomponente. |
| `UpdateAction` | `Boolean` | `(Action As TObject)` | Atualiza o estado de uma Action. |

#### `TControl`

**Herda de:** [`TComponent`](#tcomponent)

**Cadeia completa:** [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Classe base de todo controle visual da VCL Delphi. Define posição, dimensão, alinhamento, visibilidade, fonte, ancoramento, hint e eventos de mouse/teclado/toque.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Align` | [`TAlign`](#talign) | Como o controle se alinha dentro de seu container (parent control). |
| `AlignWithMargins` | `Boolean` | Se o controle deve ser restringido pelas suas margens. |
| `Anchors` | `Integer` | Como o controle se ancora ao seu parent (akLeft, akTop, akRight, akBottom). |
| `BiDiMode` | `Integer` | Modo bidirecional do controle (suporte a idiomas RTL). |
| `BoundsRect` | `Variant` | Retângulo de limites do controle, no sistema de coordenadas do parent. |
| `ClientHeight` | `Integer` | Altura da área de cliente do controle em pixels. |
| `ClientOrigin` | `Variant` | Coordenadas de tela (em pixels) do canto superior esquerdo da área de cliente. |
| `ClientRect` | `Variant` | Retângulo da área de cliente do controle em pixels. |
| `ClientWidth` | `Integer` | Largura da área de cliente do controle em pixels. |
| `Constraints` | `Variant` | Restrições de tamanho (mínimo/máximo) do controle. |
| `ControlState` | `Integer` | Estado atual de um controle em tempo de execução. |
| `ControlStyle` | `Integer` | Características de estilo do controle. |
| `Cursor` | `Integer` | Imagem usada para representar o ponteiro do mouse quando ele está sobre o controle. |
| `CustomHint` | `Variant` | Hint personalizado do controle. |
| `DockOrientation` | `Integer` | Como o controle é encaixado em relação a outros controles no mesmo parent. |
| `Enabled` | `Boolean` | Controla se o controle responde a eventos de mouse, teclado e timer. |
| `ExplicitHeight` | `Integer` | Altura vertical explícita do controle em pixels. |
| `ExplicitLeft` | `Integer` | Coordenada horizontal explícita da borda esquerda do componente relativo ao parent. |
| `ExplicitTop` | `Integer` | Coordenada vertical explícita da borda superior do componente relativo ao parent. |
| `ExplicitWidth` | `Integer` | Largura horizontal explícita do controle em pixels. |
| `Floating` | `Boolean` | Indica se o controle está flutuando. |
| `FloatingDockSiteClass` | `Variant` | Classe do controle temporário que hospeda o controle quando ele está flutuando. |
| `Height` | `Integer` | Tamanho vertical do controle em pixels. |
| `HelpContext` | `Integer` | Identificador numérico do tópico de Help para o controle. |
| `HelpKeyword` | `String` | Palavra-chave que identifica o tópico de Help para o controle. |
| `HelpType` | `Integer` | Se o Help context-sensitive é identificado por contexto ou por palavra-chave. |
| `Hint` | `String` | Texto exibido quando o usuário move o mouse sobre o controle. |
| `HostDockSite` | [`TWinControl`](#twincontrol) | Controle no qual este controle está encaixado. |
| `Left` | `Integer` | Coordenada horizontal da borda esquerda do componente relativo ao parent. |
| `LRDockWidth` | `Integer` | Largura do controle quando ele está encaixado horizontalmente. |
| `Margins` | [`TMargins`](#tmargins) | Margens do controle. |
| `Parent` | [`TWinControl`](#twincontrol) | Parent do controle. |
| `ParentCustomHint` | `Boolean` | Onde o controle busca seu hint personalizado. |
| `ShowHint` | `Boolean` | Se exibe o Help Hint quando o mouse passa sobre o controle. |
| `StyleElements` | `Integer` | Elementos de estilo usados pelo controle. |
| `TBDockHeight` | `Integer` | Altura do controle quando ele está encaixado verticalmente. |
| `Top` | `Integer` | Coordenada Y do canto superior esquerdo do controle, relativa ao parent. |
| `Touch` | `Variant` | Componente touch manager associado ao controle. |
| `UndockHeight` | `Integer` | Altura do controle quando ele está flutuando. |
| `UndockWidth` | `Integer` | Largura do controle quando ele está flutuando. |
| `Visible` | `Boolean` | Se o componente aparece na tela. |
| `Width` | `Integer` | Tamanho horizontal do controle ou formulário em pixels. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `BeginDrag` | `Void` | `(Immediate As Boolean)` | Inicia o arrasto do controle. |
| `BringToFront` | `Void` | `()` | Coloca o controle na frente de todos os outros controles no seu parent. |
| `ClientToParent` | `Variant` | `()` | Converte coordenadas client em coordenadas parent. |
| `ClientToScreen` | `Variant` | `()` | Converte um ponto de coordenadas client em coordenadas globais de tela. |
| `Dock` | `Void` | `()` | Uso interno para encaixar o controle. |
| `Dragging` | `Boolean` | `()` | Indica se o controle está sendo arrastado. |
| `EndDrag` | `Void` | `(Drop As Boolean)` | Encerra o arrasto do controle. |
| `GetControlsAlignment` | [`TAlignment`](#talignment) | `()` | Indica como o texto é alinhado dentro do controle. |
| `GetTextBuf` | `Integer` | `(ByRef Buffer As String, BufSize As Integer)` | Recupera o texto do controle em um buffer e retorna a quantidade de caracteres copiados. |
| `GetTextLen` | `Integer` | `()` | Retorna o comprimento do texto do controle. |
| `Hide` | `Void` | `()` | Torna o controle invisível. |
| `InitiateAction` | `Void` | `()` | Chama o método Update do action link, se o controle estiver associado a um action link. |
| `Invalidate` | `Void` | `()` | Repinta completamente o controle. |
| `IsRightToLeft` | `Boolean` | `()` | Indica se o controle deve ser invertido da direita para a esquerda. |
| `ManualDock` | `Boolean` | `()` | Encaixa o controle. |
| `ManualFloat` | `Boolean` | `()` | Desencaixa o controle, deixando-o flutuante. |
| `Perform` | `Integer` | `(Msg As Integer, WParam As Integer, LParam As Integer)` | Responde como se o controle tivesse recebido uma mensagem Windows específica. |
| `Refresh` | `Void` | `()` | Repinta o controle na tela. |
| `Repaint` | `Void` | `()` | Força o controle a repintar sua imagem na tela. |
| `ScaleForPPI` | `Void` | `(NewPPI As Integer)` | Ajusta a escala do controle para o PPI (Pixels Per Inch) especificado. |
| `ScreenToClient` | `Variant` | `()` | Converte coordenadas de tela para coordenadas client. |
| `SendToBack` | `Void` | `()` | Coloca o controle atrás de todos os outros controles. |
| `SetBounds` | `Void` | `(ALeft As Integer, ATop As Integer, AWidth As Integer, AHeight As Integer)` | Define Left, Top, Width e Height de uma só vez. |
| `SetTextBuf` | `Void` | `(Buffer As String)` | Define o texto do controle. |
| `Show` | `Void` | `()` | Torna o controle visível. |
| `Update` | `Void` | `()` | Processa imediatamente todas as mensagens de pintura pendentes. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnAlignInsertBefore` | `TAlignInsertBeforeEvent` | `(...)` | Determina a ordem entre dois controles ao usar Align. |
| `OnAlignPosition` | `TMethod` | `(Sender As TObject)` | Permite customizar a posição final do controle durante o alinhamento. |
| `OnCanResize` | `TCanResizeEvent` | `(...)` | Disparado antes do redimensionamento para autorizar a operação. |
| `OnClick` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o usuário clica no controle. |
| `OnConstrainedResize` | `TConstrainedResizeEvent` | `(...)` | Disparado para limitar dinamicamente as dimensões durante o redimensionamento. |
| `OnContextPopup` | `TContextPopupEvent` | `(Sender As TObject, MousePos As TPoint, ByRef Handled As Boolean)` | Disparado antes da exibição do menu popup de contexto. |
| `OnDblClick` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o usuário dá um duplo-clique no controle. |
| `OnDockDrop` | `TMethod` | `(Sender As TObject)` | Ocorre quando um cliente é docked neste controle. |
| `OnDockOver` | `TMethod` | `(Sender As TObject)` | Ocorre enquanto um cliente está sendo arrastado para docking neste controle. |
| `OnDragDrop` | `TDragDropEvent` | `(Sender As TObject, Source As TObject, X As Integer, Y As Integer)` | Ocorre quando o usuário solta um objeto sendo arrastado sobre o controle. |
| `OnDragOver` | `TMethod` | `(Sender As TObject)` | Ocorre quando um objeto está sendo arrastado sobre o controle. |
| `OnEndDock` | `TEndDragEvent` | `(Sender As TObject, Target As TObject, X As Integer, Y As Integer)` | Ocorre quando o docking termina (sucesso ou cancelamento). |
| `OnEnter` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o controle recebe o foco de entrada. |
| `OnExit` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o controle perde o foco de entrada. |
| `OnGesture` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o usuário executa um gesto associado a este controle. |
| `OnGetSiteInfo` | `TGetSiteInfoEvent` | `(...)` | Permite informar dimensões/aceitação ao avaliar este controle como dock site. |
| `OnHelp` | `TMethod` | `(Sender As TObject)` | Disparado quando o usuário solicita ajuda contextual sobre o controle. |
| `OnMouseActivate` | `TMethod` | `(Sender As TObject)` | Ocorre quando o controle é ativado por clique do mouse. |
| `OnMouseDown` | `TMouseEvent` | `(Sender As TObject, Button As TMouseButton, Shift As TShiftState, X As Integer, Y As Integer)` | Ocorre quando o usuário pressiona um botão do mouse sobre o controle. |
| `OnMouseEnter` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o ponteiro do mouse entra na área do controle. |
| `OnMouseLeave` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o ponteiro do mouse sai da área do controle. |
| `OnMouseMove` | `TMouseEvent` | `(Sender As TObject, Button As TMouseButton, Shift As TShiftState, X As Integer, Y As Integer)` | Ocorre quando o usuário move o mouse sobre o controle. |
| `OnMouseUp` | `TMouseEvent` | `(Sender As TObject, Button As TMouseButton, Shift As TShiftState, X As Integer, Y As Integer)` | Ocorre quando o usuário solta um botão do mouse sobre o controle. |
| `OnShortCut` | `TMethod` | `(Sender As TObject)` | Disparado quando uma combinação de teclas (atalho) é pressionada. |
| `OnStartDock` | `TMethod` | `(Sender As TObject)` | Ocorre quando o usuário inicia o docking do controle. |
| `OnUnDock` | `TUnDockEvent` | `(...)` | Ocorre quando um controle filho deixa de estar docked. |

#### `TCustomButtonedEdit`

**Herda de:** [`TCustomEdit`](#tcustomedit)

**Cadeia completa:** [`TCustomEdit`](#tcustomedit) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Classe ancestral VCL (`Vcl.ExtCtrls.TCustomButtonedEdit`) de edits com botões embutidos. Adiciona LeftButton e RightButton (TEditButton) sobre TCustomEdit. Base de TButtonedEdit.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Images` | `Variant` | ImageList que fornece os ícones para LeftButton e RightButton. Cada botão referencia via ImageIndex. |
| `LeftButton` | `Variant` | Botão embutido à esquerda do texto (TEditButton). Configurável via ImageIndex, HotImageIndex, PressedImageIndex, DisabledImageIndex, Hint, Visible, Enabled. |
| `RightButton` | `Variant` | Botão embutido à direita do texto (TEditButton). Configurável via ImageIndex, HotImageIndex, PressedImageIndex, DisabledImageIndex, Hint, Visible, Enabled. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnLeftButtonClick` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o usuário clica no botão esquerdo (LeftButton). |
| `OnRightButtonClick` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o usuário clica no botão direito (RightButton). |

#### `TCustomControl`

**Herda de:** [`TWinControl`](#twincontrol)

**Cadeia completa:** [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Variante de TWinControl que combina janela nativa do Windows com superfície de desenho via Canvas. Base de controles complexos customizados (Panel, Grid, controles cx*).

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Canvas` | `TCanvas` | Superfície de desenho do controle, expondo a API Canvas para pintar diretamente. |

#### `TCustomEdit`

**Herda de:** [`TWinControl`](#twincontrol)

**Cadeia completa:** [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Classe base VCL (`Vcl.StdCtrls.TCustomEdit`) de todos os controles de edição textual nativos do Windows — TEdit, TMaskEdit, TMemo, TButtonedEdit, etc. Adiciona Text, ReadOnly, MaxLength, seleção e operações de clipboard sobre TWinControl.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Alignment` | [`TAlignment`](#talignment) | Alinhamento horizontal do texto dentro do edit. |
| `AutoSelect` | `Boolean` | Se todo o texto é selecionado automaticamente quando o controle recebe foco. |
| `AutoSize` | `Boolean` | Se a altura do controle se ajusta automaticamente para acomodar a fonte. |
| `BorderStyle` | [`TBorderStyle`](#tborderstyle) | Se o edit tem borda (bsSingle) ou não (bsNone). |
| `CanUndo` | `Boolean` | Indica se há alterações que podem ser desfeitas (Undo). |
| `CharCase` | `Integer` | Caixa do texto (ecNormal=0, ecUpperCase=1, ecLowerCase=2). |
| `MaxLength` | `Integer` | Número máximo de caracteres permitidos (0 = sem limite). |
| `Modified` | `Boolean` | Indica se o conteúdo foi modificado pelo usuário desde a última atribuição/save (dirty flag). |
| `NumbersOnly` | `Boolean` | Se o edit aceita apenas caracteres numéricos. |
| `OEMConvert` | `Boolean` | Se o texto é convertido entre ANSI e OEM ao perder o foco (compatibilidade com DOS). |
| `ParentColor` | `Boolean` | Se o edit usa a cor de fundo do parent. |
| `PasswordChar` | `String` | Caractere usado para mascarar a digitação (ex: '*' para campos de senha). |
| `ReadOnly` | `Boolean` | Se o edit é somente leitura — usuário pode selecionar/copiar mas não modificar. |
| `SelLength` | `Integer` | Comprimento da seleção em caracteres. |
| `SelStart` | `Integer` | Posição inicial (caractere) da seleção. |
| `SelText` | `String` | Texto atualmente selecionado. |
| `Text` | `String` | Texto exibido e editado no controle. |
| `TextHint` | `String` | Texto exibido como placeholder quando o controle está vazio. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Clear` | `Void` | `()` | Apaga todo o texto do edit. |
| `ClearSelection` | `Void` | `()` | Remove a porção selecionada do texto. |
| `ClearUndo` | `Void` | `()` | Limpa o histórico de Undo. |
| `CopyToClipboard` | `Void` | `()` | Copia a seleção atual para a área de transferência. |
| `CutToClipboard` | `Void` | `()` | Recorta a seleção atual para a área de transferência. |
| `PasteFromClipboard` | `Void` | `()` | Cola o conteúdo da área de transferência na posição atual do cursor. |
| `SelectAll` | `Void` | `()` | Seleciona todo o texto do edit. |
| `Undo` | `Void` | `()` | Desfaz a última alteração no texto. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnChange` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o texto do edit muda (depois de cada caractere digitado ou atribuição via Text). |

#### `TcxCustomEdit`

**Herda de:** [`TCustomControl`](#tcustomcontrol)

**Cadeia completa:** [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Base da família DevExpress (cx*) de editores. Toda a família ExpressEditors herda TcxCustomEdit que implementa funcionalidade base de editor — estilos, repository items, validação, eventos de edição e operações de clipboard.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `ActiveProperties` | `Variant` | Acesso às configurações atuais do editor, independente da origem (read-only). |
| `Ajuda` | `String` | Texto de ajuda (help-id) padrão Data7 associado ao editor. Exibido em popups de F1/contextuais. |
| `AutoSize` | `Boolean` | Se o editor redimensiona automaticamente para acomodar o conteúdo. |
| `CanModify` | `Boolean` | Identifica se o editor está em modo somente leitura. |
| `CanPostEditValue` | `Boolean` | Identifica se o editor data-aware pode persistir o valor no dataset vinculado. |
| `CanSmartPaste` | `Boolean` | Identifica se o editor suporta operações de Smart Paste (AI-powered). |
| `DataBinding` | `Variant` | Permite vincular o editor a uma fonte de dados. |
| `EditModified` | `Boolean` | Indica se o conteúdo do editor foi modificado pelo usuário desde a última atribuição/post (dirty flag). Atribua False para resetar. |
| `EditValue` | `Variant` | Valor de edição do componente (independente do tipo de display). |
| `IsEditValidating` | `Boolean` | Indica se o editor está em processo de validação. |
| `IsFocused` | `Boolean` | Identifica se o editor (ou um de seus subcomponentes internos) está com o foco. |
| `IsHiding` | `Boolean` | Indica se o editor está sendo ocultado. |
| `IsPosting` | `Boolean` | Indica se o editor está persistindo seu valor para o dataset vinculado. |
| `Properties` | `Variant` | Configurações específicas do editor (quando não há RepositoryItem atribuído). |
| `ReadOnly` | `Boolean` | Se o editor é somente leitura — usuário pode focar/copiar mas não modificar o valor. |
| `RepositoryItem` | `Variant` | Repository item externo (TcxEditRepositoryItem) como fonte de configurações. Tem prioridade sobre Properties. |
| `Style` | `Variant` | Configurações de aparência do editor no estado normal. |
| `StyleDisabled` | `Variant` | Configurações de aparência do editor no estado desabilitado. |
| `StyleFocused` | `Variant` | Configurações de aparência do editor com foco. |
| `StyleHot` | `Variant` | Configurações de aparência do editor no estado hot (hover). |
| `StyleReadOnly` | `Variant` | Configurações de aparência do editor em modo somente leitura. |
| `Styles` | `Variant` | Acesso aos estilos individuais aplicados ao editor em estados diferentes. |
| `SupportsSpelling` | `Boolean` | Identifica se o editor suporta verificação ortográfica. |
| `Transparent` | `Boolean` | Se o editor é transparente em modo GDI. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Clear` | `Void` | `()` | Limpa o editor. |
| `CopyToClipboard` | `Void` | `()` | Copia o conteúdo selecionado para a área de transferência. |
| `CutToClipboard` | `Void` | `()` | Recorta o conteúdo selecionado para a área de transferência. |
| `GetPropertiesClass` | `Variant` | `()` | Retorna o tipo (classe) das configurações reais do editor. |
| `PasteFromClipboard` | `Void` | `()` | Cola o conteúdo da área de transferência no editor. |
| `PostEditValue` | `Void` | `()` | Persiste o valor de edição no dataset vinculado. |
| `ResetEditValue` | `Void` | `()` | Restaura o valor de edição anterior antes da alteração pendente ser aplicada. |
| `SelectAll` | `Void` | `()` | Seleciona todo o conteúdo do editor. |
| `ValidateEdit` | `Boolean` | `()` | Valida o display value do editor. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnChange` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o valor do editor muda (texto digitado, item selecionado, checkbox alternado, etc.). |
| `OnEditing` | `TNotifyEvent` | `(Sender As TObject)` | Permite impedir que usuários ativem o editor (validação prévia). |
| `OnFocusChanged` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando IsFocused muda — útil quando o editor abre subcomponentes que recebem foco (dropdown, calculadora, calendário). |
| `OnPostEditValue` | `TNotifyEvent` | `(Sender As TObject)` | Executa código customizado quando o editor persiste o valor no dataset vinculado. |

#### `TcxCustomTextEdit`

**Herda de:** [`TcxCustomEdit`](#tcxcustomedit)

**Cadeia completa:** [`TcxCustomEdit`](#tcxcustomedit) → [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Especialização de TcxCustomEdit para entradas textuais. Adiciona Text, seleção, hint inline (TextHint), histórico de Undo e operações de caret/clipboard; é a base de todos os editores textuais DevExpress (TextBox, PasswordTextBox, MaskTextBox, MemoTextBox, etc.).

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `BeepOnEnter` | `Boolean` | Se o editor emite um beep quando o usuário pressiona Enter no campo. |
| `CursorPos` | `Integer` | Posição do cursor (caret) dentro do editor. |
| `EditingText` | `String` | Acessa e modifica o conteúdo textual em edição (independente de display masks). |
| `EditText` | `String` | Acessa o texto raw que está sendo editado (independente de máscaras e formatação de display). Trazido de TcxCustomMaskEdit pela simplificação da árvore. |
| `ItemIndex` | `Integer` | Índice (zero-based) do item correspondente na lista de auto-complete/lookup, quando aplicável. |
| `ItemObject` | `TObject` | Objeto auxiliar associado ao item atualmente selecionado. |
| `MaxLength` | `Integer` | Número máximo de caracteres permitidos no editor (0 = sem limite). |
| `ParentColor` | `Boolean` | Se o editor de texto usa a cor do parent para preencher o background. |
| `SelLength` | `Integer` | Comprimento da seleção em caracteres. |
| `SelStart` | `Integer` | Posição inicial (índice) da seleção dentro do texto. |
| `SelText` | `String` | Texto atualmente selecionado dentro do editor. |
| `Text` | `String` | Texto exibido/editado no controle. |
| `TextHint` | `String` | Mensagem de dica (placeholder) exibida dentro do editor quando vazio. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `ClearSelection` | `Void` | `()` | Remove a seleção atual sem alterar o texto. |
| `FindSelection` | `Boolean` | `(ASearchText As String)` | Procura e seleciona um texto dentro do editor. |
| `SetSelection` | `Void` | `(AStart As Integer, ALength As Integer)` | Seleciona um intervalo de texto no editor (start + length em caracteres). |
| `Undo` | `Void` | `()` | Desfaz a última alteração de conteúdo enquanto o editor permanece focado. |

#### `TForm`

**Herda de:** [`TScrollingWinControl`](#tscrollingwincontrol)

**Cadeia completa:** [`TScrollingWinControl`](#tscrollingwincontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Classe base de janelas (formulários) da VCL Delphi. Adiciona suporte a posição inicial, borda, ícone, modalidade, eventos de ciclo de vida (OnCreate, OnShow, OnClose) e exibição como diálogo (ShowModal).

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Active` | `Boolean` | Indica se o formulário tem foco. |
| `ActiveControl` | [`TWinControl`](#twincontrol) | Controle que possui o foco no formulário. |
| `ActiveOleControl` | `Variant` | Controle OLE no formulário que reage a mudanças de foco. |
| `AlphaBlend` | `Boolean` | Habilita a transparência (alpha blending) do formulário. |
| `AlphaBlendValue` | `Integer` | Valor da transparência (0=invisível, 255=opaco). |
| `AutoScroll` | `Boolean` | Indica se as barras de rolagem aparecem automaticamente quando necessário. |
| `AutoSize` | `Boolean` | Faz o formulário se ajustar automaticamente para conter seus controles. |
| `BorderIcons` | [`TBorderIcons`](#tbordericons) | Conjunto de ícones exibidos na barra de título (biSystemMenu, biMinimize, biMaximize, biHelp). |
| `BorderStyle` | `Integer` | Aparência e comportamento da borda do formulário (bsSizeable, bsSingle, bsDialog, bsNone, bsSizeToolWin, bsToolWindow). |
| `BorderWidth` | `Integer` | Largura adicional desenhada entre a borda e a área cliente do formulário. |
| `Canvas` | `TCanvas` | Acesso à área de desenho do formulário. |
| `Ctl3D` | `Boolean` | Habilita o estilo 3D nos controles (legado pré-XP). |
| `DefaultMonitor` | [`TDefaultMonitor`](#tdefaultmonitor) | Define em qual monitor o formulário aparece por padrão. |
| `Designer` | `Variant` | Interface do designer para o formulário. |
| `DoubleBufferedMode` | `Integer` | Modo de double-buffering (auto/sempre/nunca). |
| `DragKind` | `Integer` | Define se o drag é de drag-and-drop ou de docking (dkDrag/dkDock). |
| `DragMode` | `Integer` | Modo de inicialização do drag (dmManual/dmAutomatic). |
| `DropTarget` | `Boolean` | Se o formulário é alvo de uma operação drag-and-drop. |
| `Font` | [`TFont`](#tfont) | Fonte padrão usada para textos no formulário. |
| `FormState` | `Integer` | Informações de estado transicional do formulário. |
| `FormStyle` | [`TFormStyle`](#tformstyle) | Estilo do formulário (fsNormal/fsMDIChild/fsMDIForm/fsStayOnTop). |
| `GlassFrame` | `Variant` | Acesso ao Glass Frame no Windows Vista, 7 ou posterior (efeito Aero). |
| `HelpFile` | `String` | Nome do arquivo de Help usado para exibir ajuda do formulário. |
| `KeyPreview` | `Boolean` | Se o formulário recebe eventos de teclado antes do controle ativo. |
| `Menu` | `Variant` | Menu principal do formulário. |
| `ModalResult` | `Integer` | Representa o valor de retorno de um formulário exibido como diálogo modal (mrOk, mrCancel, etc.). |
| `Monitor` | `Variant` | Acesso ao monitor (display) onde o formulário aparece. |
| `OleFormObject` | `Variant` | Interface IOleForm para um objeto OLE in-place contido no formulário. |
| `ParentBiDiMode` | `Boolean` | Indica se BiDiMode é herdado do parent. |
| `ParentFont` | `Boolean` | Faz o formulário herdar a fonte do parent. |
| `PopupMode` | `Integer` | Comportamento do formulário em relação ao estilo WS_POPUP do Windows. |
| `PopupParent` | [`TForm`](#tform) | Define uma ordem para formulários empilhados que o usuário não pode alterar. |
| `Position` | [`TPosition`](#tposition) | Posição inicial do formulário (poScreenCenter, poDefault, ...). |
| `PrintScale` | [`TPrintScale`](#tprintscale) | Define o fator de escala ao imprimir o formulário. |
| `RoundedCorners` | [`TRoundedCornerType`](#troundedcornertype) | Estilo dos cantos arredondados no Windows 11. |
| `Scaled` | `Boolean` | Indica se o formulário ajusta tamanhos conforme o DPI da tela. |
| `ScreenSnap` | `Boolean` | Se o formulário se encaixa nas bordas da tela. |
| `ShowInTaskBar` | `Boolean` | Indica se o formulário aparece na barra de tarefas do Windows. |
| `SnapBuffer` | `Integer` | Distância para o screen snap. |
| `StyleName` | `String` | Nome do estilo VCL aplicado ao formulário. |
| `TipMode` | `Integer` | Modo de exibição das dicas (tooltips) no formulário. |
| `TransparentColor` | `Boolean` | Habilita o uso de uma cor como transparente (chave) no formulário. |
| `TransparentColorValue` | `Integer` | Cor usada como chave de transparência. |
| `VisualManager` | [`IFormVisualManager`](#iformvisualmanager) | Interface do gerenciador visual (estilos/skins) do formulário. |
| `WindowState` | `Integer` | Como o formulário aparece na tela (wsNormal, wsMinimized, wsMaximized). |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `ArrangeIcons` | `Void` | `()` | Organiza os ícones de formulários filhos MDI minimizados. |
| `Cascade` | `Void` | `()` | Organiza formulários filhos MDI em cascata (sobrepostos). |
| `Close` | `Void` | `()` | Fecha o formulário. |
| `CloseQuery` | `Boolean` | `()` | Dispatcher do evento de tentativa de fechamento (consulta OnCloseQuery). |
| `DefocusControl` | `Void` | `(Control As TWinControl)` | Remove o foco de um controle do formulário. |
| `FocusControl` | `Void` | `(Control As TWinControl)` | Coloca o foco em um controle do formulário. |
| `GetFormImage` | `Variant` | `()` | Retorna um bitmap (snapshot) do formulário. |
| `IsShortCut` | `Boolean` | `()` | Processa teclas de atalho quando o formulário tem foco. |
| `MakeFullyVisible` | `Void` | `()` | Garante que o formulário esteja totalmente visível em um monitor específico. |
| `Next` | `Void` | `()` | Ativa o próximo formulário filho na sequência. |
| `Previous` | `Void` | `()` | Ativa o formulário filho MDI anterior na sequência. |
| `Print` | `Void` | `()` | Imprime o formulário. |
| `Release` | `Void` | `()` | Destrói o formulário e libera memória. |
| `SendCancelMode` | `Void` | `()` | Cancela modos no formulário. |
| `SetFocusedControl` | `Boolean` | `(Control As TWinControl)` | Coloca o foco em um controle do formulário. |
| `Show` | `Void` | `()` | Exibe o formulário. |
| `ShowModal` | `Integer` | `()` | Exibe o formulário como diálogo modal e retorna o ModalResult. |
| `Tile` | `Void` | `()` | Organiza formulários filhos MDI lado a lado. |
| `WantChildKey` | `Boolean` | `()` | Indica se o formulário processa input de teclado para um controle do qual é dono. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnActivate` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o formulário se torna o formulário ativo. |
| `OnAfterMonitorDpiChanged` | `TMonitorDpiChangedEvent` | `(Sender As TObject, OldDPI As Integer, NewDPI As Integer)` | Ocorre após o monitor que contém o formulário ter o DPI alterado (formulário reescalado). |
| `OnBeforeMonitorDpiChanged` | `TMonitorDpiChangedEvent` | `(Sender As TObject, OldDPI As Integer, NewDPI As Integer)` | Disparado antes do monitor que contém o formulário ter o DPI alterado (permite preparação). |
| `OnClose` | `TCloseEvent` | `(Sender As TObject, ByRef Action As Integer)` | Ocorre quando o formulário está sendo fechado — permite escolher a ação (caHide, caFree, caMinimize, caNone). |
| `OnCloseQuery` | `TCloseQueryEvent` | `(Sender As TObject, ByRef CanClose As Boolean)` | Ocorre antes de fechar o formulário — permite cancelar o fechamento setando CanClose = False. |
| `OnCreate` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o formulário é criado, após todos os controles filhos terem sido carregados. |
| `OnDeactivate` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o formulário deixa de ser o formulário ativo. |
| `OnDestroy` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre imediatamente antes da destruição do formulário. |
| `OnHide` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o formulário é ocultado (após Hide ou Visible := False). |
| `OnMouseWheel` | `TMouseWheelEvent` | `(...)` | Disparado quando a roda do mouse é girada sobre o formulário. |
| `OnMouseWheelDown` | `TMouseWheelUpDownEvent` | `(Sender As TObject, Shift As TShiftState, MousePos As TPoint, ByRef Handled As Boolean)` | Disparado quando a roda do mouse é girada para baixo. |
| `OnMouseWheelUp` | `TMouseWheelUpDownEvent` | `(Sender As TObject, Shift As TShiftState, MousePos As TPoint, ByRef Handled As Boolean)` | Disparado quando a roda do mouse é girada para cima. |
| `OnPaint` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o formulário precisa ser redesenhado. |
| `OnResize` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o tamanho do formulário muda. |
| `OnShow` | `TNotifyEvent` | `(Sender As TObject)` | Ocorre quando o formulário se torna visível (após Show/ShowModal ou Visible := True). |

#### `TLabeledEdit`

**Herda de:** [`TWinControl`](#twincontrol)

**Cadeia completa:** [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Caixa de entrada de texto com um rótulo (label) associado.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `EditLabel` | [`TBoundLabel`](#tboundlabel) | Referência ao rótulo (TBoundLabel) associado a este edit. |
| `LabelPosition` | `Integer` | Posição do rótulo relativo ao controle de edição (0 = lpAbove, 1 = lpBelow, 2 = lpLeft, 3 = lpRight). |
| `LabelSpacing` | `Integer` | Espaçamento (em pixels) entre o controle de edição e seu rótulo. |
| `MaxLength` | `Integer` | Número máximo de caracteres permitidos para entrada. |
| `PasswordChar` | `String` | Caractere usado para mascarar a digitação (ex: senhas). |
| `ReadOnly` | `Boolean` | Indica se a caixa de texto é somente leitura. |
| `Text` | `String` | Conteúdo textual digitado no controle. |

#### `TMargins`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Classe do Delphi que gerencia as margens de posicionamento de um controle.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Bottom` | `Integer` | Margem inferior. |
| `Left` | `Integer` | Margem esquerda. |
| `Right` | `Integer` | Margem direita. |
| `Top` | `Integer` | Margem superior. |

#### `TScrollingWinControl`

**Herda de:** [`TWinControl`](#twincontrol)

**Cadeia completa:** [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Base para containers visuais com barras de rolagem horizontal e vertical (TForm, TFrame). Adiciona controle de viewport e auto-scroll.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `HorzScrollBar` | `Variant` | Representa a barra de rolagem horizontal do controle. |
| `VertScrollBar` | `Variant` | Representa a barra de rolagem vertical do controle. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `DisableAutoRange` | `Void` | `()` | Desabilita a rolagem automática. |
| `EnableAutoRange` | `Void` | `()` | Reabilita a rolagem automática. |
| `ScrollInView` | `Void` | `(AControl As TControl)` | Rola um controle para dentro da área visível do controle de rolagem. |

#### `TShape`

**Herda de:** [`TGraphicControl`](#tgraphiccontrol)

**Cadeia completa:** [`TGraphicControl`](#tgraphiccontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Base para os componentes de formas geométricas desenhadas (Rectangle, Ellipse, Line). Expõe propriedades de Pen e Brush para customização visual.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Brush` | `Variant` | Cor e padrão usados para preencher a forma. |
| `Pen` | `TPen` | Caneta usada para desenhar o contorno da forma. |
| `Shape` | `Integer` | Tipo da forma desenhada (stRectangle, stSquare, stRoundRect, stCircle, stEllipse, etc.). |

#### `TWinControl`

**Herda de:** [`TControl`](#tcontrol)

**Cadeia completa:** [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Classe base para todos os controles visuais que possuem janela própria do Windows (handle HWND). Pode conter outros controles, receber foco de teclado e interagir com o sistema de mensagens nativo.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `AlignDisabled` | `Boolean` | Indica que o realinhamento dos controles filhos está desabilitado. |
| `Brush` | `Variant` | Determina a cor e o padrão usados para pintar o fundo do controle. |
| `ControlCount` | `Integer` | Retorna a quantidade de controles filhos. |
| `Controls` | [`TControl`](#tcontrol) | Lista todos os controles filhos. |
| `DockClientCount` | `Integer` | Quantidade de controles encaixados neste controle. |
| `DockClients` | [`TControl`](#tcontrol) | Lista os controles encaixados neste controle. |
| `DockManager` | `Variant` | Interface do gerenciador de docking do controle. |
| `DockSite` | `Boolean` | Se o controle pode ser alvo de operações drag-and-dock. |
| `DoubleBuffered` | `Boolean` | Determina se a imagem do controle é renderizada direto na janela ou pintada em um bitmap em memória primeiro. |
| `Handle` | `Integer` | Acesso ao handle Windows (HWND) subjacente do controle. |
| `MouseInClient` | `Boolean` | Indica se o ponteiro do mouse está atualmente na área de cliente do controle. |
| `Padding` | [`TMargins`](#tmargins) | Padding interno do controle. |
| `ParentDoubleBuffered` | `Boolean` | Faz a propriedade DoubleBuffered deste componente seguir o valor do parent. |
| `ParentWindow` | `Integer` | Referência ao controle subjacente do parent. |
| `Showing` | `Boolean` | Indica se o controle está sendo exibido na tela. |
| `TabOrder` | `Integer` | Posição do controle na ordem de tabulação do parent. |
| `TabStop` | `Boolean` | Determina se o usuário pode focar este controle usando a tecla TAB. |
| `UseDockManager` | `Boolean` | Se o docking manager é usado em operações drag-and-dock. |
| `VisibleDockClientCount` | `Integer` | Quantidade de controles visíveis encaixados neste controle. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Broadcast` | `Void` | `(ByRef Message As Variant)` | Envia uma mensagem para cada um dos controles filhos. |
| `CanFocus` | `Boolean` | `()` | Indica se o controle pode receber foco. |
| `ContainsControl` | `Boolean` | `(Control As TControl)` | Indica se um controle específico existe dentro deste controle (em qualquer nível de aninhamento). |
| `ControlAtPos` | [`TControl`](#tcontrol) | `()` | Retorna o controle filho localizado em uma posição específica dentro do controle. |
| `DisableAlign` | `Void` | `()` | Desabilita o realinhamento dos controles filhos. |
| `EnableAlign` | `Void` | `()` | Decrementa o contador incrementado por DisableAlign, eventualmente realinhando os controles filhos. |
| `FindChildControl` | [`TControl`](#tcontrol) | `(ControlName As String)` | Retorna um controle filho dado seu nome. |
| `FlipChildren` | `Void` | `(AllLevels As Boolean)` | Reverte as posições dos controles filhos. |
| `Focused` | `Boolean` | `()` | Determina se o controle tem foco de entrada. |
| `HandleAllocated` | `Boolean` | `()` | Reporta se existe handle Windows para o controle. |
| `HandleNeeded` | `Void` | `()` | Cria um handle Windows para o controle se ainda não existir. |
| `InsertControl` | `Void` | `(AControl As TControl)` | Insere um controle na propriedade Controls. |
| `PaintTo` | `Void` | `()` | Desenha o controle (windowed) em um device context. |
| `Realign` | `Void` | `()` | Força o controle a realinhar os filhos. |
| `RemoveControl` | `Void` | `(AControl As TControl)` | Remove um controle específico do array Controls. |
| `ScaleBy` | `Void` | `(M As Integer, D As Integer)` | Redimensiona o controle e seus filhos. |
| `ScrollBy` | `Void` | `(DeltaX As Integer, DeltaY As Integer)` | Rola o conteúdo do controle. |
| `SetFocus` | `Void` | `()` | Dá o foco de entrada para o controle. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnKeyDown` | `TKeyEvent` | `(Sender As TObject, ByRef Key As Integer, Shift As TShiftState)` | Ocorre quando o usuário pressiona uma tecla com o controle em foco. |
| `OnKeyPress` | `TKeyPressEvent` | `(Sender As TObject, ByRef Key As Char)` | Ocorre quando o usuário pressiona uma tecla imprimível com o controle em foco. |
| `OnKeyUp` | `TKeyEvent` | `(Sender As TObject, ByRef Key As Integer, Shift As TShiftState)` | Ocorre quando o usuário solta uma tecla com o controle em foco. |

#### `ValueTextBox`

**Herda de:** [`TcxCustomTextEdit`](#tcxcustomtextedit)

**Cadeia completa:** [`TcxCustomTextEdit`](#tcxcustomtextedit) → [`TcxCustomEdit`](#tcxcustomedit) → [`TCustomControl`](#tcustomcontrol) → [`TWinControl`](#twincontrol) → [`TControl`](#tcontrol) → [`TComponent`](#tcomponent) → `TPersistent` → `TObject` → `System.Classes.TObject`

Caixa de texto especializada em valores monetários (TValorEditor). Wrapper sobre TcxCurrencyEdit.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `AsFloat` | `Double` | Valor atual como Double (ponto flutuante). |
| `AsInteger` | `Integer` | Valor atual convertido para Integer (truncado). |
| `DecimalPlaces` | `Integer` | Quantidade de casas decimais exibidas (e aceitas) pelo editor de valor. |
| `DisplayFormat` | `String` | Máscara de formatação para exibição do valor (ex.: 'R$ #,##0.00'). |
| `MaxValue` | `Double` | Valor máximo aceito pelo editor (0 = sem máximo). |
| `MinValue` | `Double` | Valor mínimo aceito pelo editor (0 = sem mínimo). |

## 4. Tipos enumerados (com constantes)

> Tipos sem membros próprios cuja função é agrupar um conjunto fechado de constantes acessíveis globalmente.

### `TAlign`

Tipo de alinhamento de um controle dentro do seu container (TControl.Align). Valores possíveis (declarados globalmente, sem necessidade de Imports): alNone, alTop, alBottom, alLeft, alRight, alClient.

| Constante | Descrição |
|---|---|
| `alBottom` | Alinhado à base. |
| `alClient` | Alinhado preenchendo o espaço do cliente restante. |
| `alLeft` | Alinhado à esquerda. |
| `alNone` | Sem alinhamento automático. |
| `alRight` | Alinhado à direita. |
| `alTop` | Alinhado ao topo. |

### `TAlignment`

Alinhamento horizontal do texto/conteúdo. Valores possíveis (declarados globalmente, sem necessidade de Imports): taLeftJustify, taRightJustify, taCenter.

| Constante | Descrição |
|---|---|
| `taCenter` | Texto alinhado ao centro. |
| `taLeftJustify` | Texto alinhado à esquerda. |
| `taRightJustify` | Texto alinhado à direita. |

### `TAnchorKind`

Borda à qual o controle se ancora no seu parent (TControl.Anchors). Conjunto (set): TAnchors = set of TAnchorKind. Combine vários valores para ancorar em múltiplas bordas.

| Constante | Descrição |
|---|---|
| `akBottom` | Ancora à borda inferior (Height acompanha redimensionamento vertical do parent). |
| `akLeft` | Ancora à borda esquerda do parent (mantém Left fixo). |
| `akRight` | Ancora à borda direita (Width acompanha redimensionamento horizontal do parent). |
| `akTop` | Ancora à borda superior do parent (mantém Top fixo). |

### `TBevelCut`

Estilo do bevel interno/externo de controles VCL.

| Constante | Descrição |
|---|---|
| `bvLowered` | Valor de TBevelCut. Bevel rebaixado (efeito "afundado"). |
| `bvNone` | Valor de TBevelCut. Sem bevel. |
| `bvRaised` | Valor de TBevelCut. Bevel elevado (efeito "em relevo"). |
| `bvSpace` | Valor de TBevelCut. Reserva espaço sem desenhar bevel. |

### `TBevelKind`

Tipo de bevel (efeito 3D) usado em molduras de controles.

| Constante | Descrição |
|---|---|
| `bkFlat` | Bevel plano (linha única). |
| `bkNone` | Sem bevel. |
| `bkSoft` | Bevel suave (sombra leve). |
| `bkTile` | Bevel em mosaico (efeito de tijolos). |

### `TBevelShape`

Forma de uma Border (TBevel). Define se o bevel é um retângulo cheio, uma linha simples ou apenas um espaçador.

| Constante | Descrição |
|---|---|
| `bsBottomLine` | Apenas uma linha na base. |
| `bsBox` | Caixa retangular preenchida (4 lados). |
| `bsFrame` | Moldura retangular (4 lados, sem preenchimento). |
| `bsLeftLine` | Apenas uma linha à esquerda. |
| `bsRightLine` | Apenas uma linha à direita. |
| `bsSpacer` | Espaçador invisível (não desenha nada, ocupa apenas espaço). |
| `bsTopLine` | Apenas uma linha no topo. |

### `TBevelStyle`

Estilo visual de profundidade de uma Border (TBevel).

| Constante | Descrição |
|---|---|
| `bsLowered` | Borda parece rebaixada (afundada na superfície). |
| `bsRaised` | Borda parece elevada (saindo da superfície). |

### `TBiDiMode`

Modo bidirecional do controle (suporte a idiomas Right-to-Left como Árabe e Hebraico). Usado em TControl.BiDiMode.

| Constante | Descrição |
|---|---|
| `bdLeftToRight` | Layout esquerda-para-direita (padrão para idiomas ocidentais). |
| `bdRightToLeft` | Layout direita-para-esquerda (inverte ordem de leitura e alinhamento). |
| `bdRightToLeftNoAlign` | Direita-para-esquerda mas mantém o alinhamento original. |
| `bdRightToLeftReadingOnly` | Apenas a ordem de leitura é invertida; layout permanece esquerda-para-direita. |

### `TBorderIcon`

Ícone presente na barra de título de um Form (Form.BorderIcons). Conjunto (set): TBorderIcons = set of TBorderIcon.

| Constante | Descrição |
|---|---|
| `biAlwaysOnTop` | Indicador de janela sempre no topo (em alguns temas). |
| `biHelp` | Botão de ajuda ("?" — usado em diálogos modais). |
| `biMaximize` | Botão de maximizar. |
| `biMinimize` | Botão de minimizar. |
| `biSystemMenu` | Menu de sistema (ícone do app no canto esquerdo). |

### `TCloseAction`

Ação a ser tomada no fechamento de um Form. Recebido como parâmetro `Action` (ByRef) em TCloseEvent — você pode alterar para controlar o que acontece após OnClose.

| Constante | Descrição |
|---|---|
| `caFree` | Destrói o form e libera sua memória. |
| `caHide` | Apenas oculta o form (Visible := False); a instância permanece em memória — padrão. |
| `caMinimize` | Minimiza o form em vez de fechar. |
| `caNone` | Não fechar o form (cancela o fechamento). |

### `TDefaultMonitor`

Define em qual monitor o Form aparece em aplicações multi-monitor (Form.DefaultMonitor).

| Constante | Descrição |
|---|---|
| `dmActiveForm` | Form aparece no mesmo monitor do formulário atualmente ativo (3). |
| `dmDesktop` | Nenhuma tentativa de posicionar o form em um monitor específico (0). |
| `dmMainForm` | Form aparece no mesmo monitor do formulário principal da aplicação (2). |
| `dmPrimary` | Form é posicionado no primeiro monitor listado em Screen.Monitors (1). |

### `TDoubleBufferedMode`

Modo de double buffering em relação ao parent.

| Constante | Descrição |
|---|---|
| `dbmDefault` | Valor de TDoubleBufferedMode. Segue a configuração do parent. |
| `dbmDisabled` | Valor de TDoubleBufferedMode. Double buffering desligado. |
| `dbmEnabled` | Valor de TDoubleBufferedMode. Double buffering ligado. |

### `TDragKind`

Tipo da operação de arrasto VCL.

| Constante | Descrição |
|---|---|
| `dkDock` | Valor de TDragKind. Arrasto para docking. |
| `dkDrag` | Valor de TDragKind. Arrasto convencional (drag-and-drop). |

### `TDragMode`

Modo de início do arrasto.

| Constante | Descrição |
|---|---|
| `dmAutomatic` | Valor de TDragMode. Arrasto disparado automaticamente pelo mouse-down. |
| `dmManual` | Valor de TDragMode. Arrasto disparado manualmente via BeginDrag. |

### `TEditorType`

Tipo de editor inline usado por uma célula do Grid (TAdvStringGrid). Define como o usuário edita o conteúdo da célula.

| Constante | Descrição |
|---|---|
| `edButton` | Botão (9). |
| `edCalculatorDropDown` | Edit com calculadora dropdown (32). |
| `edCapital` | Edit que converte todas as letras digitadas para maiúsculas. |
| `edCheckBox` | Checkbox (5). |
| `edColorPickerDropDown` | Color picker com 3 métodos de seleção (dropdown list, color cube, color spectrum). |
| `edComboEdit` | Combobox editável (2). |
| `edComboList` | Combobox não-editável (3). |
| `edControlDropDown` | Edit com controle customizado como dropdown (39). |
| `edCustom` | Editor customizado (ver tópicos avançados de edição) (25). |
| `edDataCheckBox` | Checkbox cujo valor depende do texto da célula. |
| `edDateEdit` | DatePicker (6). |
| `edDateEditUpDown` | Edit de data com botões up/down. |
| `edDateSpinEdit` | Spin edit de data. |
| `edDateTimeEdit` | Edit de data e hora combinadas (28). |
| `edDetailDropDown` | Combobox onde cada item tem imagem + caption + notas (34). |
| `edEditBtn` | Edit com botão lateral (4). |
| `edFloat` | Edit que aceita apenas ponto flutuante. |
| `edFloatEditBtn` | Edit de ponto flutuante com botão lateral. |
| `edFloatSpinEdit` | Spin edit de ponto flutuante. |
| `edFloatUnitEditBtn` | Edit de ponto flutuante com seleção de unidade e botão lateral. |
| `edGridDropDown` | Edit com Grid dropdown — valor é selecionado da grade (35). |
| `edGridExDropDown` | Edit com Grid estendido como dropdown (38). |
| `edImagePickerDropDown` | Image picker inline (37). |
| `edLowerCase` | Edit que converte todas as letras digitadas para minúsculas. |
| `edMaskEditBtn` | Edit com máscara e botão lateral (43). |
| `edMemoDropDown` | Edit com memo dropdown (31). |
| `edMixedCase` | Edit com capitalização automática da primeira letra. |
| `edNone` | Sem editor — célula não-editável (27). |
| `edNormal` | Edit inline padrão (0). |
| `edNumeric` | Edit numérico (com sinal) (11). |
| `edNumericEditBtn` | Edit numérico com botão lateral. |
| `edNumericUnitEditBtn` | Edit numérico com seleção de unidade e botão lateral. |
| `edPassword` | Edit no modo senha — texto mascarado (16). |
| `edPositiveNumeric` | Edit numérico sem sinal (apenas valores positivos). |
| `edRichEdit` | Rich text editor. |
| `edSpinEdit` | Spin edit (campo numérico com setas up/down). |
| `edTimeEdit` | Edit de hora (8). |
| `edTimePickerDropDown` | Inline com relógio dropdown para selecionar hora. |
| `edTimeSpinEdit` | Spin edit de hora. |
| `edTrackBarDropDown` | Edit numérico com trackbar dropdown para selecionar valor inteiro. |
| `edUniComboEdit` | Combobox Unicode editável. |
| `edUniComboList` | Combobox Unicode não-editável. |
| `edUniEdit` | Edit Unicode. |
| `edUniEditBtn` | Edit Unicode com botão lateral. |
| `edUniMemo` | Memo Unicode multilinha. |
| `edUnitEditBtn` | Edit com seleção de unidade e botão lateral. |
| `edUpperCase` | Edit que converte todas as letras digitadas para maiúsculas. |
| `edValidChars` | Aceita apenas caracteres pertencentes ao conjunto de Grid.ValidChars ou Grid.ValidCharSet. |

### `TFormatType`

Tipo de formatação automática aplicada a uma célula.

| Constante | Descrição |
|---|---|
| `ftCurrency` | Valor de TFormatType. Formatação monetária. |
| `ftDate` | Valor de TFormatType. Formatação de data. |
| `ftDateTime` | Valor de TFormatType. Formatação de data/hora. |
| `ftFloat` | Valor de TFormatType. Formatação ponto flutuante (FloatFormat). |
| `ftNone` | Valor de TFormatType. Sem formatação. |
| `ftNumeric` | Valor de TFormatType. Formatação numérica (inteiros). |
| `ftTime` | Valor de TFormatType. Formatação de hora. |

### `TFormBorderStyle`

Estilo da borda e comportamento de redimensionamento de um Form (Form.BorderStyle).

| Constante | Descrição |
|---|---|
| `bsDialog` | Borda de diálogo; não redimensionável e sem menu minimizar/maximizar (3). |
| `bsNone` | Não redimensionável; sem borda visível (0). |
| `bsSingle` | Não redimensionável; com menu de minimizar/maximizar (1). |
| `bsSizeable` | Borda redimensionável padrão (2). |
| `bsSizeToolWin` | Como bsSizeable com caption menor (estilo tool window redimensionável) (5). |
| `bsToolWindow` | Como bsSingle mas com caption menor (estilo tool window) (4). |

### `TFormStyle`

Estilo do Form (normal, MDI parent/child, sempre no topo). Use em Form.FormStyle.

| Constante | Descrição |
|---|---|
| `fsMDIChild` | Form é uma janela MDI child (filha) (1). |
| `fsMDIForm` | Form é uma janela MDI parent (mãe) (2). |
| `fsNormal` | Form normal — não é janela MDI parent nem MDI child (0). |
| `fsStayOnTop` | Form permanece sempre no topo da área de trabalho e dos demais forms do projeto (3). |

### `TGridDrawingStyle`

Estilo geral de pintura do grid TMS.

| Constante | Descrição |
|---|---|
| `gdsClassic` | Valor de TGridDrawingStyle. Pintura clássica do TStringGrid. |
| `gdsGradient` | Valor de TGridDrawingStyle. Cabeçalhos e células com gradiente. |
| `gdsThemed` | Valor de TGridDrawingStyle. Aderência ao Windows theme corrente. |
| `gdsThemedAlt` | Valor de TGridDrawingStyle. Variação alternativa do themed. |

### `TGridDrawState`

Conjunto (set) de flags que descrevem o estado de desenho de uma célula do Grid no momento do evento OnDrawCell. Várias flags podem estar ativas simultaneamente.

| Constante | Descrição |
|---|---|
| `gdFixed` | Célula está em uma coluna/linha fixa (cabeçalho) (2). |
| `gdFocused` | Célula está com o foco (1). |
| `gdHotTrack` | Mouse está hover sobre a célula (hot-track) (4). |
| `gdPressed` | Célula está pressionada (botão de mouse down) (5). |
| `gdRowSelected` | Toda a linha desta célula está selecionada (3). |
| `gdSelected` | Célula está selecionada (0). |

### `TGridFilterType`

Como o filtro do grid trata strings ao comparar.

| Constante | Descrição |
|---|---|
| `fcCaseSensitive` | Valor de TGridFilterType. Diferencia maiúsculas/minúsculas. |
| `fcNoCase` | Valor de TGridFilterType. Ignora maiúsculas/minúsculas. |
| `fcNormal` | Valor de TGridFilterType. Comparação normal (igualdade direta). |

### `TGridLook`

Aparência global do grid TMS.

| Constante | Descrição |
|---|---|
| `glClassic` | Valor de TGridLook. Look clássico. |
| `glListView` | Valor de TGridLook. Estilo ListView do Windows Explorer. |
| `glOffice2003` | Valor de TGridLook. Estilo Office 2003. |
| `glOffice2007` | Valor de TGridLook. Estilo Office 2007. |
| `glOffice2010` | Valor de TGridLook. Estilo Office 2010. |
| `glOfficeXP` | Valor de TGridLook. Estilo Office XP. |
| `glStandard` | Valor de TGridLook. Look padrão Windows. |
| `glWindows7` | Valor de TGridLook. Estilo Windows 7. |

### `THelpType`

Indica se o Help context-sensitive é identificado por contexto numérico ou por palavra-chave.

| Constante | Descrição |
|---|---|
| `htContext` | Valor de THelpType. Resolução por número (HelpContext). |
| `htKeyword` | Valor de THelpType. Resolução por palavra-chave (HelpKeyword). |

### `THintShowLargeTextPos`

Posição do hint expandido para texto grande de células.

| Constante | Descrição |
|---|---|
| `hpBottom` | Valor de THintShowLargeTextPos. Abaixo da célula. |
| `hpLeft` | Valor de THintShowLargeTextPos. À esquerda da célula. |
| `hpRight` | Valor de THintShowLargeTextPos. À direita da célula. |
| `hpTop` | Valor de THintShowLargeTextPos. Acima da célula. |

### `TIntelliPan`

Modos de pan inteligente do grid TMS.

| Constante | Descrição |
|---|---|
| `ipBoth` | Valor de TIntelliPan. Pan nas duas direções. |
| `ipHorizontal` | Valor de TIntelliPan. Pan apenas horizontal. |
| `ipNone` | Valor de TIntelliPan. Pan desativado. |
| `ipVertical` | Valor de TIntelliPan. Pan apenas vertical. |

### `TInvalidEntryIcon`

Ícone exibido quando o usuário tenta confirmar valor inválido.

| Constante | Descrição |
|---|---|
| `ieError` | Valor de TInvalidEntryIcon. Ícone de erro. |
| `ieInformation` | Valor de TInvalidEntryIcon. Ícone informativo. |
| `ieNone` | Valor de TInvalidEntryIcon. Nenhum ícone. |
| `ieQuestion` | Valor de TInvalidEntryIcon. Ícone de pergunta. |
| `ieWarning` | Valor de TInvalidEntryIcon. Ícone de aviso. |

### `TLabelPosition`

Posição do rótulo (TBoundLabel) em relação ao controle de edição associado. Usado em TLabeledEdit.LabelPosition.

| Constante | Descrição |
|---|---|
| `lpAbove` | Rótulo acima do edit. |
| `lpBelow` | Rótulo abaixo do edit. |
| `lpLeft` | Rótulo à esquerda do edit. |
| `lpRight` | Rótulo à direita do edit. |

### `TModalResult`

Representa o valor de retorno de um diálogo modal. Use estes mrXxx em ButtonOk/ButtonCancel.ModalResult ou retorne diretamente em Form.ShowModal.

| Constante | Descrição |
|---|---|
| `mrAbort` | Resultado Abort (3) — operação abortada. |
| `mrAll` | Resultado All (8) — aplicar a tudo. |
| `mrCancel` | Resultado Cancel (2) — cancelamento pelo usuário. |
| `mrClose` | Resultado Close (11) — fechar. |
| `mrIgnore` | Resultado Ignore (5) — ignorar e continuar. |
| `mrNo` | Resultado No (7) — não. |
| `mrNone` | Sem resultado (0) — diálogo permanece aberto. |
| `mrNoToAll` | Resultado NoToAll (9) — não para todos os itens. |
| `mrOk` | Resultado Ok (1) — confirmação do usuário. |
| `mrRetry` | Resultado Retry (4) — tentar novamente. |
| `mrYes` | Resultado Yes (6) — sim. |
| `mrYesToAll` | Resultado YesToAll (10) — sim para todos os itens. |

### `TPopupMode`

Comportamento do Form em relação ao estilo WS_POPUP do Windows. Use em Form.PopupMode em conjunto com Form.PopupParent.

| Constante | Descrição |
|---|---|
| `pmAuto` | Form é popup automaticamente baseado no contexto da aplicação (1). |
| `pmExplicit` | Form é popup explícito; usa Form.PopupParent como dono (2). |
| `pmNone` | Sem comportamento popup — modo padrão do Windows (0). |

### `TPopupToolBarMode`

Modo do popup toolbar do grid TMS.

| Constante | Descrição |
|---|---|
| `tbAutoShow` | Valor de TPopupToolBarMode. Mostra automaticamente sobre células selecionadas. |
| `tbManual` | Valor de TPopupToolBarMode. Exibição controlada manualmente. |
| `tbNever` | Valor de TPopupToolBarMode. Toolbar desabilitada. |

### `TPosition`

Descreve o posicionamento de um Form na tela (Form.Position).

| Constante | Descrição |
|---|---|
| `poDefault` | Posição e tamanho determinados pelo sistema operacional (1). |
| `poDefaultPosOnly` | Mantém o tamanho de design; sistema operacional escolhe a posição (2). |
| `poDefaultSizeOnly` | Mantém a posição de design; sistema operacional escolhe o tamanho (3). |
| `poDesigned` | Form aparece com a posição/tamanho que tinha em tempo de design (0). |
| `poDesktopCenter` | Centralizado no desktop; mantém o tamanho de design (5). |
| `poMainFormCenter` | Centralizado no Form principal da aplicação — apenas para forms secundários (6). |
| `poOwnerFormCenter` | Centralizado no Form do Owner (cai em poMainFormCenter se Owner não for Form) (7). |
| `poScreenCenter` | Centralizado na tela; mantém o tamanho de design (4). |

### `TPrintScale`

Proporções de impressão de um Form (Form.PrintScale).

| Constante | Descrição |
|---|---|
| `poNone` | Sem escala — pode aparecer comprimido ou esticado na impressão (0). |
| `poPrintToFit` | Mantém as proporções da tela mas ajusta o tamanho à página (2). |
| `poProportional` | Imprime no tamanho aproximadamente igual ao que aparece na tela (WYSIWYG) (1). |

### `TProgressBarOrientation`

Orientação de uma ProgressBar (ProgressBar.Orientation).

| Constante | Descrição |
|---|---|
| `pbHorizontal` | Barra horizontal (cresce da esquerda para a direita). |
| `pbVertical` | Barra vertical (cresce de baixo para cima). |

### `TProgressBarState`

Estado visual de uma ProgressBar (ProgressBar.State) — afeta a cor da barra preenchida.

| Constante | Descrição |
|---|---|
| `pbsError` | Estado de erro — barra vermelha. |
| `pbsNormal` | Estado normal — barra verde. |
| `pbsPaused` | Estado pausado — barra amarela. |

### `TProgressBarStyle`

Estilo de uma ProgressBar (ProgressBar.Style).

| Constante | Descrição |
|---|---|
| `pbstMarquee` | Animação contínua ("marquee") — usa quando o tempo de operação é indeterminado. |
| `pbstNormal` | Barra padrão — exibe Position entre Min e Max. |

### `TRoundedCornerType`

Tipo de arredondamento dos cantos do Form (Windows 11+). Use em Form.RoundedCornerType.

| Constante | Descrição |
|---|---|
| `rcDefault` | Comportamento padrão do sistema (decisão do Windows) (0). |
| `rcOff` | Cantos retos — sem arredondamento (1). |
| `rcOn` | Cantos arredondados (raio padrão do Windows 11) (2). |
| `rcSmall` | Cantos arredondados com raio pequeno (3). |

### `TScrollBarAlways`

Modo de visibilidade das scrollbars do grid TMS.

| Constante | Descrição |
|---|---|
| `sbAlwaysVisible` | Valor de TScrollBarAlways. Sempre visível, mesmo sem overflow. |
| `sbAuto` | Valor de TScrollBarAlways. Auto — mostra quando há overflow. |
| `sbNever` | Valor de TScrollBarAlways. Nunca exibida. |

### `TScrollHintType`

Conteúdo do hint exibido durante scroll do grid TMS.

| Constante | Descrição |
|---|---|
| `shFull` | Valor de TScrollHintType. Linha + conteúdo da célula corrente. |
| `shNone` | Valor de TScrollHintType. Sem hint. |
| `shRowOnly` | Valor de TScrollHintType. Apenas índice da linha. |

### `TScrollStyle`

Quais scrollbars são exibidas pelo controle.

| Constante | Descrição |
|---|---|
| `ssBoth` | Valor de TScrollStyle. Scrollbars horizontal e vertical. |
| `ssHorizontal` | Valor de TScrollStyle. Apenas scrollbar horizontal. |
| `ssNone` | Valor de TScrollStyle. Nenhuma scrollbar. |
| `ssVertical` | Valor de TScrollStyle. Apenas scrollbar vertical. |

### `TScrollType`

Granularidade do scroll do grid TMS.

| Constante | Descrição |
|---|---|
| `ssLineByLine` | Valor de TScrollType. Scroll linha a linha. |
| `ssLineByPage` | Valor de TScrollType. Scroll página a página. |
| `ssPixel` | Valor de TScrollType. Scroll suave por pixel. |

### `TShapeType`

Forma geométrica desenhada por TShape (Rectangle, Ellipse, Line). Usado em TShape.Shape.

| Constante | Descrição |
|---|---|
| `stCircle` | Círculo (mantém proporção 1:1). |
| `stEllipse` | Elipse. |
| `stRectangle` | Retângulo. |
| `stRoundRect` | Retângulo com cantos arredondados. |
| `stRoundSquare` | Quadrado com cantos arredondados. |
| `stSquare` | Quadrado (mantém proporção 1:1). |

### `TShiftState`

Indica o estado das teclas modificadoras, botões do mouse ou dispositivos touch. Usado por handlers de eventos de teclado e mouse para detectar combinações no momento do evento. É um conjunto (set) de valores ssXxx (vários podem estar ativos simultaneamente).

| Constante | Descrição |
|---|---|
| `ssAlt` | A tecla ALT está pressionada. |
| `ssCommand` | A tecla CMD está pressionada (apenas no macOS). |
| `ssCtrl` | A tecla CTRL está pressionada. |
| `ssDouble` | O botão do mouse recebeu um duplo-clique. |
| `ssHorizontal` | Movimento horizontal no touch ou wheel produzindo deslocamento horizontal. |
| `ssLeft` | Botão esquerdo do mouse está pressionado. |
| `ssMiddle` | Botão central (scroll) do mouse está pressionado. |
| `ssPen` | A caneta (stylus) está tocando a superfície de um tablet. |
| `ssRight` | Botão direito do mouse está pressionado. |
| `ssShift` | A tecla SHIFT está pressionada. |
| `ssTouch` | O usuário está mantendo o dedo sobre a superfície touch. |

### `TVAlignment`

Alinhamento vertical do conteúdo dentro da célula.

| Constante | Descrição |
|---|---|
| `vtaBottom` | Valor de TVAlignment. Base. |
| `vtaCenter` | Valor de TVAlignment. Centro vertical. |
| `vtaTop` | Valor de TVAlignment. Topo. |

### `TWindowState`

Estado atual de uma janela (Form.WindowState).

| Constante | Descrição |
|---|---|
| `wsMaximized` | Janela maximizada. |
| `wsMinimized` | Janela minimizada. |
| `wsNormal` | Janela em tamanho/posição normal. |

## 5. Delegates / assinaturas de evento

### `TAfterCellPasteEvent`

Disparado depois de colar uma célula.

**Assinatura:**

```basic
Sub TAfterCellPasteEvent(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String)
```

### `TAfterCellPasteWideEvent`

Versão wide-string de TAfterCellPasteEvent.

**Assinatura:**

```basic
Sub TAfterCellPasteWideEvent(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String)
```

### `TAfterColumnMoved`

Coluna foi movida (commit).

**Assinatura:**

```basic
Sub TAfterColumnMoved(Sender As TObject, FromCol As Integer, ToCol As Integer)
```

### `TAnchorClickEvent`

Clique em uma âncora (link HTML) dentro da célula.

**Assinatura:**

```basic
Sub TAnchorClickEvent(Sender As TObject, ACol As Integer, ARow As Integer, Anchor As String)
```

### `TAnchorEvent`

Mouse entrou/saiu de uma âncora HTML em uma célula.

**Assinatura:**

```basic
Sub TAnchorEvent(Sender As TObject, ACol As Integer, ARow As Integer, Anchor As String)
```

### `TAnchorHintEvent`

Permite fornecer hint customizado para uma âncora.

**Assinatura:**

```basic
Sub TAnchorHintEvent(Sender As TObject, ACol As Integer, ARow As Integer, Anchor As String, ByRef Hint As String)
```

### `TAutoAddRowEvent`

Linha adicionada automaticamente.

**Assinatura:**

```basic
Sub TAutoAddRowEvent(Sender As TObject, ARow As Integer)
```

### `TAutoAdvanceEvent`

Permite controlar se o foco avança após uma edição.

**Assinatura:**

```basic
Sub TAutoAdvanceEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef ACanAdvance As Boolean)
```

### `TAutoDeleteRowEvent`

Linha excluída automaticamente.

**Assinatura:**

```basic
Sub TAutoDeleteRowEvent(Sender As TObject, ARow As Integer)
```

### `TAutoInsertColEvent`

Coluna inserida automaticamente.

**Assinatura:**

```basic
Sub TAutoInsertColEvent(Sender As TObject, ACol As Integer)
```

### `TAutoInsertRowEvent`

Linha inserida automaticamente.

**Assinatura:**

```basic
Sub TAutoInsertRowEvent(Sender As TObject, ARow As Integer)
```

### `TBeforeCellPasteEvent`

Disparado antes de colar uma célula, permitindo transformar o valor.

**Assinatura:**

```basic
Sub TBeforeCellPasteEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AValue As String, ByRef AllowPaste As Boolean)
```

### `TBeforeCellPasteWideEvent`

Versão wide-string de TBeforeCellPasteEvent.

**Assinatura:**

```basic
Sub TBeforeCellPasteWideEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AValue As String, ByRef AllowPaste As Boolean)
```

### `TBeforeEditEvent`

Disparado antes de iniciar a edição da célula.

**Assinatura:**

```basic
Sub TBeforeEditEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AllowEdit As Boolean)
```

### `TButtonClickEvent`

Clique em botão embarcado na célula.

**Assinatura:**

```basic
Sub TButtonClickEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TCalcFooterEvent`

Calculadora customizada do footer.

**Assinatura:**

```basic
Sub TCalcFooterEvent(Sender As TObject, ACol As Integer, ByRef AValue As String)
```

### `TCanAddColEvent`

Permite vetar a inclusão de coluna.

**Assinatura:**

```basic
Sub TCanAddColEvent(Sender As TObject, ACol As Integer, ByRef DoAdd As Boolean)
```

### `TCanAddRowEvent`

Permite vetar a inclusão de linha.

**Assinatura:**

```basic
Sub TCanAddRowEvent(Sender As TObject, ARow As Integer, ByRef DoAdd As Boolean)
```

### `TCanClickCellEvent`

Permite vetar o clique em uma célula.

**Assinatura:**

```basic
Sub TCanClickCellEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Allow As Boolean)
```

### `TCanDeleteRowEvent`

Permite vetar a exclusão de uma linha.

**Assinatura:**

```basic
Sub TCanDeleteRowEvent(Sender As TObject, ARow As Integer, ByRef DoDelete As Boolean)
```

### `TCanDisunctRowSelectDragEvent`

Permite vetar arrasto em modo disjunto de seleção de linhas.

**Assinatura:**

```basic
Sub TCanDisunctRowSelectDragEvent(Sender As TObject, ARow As Integer, ByRef Allow As Boolean)
```

### `TCanEditCellEvent`

Permite vetar a edição de uma célula.

**Assinatura:**

```basic
Sub TCanEditCellEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef CanEdit As Boolean)
```

### `TCanInsertRowEvent`

Permite vetar a inserção de linha em posição específica.

**Assinatura:**

```basic
Sub TCanInsertRowEvent(Sender As TObject, ARow As Integer, ByRef DoInsert As Boolean)
```

### `TCanShowFixedDropDownEvent`

Permite vetar a abertura do dropdown de filtro fixo.

**Assinatura:**

```basic
Sub TCanShowFixedDropDownEvent(Sender As TObject, ACol As Integer, ByRef AllowShow As Boolean)
```

### `TCanSortEvent`

Permite vetar a ordenação por uma coluna.

**Assinatura:**

```basic
Sub TCanSortEvent(Sender As TObject, ACol As Integer, ByRef DoSort As Boolean)
```

### `TCellComboControlEvent`

Permite preencher um combo embarcado na célula.

**Assinatura:**

```basic
Sub TCellComboControlEvent(Sender As TObject, ACol As Integer, ARow As Integer, AItems As TStringList)
```

### `TCellComboControlSelectEvent`

Seleção feita em um combo embarcado.

**Assinatura:**

```basic
Sub TCellComboControlSelectEvent(Sender As TObject, ACol As Integer, ARow As Integer, AItemIndex As Integer)
```

### `TCellControlEvent`

Interação com um controle embarcado na célula.

**Assinatura:**

```basic
Sub TCellControlEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TCellSaveLoadEvent`

Permite serializar/deserializar uma célula em fluxos persistentes.

**Assinatura:**

```basic
Sub TCellSaveLoadEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AValue As String)
```

### `TCellsChangedEvent`

Notifica que um intervalo de células mudou de valor.

**Assinatura:**

```basic
Sub TCellsChangedEvent(Sender As TObject, ARect As TRect)
```

### `TCellValidateEvent`

Permite validar o valor digitado em uma célula.

**Assinatura:**

```basic
Sub TCellValidateEvent(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String, ByRef AValid As Boolean)
```

### `TCellValidateWideEvent`

Versão wide-string de TCellValidateEvent.

**Assinatura:**

```basic
Sub TCellValidateWideEvent(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String, ByRef AValid As Boolean)
```

### `TChangeScaleEvent`

Mudança de escala (DPI) do controle.

**Assinatura:**

```basic
Sub TChangeScaleEvent(Sender As TObject, M As Integer, D As Integer)
```

### `TCheckBoxCanToggleEvent`

Permite vetar o toggle de um checkbox da célula.

**Assinatura:**

```basic
Sub TCheckBoxCanToggleEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef CanToggle As Boolean)
```

### `TCheckBoxClickEvent`

Clique em checkbox embarcado.

**Assinatura:**

```basic
Sub TCheckBoxClickEvent(Sender As TObject, ACol As Integer, ARow As Integer, State As Boolean)
```

### `TClickCellEvent`

Clique em uma célula normal.

**Assinatura:**

```basic
Sub TClickCellEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TClickSortEvent`

Clique no header da coluna para ordenar.

**Assinatura:**

```basic
Sub TClickSortEvent(Sender As TObject, ACol As Integer)
```

### `TClipboardEvent`

Permite vetar a operação de clipboard (copy/paste/cut).

**Assinatura:**

```basic
Sub TClipboardEvent(Sender As TObject, ByRef AllowClipboard As Boolean)
```

### `TCloseEvent`

Assinatura do handler de Form.OnClose. Action recebe o tipo de fechamento (caNone, caHide, caFree, caMinimize) e pode ser alterado para mudar o comportamento.

**Assinatura:**

```basic
Sub TCloseEvent(Sender As TObject, ByRef Action As Integer)
```

### `TCloseQueryEvent`

Assinatura do handler de Form.OnCloseQuery. Defina CanClose := False no handler para impedir o fechamento (ex.: confirmar com o usuário antes de fechar).

**Assinatura:**

```basic
Sub TCloseQueryEvent(Sender As TObject, ByRef CanClose As Boolean)
```

### `TColDisunctSelectedEvent`

Coluna foi adicionada à seleção disjunta.

**Assinatura:**

```basic
Sub TColDisunctSelectedEvent(Sender As TObject, ACol As Integer)
```

### `TColDisunctSelectEvent`

Permite controlar seleção disjunta por coluna.

**Assinatura:**

```basic
Sub TColDisunctSelectEvent(Sender As TObject, ACol As Integer, ByRef Selected As Boolean)
```

### `TColumnSizeEvent`

Largura da coluna foi alterada (commit).

**Assinatura:**

```basic
Sub TColumnSizeEvent(Sender As TObject, ACol As Integer, AWidth As Integer)
```

### `TColumnSizingEvent`

Largura da coluna está sendo arrastada.

**Assinatura:**

```basic
Sub TColumnSizingEvent(Sender As TObject, ACol As Integer, AWidth As Integer)
```

### `TComboChangeEvent`

Mudança de seleção em combo embarcado.

**Assinatura:**

```basic
Sub TComboChangeEvent(Sender As TObject, ACol As Integer, ARow As Integer, AItemIndex As Integer)
```

### `TComboObjectChangeEvent`

Mudança de combo com objeto associado.

**Assinatura:**

```basic
Sub TComboObjectChangeEvent(Sender As TObject, ACol As Integer, ARow As Integer, AObject As TObject)
```

### `TContextPopupEvent`

Disparado quando o usuário invoca o popup contextual do controle.

**Assinatura:**

```basic
Sub TContextPopupEvent(Sender As TObject, MousePos As TPoint, ByRef Handled As Boolean)
```

### `TCustomCellDrawEvent`

Pintura customizada do fundo ou conteúdo da célula (background/foreground).

**Assinatura:**

```basic
Sub TCustomCellDrawEvent(Sender As TObject, ACanvas As TCanvas, ACol As Integer, ARow As Integer, ARect As TRect)
```

### `TCustomCellSizeEvent`

Permite definir manualmente largura/altura de uma célula específica.

**Assinatura:**

```basic
Sub TCustomCellSizeEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AWidth As Integer, ByRef AHeight As Integer)
```

### `TCustomCompareEvent`

Comparador customizado de strings entre duas células.

**Assinatura:**

```basic
Sub TCustomCompareEvent(Sender As TObject, ACol As Integer, Cell1 As String, Cell2 As String, ByRef Result As Integer)
```

### `TCustomFilterEvent`

Permite implementar filtros customizados.

**Assinatura:**

```basic
Sub TCustomFilterEvent(Sender As TObject, ACol As Integer, Value As String, ByRef Accept As Boolean)
```

### `TDateTimeChangeEvent`

Mudança de valor em editor de data/hora.

**Assinatura:**

```basic
Sub TDateTimeChangeEvent(Sender As TObject, ACol As Integer, ARow As Integer, Value As TDateTime)
```

### `TDateTimeSpinClickEvent`

Clique no spin de data/hora embarcado.

**Assinatura:**

```basic
Sub TDateTimeSpinClickEvent(Sender As TObject, ACol As Integer, ARow As Integer, Value As TDateTime)
```

### `TDblClickCellEvent`

Duplo-clique em uma célula normal.

**Assinatura:**

```basic
Sub TDblClickCellEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TDragDropEvent`

Disparado ao soltar um objeto sobre o controle durante drag-and-drop VCL.

**Assinatura:**

```basic
Sub TDragDropEvent(Sender As TObject, Source As TObject, X As Integer, Y As Integer)
```

### `TDrawCellEvent`

Disparado para cada célula desenhada, permitindo customizar o conteúdo no Canvas.

**Assinatura:**

```basic
Sub TDrawCellEvent(Sender As TObject, ACol As Integer, ARow As Integer, Rect As TRect, State As TGridDrawState)
```

### `TDropDownButtonClickEvent`

Clique no botão dropdown de uma coluna.

**Assinatura:**

```basic
Sub TDropDownButtonClickEvent(Sender As TObject, ACol As Integer)
```

### `TEditCellDoneEvent`

Edição da célula concluída (commit).

**Assinatura:**

```basic
Sub TEditCellDoneEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TEditChangeEvent`

Mudança no texto durante a edição.

**Assinatura:**

```basic
Sub TEditChangeEvent(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String)
```

### `TEllipsClickEvent`

Clique no botão de elipse (...) do editor inline.

**Assinatura:**

```basic
Sub TEllipsClickEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TEndColumnSizeEvent`

Fim do redimensionamento da coluna.

**Assinatura:**

```basic
Sub TEndColumnSizeEvent(Sender As TObject, ACol As Integer, AWidth As Integer)
```

### `TEndDragEvent`

Disparado quando uma operação de drag-and-drop termina.

**Assinatura:**

```basic
Sub TEndDragEvent(Sender As TObject, Target As TObject, X As Integer, Y As Integer)
```

### `TEndRowSizeEvent`

Fim do redimensionamento da linha.

**Assinatura:**

```basic
Sub TEndRowSizeEvent(Sender As TObject, ARow As Integer, AHeight As Integer)
```

### `TExpandClickEvent`

Clique no expand/collapse do node.

**Assinatura:**

```basic
Sub TExpandClickEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TFindNoResultEvent`

Busca não retornou resultado.

**Assinatura:**

```basic
Sub TFindNoResultEvent(Sender As TObject, AValue As String)
```

### `TFixedCellClickEvent`

Clique em uma célula fixa (header/footer) da grade.

**Assinatura:**

```basic
Sub TFixedCellClickEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TFloatFormatEvent`

Permite definir o formato de exibição de uma célula numérica.

**Assinatura:**

```basic
Sub TFloatFormatEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AFormat As String)
```

### `TFloatSpinClickEvent`

Clique no float-spin embarcado.

**Assinatura:**

```basic
Sub TFloatSpinClickEvent(Sender As TObject, ACol As Integer, ARow As Integer, Value As Double)
```

### `TFooterPaintEvent`

Pintura customizada do footer.

**Assinatura:**

```basic
Sub TFooterPaintEvent(Sender As TObject, ACanvas As TCanvas, ARect As TRect)
```

### `TGetColumnFilterEvent`

Permite popular a lista de itens do filtro dropdown da coluna.

**Assinatura:**

```basic
Sub TGetColumnFilterEvent(Sender As TObject, ACol As Integer, AStrings As TStringList)
```

### `TGetDisplTextEvent`

Permite reescrever o texto exibido pela célula sem alterar o storage.

**Assinatura:**

```basic
Sub TGetDisplTextEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Value As String)
```

### `TGetDisplWideTextEvent`

Versão wide-string de TGetDisplTextEvent.

**Assinatura:**

```basic
Sub TGetDisplWideTextEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Value As String)
```

### `TGetEditEvent`

Permite ler/escrever o texto do editor inline antes/durante a edição.

**Assinatura:**

```basic
Sub TGetEditEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef Value As String)
```

### `TGetEditorPropEvent`

Permite ajustar propriedades do editor (cor, fonte) por célula.

**Assinatura:**

```basic
Sub TGetEditorPropEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TGetEditorTypeEvent`

Permite escolher dinamicamente o tipo de editor da célula.

**Assinatura:**

```basic
Sub TGetEditorTypeEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AEditor As TEditorType)
```

### `TGridBorderPropEvent`

Permite definir propriedades de borda por célula.

**Assinatura:**

```basic
Sub TGridBorderPropEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TGridColorEvent`

Permite alterar a cor de fundo/texto da célula em tempo de pintura.

**Assinatura:**

```basic
Sub TGridColorEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AColor As Integer, ByRef ABrushColor As Integer)
```

### `TGridGetInplaceEditorEvent`

Permite fornecer um inplace editor customizado para a célula.

**Assinatura:**

```basic
Sub TGridGetInplaceEditorEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AEditor As TWinControl)
```

### `TGridGetInplaceEditorPropertiesEvent`

Permite ajustar as propriedades do inplace editor por célula.

**Assinatura:**

```basic
Sub TGridGetInplaceEditorPropertiesEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TGridPrintColumnWidthEvent`

Permite ajustar a largura da coluna durante o print.

**Assinatura:**

```basic
Sub TGridPrintColumnWidthEvent(Sender As TObject, ACol As Integer, ByRef AWidth As Integer)
```

### `TGridPrintNewPageEvent`

Disparado a cada nova página gerada durante o print.

**Assinatura:**

```basic
Sub TGridPrintNewPageEvent(Sender As TObject, PageNo As Integer)
```

### `TGridPrintRowHeightEvent`

Permite ajustar a altura da linha durante o print.

**Assinatura:**

```basic
Sub TGridPrintRowHeightEvent(Sender As TObject, ARow As Integer, ByRef AHeight As Integer)
```

### `TGridProgressEvent`

Reporta progresso de uma operação longa (load/save/filter).

**Assinatura:**

```basic
Sub TGridProgressEvent(Sender As TObject, AProgress As Integer)
```

### `THasComboEvent`

Indica se uma célula deve receber um combo.

**Assinatura:**

```basic
Sub THasComboEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef HasCombo As Boolean)
```

### `THasEditBtnEvent`

Indica se uma célula deve mostrar botão de edição.

**Assinatura:**

```basic
Sub THasEditBtnEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef HasBtn As Boolean)
```

### `THasFilterEditEvent`

Indica se a coluna deve mostrar campo de filtro.

**Assinatura:**

```basic
Sub THasFilterEditEvent(Sender As TObject, ACol As Integer, ByRef HasFilterEdit As Boolean)
```

### `THasSpinEditEvent`

Indica se uma célula deve receber spin edit.

**Assinatura:**

```basic
Sub THasSpinEditEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef HasSpin As Boolean)
```

### `THoverButtonsShowEvent`

Controla a exibição dos hover-buttons por linha.

**Assinatura:**

```basic
Sub THoverButtonsShowEvent(Sender As TObject, ARow As Integer, ByRef Show As Boolean)
```

### `TImageSelectedEvent`

Imagem selecionada via image picker.

**Assinatura:**

```basic
Sub TImageSelectedEvent(Sender As TObject, ACol As Integer, ARow As Integer, AImageIndex As Integer)
```

### `TImageSelectEvent`

Image picker iniciou seleção.

**Assinatura:**

```basic
Sub TImageSelectEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TIsFixedCellEvent`

Permite tratar uma célula como fixa (header/footer) dinamicamente.

**Assinatura:**

```basic
Sub TIsFixedCellEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef IsFixed As Boolean)
```

### `TIsPasswordCellEvent`

Permite renderizar uma célula como senha (caracteres mascarados).

**Assinatura:**

```basic
Sub TIsPasswordCellEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef IsPassword As Boolean)
```

### `TMarcaDesmarcaLinhaParaExclusaoEvent`

Evento Data7 disparado ao marcar/desmarcar uma linha para exclusão.

**Assinatura:**

```basic
Sub TMarcaDesmarcaLinhaParaExclusaoEvent(Sender As TObject, ARow As Integer, Marcado As Boolean)
```

### `TMethod`

Placeholder Delphi (record com Code+Data) usado por handlers que não têm assinatura específica conhecida no autocomplete original. Tratado como TNotifyEvent pelo linter.

**Assinatura:**

```basic
Sub TMethod(Sender As TObject)
```

### `TMonitorDpiChangedEvent`

Assinatura do handler do evento OnAfterMonitorDpiChanged / OnBeforeMonitorDpiChanged do Form. Disparado quando o DPI do monitor onde o form está exibido muda.

**Assinatura:**

```basic
Sub TMonitorDpiChangedEvent(Sender As TObject, OldDPI As Integer, NewDPI As Integer)
```

### `TMouseMoveEvent`

Movimento do mouse sobre o controle.

**Assinatura:**

```basic
Sub TMouseMoveEvent(Sender As TObject, Shift As TShiftState, X As Integer, Y As Integer)
```

### `TMouseWheelUpDownEvent`

Roda do mouse para cima/baixo sobre o controle.

**Assinatura:**

```basic
Sub TMouseWheelUpDownEvent(Sender As TObject, Shift As TShiftState, MousePos As TPoint, ByRef Handled As Boolean)
```

### `TMovedEvent`

Movimentação de linha/coluna por drag.

**Assinatura:**

```basic
Sub TMovedEvent(Sender As TObject, FromIndex As Integer, ToIndex As Integer)
```

### `TNodeAllowEvent`

Permite vetar a expansão/contração de um nó.

**Assinatura:**

```basic
Sub TNodeAllowEvent(Sender As TObject, ARow As Integer, ByRef Allow As Boolean)
```

### `TNodeClickEvent`

Clique para expandir/contrair um nó da árvore.

**Assinatura:**

```basic
Sub TNodeClickEvent(Sender As TObject, ARow As Integer)
```

### `TOleDragDropEvent`

Drop de objeto OLE no controle.

**Assinatura:**

```basic
Sub TOleDragDropEvent(Sender As TObject, X As Integer, Y As Integer, AData As String)
```

### `TOleDragOverEvent`

Drag-over OLE com decisão de aceitar/rejeitar.

**Assinatura:**

```basic
Sub TOleDragOverEvent(Sender As TObject, X As Integer, Y As Integer, ByRef Accept As Boolean)
```

### `TOleDragStartEvent`

Permite vetar o início de drag OLE.

**Assinatura:**

```basic
Sub TOleDragStartEvent(Sender As TObject, ByRef Allow As Boolean)
```

### `TOleDragStopEvent`

Disparado quando a operação OLE de drag iniciada por este controle é encerrada (cancelada ou concluída).

**Assinatura:**

```basic
Sub TOleDragStopEvent(Sender As TObject)
```

### `TOleDropColEvent`

Drop OLE caiu em uma coluna específica.

**Assinatura:**

```basic
Sub TOleDropColEvent(Sender As TObject, ACol As Integer)
```

### `TOleDropFileEvent`

Disparado quando o usuário solta um único arquivo do Explorer (formato CF_HDROP) sobre o controle via OLE drop.

**Assinatura:**

```basic
Sub TOleDropFileEvent(Sender As TObject, FileName As String)
```

### `TOleDropFilesEvent`

Drop OLE de múltiplos arquivos.

**Assinatura:**

```basic
Sub TOleDropFilesEvent(Sender As TObject, Files As TStringList)
```

### `TOleDropURLEvent`

Disparado quando o usuário solta uma URL (formato CF_HTML / hyperlink) arrastada de um browser sobre o controle via OLE drop.

**Assinatura:**

```basic
Sub TOleDropURLEvent(Sender As TObject, URL As String)
```

### `TRadioButtonClickEvent`

Clique em radio button embarcado.

**Assinatura:**

```basic
Sub TRadioButtonClickEvent(Sender As TObject, ACol As Integer, ARow As Integer, AIndex As Integer)
```

### `TRadioClickEvent`

Clique em radio embarcado.

**Assinatura:**

```basic
Sub TRadioClickEvent(Sender As TObject, ACol As Integer, ARow As Integer, AIndex As Integer)
```

### `TRatingChangeEvent`

Mudança no controle de rating embarcado.

**Assinatura:**

```basic
Sub TRatingChangeEvent(Sender As TObject, ACol As Integer, ARow As Integer, ARating As Integer)
```

### `TRawCompareEvent`

Comparador customizado por índice de linha (acesso direto a dados).

**Assinatura:**

```basic
Sub TRawCompareEvent(Sender As TObject, ACol As Integer, Row1 As Integer, Row2 As Integer, ByRef Result As Integer)
```

### `TRowCountChangeEvent`

Mudança no número total de linhas.

**Assinatura:**

```basic
Sub TRowCountChangeEvent(Sender As TObject, RowCount As Integer)
```

### `TRowDisunctSelectEvent`

Permite controlar seleção disjunta por linha.

**Assinatura:**

```basic
Sub TRowDisunctSelectEvent(Sender As TObject, ARow As Integer, ByRef Selected As Boolean)
```

### `TRowSizeEvent`

Altura da linha foi alterada (commit).

**Assinatura:**

```basic
Sub TRowSizeEvent(Sender As TObject, ARow As Integer, AHeight As Integer)
```

### `TRowSizingEvent`

Altura da linha está sendo arrastada.

**Assinatura:**

```basic
Sub TRowSizingEvent(Sender As TObject, ARow As Integer, AHeight As Integer)
```

### `TScrollCellEvent`

Célula focada via scroll.

**Assinatura:**

```basic
Sub TScrollCellEvent(Sender As TObject, ACol As Integer, ARow As Integer)
```

### `TScrollHintEvent`

Texto do hint exibido durante scroll.

**Assinatura:**

```basic
Sub TScrollHintEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AHint As String)
```

### `TSearchEditChangeEvent`

Mudança no texto do search footer.

**Assinatura:**

```basic
Sub TSearchEditChangeEvent(Sender As TObject, AValue As String)
```

### `TSearchFooterSearchEndEvent`

Disparado ao encerrar a busca no search footer.

**Assinatura:**

```basic
Sub TSearchFooterSearchEndEvent(Sender As TObject, AValue As String)
```

### `TSearchFooterSearchEvent`

Disparado durante busca incremental no search footer.

**Assinatura:**

```basic
Sub TSearchFooterSearchEvent(Sender As TObject, AValue As String, ByRef Found As Boolean)
```

### `TSelectCellEvent`

Permite vetar a seleção de uma célula específica.

**Assinatura:**

```basic
Sub TSelectCellEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef CanSelect As Boolean)
```

### `TSelectionChanged`

Mudança na seleção (linha/coluna/célula).

**Assinatura:**

```basic
Sub TSelectionChanged(Sender As TObject)
```

### `TSetEditEvent`

Disparado ao gravar o texto digitado no editor inline.

**Assinatura:**

```basic
Sub TSetEditEvent(Sender As TObject, ACol As Integer, ARow As Integer, Value As String)
```

### `TShowFilterEditEvent`

Permite vetar a exibição do filtro de uma coluna.

**Assinatura:**

```basic
Sub TShowFilterEditEvent(Sender As TObject, ACol As Integer, ByRef AllowShow As Boolean)
```

### `TSpinClickEvent`

Clique no spin embarcado.

**Assinatura:**

```basic
Sub TSpinClickEvent(Sender As TObject, ACol As Integer, ARow As Integer, Value As Integer)
```

### `TUnitChangedEvent`

Unidade do editor com unidades mudou.

**Assinatura:**

```basic
Sub TUnitChangedEvent(Sender As TObject, ACol As Integer, ARow As Integer, AUnit As String)
```

### `TUpdateColumnSizeEvent`

Permite ajustar largura final ao terminar resize.

**Assinatura:**

```basic
Sub TUpdateColumnSizeEvent(Sender As TObject, ACol As Integer, ByRef AWidth As Integer)
```

### `TWordWrapEvent`

Permite forçar/inibir word-wrap por célula.

**Assinatura:**

```basic
Sub TWordWrapEvent(Sender As TObject, ACol As Integer, ARow As Integer, ByRef WordWrap As Boolean)
```

## 6. Aliases / classes intermediárias (sem membros próprios)

> Classes da cadeia de herança real (Delphi/VCL/DevExpress/TMS/Data7) que existem para que tipos como `Dim x As TBotao` sejam reconhecidos. Todos os seus membros são herdados.

| Tipo | Herda de | Descrição |
|---|---|---|
| `ButtonCancel` | [`TButtonControl`](#tbuttoncontrol) | Variante de CommandButton pré-configurada como botão de cancelamento ("Cancelar") do diálogo. |
| `ButtonOk` | [`TButtonControl`](#tbuttoncontrol) | Variante de CommandButton pré-configurada como botão de confirmação ("Ok"/"Confirmar") do diálogo. |
| `ButtonTextBox` | [`TcxCustomTextEdit`](#tcxcustomtextedit) | Caixa de texto com botão de ação lateral configurável (TEditorBotao). Wrapper sobre TcxButtonEdit. |
| `Calendar` | [`TFrame`](#tframe) | Frame de calendário visual do Data7 para seleção de datas. |
| `CommandButton` | [`TButtonControl`](#tbuttoncontrol) | Botão padrão do Data7 (TBotao) com janela própria. Equivalente ao TButton nativo do Delphi com estilo customizado do ERP. |
| `ControlGroup` | [`TGraphicControl`](#tgraphiccontrol) | Agrupador visual de controles desenhado via Canvas (sem janela própria). Equivalente ao TControlGroup do Data7. |
| `CustomControl` | [`TCustomControl`](#tcustomcontrol) | Controle customizável reutilizável pelo desenvolvedor no Data7. Especialização de TCustomControl com infraestrutura padrão do ERP. |
| `Ellipse` | [`TShape`](#tshape) | Forma geométrica elíptica/circular para desenho na superfície do container pai. |
| `Form` | [`TForm`](#tform) | Formulário base do Data7 (TfrmFormulario). Especialização de TForm com infraestrutura padrão do ERP. |
| `FormButtons` | [`TForm`](#tform) | Formulário padrão do Data7 com barra de botões inferior (Ok/Cancela/auxiliares) já configurada. |
| `GridConfigs` | `-` | Configurações de Grid do Data7 — agrega opções de layout, scrollbars, ordenação, agrupamento e estilização aplicadas a um componente Grid. |
| `GridEditorLink` | [`TEditLink`](#teditlink) | Especialização Data7 de TEditLink que vincula células do Grid a editores inline (TextBox, DateTextBox, ValueTextBox etc.). |
| `IFormVisualManager` | `-` | Interface que descreve um gerenciador visual de formulários do Data7 — controla skins, layouts e temas aplicados aos forms do ERP. |
| `Line` | [`TShape`](#tshape) | Linha geométrica (horizontal, vertical ou diagonal) desenhada como TShape. |
| `NumberTextBox` | [`TcxCustomTextEdit`](#tcxcustomtextedit) | Caixa de texto especializada em entrada numérica com calculadora popup (TNumeroEditor). Wrapper sobre TcxCalcEdit. |
| `PageControl` | [`TCustomControl`](#tcustomcontrol) | Container de abas (TabSheets) — wrapper sobre o TRzPageControl da Raize. Permite alternar entre múltiplas páginas filhas. |
| `Panel` | [`TCustomControl`](#tcustomcontrol) | Container retangular genérico para agrupar e posicionar outros controles. Wrapper sobre TCustomPanel da VCL. |
| `PasswordTextBox` | [`TcxCustomTextEdit`](#tcxcustomtextedit) | Variante de TextBox configurada para entrada de senhas (caracteres mascarados). |
| `Rectangle` | [`TShape`](#tshape) | Forma geométrica retangular para desenho na superfície do container pai. |
| `TAdvColumnGrid` | [`TAdvStringGrid`](#tadvstringgrid) | Grid TMS com modelo de colunas tipadas (cada coluna define seu editor, alinhamento, formatação). |
| `TAdvStringGrid` | [`TBaseGrid`](#tbasegrid) | Componente Grid avançado da TMS Software — base de TAdvColumnGrid. |
| `TBaseGrid` | [`TObjStringGrid`](#tobjstringgrid) | Classe base Data7 de grids ricos. |
| `TBevel` | [`TGraphicControl`](#tgraphiccontrol) | Borda decorativa da VCL. Ancestral de Border. |
| `TBevelEdges` | `-` | Set de TBevelEdge — quais bordas exibem bevel (beLeft, beTop, beRight, beBottom). |
| `TBorderIcons` | `-` | Set Delphi `set of TBorderIcon` — coleção de ícones exibidos na barra de título do formulário (biSystemMenu, biMinimize, biMaximize, biHelp). |
| `TBorderStyle` | `-` | Tipo da propriedade BorderStyle de controles com moldura (Panel, Grid, edits). Sobreposto com TFormBorderStyle: aqui só existem bsNone/bsSingle (controles de moldura simples). |
| `TBotao` | [`TSSCustomButton`](#tsscustombutton) | Botão base do Data7 (cor, fonte e estilo padronizados). Ancestral de CommandButton, ButtonOk e ButtonCancel. |
| `TButtonedEdit` | [`TCustomButtonedEdit`](#tcustombuttonededit) | Edit nativo VCL com dois botões opcionais embutidos (`Vcl.ExtCtrls.TButtonedEdit`). Use Images para suprir ícones a partir de um TImageList, referenciados pelas propriedades LeftButton e RightButton herdadas. Não introduz membros próprios além dos herdados de TCustomButtonedEdit. |
| `TControlGroup` | [`TGraphicControl`](#tgraphiccontrol) | Container visual de agrupamento — ancestral de ControlGroup. |
| `TCustomDrawGrid` | [`TCustomGrid`](#tcustomgrid) | Variante de TCustomGrid com suporte a desenho customizado de células (OnDrawCell). |
| `TCustomForm` | [`TScrollingWinControl`](#tscrollingwincontrol) | Classe ancestral de TForm na VCL Delphi. Adiciona ciclo de vida do formulário, modalidade, menu e suporte a OLE. |
| `TCustomFrame` | [`TScrollingWinControl`](#tscrollingwincontrol) | Classe ancestral de TFrame na VCL. |
| `TCustomGrid` | [`TCustomControl`](#tcustomcontrol) | Classe base VCL de todos os componentes Grid. |
| `TCustomLabel` | [`TGraphicControl`](#tgraphiccontrol) | Classe ancestral de rótulos (label) na VCL. |
| `TCustomPanel` | [`TCustomControl`](#tcustomcontrol) | Classe ancestral de Panel na VCL. |
| `TCustomSpeedButton` | [`TGraphicControl`](#tgraphiccontrol) | Ancestral VCL de TSpeedButton — botão visual desenhado no Canvas do parent. |
| `TcxButtonEdit` | [`TcxCustomButtonEdit`](#tcxcustombuttonedit) | Edit DevExpress com botão lateral. Ancestral de TPesquisaEditor e TEditorBotao. |
| `TcxCalcEdit` | [`TcxCustomCalcEdit`](#tcxcustomcalcedit) | Edit numérico DevExpress com calculadora popup. Ancestral de TNumeroEditor. |
| `TcxCheckBox` | [`TcxCustomCheckBox`](#tcxcustomcheckbox) | Checkbox DevExpress. Ancestral de THCheckBox. |
| `TcxComboBox` | [`TcxCustomComboBox`](#tcxcustomcombobox) | ComboBox DevExpress. Ancestral de THComboBox. |
| `TcxCurrencyEdit` | [`TcxCustomCurrencyEdit`](#tcxcustomcurrencyedit) | Edit monetário DevExpress. Ancestral de TValorEditor. |
| `TcxCustomButtonEdit` | [`TcxCustomMaskEdit`](#tcxcustommaskedit) | Edit DevExpress com botão lateral configurável. Ancestral de TcxButtonEdit. |
| `TcxCustomCalcEdit` | [`TcxCustomPopupEdit`](#tcxcustompopupedit) | Ancestral DevExpress de edit numérico com calculadora popup. Ancestral de TcxCalcEdit. |
| `TcxCustomCheckBox` | [`TcxCustomEdit`](#tcxcustomedit) | Ancestral DevExpress de checkbox. Ancestral de TcxCheckBox. |
| `TcxCustomComboBox` | [`TcxCustomDropDownEdit`](#tcxcustomdropdownedit) | Ancestral DevExpress de combobox. Ancestral de TcxComboBox. |
| `TcxCustomCurrencyEdit` | [`TcxCustomTextEdit`](#tcxcustomtextedit) | Ancestral DevExpress de edit monetário. Ancestral de TcxCurrencyEdit. |
| `TcxCustomDateEdit` | [`TcxCustomPopupEdit`](#tcxcustompopupedit) | Ancestral DevExpress de date pickers. Ancestral de TcxDateEdit. |
| `TcxCustomDropDownEdit` | [`TcxCustomMaskEdit`](#tcxcustommaskedit) | Ancestral DevExpress de editores com dropdown popup (combobox, datepicker, etc.). |
| `TcxCustomMaskEdit` | [`TcxCustomTextEdit`](#tcxcustomtextedit) | Especialização DevExpress de TcxCustomTextEdit que adiciona máscara de entrada. Ancestral de TcxMaskEdit, TcxButtonEdit, TcxCustomDateEdit e TcxCustomCalcEdit. |
| `TcxCustomMemo` | [`TcxCustomTextEdit`](#tcxcustomtextedit) | Ancestral DevExpress de memo multilinha. Ancestral de TcxMemo. |
| `TcxCustomPopupEdit` | [`TcxCustomDropDownEdit`](#tcxcustomdropdownedit) | Ancestral DevExpress de editors com popup customizado. Ancestral de TcxCustomDateEdit e TcxCustomCalcEdit. |
| `TcxDateEdit` | [`TcxCustomDateEdit`](#tcxcustomdateedit) | DatePicker DevExpress. Ancestral de TDataEditor. |
| `TcxMaskEdit` | [`TcxCustomMaskEdit`](#tcxcustommaskedit) | Edit DevExpress com máscara. Ancestral de TMascaraEditor. |
| `TcxMemo` | [`TcxCustomMemo`](#tcxcustommemo) | Memo DevExpress multilinha. Ancestral de TMemoEditor. |
| `TcxTextEdit` | [`TcxCustomTextEdit`](#tcxcustomtextedit) | Edit textual simples DevExpress. Ancestral de TEditor. |
| `TDataEditor` | [`TcxDateEdit`](#tcxdateedit) | Editor de data Data7 — ancestral de DateTextBox. |
| `TDrawGrid` | [`TCustomDrawGrid`](#tcustomdrawgrid) | Grid VCL com desenho customizado exposto (TDrawGrid). |
| `TEditLink` | `-` | Link de editor — abstração que conecta uma célula do Grid a um editor inline customizado (TcxCustomEdit derivado). |
| `TEditor` | [`TcxTextEdit`](#tcxtextedit) | Editor textual base do Data7 — ancestral de TextBox e PasswordTextBox. |
| `TEditorBotao` | [`TcxButtonEdit`](#tcxbuttonedit) | Editor com botão Data7 — ancestral de ButtonTextBox. |
| `TextBox` | [`TcxCustomTextEdit`](#tcxcustomtextedit) | Caixa de texto de linha única do Data7 (TEditor). Wrapper sobre TcxTextEdit. |
| `TFilterDropDownColumns` | `-` | Set TMS — quais colunas exibem o botão de filtro dropdown. |
| `TFont` | `-` | Define fonte (Name, Size, Style, Color) usada para pintar texto em um controle. |
| `TFrame` | [`TScrollingWinControl`](#tscrollingwincontrol) | Base para componentes compostos reutilizáveis embutidos em formulários (frames). Funciona como container similar ao TForm mas projetado para ser colocado dentro de outros containers. |
| `TFrameCalendario` | [`TFrame`](#tframe) | Frame base de Calendar no Data7. |
| `TFrameTopbar` | [`TFrame`](#tframe) | Frame base de Topbar no Data7. |
| `TfrmFormulario` | [`TForm`](#tform) | Form base do Data7 do qual Form e FormButtons derivam. Encapsula recursos padrão do ERP (estilo Data7, suporte a topbar, etc.). |
| `TfrmPaiCadastro` | [`TfrmFormulario`](#tfrmformulario) | Form base dos cadastros padrão do Data7 — adiciona barra de botões (ButtonOk/ButtonCancel) e fluxo de gravação. |
| `TGrade` | [`TAdvColumnGrid`](#tadvcolumngrid) | Especialização Data7 (TGrade) de TAdvColumnGrid — ancestral direto de Grid. |
| `TGraphicControl` | [`TControl`](#tcontrol) | Classe base de controles visuais sem janela própria (não possuem handle Windows). Renderizam a si mesmos através do Canvas do controle pai. Ex.: Imagem, formas geométricas, FlatButton. |
| `TGridOptions` | `-` | Set TMS com flags de comportamento e interação da grade (TAdvStringGridOptions). |
| `THCheckBox` | [`TcxCheckBox`](#tcxcheckbox) | CheckBox híbrido Data7 — ancestral de CheckBox. |
| `THComboBox` | [`TcxComboBox`](#tcxcombobox) | ComboBox híbrido Data7 — ancestral de HComboBox. |
| `THoverFixedCells` | `-` | Set TMS que indica quais células fixas reagem a hover. |
| `THoverRowCells` | `-` | Set TMS que indica quais células acompanham o destaque ao passar o mouse na linha (hcAll, hcSelected, hcNormal). |
| `TImage` | [`TGraphicControl`](#tgraphiccontrol) | Componente de exibição de imagem da VCL. Ancestral de Imagem. |
| `Timer` | [`TComponent`](#tcomponent) | Componente não-visual que dispara um evento (OnTimer) em intervalos regulares definidos por Interval (ms). Wrapper do TTimer nativo do Delphi. |
| `TMascaraEditor` | [`TcxMaskEdit`](#tcxmaskedit) | Editor com máscara Data7 — ancestral de MaskTextBox (controle de máscara genérico). |
| `TMemoEditor` | [`TcxMemo`](#tcxmemo) | Memo multilinha Data7 — ancestral de MemoTextBox. |
| `TNumeroEditor` | [`TcxCalcEdit`](#tcxcalcedit) | Editor numérico Data7 — ancestral de NumberTextBox. |
| `TObjStringGrid` | [`TStringGrid`](#tstringgrid) | Variante Data7 de TStringGrid com suporte aprimorado a objetos por célula (Objects[col,row]). |
| `Topbar` | [`TFrame`](#tframe) | Frame de barra superior padrão do Data7 (cabeçalho) usado nos formulários do ERP. |
| `TPesquisaEditor` | [`TcxButtonEdit`](#tcxbuttonedit) | Editor de pesquisa padrão Data7 — ancestral de SearchTextBox. |
| `TRotulo` | [`TCustomLabel`](#tcustomlabel) | Rótulo (label) base do Data7. Ancestral de StaticText. |
| `TRzCustomTabControl` | [`TCustomControl`](#tcustomcontrol) | Classe base Raize de controles tipo tab/abas. Ancestral de TRzPageControl. |
| `TRzPageControl` | [`TRzCustomTabControl`](#trzcustomtabcontrol) | PageControl Raize com abas estilizadas. Ancestral de PageControl. |
| `TRzTabSheet` | [`TCustomControl`](#tcustomcontrol) | Aba Raize que vive dentro de um TRzPageControl. Ancestral de TabSheet. |
| `TSpeedBotao` | [`TSpeedButton`](#tspeedbutton) | Especialização Data7 de TSpeedButton — base de FlatButton. |
| `TSpeedButton` | [`TCustomSpeedButton`](#tcustomspeedbutton) | Botão flat padrão VCL (Vcl.Buttons.TSpeedButton) — botão sem janela própria que vive no Canvas do parent, usado em barras de ferramentas. Suporta Glyph, Down, GroupIndex e AllowAllUp. |
| `TSSCustomButton` | [`TButtonControl`](#tbuttoncontrol) | Classe Data7 (Se7e Sistemas) ancestral comum dos botões customizados (TBotao). |
| `TStringGrid` | [`TDrawGrid`](#tdrawgrid) | Grid VCL com células contendo strings (acessadas por Cells[col,row]). |
| `TStyleElements` | `-` | Set indicando quais elementos do controle são pintados pelo theme manager (seBorder, seClient, seFont). |
| `TTimer` | [`TComponent`](#tcomponent) | Componente Timer não-visual da VCL. Ancestral de Forms.Timer. |
| `TTMSStyle` | `-` | Estilo visual global TMS aplicado ao grid (tsOffice2003Blue, tsOffice2007Blue, ...). |
| `TValorEditor` | [`TcxCurrencyEdit`](#tcxcurrencyedit) | Editor de valor monetário Data7 — ancestral de ValueTextBox. |

## 7. Funções e procedimentos do namespace

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `ProcessMessages` | `Void` | `()` | Força a thread principal do ERP a processar mensagens pendentes da fila do Windows (evita congelamento da tela). |

---

_168 classes/tipos, 129 delegates, 1 funções, ~1147 membros próprios em classes, 235 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T17:44:11.181Z pela extensão Data7 Dev Studio._

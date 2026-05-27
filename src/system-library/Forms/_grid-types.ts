import type { SystemSymbolInfo, SystemContainer } from "../types";

/**
 * Stubs dos tipos auxiliares referenciados pelo componente Grid (e por outros
 * componentes da VCL/TMS expostos pelo autocomplete do Data7).
 *
 * Para tipos enum/set conhecidos do Delphi/TMS, declaramos a classe E as
 * constantes nominais (padrão de `TEditorType.ts`). Isso habilita autocomplete
 * de valores em atribuições como `Grid.BevelInner = bvLowered`, e dá ao linter
 * material para emitir `unknown-member` quando o usuário inventa um valor.
 *
 * Para tipos puramente "container" (TFont, TStringList já existem; aqui ficam
 * os que ainda não têm definição rica), declaramos apenas a classe — o
 * autocomplete de membros vai melhorar conforme cada um for promovido a um
 * arquivo dedicado (ver `TEditorType.ts` como referência).
 */

const RANGE = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;
const FORMS: SystemContainer = "Forms";

interface EnumSpec {
  readonly name: string;
  readonly description: string;
  /**
   * Constantes nominais do enum. São registradas como `variable` no namespace
   * `Forms` (não dentro do próprio enum) — mesmo padrão de `TEditorType.ts`.
   */
  readonly values: readonly { readonly name: string; readonly note: string }[];
}

interface StubSpec {
  readonly name: string;
  readonly description: string;
}

const enums: readonly EnumSpec[] = [
  {
    name: "THelpType",
    description:
      "Indica se o Help context-sensitive é identificado por contexto numérico ou por palavra-chave.",
    values: [
      { name: "htContext", note: "Resolução por número (HelpContext)." },
      { name: "htKeyword", note: "Resolução por palavra-chave (HelpKeyword)." },
    ],
  },
  {
    name: "TBevelCut",
    description: "Estilo do bevel interno/externo de controles VCL.",
    values: [
      { name: "bvNone", note: "Sem bevel." },
      { name: "bvLowered", note: 'Bevel rebaixado (efeito "afundado").' },
      { name: "bvRaised", note: 'Bevel elevado (efeito "em relevo").' },
      { name: "bvSpace", note: "Reserva espaço sem desenhar bevel." },
    ],
  },
  {
    name: "TDragKind",
    description: "Tipo da operação de arrasto VCL.",
    values: [
      { name: "dkDrag", note: "Arrasto convencional (drag-and-drop)." },
      { name: "dkDock", note: "Arrasto para docking." },
    ],
  },
  {
    name: "TDragMode",
    description: "Modo de início do arrasto.",
    values: [
      { name: "dmManual", note: "Arrasto disparado manualmente via BeginDrag." },
      { name: "dmAutomatic", note: "Arrasto disparado automaticamente pelo mouse-down." },
    ],
  },
  {
    name: "TDoubleBufferedMode",
    description: "Modo de double buffering em relação ao parent.",
    values: [
      { name: "dbmDefault", note: "Segue a configuração do parent." },
      { name: "dbmDisabled", note: "Double buffering desligado." },
      { name: "dbmEnabled", note: "Double buffering ligado." },
    ],
  },
  {
    name: "TScrollStyle",
    description: "Quais scrollbars são exibidas pelo controle.",
    values: [
      { name: "ssNone", note: "Nenhuma scrollbar." },
      { name: "ssHorizontal", note: "Apenas scrollbar horizontal." },
      { name: "ssVertical", note: "Apenas scrollbar vertical." },
      { name: "ssBoth", note: "Scrollbars horizontal e vertical." },
    ],
  },
  {
    name: "TVAlignment",
    description: "Alinhamento vertical do conteúdo dentro da célula.",
    values: [
      { name: "vtaCenter", note: "Centro vertical." },
      { name: "vtaTop", note: "Topo." },
      { name: "vtaBottom", note: "Base." },
    ],
  },
  {
    name: "TGridDrawingStyle",
    description: "Estilo geral de pintura do grid TMS.",
    values: [
      { name: "gdsClassic", note: "Pintura clássica do TStringGrid." },
      { name: "gdsThemed", note: "Aderência ao Windows theme corrente." },
      { name: "gdsGradient", note: "Cabeçalhos e células com gradiente." },
      { name: "gdsThemedAlt", note: "Variação alternativa do themed." },
    ],
  },
  {
    name: "TGridLook",
    description: "Aparência global do grid TMS.",
    values: [
      { name: "glClassic", note: "Look clássico." },
      { name: "glOffice2003", note: "Estilo Office 2003." },
      { name: "glOfficeXP", note: "Estilo Office XP." },
      { name: "glStandard", note: "Look padrão Windows." },
      { name: "glListView", note: "Estilo ListView do Windows Explorer." },
      { name: "glOffice2007", note: "Estilo Office 2007." },
      { name: "glOffice2010", note: "Estilo Office 2010." },
      { name: "glWindows7", note: "Estilo Windows 7." },
    ],
  },
  {
    name: "TGridFilterType",
    description: "Como o filtro do grid trata strings ao comparar.",
    values: [
      { name: "fcNormal", note: "Comparação normal (igualdade direta)." },
      { name: "fcCaseSensitive", note: "Diferencia maiúsculas/minúsculas." },
      { name: "fcNoCase", note: "Ignora maiúsculas/minúsculas." },
    ],
  },
  {
    name: "TIntelliPan",
    description: "Modos de pan inteligente do grid TMS.",
    values: [
      { name: "ipNone", note: "Pan desativado." },
      { name: "ipVertical", note: "Pan apenas vertical." },
      { name: "ipHorizontal", note: "Pan apenas horizontal." },
      { name: "ipBoth", note: "Pan nas duas direções." },
    ],
  },
  {
    name: "TInvalidEntryIcon",
    description: "Ícone exibido quando o usuário tenta confirmar valor inválido.",
    values: [
      { name: "ieNone", note: "Nenhum ícone." },
      { name: "ieError", note: "Ícone de erro." },
      { name: "ieInformation", note: "Ícone informativo." },
      { name: "ieWarning", note: "Ícone de aviso." },
      { name: "ieQuestion", note: "Ícone de pergunta." },
    ],
  },
  {
    name: "TPopupToolBarMode",
    description: "Modo do popup toolbar do grid TMS.",
    values: [
      { name: "tbAutoShow", note: "Mostra automaticamente sobre células selecionadas." },
      { name: "tbManual", note: "Exibição controlada manualmente." },
      { name: "tbNever", note: "Toolbar desabilitada." },
    ],
  },
  {
    name: "TScrollBarAlways",
    description: "Modo de visibilidade das scrollbars do grid TMS.",
    values: [
      { name: "sbAuto", note: "Auto — mostra quando há overflow." },
      { name: "sbAlwaysVisible", note: "Sempre visível, mesmo sem overflow." },
      { name: "sbNever", note: "Nunca exibida." },
    ],
  },
  {
    name: "TScrollType",
    description: "Granularidade do scroll do grid TMS.",
    values: [
      { name: "ssLineByLine", note: "Scroll linha a linha." },
      { name: "ssLineByPage", note: "Scroll página a página." },
      { name: "ssPixel", note: "Scroll suave por pixel." },
    ],
  },
  {
    name: "TScrollHintType",
    description: "Conteúdo do hint exibido durante scroll do grid TMS.",
    values: [
      { name: "shNone", note: "Sem hint." },
      { name: "shRowOnly", note: "Apenas índice da linha." },
      { name: "shFull", note: "Linha + conteúdo da célula corrente." },
    ],
  },
  {
    name: "TFormatType",
    description: "Tipo de formatação automática aplicada a uma célula.",
    values: [
      { name: "ftNone", note: "Sem formatação." },
      { name: "ftNumeric", note: "Formatação numérica (inteiros)." },
      { name: "ftFloat", note: "Formatação ponto flutuante (FloatFormat)." },
      { name: "ftDateTime", note: "Formatação de data/hora." },
      { name: "ftDate", note: "Formatação de data." },
      { name: "ftTime", note: "Formatação de hora." },
      { name: "ftCurrency", note: "Formatação monetária." },
    ],
  },
  {
    name: "THintShowLargeTextPos",
    description: "Posição do hint expandido para texto grande de células.",
    values: [
      { name: "hpRight", note: "À direita da célula." },
      { name: "hpBottom", note: "Abaixo da célula." },
      { name: "hpLeft", note: "À esquerda da célula." },
      { name: "hpTop", note: "Acima da célula." },
    ],
  },
];

const setStubs: readonly StubSpec[] = [
  {
    name: "TBevelEdges",
    description:
      "Set de TBevelEdge — quais bordas exibem bevel (beLeft, beTop, beRight, beBottom).",
  },
  {
    name: "TStyleElements",
    description:
      "Set indicando quais elementos do controle são pintados pelo theme manager (seBorder, seClient, seFont).",
  },
  {
    name: "TGridOptions",
    description: "Set TMS com flags de comportamento e interação da grade (TAdvStringGridOptions).",
  },
  {
    name: "THoverRowCells",
    description:
      "Set TMS que indica quais células acompanham o destaque ao passar o mouse na linha (hcAll, hcSelected, hcNormal).",
  },
  {
    name: "THoverFixedCells",
    description: "Set TMS que indica quais células fixas reagem a hover.",
  },
  {
    name: "TFilterDropDownColumns",
    description: "Set TMS — quais colunas exibem o botão de filtro dropdown.",
  },
  {
    name: "TFont",
    description: "Define fonte (Name, Size, Style, Color) usada para pintar texto em um controle.",
  },
  {
    name: "TTMSStyle",
    description:
      "Estilo visual global TMS aplicado ao grid (tsOffice2003Blue, tsOffice2007Blue, ...).",
  },
];

const enumClasses: SystemSymbolInfo[] = enums.map((e) => ({
  name: e.name,
  kind: "class",
  type: e.name,
  isShared: false,
  isPrivate: false,
  range: RANGE,
  fileUri: "system://library",
  containerName: FORMS,
  description: e.description,
}));

const enumConstants: SystemSymbolInfo[] = enums.flatMap((e) =>
  e.values.map<SystemSymbolInfo>((v) => ({
    name: v.name,
    kind: "variable",
    type: e.name,
    isShared: true,
    isPrivate: false,
    range: RANGE,
    fileUri: "system://library",
    containerName: FORMS,
    description: `Valor de ${e.name}. ${v.note}`,
  })),
);

const setClasses: SystemSymbolInfo[] = setStubs.map((s) => ({
  name: s.name,
  kind: "class",
  type: s.name,
  isShared: false,
  isPrivate: false,
  range: RANGE,
  fileUri: "system://library",
  containerName: FORMS,
  description: s.description,
}));

export const symbols: SystemSymbolInfo[] = [...enumClasses, ...enumConstants, ...setClasses];

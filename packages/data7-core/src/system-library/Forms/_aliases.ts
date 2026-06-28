import type { SystemSymbolInfo } from "../types";

/**
 * Aliases e classes intermediárias do namespace Forms.
 *
 * Estes são tipos expostos pelo Data7 (autocomplete oficial do compilador) que
 * existem na cadeia de herança real do Delphi/VCL/DevExpress/TMS, mas que foram
 * colapsados na nossa árvore simplificada. Declará-los aqui permite:
 *   - usar `Dim x As TBotao` sem o linter reclamar de tipo desconhecido
 *   - aparecer no autocomplete do namespace `Forms`
 *   - resolver corretamente hover/Go-to-Definition apontando para a classe equivalente
 *
 * Cada entrada tem `inheritsFrom` apontando para a classe da nossa estrutura
 * simplificada que carrega as definições reais. Assim os membros herdados via
 * cadeia funcionam normalmente.
 */

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

interface AliasSpec {
  readonly name: string;
  readonly inheritsFrom: string;
  readonly description: string;
}

const aliases: readonly AliasSpec[] = [
  // ───────── Form / Frame hierarchy ─────────
  {
    name: "TCustomForm",
    inheritsFrom: "TScrollingWinControl",
    description:
      "Classe ancestral de TForm na VCL Delphi. Adiciona ciclo de vida do formulário, modalidade, menu e suporte a OLE.",
  },
  {
    name: "TfrmFormulario",
    inheritsFrom: "TForm",
    description:
      "Form base do Data7 do qual Form e FormButtons derivam. Encapsula recursos padrão do ERP (estilo Data7, suporte a topbar, etc.).",
  },
  {
    name: "TfrmPaiCadastro",
    inheritsFrom: "TfrmFormulario",
    description:
      "Form base dos cadastros padrão do Data7 — adiciona barra de botões (ButtonOk/ButtonCancel) e fluxo de gravação.",
  },
  {
    name: "TCustomFrame",
    inheritsFrom: "TScrollingWinControl",
    description: "Classe ancestral de TFrame na VCL.",
  },
  {
    name: "TFrameCalendario",
    inheritsFrom: "TFrame",
    description: "Frame base de Calendar no Data7.",
  },
  { name: "TFrameTopbar", inheritsFrom: "TFrame", description: "Frame base de Topbar no Data7." },

  // ───────── Buttons hierarchy ─────────
  {
    name: "TSSCustomButton",
    inheritsFrom: "TButtonControl",
    description: "Classe Data7 (Se7e Sistemas) ancestral comum dos botões customizados (TBotao).",
  },
  {
    name: "TBotao",
    inheritsFrom: "TSSCustomButton",
    description:
      "Botão base do Data7 (cor, fonte e estilo padronizados). Ancestral de CommandButton, ButtonOk e ButtonCancel.",
  },
  {
    name: "TCustomSpeedButton",
    inheritsFrom: "TGraphicControl",
    description: "Ancestral VCL de TSpeedButton — botão visual desenhado no Canvas do parent.",
  },
  {
    name: "TSpeedButton",
    inheritsFrom: "TCustomSpeedButton",
    description:
      "Botão flat padrão VCL (Vcl.Buttons.TSpeedButton) — botão sem janela própria que vive no Canvas do parent, usado em barras de ferramentas. Suporta Glyph, Down, GroupIndex e AllowAllUp.",
  },
  {
    name: "TSpeedBotao",
    inheritsFrom: "TSpeedButton",
    description: "Especialização Data7 de TSpeedButton — base de FlatButton.",
  },

  // ───────── Visual primitives ─────────
  {
    name: "TBevel",
    inheritsFrom: "TGraphicControl",
    description: "Borda decorativa da VCL. Ancestral de Border.",
  },
  {
    name: "TImage",
    inheritsFrom: "TGraphicControl",
    description: "Componente de exibição de imagem da VCL. Ancestral de Imagem.",
  },
  {
    name: "TCustomLabel",
    inheritsFrom: "TGraphicControl",
    description: "Classe ancestral de rótulos (label) na VCL.",
  },
  {
    name: "TRotulo",
    inheritsFrom: "TCustomLabel",
    description: "Rótulo (label) base do Data7. Ancestral de StaticText.",
  },
  {
    name: "TCustomPanel",
    inheritsFrom: "TCustomControl",
    description: "Classe ancestral de Panel na VCL.",
  },
  {
    name: "TTimer",
    inheritsFrom: "TComponent",
    description: "Componente Timer não-visual da VCL. Ancestral de Forms.Timer.",
  },
  {
    name: "TControlGroup",
    inheritsFrom: "TGraphicControl",
    description: "Container visual de agrupamento — ancestral de ControlGroup.",
  },

  // ───────── DevExpress intermediate classes ─────────
  {
    name: "TcxCustomMaskEdit",
    inheritsFrom: "TcxCustomTextEdit",
    description:
      "Especialização DevExpress de TcxCustomTextEdit que adiciona máscara de entrada. Ancestral de TcxMaskEdit, TcxButtonEdit, TcxCustomDateEdit e TcxCustomCalcEdit.",
  },
  {
    name: "TcxCustomButtonEdit",
    inheritsFrom: "TcxCustomMaskEdit",
    description: "Edit DevExpress com botão lateral configurável. Ancestral de TcxButtonEdit.",
  },
  {
    name: "TcxCustomMemo",
    inheritsFrom: "TcxCustomTextEdit",
    description: "Ancestral DevExpress de memo multilinha. Ancestral de TcxMemo.",
  },
  {
    name: "TcxCustomCurrencyEdit",
    inheritsFrom: "TcxCustomTextEdit",
    description: "Ancestral DevExpress de edit monetário. Ancestral de TcxCurrencyEdit.",
  },
  {
    name: "TcxCustomDropDownEdit",
    inheritsFrom: "TcxCustomMaskEdit",
    description:
      "Ancestral DevExpress de editores com dropdown popup (combobox, datepicker, etc.).",
  },
  {
    name: "TcxCustomComboBox",
    inheritsFrom: "TcxCustomDropDownEdit",
    description: "Ancestral DevExpress de combobox. Ancestral de TcxComboBox.",
  },
  {
    name: "TcxCustomPopupEdit",
    inheritsFrom: "TcxCustomDropDownEdit",
    description:
      "Ancestral DevExpress de editors com popup customizado. Ancestral de TcxCustomDateEdit e TcxCustomCalcEdit.",
  },
  {
    name: "TcxCustomDateEdit",
    inheritsFrom: "TcxCustomPopupEdit",
    description: "Ancestral DevExpress de date pickers. Ancestral de TcxDateEdit.",
  },
  {
    name: "TcxCustomCalcEdit",
    inheritsFrom: "TcxCustomPopupEdit",
    description:
      "Ancestral DevExpress de edit numérico com calculadora popup. Ancestral de TcxCalcEdit.",
  },
  {
    name: "TcxCustomCheckBox",
    inheritsFrom: "TcxCustomEdit",
    description: "Ancestral DevExpress de checkbox. Ancestral de TcxCheckBox.",
  },

  // ───────── DevExpress concrete intermediate (between custom and Data7 specialization) ─────────
  {
    name: "TcxTextEdit",
    inheritsFrom: "TcxCustomTextEdit",
    description: "Edit textual simples DevExpress. Ancestral de TEditor.",
  },
  {
    name: "TcxButtonEdit",
    inheritsFrom: "TcxCustomButtonEdit",
    description: "Edit DevExpress com botão lateral. Ancestral de TPesquisaEditor e TEditorBotao.",
  },
  {
    name: "TcxMemo",
    inheritsFrom: "TcxCustomMemo",
    description: "Memo DevExpress multilinha. Ancestral de TMemoEditor.",
  },
  {
    name: "TcxCurrencyEdit",
    inheritsFrom: "TcxCustomCurrencyEdit",
    description: "Edit monetário DevExpress. Ancestral de TValorEditor.",
  },
  {
    name: "TcxComboBox",
    inheritsFrom: "TcxCustomComboBox",
    description: "ComboBox DevExpress. Ancestral de THComboBox.",
  },
  {
    name: "TcxDateEdit",
    inheritsFrom: "TcxCustomDateEdit",
    description: "DatePicker DevExpress. Ancestral de TDataEditor.",
  },
  {
    name: "TcxCalcEdit",
    inheritsFrom: "TcxCustomCalcEdit",
    description: "Edit numérico DevExpress com calculadora popup. Ancestral de TNumeroEditor.",
  },
  {
    name: "TcxMaskEdit",
    inheritsFrom: "TcxCustomMaskEdit",
    description: "Edit DevExpress com máscara. Ancestral de TMascaraEditor.",
  },
  {
    name: "TcxCheckBox",
    inheritsFrom: "TcxCustomCheckBox",
    description: "Checkbox DevExpress. Ancestral de THCheckBox.",
  },

  // ───────── Data7-specific editor specializations (entre DevExpress e classe final) ─────────
  {
    name: "TEditor",
    inheritsFrom: "TcxTextEdit",
    description: "Editor textual base do Data7 — ancestral de TextBox e PasswordTextBox.",
  },
  {
    name: "TEditorBotao",
    inheritsFrom: "TcxButtonEdit",
    description: "Editor com botão Data7 — ancestral de ButtonTextBox.",
  },
  {
    name: "TPesquisaEditor",
    inheritsFrom: "TcxButtonEdit",
    description: "Editor de pesquisa padrão Data7 — ancestral de SearchTextBox.",
  },
  {
    name: "TMemoEditor",
    inheritsFrom: "TcxMemo",
    description: "Memo multilinha Data7 — ancestral de MemoTextBox.",
  },
  {
    name: "TValorEditor",
    inheritsFrom: "TcxCurrencyEdit",
    description: "Editor de valor monetário Data7 — ancestral de ValueTextBox.",
  },
  {
    name: "THComboBox",
    inheritsFrom: "TcxComboBox",
    description: "ComboBox híbrido Data7 — ancestral de HComboBox.",
  },
  {
    name: "TDataEditor",
    inheritsFrom: "TcxDateEdit",
    description: "Editor de data Data7 — ancestral de DateTextBox.",
  },
  {
    name: "TNumeroEditor",
    inheritsFrom: "TcxCalcEdit",
    description: "Editor numérico Data7 — ancestral de NumberTextBox.",
  },
  {
    name: "TMascaraEditor",
    inheritsFrom: "TcxMaskEdit",
    description:
      "Editor com máscara Data7 — ancestral de MaskTextBox (controle de máscara genérico).",
  },
  {
    name: "THCheckBox",
    inheritsFrom: "TcxCheckBox",
    description: "CheckBox híbrido Data7 — ancestral de CheckBox.",
  },

  // ───────── PageControl / TabSheet hierarchy (Raize/Konopka components) ─────────
  {
    name: "TRzCustomTabControl",
    inheritsFrom: "TCustomControl",
    description: "Classe base Raize de controles tipo tab/abas. Ancestral de TRzPageControl.",
  },
  {
    name: "TRzPageControl",
    inheritsFrom: "TRzCustomTabControl",
    description: "PageControl Raize com abas estilizadas. Ancestral de PageControl.",
  },
  {
    name: "TRzTabSheet",
    inheritsFrom: "TCustomControl",
    description: "Aba Raize que vive dentro de um TRzPageControl. Ancestral de TabSheet.",
  },

  // ───────── Grid hierarchy (VCL + TMS AdvStringGrid + Data7) ─────────
  {
    name: "TCustomGrid",
    inheritsFrom: "TCustomControl",
    description: "Classe base VCL de todos os componentes Grid.",
  },
  {
    name: "TCustomDrawGrid",
    inheritsFrom: "TCustomGrid",
    description:
      "Variante de TCustomGrid com suporte a desenho customizado de células (OnDrawCell).",
  },
  {
    name: "TDrawGrid",
    inheritsFrom: "TCustomDrawGrid",
    description: "Grid VCL com desenho customizado exposto (TDrawGrid).",
  },
  {
    name: "TStringGrid",
    inheritsFrom: "TDrawGrid",
    description: "Grid VCL com células contendo strings (acessadas por Cells[col,row]).",
  },
  {
    name: "TObjStringGrid",
    inheritsFrom: "TStringGrid",
    description:
      "Variante Data7 de TStringGrid com suporte aprimorado a objetos por célula (Objects[col,row]).",
  },
  {
    name: "TBaseGrid",
    inheritsFrom: "TObjStringGrid",
    description: "Classe base Data7 de grids ricos.",
  },
  {
    name: "TAdvStringGrid",
    inheritsFrom: "TBaseGrid",
    description: "Componente Grid avançado da TMS Software — base de TAdvColumnGrid.",
  },
  {
    name: "TAdvColumnGrid",
    inheritsFrom: "TAdvStringGrid",
    description:
      "Grid TMS com modelo de colunas tipadas (cada coluna define seu editor, alinhamento, formatação).",
  },
  {
    name: "TGrade",
    inheritsFrom: "TAdvColumnGrid",
    description: "Especialização Data7 (TGrade) de TAdvColumnGrid — ancestral direto de Grid.",
  },
];

export const symbols: SystemSymbolInfo[] = aliases.map((a) => ({
  name: a.name,
  kind: "class",
  type: a.name,
  isShared: false,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  inheritsFrom: a.inheritsFrom,
  description: a.description,
}));

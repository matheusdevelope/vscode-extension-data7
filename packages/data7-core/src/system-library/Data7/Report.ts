import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols, type MethodSpec, type PropSpec, UNSUP_NOTE } from "../symbol-helpers";

/**
 * Data7.Report — wrapper Data7 sobre TfrmFormulario (Forms.Form), que por sua
 * vez herda de TForm → TCustomForm → TScrollingWinControl → TWinControl →
 * TControl → TComponent → TPersistent → TObject.
 *
 * Por isso `inheritsFrom: "Form"` e os membros já presentes nessa cadeia (Name,
 * Tag, Left/Top/Width/Height, eventos comuns, etc.) não são repetidos aqui.
 *
 * Itens marcados `isUnsupported: true` aparecem no autocomplete original (VCL
 * + ERP) mas o compilador Data7 não traduz seu uso — o linter emite o
 * diagnóstico `unsupported-member` (ver `src/diagnostic-codes.ts`).
 */

// ───────── Overrides de ancestrais marcados como "Não" no autocomplete ─────────
const overrides: readonly PropSpec[] = [
  {
    name: "CustomHint",
    type: "Variant",
    description: "Hint personalizado herdado de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "HorzScrollBar",
    type: "Variant",
    description: "Barra de rolagem horizontal herdada de TScrollingWinControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "VertScrollBar",
    type: "Variant",
    description: "Barra de rolagem vertical herdada de TScrollingWinControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Action",
    type: "Variant",
    description: "Ação VCL associada herdada de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "CustomTitleBar",
    type: "Variant",
    description: "Barra de título customizada herdada de TCustomForm." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Constraints",
    type: "Variant",
    description: "Restrições de tamanho herdadas de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "GlassFrame",
    type: "Variant",
    description: "Glass frame Aero herdado de TCustomForm." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Icon",
    type: "Variant",
    description: "Ícone do formulário herdado de TCustomForm." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Padding",
    type: "Variant",
    description: "Padding interno herdado de TWinControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Menu",
    type: "Variant",
    description: "Menu principal herdado de TCustomForm." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ObjectMenuItem",
    type: "Variant",
    description: "Item de menu OLE herdado de TCustomForm." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "PopupMenu",
    type: "Variant",
    description: "Menu popup herdado de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Touch",
    type: "Variant",
    description: "Touch manager herdado de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "WindowMenu",
    type: "Variant",
    description: "Menu MDI herdado de TForm." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Caption",
    type: "Variant",
    description: "Caption (legenda) herdado de TForm — use `Title`/`Titulo`." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Color",
    type: "Variant",
    description: "Cor de fundo herdada de TControl — não aplicável ao relatório." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "OnGesture",
    type: "Variant",
    description: "Evento de gestos herdado de TControl." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Observers",
    type: "Variant",
    description: "Lista de observadores VCL herdada de TComponent." + UNSUP_NOTE,
    isUnsupported: true,
  },
];

// ───────── Properties / membros específicos do Data7.Report ─────────
const specificProperties: readonly PropSpec[] = [
  {
    name: "ID",
    type: "Long",
    description:
      "Identificador interno do relatório (sobrescreve o `ID` herdado, ampliado para Int64).",
  },
  { name: "Title", type: "String", description: "Título exibido na barra do relatório." },
  {
    name: "CodRelatorio",
    type: "Integer",
    description: "Código do cadastro de relatório no ERP.",
  },
  { name: "Titulo", type: "String", description: "Alias português de `Title`." },
  {
    name: "ConfirmacaoImpressaoStringGrid",
    type: "Variant",
    description: "Grid de confirmação de impressão exposto pelo cadastro." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "OnShowFormEnvioWhatsappEvent",
    type: "Variant",
    description: "Evento de exibição do envio por WhatsApp." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ItemNotaFiscal",
    type: "String",
    description: "Texto do item para impressão de nota fiscal modelo 1.",
  },
  {
    name: "ItemNotaFiscalEletronica",
    type: "String",
    description: "Texto do item para impressão de NF-e.",
  },
  {
    name: "ItemNotaFiscalEletronicaContingencia",
    type: "String",
    description: "Texto do item para impressão de NF-e em contingência.",
  },
];

// ───────── Métodos / construtor ─────────
const methods: readonly MethodSpec[] = [
  {
    name: "New",
    returns: "Report",
    params: [{ name: "AOwner", type: "TComponent" }],
    description: "Construtor padrão do relatório recebendo o Owner.",
  },
  {
    name: "Show",
    returns: "Boolean",
    params: [],
    description:
      "Abre a janela de relatório com confirmação do usuário. Retorna True se o usuário confirmou a impressão.",
  },
  {
    name: "Print",
    returns: "Void",
    params: [],
    description: "Imprime o relatório diretamente, sem exibir a tela de confirmação.",
  },
  {
    name: "AddParam",
    returns: "Void",
    params: [
      { name: "pName", type: "String" },
      { name: "pValue", type: "Variant" },
    ],
    description: "Adiciona/atualiza um parâmetro nomeado utilizado pela query do relatório.",
  },
  {
    name: "ExportToPdf",
    returns: "Void",
    params: [
      { name: "pLayoutIndex", type: "Integer" },
      { name: "pFilePath", type: "String" },
    ],
    description:
      "Exporta o relatório para um arquivo PDF no caminho informado, usando o layout indicado.",
  },
  {
    name: "_GetParent",
    returns: "TWinControl",
    params: [],
    description: "Acessor interno (getter) da propriedade Parent.",
  },
  {
    name: "_SetParent",
    returns: "Void",
    params: [{ name: "Value", type: "TWinControl" }],
    description: "Acessor interno (setter) da propriedade Parent.",
  },
];

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "Report",
  namespaceContainer: "Data7",
  inheritsFrom: "Form",
  description:
    "Relatório padrão do Data7 (TfrmFormulario derivado). Permite exibir/imprimir/exportar relatórios cadastrados, com suporte a parâmetros nomeados via AddParam.",
  properties: [...overrides, ...specificProperties],
  methods,
});

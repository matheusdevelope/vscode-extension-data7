import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "SearchTextBox",
    kind: "class",
    type: "SearchTextBox",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TcxCustomTextEdit",
    description:
      "Caixa de texto com botão lateral para pesquisa padrão Data7 (TPesquisaEditor). Wrapper sobre TcxButtonEdit.",
  },

  // ───────── Properties (Data7-specific search) ─────────
  {
    name: "CodPesquisa",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "SearchTextBox",
    description:
      "Código da pesquisa padrão Data7 vinculada a este editor (referência à PesquisaPadrao da Data7 API).",
  },
  {
    name: "EditorDescricao",
    kind: "property",
    type: "TcxCustomEdit",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "SearchTextBox",
    description:
      "Editor de texto auxiliar que exibe a descrição do registro selecionado pela pesquisa.",
  },
  {
    name: "ExpressaoFiltro",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "SearchTextBox",
    description: "Expressão SQL de filtro aplicada na pesquisa.",
  },
  {
    name: "AsString",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "SearchTextBox",
    description: "Valor selecionado como String (geralmente o código do registro).",
  },
  {
    name: "AsInteger",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "SearchTextBox",
    description: "Valor selecionado como Integer.",
  },
];

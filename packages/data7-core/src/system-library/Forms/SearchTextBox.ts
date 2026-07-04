import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "SearchTextBox",
    kind: "class",
    type: "SearchTextBox",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "SearchTextBox",
    description:
      "Código da pesquisa padrão Data7 vinculada a este editor (referência à PesquisaPadrao da Data7 API).",
  },
  {
    name: "EditorDescricao",
    kind: "property",
    type: "MemoTextBox",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "SearchTextBox",
    description: "Expressão SQL de filtro aplicada na pesquisa.",
  },
  {
    name: "AsString",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "SearchTextBox",
    description: "Valor selecionado como String (geralmente o código do registro).",
  },
  {
    name: "AsInteger",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "SearchTextBox",
    description: "Valor selecionado como Integer.",
  },
];

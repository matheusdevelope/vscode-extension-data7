import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Show",
    kind: "method",
    type: "Boolean",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms.Form",
    description: "Exibe o formulário e retorna False se o usuário cancelar ou clicar no ESC.",
  },
  {
    name: "Form",
    kind: "class",
    type: "Form",
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
    inheritsFrom: "TForm",
    description:
      "Formulário base do Data7 (TfrmFormulario). Especialização de TForm com infraestrutura padrão do ERP.",
  },
];

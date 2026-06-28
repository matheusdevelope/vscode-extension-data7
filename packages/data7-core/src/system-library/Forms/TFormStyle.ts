import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFormStyle",
    kind: "class",
    type: "TFormStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Estilo do Form (normal, MDI parent/child, sempre no topo). Use em Form.FormStyle.",
  },

  // ───────── Constantes ─────────
  {
    name: "fsNormal",
    kind: "variable",
    type: "TFormStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Form normal — não é janela MDI parent nem MDI child (0).",
  },
  {
    name: "fsMDIChild",
    kind: "variable",
    type: "TFormStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Form é uma janela MDI child (filha) (1).",
  },
  {
    name: "fsMDIForm",
    kind: "variable",
    type: "TFormStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Form é uma janela MDI parent (mãe) (2).",
  },
  {
    name: "fsStayOnTop",
    kind: "variable",
    type: "TFormStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Form permanece sempre no topo da área de trabalho e dos demais forms do projeto (3).",
  },
];

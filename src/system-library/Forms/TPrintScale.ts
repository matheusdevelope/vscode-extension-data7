import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPrintScale",
    kind: "class",
    type: "TPrintScale",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Proporções de impressão de um Form (Form.PrintScale).",
  },

  // ───────── Constantes ─────────
  // Nota: poNone, poProportional, poPrintToFit têm prefixo `po` (mesmo namespace de TPosition).
  // No Data7 isso é aceito porque os identificadores são distintos.
  {
    name: "poNone",
    kind: "variable",
    type: "TPrintScale",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Sem escala — pode aparecer comprimido ou esticado na impressão (0).",
  },
  {
    name: "poProportional",
    kind: "variable",
    type: "TPrintScale",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Imprime no tamanho aproximadamente igual ao que aparece na tela (WYSIWYG) (1).",
  },
  {
    name: "poPrintToFit",
    kind: "variable",
    type: "TPrintScale",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Mantém as proporções da tela mas ajusta o tamanho à página (2).",
  },
];

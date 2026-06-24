import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const ca = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TCloseAction",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCloseAction",
    kind: "class",
    type: "TCloseAction",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    description:
      "Ação a ser tomada no fechamento de um Form. Recebido como parâmetro `Action` (ByRef) em TCloseEvent — você pode alterar para controlar o que acontece após OnClose.",
  },

  ca("caNone", "Não fechar o form (cancela o fechamento)."),
  ca(
    "caHide",
    "Apenas oculta o form (Visible := False); a instância permanece em memória — padrão.",
  ),
  ca("caFree", "Destrói o form e libera sua memória."),
  ca("caMinimize", "Minimiza o form em vez de fechar."),
];

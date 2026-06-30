import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCloseAction",
    kind: "class",
    type: "TCloseAction",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Ação a ser tomada no fechamento de um Form. Recebido como parâmetro `Action` (ByRef) em TCloseEvent — você pode alterar para controlar o que acontece após OnClose.",
  },

  buildEnumVal("caNone", "TCloseAction", "Não fechar o form (cancela o fechamento).", "Forms"),
  buildEnumVal(
    "caHide",
    "TCloseAction",
    "Apenas oculta o form (Visible := False); a instância permanece em memória — padrão.",
    "Forms",
  ),
  buildEnumVal("caFree", "TCloseAction", "Destrói o form e libera sua memória.", "Forms"),
  buildEnumVal("caMinimize", "TCloseAction", "Minimiza o form em vez de fechar.", "Forms"),
];

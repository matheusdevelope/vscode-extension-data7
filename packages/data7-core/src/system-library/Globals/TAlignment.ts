import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TAlignment",
    kind: "class",
    type: "TAlignment",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Alinhamento horizontal do texto/conteúdo. Valores possíveis (declarados globalmente, sem necessidade de Imports): taLeftJustify, taRightJustify, taCenter.",
  },
  buildEnumVal("taLeftJustify", "TAlignment", "Texto alinhado à esquerda."),
  buildEnumVal("taRightJustify", "TAlignment", "Texto alinhado à direita."),
  buildEnumVal("taCenter", "TAlignment", "Texto centralizado."),
];

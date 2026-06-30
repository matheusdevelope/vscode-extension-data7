import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TAlign",
    kind: "class",
    type: "TAlign",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Tipo de alinhamento de um controle dentro do seu container (TControl.Align). Valores possíveis (declarados globalmente, sem necessidade de Imports): alNone, alTop, alBottom, alLeft, alRight, alClient.",
  },
  buildEnumVal("alNone", "TAlign", "Sem alinhamento automático."),
  buildEnumVal("alTop", "TAlign", "Alinhado ao topo do container."),
  buildEnumVal("alBottom", "TAlign", "Alinhado à base do container."),
  buildEnumVal("alLeft", "TAlign", "Alinhado à esquerda do container."),
  buildEnumVal("alRight", "TAlign", "Alinhado à direita do container."),
  buildEnumVal("alClient", "TAlign", "Preenche toda a área restante do container."),
];

import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "CommandButton",
    kind: "class",
    type: "CommandButton",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TButtonControl",
    description:
      "Botão padrão do Data7 (TBotao) com janela própria. Equivalente ao TButton nativo do Delphi com estilo customizado do ERP.",
  },
];

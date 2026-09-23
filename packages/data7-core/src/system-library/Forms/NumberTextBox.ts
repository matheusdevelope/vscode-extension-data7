import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "NumberTextBox",
    kind: "class",
    type: "NumberTextBox",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TcxCustomTextEdit",
    description:
      "Caixa de texto especializada em entrada numérica com calculadora popup (TNumeroEditor). Wrapper sobre TcxCalcEdit.",
  },
  {
    name: "Value",
    kind: "property",
    type: "Double",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "NumberTextBox",
    description: "Valor numérico exibido/editado no controle.",
  },
];

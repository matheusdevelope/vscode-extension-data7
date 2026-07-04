import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBoundLabel",
    kind: "class",
    type: "TBoundLabel",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TWinControl",
    description: "Rótulo associado a um controle de edição (TLabeledEdit).",
  },
  {
    name: "Caption",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TBoundLabel",
    description: "Texto exibido no rótulo.",
  },
];

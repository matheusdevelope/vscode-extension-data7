import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TEditLink",
    kind: "class",
    type: "TEditLink",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description:
      "Link de editor — abstração que conecta uma célula do Grid a um editor inline customizado (TcxCustomEdit derivado).",
  },
  {
    name: "Control",
    kind: "class",
    type: "TEditLink.Control",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TEditLink",
    inheritsFrom: "TWinControl",
    description: "Objeto de controle do EditLink",
  },
];

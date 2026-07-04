import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "GridEditorLink",
    kind: "class",
    type: "GridEditorLink",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TEditLink",
    description:
      "Especialização Data7 de TEditLink que vincula células do Grid a editores inline (TextBox, DateTextBox, ValueTextBox etc.).",
  },
];

import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "GridEditorLink",
    kind: "class",
    type: "GridEditorLink",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TEditLink",
    description:
      "Especialização Data7 de TEditLink que vincula células do Grid a editores inline (TextBox, DateTextBox, ValueTextBox etc.).",
  },
];

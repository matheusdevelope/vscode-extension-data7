import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "System.Classes",
    kind: "namespace",
    type: "System.Classes",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description:
      "Namespace contendo as classes bases de persistência e strings do Delphi (TObject, TPersistent, TStrings, TStringList).",
  },
];

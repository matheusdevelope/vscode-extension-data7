import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const fs = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TFontQuality",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFontQuality",
    kind: "class",
    type: "TFontQuality",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    description: "Enumeração para definir o quality da fonte.",
  },

  fs("fqDefault", "Use o quality padrão da fonte."),
  fs("fqDraft", "Use um quality de rascunho."),
  fs("fqProof", "Use um quality de prova."),
  fs("fqNonAntiAliased", "Use um quality sem anti-aliasing."),
  fs("fqAntiAliased", "Use um quality com anti-aliasing."),
  fs("fqClearType", "Use o quality ClearType."),
  fs("fqClearTypeNatural", "Use o quality ClearType Natural."),
];

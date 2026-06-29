import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const fs = (name: string, description: string): SystemSymbolInfo => ({
   name: name,
   kind: "variable",
   type: "TFontPitch",
   isShared: true,
   isPrivate: false,
   range: range,
   fileUri: "system://library",
   description: description,
});

export const symbols: SystemSymbolInfo[] = [
   {
      name: "TFontPitch",
      kind: "class",
      type: "TFontPitch",
      isShared: false,
      isPrivate: false,
      range: range,
      fileUri: "system://library",
      description: "Enumeração para definir o pitch da fonte.",
   },

   fs("fpDefault", "Use o pitch padrão da fonte."),
   fs("fpFixed", "Use um pitch fixo."),
   fs("fpVariable", "Use um pitch variável."),
];

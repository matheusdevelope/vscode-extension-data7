import type { SugarPlugin } from "../../types";

export const inlineIfSugarPlugin: SugarPlugin = {
  id: "inline-if",
  displayName: "Inline If Expansion",
  description: "Expands single-line If/Then statements into block If/Then/End If statements.",
  enabledByDefault: true,
  dependencies: [],
  syntaxKinds: ["IfStatement"],
};

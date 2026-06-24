import type { SugarPlugin } from "../../types";

export const enumSugarPlugin: SugarPlugin = {
  id: "enum",
  displayName: "Declarative Enum",
  description: "Expands Enum declarations into TEnum-compatible classes.",
  enabledByDefault: true,
  dependencies: [],
  syntaxKinds: ["EnumDeclaration"],
  requiredImports: () => ["mod_tenum"],
};

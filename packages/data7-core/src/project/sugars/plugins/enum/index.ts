import type { SugarPlugin } from "../../types";
import { EnumParserPlugin } from "./parser";

export const enumSugarPlugin: SugarPlugin = {
  id: "enum",
  displayName: "Declarative Enum",
  description: "Expands Enun declarations into TEnum-compatible classes.",
  enabledByDefault: true,
  dependencies: [],
  syntaxKinds: ["EnumDeclaration"],
  createParserPlugin: () => new EnumParserPlugin(),
  requiredImports: () => ["mod_tenum"],
};

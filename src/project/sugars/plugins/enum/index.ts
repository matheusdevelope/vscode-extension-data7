import type { SugarPlugin, SugarUtilityModule } from "../../types";

const enumUtility: SugarUtilityModule = {
  id: "enum.core",
  namespace: "core_sugars_enum",
  dependencies: [],
  generateCode() {
    return [
      "Namespace core_sugars_enum",
      "Class CoreSugarBaseEnum",
      "   Inherits BaseEnum",
      "   Sub New()",
      "      MyBase.New()",
      "   End Sub",
      "   Sub Free()",
      "      MyBase.Free()",
      "   End Sub",
      "End Class",
      "End Namespace",
    ].join("\r\n");
  },
};

export const enumSugarPlugin: SugarPlugin = {
  id: "enum",
  displayName: "Declarative Enum",
  description: "Expands Enum declarations into BaseEnum-compatible classes.",
  enabledByDefault: true,
  dependencies: [],
  syntaxKinds: ["EnumDeclaration"],
  utilityModules: () => [enumUtility],
};


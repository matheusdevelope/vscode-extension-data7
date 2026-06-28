export interface LanguageKeyword {
  readonly canonical: string;
  readonly source: "native" | "sugar";
  readonly sugarId?: string;
}

const NATIVE_KEYWORDS: readonly string[] = [
  "Alias",
  "And",
  "AndAlso",
  "As",
  "ByRef",
  "ByVal",
  "Case",
  "Catch",
  "Class",
  "Const",
  "Continue",
  "Declare",
  "Delegate",
  "Dim",
  "Do",
  "Each",
  "Else",
  "ElseIf",
  "End",
  "Enum",
  "Exit",
  "False",
  "Finally",
  "For",
  "Function",
  "Get",
  "If",
  "Imports",
  "In",
  "Inherits",
  "Is",
  "IsNot",
  "Let",
  "Lib",
  "Like",
  "Loop",
  "Me",
  "Mod",
  "MyBase",
  "Namespace",
  "New",
  "Next",
  "Not",
  "Nothing",
  "NULL",
  "Or",
  "OrElse",
  "Overridable",
  "Overrides",
  "Private",
  "Property",
  "Protected",
  "Public",
  "ReadOnly",
  "Return",
  "Select",
  "Set",
  "Shared",
  "Step",
  "Structure",
  "Sub",
  "Then",
  "Throw",
  "To",
  "True",
  "Try",
  "Until",
  "Using",
  "When",
  "While",
  "With",
  "Xor",
];

const SUGAR_KEYWORDS: readonly LanguageKeyword[] = [
  { canonical: "Enun", source: "sugar", sugarId: "enum" },
];

export const LANGUAGE_KEYWORDS: readonly LanguageKeyword[] = [
  ...NATIVE_KEYWORDS.map((canonical) => ({ canonical, source: "native" as const })),
  ...SUGAR_KEYWORDS,
];

export const LANGUAGE_KEYWORD_CANONICALS: readonly string[] = LANGUAGE_KEYWORDS.map(
  (keyword) => keyword.canonical,
);

export const LANGUAGE_KEYWORD_SET: ReadonlySet<string> = new Set(
  LANGUAGE_KEYWORD_CANONICALS.map((keyword) => keyword.toLowerCase()),
);

export const LANGUAGE_KEYWORD_CASING: ReadonlyMap<string, string> = new Map(
  LANGUAGE_KEYWORD_CANONICALS.map((keyword) => [keyword.toLowerCase(), keyword]),
);

export function isLanguageKeyword(value: string): boolean {
  return LANGUAGE_KEYWORD_SET.has(value.toLowerCase());
}

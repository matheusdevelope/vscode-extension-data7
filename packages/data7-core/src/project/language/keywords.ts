export type KeywordNative =
  | "AddHandler"
  | "AddressOf"
  | "Alias"
  | "As"
  | "ByRef"
  | "ByVal"
  | "Call"
  | "Case"
  | "Catch"
  | "CBool"
  | "CByte"
  | "CChar"
  | "CDate"
  | "CDec"
  | "CDbl"
  | "CInt"
  | "Class"
  | "CLng"
  | "CObj"
  | "Const"
  | "Continue"
  | "CShort"
  | "CSng"
  | "CStr"
  | "CType"
  | "Declare"
  | "Default"
  | "Delegate"
  | "Dim"
  | "Do"
  | "Each"
  | "Else"
  | "ElseIf"
  | "End"
  | "Enum"
  | "Erase"
  | "Error"
  | "Event"
  | "Exit"
  | "Finally"
  | "For"
  | "Friend"
  | "Function"
  | "Get"
  | "GetType"
  | "Global"
  | "GoTo"
  | "Handles"
  | "If"
  | "Implements"
  | "Imports"
  | "In"
  | "Inherits"
  | "Interface"
  | "Let"
  | "Lib"
  | "Loop"
  | "Me"
  | "Module"
  | "MustInherit"
  | "MustOverride"
  | "MyBase"
  | "MyClass"
  | "Namespace"
  | "Narrowing"
  | "New"
  | "Next"
  | "Of"
  | "On"
  | "Operator"
  | "Option"
  | "Optional"
  | "Overloads"
  | "Overridable"
  | "Overrides"
  | "ParamArray"
  | "Partial"
  | "Private"
  | "Property"
  | "Protected"
  | "Public"
  | "RaiseEvent"
  | "ReadOnly"
  | "ReDim"
  | "REM"
  | "Resume"
  | "Return"
  | "Select"
  | "Set"
  | "Shadows"
  | "Shared"
  | "Static"
  | "Step"
  | "Stop"
  | "Structure"
  | "Sub"
  | "SyncLock"
  | "Then"
  | "Throw"
  | "To"
  | "Try"
  | "TryCast"
  | "TypeOf"
  | "Until"
  | "Using"
  | "When"
  | "While"
  | "Widening"
  | "With"
  | "WithEvents"
  | "WriteOnly"
  | "And"
  | "AndAlso"
  | "Or"
  | "OrElse"
  | "Not"
  | "Xor"
  | "Like"
  | "Is"
  | "IsNot"
  | "Mod"
  | "True"
  | "False"
  | "Null"
  | "Unassigned"
  | "Empty";

type KeywordSugar = "Enun";

type Keyword = KeywordNative | KeywordSugar;

export interface KeywordConfig {
  name: KeywordNative;
  control?: boolean;
  allowName?: boolean;
  operator?: boolean;
  constant?: boolean;
  category?: "control" | "operator" | "constant";
  sugarId?: string;
}

export type KeywordSource = "native" | "sugar";

export type KeywordCategory = "control" | "operator" | "constant";

export interface KeywordDefinition {
  readonly canonical: Keyword;
  readonly source: KeywordSource;
  readonly category: KeywordCategory;
  readonly sugarId?: string;
}

// Master configuration list for all canonical language keywords, operators, and constants.
const kcontrol = (name: KeywordNative, allowName = false): KeywordConfig => {
  return { name, control: true, allowName };
};

const noperator = (name: KeywordNative): KeywordConfig => {
  return { name, operator: true };
};
const nconstant = (name: KeywordNative, allowName = true): KeywordConfig => {
  return { name, constant: true, allowName };
};
export const KEYWORD_CONFIGS: KeywordConfig[] = [
  kcontrol("AddHandler"),
  kcontrol("AddressOf"),
  kcontrol("Alias", true),
  kcontrol("As"),
  kcontrol("ByRef", true),
  kcontrol("ByVal", true),
  kcontrol("Call"),
  kcontrol("Case"),
  kcontrol("Catch"),
  kcontrol("CBool", true),
  kcontrol("CByte", true),
  kcontrol("CChar", true),
  kcontrol("CDate", true),
  kcontrol("CDec", true),
  kcontrol("CDbl", true),
  kcontrol("CInt", true),
  kcontrol("Class"),
  kcontrol("CLng", true),
  kcontrol("CObj", true),
  kcontrol("Const", true),
  kcontrol("Continue", true),
  kcontrol("CShort", true),
  kcontrol("CSng", true),
  kcontrol("CStr", true),
  kcontrol("CType", true),
  kcontrol("Declare", true),
  kcontrol("Default", true),
  kcontrol("Delegate"),
  kcontrol("Dim"),
  kcontrol("Do"),
  kcontrol("Each"),
  kcontrol("Else"),
  kcontrol("ElseIf"),
  kcontrol("End"),
  kcontrol("Enum"),
  kcontrol("Erase"),
  kcontrol("Error", true),
  kcontrol("Event"),
  kcontrol("Exit"),
  kcontrol("Finally"),
  kcontrol("For"),
  kcontrol("Friend"),
  kcontrol("Function"),
  kcontrol("Get", true),
  kcontrol("GetType"),
  kcontrol("Global", true),
  kcontrol("GoTo"),
  kcontrol("Handles"),
  kcontrol("If"),
  kcontrol("Implements"),
  kcontrol("Imports"),
  kcontrol("In"),
  kcontrol("Inherits"),
  kcontrol("Interface"),
  kcontrol("Let"),
  kcontrol("Lib", true),
  kcontrol("Loop"),
  kcontrol("Me"),
  kcontrol("Module"),
  kcontrol("MustInherit"),
  kcontrol("MustOverride", true),
  kcontrol("MyBase"),
  kcontrol("MyClass"),
  kcontrol("Namespace"),
  kcontrol("Narrowing"),
  kcontrol("New", true),
  kcontrol("Next"),
  kcontrol("Of"),
  kcontrol("On"),
  kcontrol("Operator"),
  kcontrol("Option", true),
  kcontrol("Optional"),
  kcontrol("Overloads"),
  kcontrol("Overridable"),
  kcontrol("Overrides"),
  kcontrol("ParamArray"),
  kcontrol("Partial"),
  kcontrol("Private"),
  kcontrol("Property"),
  kcontrol("Protected"),
  kcontrol("Public"),
  kcontrol("RaiseEvent"),
  kcontrol("ReadOnly", true),
  kcontrol("ReDim"),
  kcontrol("REM"),
  kcontrol("Resume"),
  kcontrol("Return"),
  kcontrol("Select"),
  kcontrol("Set", true),
  kcontrol("Shadows", true),
  kcontrol("Shared", true),
  kcontrol("Static"),
  kcontrol("Step"),
  kcontrol("Stop"),
  kcontrol("Structure"),
  kcontrol("Sub"),
  kcontrol("SyncLock"),
  kcontrol("Then"),
  kcontrol("Throw"),
  kcontrol("To"),
  kcontrol("Try"),
  kcontrol("TryCast", true),
  kcontrol("TypeOf", true),
  kcontrol("Until"),
  kcontrol("Using"),
  kcontrol("When"),
  kcontrol("While"),
  kcontrol("Widening"),
  kcontrol("With"),
  kcontrol("WithEvents"),
  kcontrol("WriteOnly"),

  // Operators
  noperator("And"),
  noperator("AndAlso"),
  noperator("Or"),
  noperator("OrElse"),
  noperator("Not"),
  noperator("Xor"),
  noperator("Like"),
  noperator("Is"),
  noperator("IsNot"),
  noperator("Mod"),

  // Constants
  nconstant("True"),
  nconstant("False"),
  nconstant("Null"),
  nconstant("Unassigned"),
  nconstant("Empty"),
].sort((a, b) => a.name.localeCompare(b.name));

// 1. Control keywords (native flow control, declarations, modifiers, structural keywords, type conversions)
export const NATIVE_CONTROL_KEYWORDS: readonly KeywordNative[] = KEYWORD_CONFIGS.filter(
  (k) => "control" in k && k.control,
).map((k) => k.name);

// 2. Logical, Relational, and Arithmetic Operator Keywords
export const LOGICAL_OPERATOR_KEYWORDS: readonly KeywordNative[] = KEYWORD_CONFIGS.filter(
  (k) => "operator" in k && k.operator,
).map((k) => k.name);

// 3. Constants / Special literal values
export const CONSTANT_KEYWORDS: readonly KeywordNative[] = KEYWORD_CONFIGS.filter(
  (k) => "constant" in k && k.constant,
).map((k) => k.name);

// 4. Sugar Keywords
const scontrol = (canonical: KeywordSugar, sugarId: string): KeywordDefinition => {
  return { canonical, source: "sugar", category: "control", sugarId };
};

export const SUGAR_KEYWORDS: readonly KeywordDefinition[] = [scontrol("Enun", "enum")];

export const LANGUAGE_KEYWORDS: readonly KeywordDefinition[] = [
  ...NATIVE_CONTROL_KEYWORDS.map((canonical) => ({
    canonical,
    source: "native" as const,
    category: "control" as const,
  })),
  ...LOGICAL_OPERATOR_KEYWORDS.map((canonical) => ({
    canonical,
    source: "native" as const,
    category: "operator" as const,
  })),
  ...CONSTANT_KEYWORDS.map((canonical) => ({
    canonical,
    source: "native" as const,
    category: "constant" as const,
  })),
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

// Keywords that are allowed to be parsed as identifiers/member names (e.g. in consumeNameToken)
export const ALLOWED_NAME_KEYWORDS: ReadonlySet<string> = new Set(
  KEYWORD_CONFIGS.filter((k) => "allowName" in k && k.allowName).map((k) => k.name.toLowerCase()),
);

import type { SugarPlugin } from "../types";
import { enumSugarPlugin } from "./enum";
import { inlineIfSugarPlugin } from "./inline-if";
import { ArrayListParserPlugin } from "./array-list/parser";
import { TernaryParserPlugin } from "./ternary/parser";
import { NullCoalesceParserPlugin } from "./null-coalesce/parser";
import { OptionalChainParserPlugin } from "./optional-chain/parser";
import { InterpolationParserPlugin } from "./interpolation/parser";
import { TaggedTemplateParserPlugin } from "./tagged-template/parser";
import { ObjectInitializerParserPlugin } from "./object-initializer/parser";
import { UsingParserPlugin } from "./using/parser";
import { ReturnIfParserPlugin } from "./return-if/parser";
import { PipeParserPlugin } from "./pipe/parser";
import { DestructureParserPlugin } from "./destructure/parser";

function metadata(plugin: SugarPlugin): SugarPlugin {
  return plugin;
}

export const builtInSugarPlugins: readonly SugarPlugin[] = [
  inlineIfSugarPlugin,
  metadata({
    id: "array-list",
    displayName: "Array List",
    description: "Materializes modern array syntax on top of TTList<T>.",
    enabledByDefault: true,
    syntaxKinds: [
      "VariableDeclaration(array)",
      "ArrayLiteralExpression",
      "SpreadExpression",
      "ArrayAccessExpression",
      "ArrowFunctionExpression",
      "MethodInvocation(map/filter/find/findIndex/some/every/reduce/forEach)",
    ],
    createParserPlugin: () => new ArrayListParserPlugin(),
  }),
  metadata({
    id: "for-each",
    displayName: "For Each",
    description: "Expands For Each over enumerable values into indexed For loops.",
    enabledByDefault: true,
    syntaxKinds: ["ForEachStatement"],
    diagnosticCodes: ["not-enumerable"],
  }),
  metadata({
    id: "for-each-range",
    displayName: "For Each Range",
    description: "Expands For Each over a..b ranges into native For loops.",
    enabledByDefault: true,
    syntaxKinds: ["ForEachStatement", "BinaryExpression(..)"],
  }),
  metadata({
    id: "ternary",
    displayName: "Ternary",
    description: "Expands cond ? a : b in supported assignment contexts.",
    enabledByDefault: true,
    syntaxKinds: ["TernaryExpression"],
    diagnosticCodes: ["ternary-context-unsupported"],
    createParserPlugin: () => new TernaryParserPlugin(),
  }),
  metadata({
    id: "null-coalesce",
    displayName: "Null Coalescing",
    description: "Expands ?? and ??= into explicit null checks.",
    enabledByDefault: true,
    syntaxKinds: ["NullCoalescingExpression", "Assignment(??=)"],
    diagnosticCodes: ["null-coalesce-context-unsupported"],
    createParserPlugin: () => new NullCoalesceParserPlugin(),
  }),
  metadata({
    id: "logical-assignment",
    displayName: "Logical Assignment",
    description: "Expands ||= and &&= into explicit If assignments.",
    enabledByDefault: true,
    syntaxKinds: ["Assignment(||=)", "Assignment(&&=)"],
  }),
  metadata({
    id: "optional-chain",
    displayName: "Optional Chaining",
    description: "Expands shallow optional chaining into null-guarded native code.",
    enabledByDefault: true,
    syntaxKinds: ["OptionalChainingExpression"],
    diagnosticCodes: ["optional-chain-context-unsupported", "optional-chain-too-deep"],
    createParserPlugin: () => new OptionalChainParserPlugin(),
  }),
  metadata({
    id: "numeric-separator",
    displayName: "Numeric Separator",
    description: "Removes underscores between digits before parsing.",
    enabledByDefault: true,
  }),
  metadata({
    id: "interpolation",
    displayName: "String Interpolation",
    description: "Expands interpolated strings into native concatenation.",
    enabledByDefault: true,
    syntaxKinds: ["TaggedTemplateExpression(tag='')"],
    diagnosticCodes: ["invalid-interpolation"],
    createParserPlugin: () => new InterpolationParserPlugin(),
  }),
  metadata({
    id: "tagged-template",
    displayName: "Tagged Templates",
    description: "Expands tagged template expressions into custom builder calls.",
    enabledByDefault: true,
    syntaxKinds: ["TaggedTemplateExpression"],
    createParserPlugin: () => new TaggedTemplateParserPlugin(),
  }),
  metadata({
    id: "object-initializer",
    displayName: "Object Initializer",
    description: "Expands New T() With { .A = ... } into creation plus assignments.",
    enabledByDefault: true,
    syntaxKinds: ["ObjectInitializerExpression"],
    createParserPlugin: () => new ObjectInitializerParserPlugin(),
  }),
  metadata({
    id: "using",
    displayName: "Using",
    description: "Expands Using blocks into Try/Finally with Free().",
    enabledByDefault: true,
    syntaxKinds: ["UsingStatement"],
    diagnosticCodes: ["using-non-disposable"],
    createParserPlugin: () => new UsingParserPlugin(),
  }),
  enumSugarPlugin,
  metadata({
    id: "return-if",
    displayName: "Return If",
    description: "Parses Return If ... Then ... Else ... as a returnable ternary form.",
    enabledByDefault: true,
    syntaxKinds: ["ReturnStatement", "TernaryExpression"],
    createParserPlugin: () => new ReturnIfParserPlugin(),
  }),
  metadata({
    id: "pipe",
    displayName: "Pipe",
    description: "Expands left |> right into a call that passes left as the first argument.",
    enabledByDefault: true,
    syntaxKinds: ["PipeExpression"],
    createParserPlugin: () => new PipeParserPlugin(),
  }),
  metadata({
    id: "destructure-object",
    displayName: "Object Destructuring",
    description: "Expands object destructuring declarations into member assignments.",
    enabledByDefault: true,
    syntaxKinds: ["DestructuredVariableDeclaration(object)"],
    diagnosticCodes: ["destructure-context-unsupported", "destructure-unknown-member"],
    createParserPlugin: () => new DestructureParserPlugin(true, false),
  }),
  metadata({
    id: "destructure-array",
    displayName: "Array Destructuring",
    description: "Expands array/list destructuring declarations into Item(index) accesses.",
    enabledByDefault: true,
    syntaxKinds: ["DestructuredVariableDeclaration(array)"],
    diagnosticCodes: ["destructure-context-unsupported", "destructure-non-array"],
    createParserPlugin: () => new DestructureParserPlugin(false, true),
  }),
  metadata({
    id: "auto-new",
    displayName: "Auto New",
    description:
      "Normalizes Dim x As New T into Dim x As New T(), and collapses As T = New T() for locals when types match. Class fields keep As T = New T().",
    enabledByDefault: true,
    syntaxKinds: ["VariableDeclaration"],
    diagnosticCodes: ["auto-new-non-default-ctor"],
  }),
  metadata({
    id: "logger-print",
    displayName: "Logger Print",
    description: "Rewrites global Print calls to the core logger after all other sugars run.",
    enabledByDefault: true,
    priority: 1000,
    syntaxKinds: ["MethodInvocation(Print)"],
  }),
];

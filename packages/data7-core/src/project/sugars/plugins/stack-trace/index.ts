import type { SugarPlugin } from "../../types";
import { STACK_TRACE_SUGAR_ID } from "./transformer";

export const stackTraceSugarPlugin: SugarPlugin = {
  id: STACK_TRACE_SUGAR_ID,
  displayName: "Stack Trace",
  description:
    "Injects StackTrace.Push/Pop around methods and wraps Principal entry in Try/Catch/Finally.",
  enabledByDefault: false,
  priority: 2000,
  syntaxKinds: ["MethodDeclaration", "PropertyDeclaration", "ReturnStatement", "ExitStatement"],
};

export {
  STACK_TRACE_MODULE_NAME,
  STACK_TRACE_NAMESPACE,
  STACK_TRACE_SUGAR_ID,
  StackTraceSugarTransformer,
  packagedUnitFileName,
  rewriteGeneratedStackTraceLocations,
} from "./transformer";

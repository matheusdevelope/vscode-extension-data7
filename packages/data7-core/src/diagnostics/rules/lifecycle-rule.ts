import type { Rule, RuleContext } from "./base-rule";
import type { CompilationUnit } from "../../project/ast/ast";
import { validateMyBaseNewCalls, validateMyBaseFreeCalls } from "../structural-diagnostics";

export class LifecycleRule implements Rule {
  public readonly name = "lifecycle";

  public onEnd(unit: CompilationUnit, context: RuleContext): void {
    validateMyBaseNewCalls(unit, context.diagnostics);

    const fileSyms = context.indexer.getFileSymbols(context.document.uri.toString());
    validateMyBaseFreeCalls(unit, fileSyms, context.diagnostics);
  }
}

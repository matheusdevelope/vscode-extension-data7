import type { IfStatement } from "../../../ast/ast";

export function expandInlineIf(s: IfStatement): IfStatement {
  if (s.singleLine) {
    s.singleLine = false;
  }
  return s;
}

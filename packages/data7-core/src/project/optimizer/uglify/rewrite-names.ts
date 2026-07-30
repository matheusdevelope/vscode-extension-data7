import {
  ASTWalker,
  type CompilationUnit,
  type Expression,
  type MethodDeclaration,
  type Node,
  type Statement,
  type TypeReference,
} from "../../ast/ast";
import { createLocalRenameMap, type UglifyRenameMaps } from "./collect-renames";
import {
  bindingTypeLowerFromDeclaration,
  resolveReceiverTypeLower,
  typeReferenceSimpleLower,
  userTypeOwnsMember,
  type ReceiverScope,
} from "./user-type-index";

function renameDottedName(name: string, maps: UglifyRenameMaps): string {
  const parts = name.split(".");
  if (parts.length === 0) return name;
  const renamed = parts.map((part) => {
    const lower = part.toLowerCase();
    return maps.namespaces.get(lower) ?? maps.types.get(lower) ?? part;
  });
  return renamed.join(".");
}

function rewriteTypeReference(type: TypeReference, maps: UglifyRenameMaps): void {
  type.name = renameDottedName(type.name, maps);
  for (const arg of type.typeArguments) rewriteTypeReference(arg, maps);
}

function resolveMemberRename(
  memberName: string,
  maps: UglifyRenameMaps,
  receiverTypeLower: string | undefined,
  namespaceLower?: string,
): string {
  const lower = memberName.toLowerCase();

  // Nested class access (`WinAPI.Window`) must win over an unrelated Property/Method
  // that shares the same simple name in the global members map.
  if (receiverTypeLower) {
    const nestedRename = maps.nestedTypes.get(receiverTypeLower)?.get(lower);
    if (nestedRename !== undefined) return nestedRename;
    // Also try simple receiver key for nestedTypes (maps use simple parent names).
    const simpleReceiver = receiverTypeLower.includes(".")
      ? receiverTypeLower.slice(receiverTypeLower.lastIndexOf(".") + 1)
      : receiverTypeLower;
    if (simpleReceiver !== receiverTypeLower) {
      const nestedSimple = maps.nestedTypes.get(simpleReceiver)?.get(lower);
      if (nestedSimple !== undefined) return nestedSimple;
    }
  }

  const memberRename = maps.members.get(lower);
  if (memberRename !== undefined) {
    if (
      receiverTypeLower &&
      userTypeOwnsMember(receiverTypeLower, lower, maps.userTypes, namespaceLower)
    ) {
      return memberRename;
    }
    if (receiverTypeLower && maps.namespaceMembers.get(receiverTypeLower)?.has(lower)) {
      return memberRename;
    }
    // Qualified class key `ns.type` — namespace members are keyed by simple ns name.
    if (receiverTypeLower?.includes(".")) {
      const ns = receiverTypeLower.slice(0, receiverTypeLower.indexOf("."));
      if (maps.namespaceMembers.get(ns)?.has(lower)) return memberRename;
    }
    return memberName;
  }

  return maps.types.get(lower) ?? maps.namespaces.get(lower) ?? memberName;
}

/**
 * Bare calls (`pHandler(...)`, `TTObject(x)`) store the name in `methodName`.
 * Qualified calls gate System-Library-colliding names on the receiver's user type.
 */
function renameMethodInvocationName(
  node: { callee?: Expression; methodName: string },
  maps: UglifyRenameMaps,
  locals: ReadonlyMap<string, string> | undefined,
  receiverTypeLower: string | undefined,
  namespaceLower?: string,
): void {
  const lower = node.methodName.toLowerCase();
  if (lower.length === 0) return;

  if (!node.callee) {
    const localNext = locals?.get(lower);
    if (localNext !== undefined) {
      node.methodName = localNext;
      return;
    }
    const typeNext = maps.types.get(lower) ?? maps.namespaces.get(lower);
    if (typeNext !== undefined) {
      node.methodName = typeNext;
      return;
    }
    const memberNext = maps.members.get(lower);
    if (memberNext !== undefined && !maps.systemCollidingMembers.has(lower)) {
      node.methodName = memberNext;
    }
    return;
  }

  node.methodName = resolveMemberRename(node.methodName, maps, receiverTypeLower, namespaceLower);
}

/**
 * Apply global declaration renames and per-method local renames in place.
 */
export function applyUglifyRenames(unit: CompilationUnit, maps: UglifyRenameMaps): void {
  const globalTaken = [
    ...maps.namespaces.values(),
    ...maps.types.values(),
    ...maps.members.values(),
  ];
  const typeNames = new Set<string>([...maps.types.keys(), ...maps.userTypes.keys()]);
  const namespaceNames = maps.namespaceNames;

  const declarationRenamer = new (class extends ASTWalker {
    private currentClassLower: string | undefined;
    private currentBaseLower: string | undefined;
    private currentNamespaceLower: string | undefined;
    private readonly typeBindings = new Map<string, string>();
    private readonly withTypeStack: string[] = [];
    /**
     * VB-style function/property return: `IndexOf = value` / `Name = ...`
     * maps the routine's original name to its uglified name within the body.
     */
    private currentRoutineRename:
      | { readonly originalLower: string; readonly renamed: string }
      | undefined;

    private scope(): ReceiverScope {
      return {
        currentClassLower: this.currentClassLower,
        currentBaseLower: this.currentBaseLower,
        currentNamespaceLower: this.currentNamespaceLower,
        withTypeLower: this.withTypeStack[this.withTypeStack.length - 1],
        bindings: this.typeBindings,
        namespaceNames,
      };
    }

    private memberRename(memberName: string, receiverTypeLower: string | undefined): string {
      return resolveMemberRename(memberName, maps, receiverTypeLower, this.currentNamespaceLower);
    }

    private effectiveReceiverType(expression: Expression | undefined): string | undefined {
      if (
        expression &&
        expression.kind === "Identifier" &&
        expression.name === "" &&
        this.withTypeStack.length > 0
      ) {
        return this.withTypeStack[this.withTypeStack.length - 1];
      }
      if (!expression && this.withTypeStack.length > 0) {
        return this.withTypeStack[this.withTypeStack.length - 1];
      }
      return this.receiverTypeOf(expression);
    }

    private bindName(name: string, typeLower: string | undefined): void {
      if (!typeLower) return;
      this.typeBindings.set(name.toLowerCase(), typeLower);
    }

    private receiverTypeOf(expression: Expression | undefined): string | undefined {
      return resolveReceiverTypeLower(expression, this.scope(), maps.userTypes, typeNames);
    }

    public override walk(node: Node | undefined): void {
      if (!node) return;

      if (node.kind === "NamespaceDeclaration") {
        const originalNs = node.name.toLowerCase();
        const previousNs = this.currentNamespaceLower;
        this.currentNamespaceLower = originalNs;
        const next = maps.namespaces.get(originalNs);
        if (next !== undefined) node.name = next;
        for (const member of node.members) this.walk(member);
        this.currentNamespaceLower = previousNs;
        return;
      }

      if (node.kind === "ClassDeclaration") {
        const originalLower = node.name.toLowerCase();
        const next = maps.types.get(originalLower);
        if (next !== undefined) node.name = next;

        const previousClass = this.currentClassLower;
        const previousBase = this.currentBaseLower;
        // Prefer namespace-qualified keys so homonymous classes in other namespaces
        // (mod_enum.TEnum vs mod_tenum.TEnum) do not share a member type map.
        this.currentClassLower = this.currentNamespaceLower
          ? `${this.currentNamespaceLower}.${originalLower}`
          : originalLower;
        this.currentBaseLower =
          maps.userTypes.get(this.currentClassLower)?.baseLower ??
          maps.userTypes.get(originalLower)?.baseLower ??
          typeReferenceSimpleLower(node.baseType);

        for (const member of node.members) {
          if (member.kind === "FieldDeclaration") {
            this.bindName(member.name, typeReferenceSimpleLower(member.type));
          } else if (member.kind === "PropertyDeclaration") {
            this.bindName(member.name, typeReferenceSimpleLower(member.type));
          }
        }

        if (node.baseType) rewriteTypeReference(node.baseType, maps);
        for (const tp of node.typeParameters) this.walk(tp);
        for (const member of node.members) this.walk(member);

        this.currentClassLower = previousClass;
        this.currentBaseLower = previousBase;
        return;
      }

      if (node.kind === "EnumDeclaration") {
        const next = maps.types.get(node.name.toLowerCase());
        if (next !== undefined) node.name = next;
        if (node.baseType) rewriteTypeReference(node.baseType, maps);
        for (const entry of node.entries) {
          const entryNext = maps.members.get(entry.name.toLowerCase());
          if (entryNext !== undefined) entry.name = entryNext;
          if (entry.value) this.walk(entry.value);
        }
        return;
      }

      if (node.kind === "DelegateDeclaration") {
        const next = maps.types.get(node.name.toLowerCase());
        if (next !== undefined) node.name = next;
        for (const tp of node.typeParameters) this.walk(tp);
        const delegateLocals = createLocalRenameMap(
          {
            kind: "MethodDeclaration",
            name: "__delegate",
            typeParameters: [],
            parameters: [...node.parameters],
            body: [],
          },
          globalTaken,
        );
        for (const parameter of node.parameters) {
          const localNext = delegateLocals.get(parameter.name.toLowerCase());
          if (localNext !== undefined) parameter.name = localNext;
          rewriteTypeReference(parameter.type, maps);
          if (parameter.defaultValue) this.walk(parameter.defaultValue);
        }
        if (node.returnType) rewriteTypeReference(node.returnType, maps);
        return;
      }

      if (node.kind === "MethodDeclaration") {
        this.rewriteMethod(node);
        return;
      }

      if (node.kind === "PropertyDeclaration") {
        const originalName = node.name;
        const typeLower = typeReferenceSimpleLower(node.type);
        const next = maps.members.get(node.name.toLowerCase());
        if (next !== undefined) {
          node.name = next;
          this.bindName(next, typeLower);
          this.bindName(originalName, typeLower);
        }
        rewriteTypeReference(node.type, maps);
        if (node.parameters) {
          for (const parameter of node.parameters) this.walk(parameter);
        }
        const returnAlias = {
          originalLower: originalName.toLowerCase(),
          renamed: node.name,
        };
        if (node.getter) this.rewriteMethod(node.getter, returnAlias);
        if (node.setter) this.rewriteMethod(node.setter, returnAlias);
        return;
      }

      if (node.kind === "FieldDeclaration") {
        const originalName = node.name;
        const typeLower = typeReferenceSimpleLower(node.type);
        const next = maps.members.get(node.name.toLowerCase());
        if (next !== undefined) {
          node.name = next;
          this.bindName(next, typeLower);
          this.bindName(originalName, typeLower);
        }
        rewriteTypeReference(node.type, maps);
        if (node.initializer) this.walkExpression(node.initializer, new Map());
        if (node.nativeArrayDimensions) {
          for (const dimension of node.nativeArrayDimensions) {
            this.walkExpression(dimension, new Map());
          }
        }
        return;
      }

      if (node.kind === "VariableDeclaration") {
        // Top-level Dim (e.g. Principal.bas seeds) must bind before member rename so
        // later `g.Touch()` can gate System-Library-colliding renames on the user type.
        const originalName = node.name;
        const typeLower = bindingTypeLowerFromDeclaration(node);
        this.bindName(originalName, typeLower);
        const next = maps.members.get(node.name.toLowerCase());
        if (next !== undefined) {
          node.name = next;
          this.bindName(next, typeLower);
        }
        if (node.type) rewriteTypeReference(node.type, maps);
        if (node.initializer) this.walkExpression(node.initializer, new Map());
        if (node.nativeArrayDimensions) {
          for (const dimension of node.nativeArrayDimensions) {
            this.walkExpression(dimension, new Map());
          }
        }
        return;
      }

      if (node.kind === "ImportsDeclaration") {
        node.target = renameDottedName(node.target, maps);
        return;
      }

      if (node.kind === "TypeReference") {
        rewriteTypeReference(node, maps);
        return;
      }

      if (node.kind === "MemberAccess") {
        const receiverType = this.effectiveReceiverType(node.target);
        this.walk(node.target);
        node.member = this.memberRename(node.member, receiverType);
        return;
      }

      if (node.kind === "MethodInvocation") {
        const receiverType = this.effectiveReceiverType(node.callee);
        if (node.callee) this.walk(node.callee);
        renameMethodInvocationName(node, maps, undefined, receiverType, this.currentNamespaceLower);
        for (const typeArg of node.typeArguments) rewriteTypeReference(typeArg, maps);
        for (const arg of node.arguments) this.walk(arg);
        return;
      }

      if (node.kind === "Identifier") {
        const lower = node.name.toLowerCase();
        const next =
          maps.namespaces.get(lower) ??
          maps.types.get(lower) ??
          (maps.systemCollidingMembers.has(lower) ? undefined : maps.members.get(lower));
        if (next !== undefined) node.name = next;
        return;
      }

      super.walk(node);
    }

    private rewriteMethod(
      method: MethodDeclaration,
      returnAlias?: { readonly originalLower: string; readonly renamed: string },
    ): void {
      const originalLower = method.name.toLowerCase();
      if (!method.isConstructor && method.libName === undefined) {
        const next = maps.members.get(originalLower);
        if (next !== undefined) method.name = next;
      }
      for (const tp of method.typeParameters) this.walk(tp);
      if (method.returnType) rewriteTypeReference(method.returnType, maps);

      const locals = createLocalRenameMap(method, globalTaken);
      const previousRoutine = this.currentRoutineRename;
      this.currentRoutineRename = returnAlias ?? {
        originalLower,
        renamed: method.name,
      };

      for (const parameter of method.parameters) {
        const original = parameter.name;
        const typeLower = typeReferenceSimpleLower(parameter.type);
        this.bindName(original, typeLower);
        const localNext = locals.get(parameter.name.toLowerCase());
        if (localNext !== undefined) {
          parameter.name = localNext;
          this.bindName(localNext, typeLower);
        }
        rewriteTypeReference(parameter.type, maps);
        if (parameter.defaultValue) this.walkExpression(parameter.defaultValue, locals);
      }

      for (const statement of method.body) {
        this.walkStatement(statement, locals);
      }

      this.currentRoutineRename = previousRoutine;
    }

    private walkStatement(statement: Statement, locals: ReadonlyMap<string, string>): void {
      switch (statement.kind) {
        case "VariableDeclaration": {
          const original = statement.name;
          const typeLower = bindingTypeLowerFromDeclaration(statement);
          this.bindName(original, typeLower);
          if (statement.initializer) this.walkExpression(statement.initializer, locals);
          const localNext = locals.get(statement.name.toLowerCase());
          if (localNext !== undefined) {
            statement.name = localNext;
            this.bindName(localNext, typeLower);
          }
          if (statement.type) rewriteTypeReference(statement.type, maps);
          if (statement.nativeArrayDimensions) {
            for (const dimension of statement.nativeArrayDimensions) {
              this.walkExpression(dimension, locals);
            }
          }
          return;
        }
        case "ForStatement": {
          const localNext = locals.get(statement.counter.name.toLowerCase());
          if (localNext !== undefined) statement.counter.name = localNext;
          this.walkExpression(statement.start, locals);
          this.walkExpression(statement.end, locals);
          if (statement.step) this.walkExpression(statement.step, locals);
          for (const body of statement.body) this.walkStatement(body, locals);
          return;
        }
        case "ForEachStatement": {
          const localNext = locals.get(statement.elementVar.name.toLowerCase());
          if (localNext !== undefined) statement.elementVar.name = localNext;
          if (statement.elementType) {
            this.bindName(
              statement.elementVar.name,
              typeReferenceSimpleLower(statement.elementType),
            );
            rewriteTypeReference(statement.elementType, maps);
          }
          this.walkExpression(statement.enumerable, locals);
          for (const body of statement.body) this.walkStatement(body, locals);
          return;
        }
        case "UsingStatement": {
          const original = statement.resourceVar.name;
          const typeLower = typeReferenceSimpleLower(statement.resourceType);
          this.bindName(original, typeLower);
          const localNext = locals.get(statement.resourceVar.name.toLowerCase());
          if (localNext !== undefined) {
            statement.resourceVar.name = localNext;
            this.bindName(localNext, typeLower);
          }
          rewriteTypeReference(statement.resourceType, maps);
          for (const arg of statement.resourceArgs) this.walkExpression(arg, locals);
          for (const body of statement.body) this.walkStatement(body, locals);
          return;
        }
        case "TryCatchStatement": {
          for (const body of statement.tryBody) this.walkStatement(body, locals);
          if (statement.catchVar) {
            const typeLower = typeReferenceSimpleLower(statement.catchType);
            this.bindName(statement.catchVar.name, typeLower);
            const localNext = locals.get(statement.catchVar.name.toLowerCase());
            if (localNext !== undefined) {
              statement.catchVar.name = localNext;
              this.bindName(localNext, typeLower);
            }
          }
          if (statement.catchType) rewriteTypeReference(statement.catchType, maps);
          for (const body of statement.catchBody) this.walkStatement(body, locals);
          if (statement.finallyBody) {
            for (const body of statement.finallyBody) this.walkStatement(body, locals);
          }
          return;
        }
        case "IfStatement": {
          this.walkExpression(statement.condition, locals);
          for (const body of statement.thenBranch) this.walkStatement(body, locals);
          for (const branch of statement.elseIfBranches) {
            this.walkExpression(branch.condition, locals);
            for (const body of branch.body) this.walkStatement(body, locals);
          }
          if (statement.elseBranch) {
            for (const body of statement.elseBranch) this.walkStatement(body, locals);
          }
          return;
        }
        case "WhileStatement": {
          this.walkExpression(statement.condition, locals);
          for (const body of statement.body) this.walkStatement(body, locals);
          return;
        }
        case "WithStatement": {
          // Resolve With target type before renaming so userTypes keys still match.
          const withType = this.receiverTypeOf(statement.expression);
          if (withType) this.withTypeStack.push(withType);
          this.walkExpression(statement.expression, locals);
          for (const body of statement.body) this.walkStatement(body, locals);
          if (withType) this.withTypeStack.pop();
          return;
        }
        case "SelectCaseStatement": {
          this.walkExpression(statement.expression, locals);
          for (const branch of statement.cases) {
            // Case labels (`Case Type.Member()`, `Case EnumEntry`) must rename too.
            for (const value of branch.values) this.walkExpression(value, locals);
            for (const body of branch.body) this.walkStatement(body, locals);
          }
          return;
        }
        case "Block": {
          for (const body of statement.statements) this.walkStatement(body, locals);
          return;
        }
        case "Assignment": {
          this.walkExpression(statement.target, locals);
          this.walkExpression(statement.value, locals);
          return;
        }
        case "ExpressionStatement": {
          this.walkExpression(statement.expression, locals);
          return;
        }
        case "ReturnStatement": {
          if (statement.expression) this.walkExpression(statement.expression, locals);
          return;
        }
        case "ThrowStatement": {
          this.walkExpression(statement.expression, locals);
          return;
        }
        case "DestructuredVariableDeclaration": {
          for (const binding of statement.bindings) {
            const localNext = locals.get(binding.name.toLowerCase());
            if (localNext !== undefined) binding.name = localNext;
            if (binding.defaultValue) this.walkExpression(binding.defaultValue, locals);
          }
          this.walkExpression(statement.initializer, locals);
          return;
        }
        default:
          return;
      }
    }

    private walkExpression(expression: Expression, locals: ReadonlyMap<string, string>): void {
      switch (expression.kind) {
        case "Identifier": {
          const lower = expression.name.toLowerCase();
          const localNext = locals.get(lower);
          if (localNext !== undefined) {
            expression.name = localNext;
            return;
          }
          // VB-style `FunctionName = expr` / property return assignments.
          if (this.currentRoutineRename && lower === this.currentRoutineRename.originalLower) {
            expression.name = this.currentRoutineRename.renamed;
            return;
          }
          const next =
            maps.namespaces.get(lower) ??
            maps.types.get(lower) ??
            (maps.systemCollidingMembers.has(lower) ? undefined : maps.members.get(lower));
          if (next !== undefined) expression.name = next;
          return;
        }
        case "MemberAccess": {
          const receiverType = this.effectiveReceiverType(expression.target);
          this.walkExpression(expression.target, locals);
          expression.member = this.memberRename(expression.member, receiverType);
          return;
        }
        case "MethodInvocation": {
          const receiverType = this.effectiveReceiverType(expression.callee);
          if (expression.callee) this.walkExpression(expression.callee, locals);
          // Recursive / same-routine bare call: `IndexOf(x)` inside Function IndexOf.
          if (
            !expression.callee &&
            this.currentRoutineRename &&
            expression.methodName.toLowerCase() === this.currentRoutineRename.originalLower &&
            !this.scope().withTypeLower
          ) {
            expression.methodName = this.currentRoutineRename.renamed;
          } else {
            renameMethodInvocationName(
              expression,
              maps,
              locals,
              receiverType,
              this.currentNamespaceLower,
            );
          }
          for (const typeArg of expression.typeArguments) rewriteTypeReference(typeArg, maps);
          for (const arg of expression.arguments) this.walkExpression(arg, locals);
          return;
        }
        case "ObjectCreationExpression": {
          rewriteTypeReference(expression.type, maps);
          for (const arg of expression.arguments) this.walkExpression(arg, locals);
          return;
        }
        case "ObjectInitializerExpression": {
          const receiverType = typeReferenceSimpleLower(expression.type);
          rewriteTypeReference(expression.type, maps);
          for (const arg of expression.arguments) this.walkExpression(arg, locals);
          for (const assignment of expression.assignments) {
            assignment.member = this.memberRename(assignment.member, receiverType);
            this.walkExpression(assignment.value, locals);
          }
          return;
        }
        case "TypeReferenceExpression": {
          rewriteTypeReference(expression.type, maps);
          return;
        }
        case "ArrayAccessExpression": {
          this.walkExpression(expression.target, locals);
          this.walkExpression(expression.index, locals);
          if (expression.indices) {
            for (const index of expression.indices) this.walkExpression(index, locals);
          }
          return;
        }
        case "BinaryExpression": {
          this.walkExpression(expression.left, locals);
          this.walkExpression(expression.right, locals);
          return;
        }
        case "UnaryExpression": {
          this.walkExpression(expression.argument, locals);
          return;
        }
        case "TernaryExpression": {
          this.walkExpression(expression.condition, locals);
          this.walkExpression(expression.trueExpr, locals);
          this.walkExpression(expression.falseExpr, locals);
          return;
        }
        case "NullCoalescingExpression": {
          this.walkExpression(expression.left, locals);
          this.walkExpression(expression.right, locals);
          return;
        }
        case "OptionalChainingExpression": {
          this.walkExpression(expression.target, locals);
          return;
        }
        case "ArrayLiteralExpression": {
          for (const element of expression.elements) {
            if (element.kind === "SpreadExpression") {
              this.walkExpression(element.expression, locals);
            } else {
              this.walkExpression(element, locals);
            }
          }
          return;
        }
        case "SpreadExpression": {
          this.walkExpression(expression.expression, locals);
          return;
        }
        case "ArrowFunctionExpression": {
          const lambdaBody: Statement[] = Array.isArray(expression.body) ? expression.body : [];
          const nested = createLocalRenameMap(
            {
              kind: "MethodDeclaration",
              name: "__lambda",
              typeParameters: [],
              parameters: [...expression.parameters],
              body: lambdaBody,
            },
            [...globalTaken, ...locals.values()],
          );
          for (const parameter of expression.parameters) {
            const typeLower = typeReferenceSimpleLower(parameter.type);
            this.bindName(parameter.name, typeLower);
            const localNext = nested.get(parameter.name.toLowerCase());
            if (localNext !== undefined) {
              parameter.name = localNext;
              this.bindName(localNext, typeLower);
            }
            rewriteTypeReference(parameter.type, maps);
          }
          if (expression.returnType) rewriteTypeReference(expression.returnType, maps);
          if (Array.isArray(expression.body)) {
            for (const statement of expression.body) {
              this.walkStatement(statement, nested);
            }
          } else {
            this.walkExpression(expression.body, nested);
          }
          return;
        }
        case "Literal":
          return;
        default:
          return;
      }
    }
  })();

  declarationRenamer.walk(unit);
}

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  canonicalNameOf,
  flatNameFromParts,
  flatNameOf,
  GenericsMonomorphizer,
  MAX_INSTANTIATIONS,
  type Assignment,
  type ClassDeclaration,
  type ClassMember,
  type CompilationUnit,
  type DelegateDeclaration,
  type Expression,
  type FieldDeclaration,
  type Identifier,
  type Literal,
  type MemberAccess,
  type MethodDeclaration,
  type MethodInvocation,
  type MonomorphizationWarning,
  type MonomorphizationWarningCode,
  type NamespaceDeclaration,
  type ObjectCreationExpression,
  type OpaqueStatement,
  type ParameterDeclaration,
  type Statement,
  type TopLevelMember,
  type TypeParameter,
  type TypeReference,
  type VariableDeclaration,
} from "../../project/generics";

// ----------------------------------------------------------------------------
// Tiny AST builder helpers (test-only; keeps each scenario readable and lets
// the structural assertions stay focused on the engine's behaviour).
// ----------------------------------------------------------------------------

function typeRef(name: string, typeArguments: TypeReference[] = []): TypeReference {
  return { kind: "TypeReference", name, typeArguments };
}
function typeParam(name: string, constraint?: TypeReference): TypeParameter {
  const tp: TypeParameter = { kind: "TypeParameter", name };
  if (constraint) tp.constraint = constraint;
  return tp;
}
function param(name: string, type: TypeReference): ParameterDeclaration {
  return { kind: "ParameterDeclaration", name, type };
}
function field(name: string, type: TypeReference): FieldDeclaration {
  return { kind: "FieldDeclaration", name, type };
}
function method(
  name: string,
  opts: {
    typeParameters?: TypeParameter[];
    parameters?: ParameterDeclaration[];
    returnType?: TypeReference;
    body?: Statement[];
  } = {},
): MethodDeclaration {
  const m: MethodDeclaration = {
    kind: "MethodDeclaration",
    name,
    typeParameters: opts.typeParameters ?? [],
    parameters: opts.parameters ?? [],
    body: opts.body ?? [],
  };
  if (opts.returnType) m.returnType = opts.returnType;
  return m;
}
function classDecl(
  name: string,
  opts: {
    typeParameters?: TypeParameter[];
    baseType?: TypeReference;
    members?: ClassMember[];
  } = {},
): ClassDeclaration {
  const c: ClassDeclaration = {
    kind: "ClassDeclaration",
    name,
    typeParameters: opts.typeParameters ?? [],
    members: opts.members ?? [],
  };
  if (opts.baseType) c.baseType = opts.baseType;
  return c;
}
function delegateDecl(
  name: string,
  opts: {
    typeParameters?: TypeParameter[];
    parameters?: ParameterDeclaration[];
    returnType?: TypeReference;
  } = {},
): DelegateDeclaration {
  const d: DelegateDeclaration = {
    kind: "DelegateDeclaration",
    name,
    typeParameters: opts.typeParameters ?? [],
    parameters: opts.parameters ?? [],
  };
  if (opts.returnType) d.returnType = opts.returnType;
  return d;
}
function namespaceDecl(name: string, members: TopLevelMember[]): NamespaceDeclaration {
  return { kind: "NamespaceDeclaration", name, members };
}
function dim(name: string, type?: TypeReference, initializer?: Expression): VariableDeclaration {
  const v: VariableDeclaration = { kind: "VariableDeclaration", name };
  if (type) v.type = type;
  if (initializer) v.initializer = initializer;
  return v;
}
function newExpr(type: TypeReference, args: Expression[] = []): ObjectCreationExpression {
  return { kind: "ObjectCreationExpression", type, arguments: args };
}
function call(
  methodName: string,
  typeArguments: TypeReference[] = [],
  args: Expression[] = [],
): MethodInvocation {
  return {
    kind: "MethodInvocation",
    methodName,
    typeArguments,
    arguments: args,
  };
}
function id(name: string): Identifier {
  return { kind: "Identifier", name };
}
function lit(value: string | number | boolean | null): Literal {
  return { kind: "Literal", value };
}
function memberAccess(target: Expression, member: string): MemberAccess {
  return { kind: "MemberAccess", target, member };
}
function assign(target: Expression, value: Expression): Assignment {
  return { kind: "Assignment", target, value };
}
function opaque(text: string): OpaqueStatement {
  return { kind: "OpaqueStatement", text };
}
function unit(members: TopLevelMember[]): CompilationUnit {
  return { kind: "CompilationUnit", members };
}

// ----------------------------------------------------------------------------
// Tiny structural matchers (avoid pulling in a deep-equal library).
// ----------------------------------------------------------------------------

function findClass(members: readonly TopLevelMember[], name: string): ClassDeclaration | undefined {
  for (const m of members) {
    if (m.kind === "ClassDeclaration" && m.name === name) return m;
  }
  return undefined;
}
function findMethod(
  members: readonly TopLevelMember[],
  name: string,
): MethodDeclaration | undefined {
  for (const m of members) {
    if (m.kind === "MethodDeclaration" && m.name === name) return m;
  }
  return undefined;
}
function findDelegate(
  members: readonly TopLevelMember[],
  name: string,
): DelegateDeclaration | undefined {
  for (const m of members) {
    if (m.kind === "DelegateDeclaration" && m.name === name) return m;
  }
  return undefined;
}
function findVar(
  members: readonly TopLevelMember[],
  name: string,
): VariableDeclaration | undefined {
  for (const m of members) {
    if (m.kind === "VariableDeclaration" && m.name === name) return m;
  }
  return undefined;
}
function findNamespace(u: CompilationUnit, name: string): NamespaceDeclaration | undefined {
  for (const m of u.members) {
    if (m.kind === "NamespaceDeclaration" && m.name === name) return m;
  }
  return undefined;
}
function classFieldType(c: ClassDeclaration, fieldName: string): TypeReference | undefined {
  for (const m of c.members) {
    if (m.kind === "FieldDeclaration" && m.name === fieldName) return m.type;
  }
  return undefined;
}
function classMethod(c: ClassDeclaration, name: string): MethodDeclaration | undefined {
  for (const m of c.members) {
    if (m.kind === "MethodDeclaration" && m.name === name) return m;
  }
  return undefined;
}
function warningCodes(warnings: readonly MonomorphizationWarning[]): MonomorphizationWarningCode[] {
  return warnings.map((w) => w.code);
}

// ============================================================================
// Tests
// ============================================================================

describe("GenericsMonomorphizer — Scenario A (Box<T As BaseItem>)", () => {
  /**
   * Mirrors the user-source ground-truth case:
   *
   *   Class Box<T As BaseItem>
   *      Public Value As T
   *      Sub New(initVal As T)
   *         me.Value = initVal
   *      End Sub
   *   End Class
   *
   *   Dim b1 As Box<Integer> = New Box<Integer>(10)
   *   Dim b2 As Box<Integer> = New Box<Integer>(20)
   */
  function buildScenarioA(): CompilationUnit {
    const T = typeParam("T", typeRef("BaseItem"));
    const boxClass = classDecl("Box", {
      typeParameters: [T],
      members: [
        field("Value", typeRef("T")),
        method("New", {
          parameters: [param("initVal", typeRef("T"))],
          body: [assign(memberAccess(id("me"), "Value"), id("initVal"))],
        }),
      ],
    });

    const boxOfInt = (): TypeReference => typeRef("Box", [typeRef("Integer")]);
    const b1 = dim("b1", boxOfInt(), newExpr(boxOfInt(), [lit(10)]));
    const b2 = dim("b2", boxOfInt(), newExpr(boxOfInt(), [lit(20)]));

    return unit([boxClass, b1, b2]);
  }

  test("registers and prunes the original generic class", () => {
    const u = buildScenarioA();
    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.templates.has("Box"), true);
    assert.equal(findClass(u.members, "Box"), undefined);
  });

  test("emits exactly one Box_Integer despite two identical usage sites (ODR)", () => {
    const u = buildScenarioA();
    const result = new GenericsMonomorphizer().monomorphize(u);

    const boxInteger = u.members.filter(
      (m) => m.kind === "ClassDeclaration" && m.name === "Box_Integer",
    );
    assert.equal(boxInteger.length, 1);
    assert.equal(result.instantiated.size, 1);
    assert.deepEqual(result.instantiated.values(), ["Box_Integer"]);
  });

  test("strips the type parameter and the `As BaseItem` constraint", () => {
    const u = buildScenarioA();
    new GenericsMonomorphizer().monomorphize(u);

    const concrete = findClass(u.members, "Box_Integer");
    assert.ok(concrete);
    assert.equal(concrete.typeParameters.length, 0);
  });

  test("substitutes `T` with `Integer` inside field, parameter and method body", () => {
    const u = buildScenarioA();
    new GenericsMonomorphizer().monomorphize(u);

    const concrete = findClass(u.members, "Box_Integer");
    assert.ok(concrete);

    assert.equal(classFieldType(concrete, "Value")?.name, "Integer");

    const ctor = classMethod(concrete, "New");
    assert.ok(ctor);
    assert.equal(ctor.parameters[0]?.type.name, "Integer");

    const stmt = ctor.body[0];
    assert.ok(stmt && stmt.kind === "Assignment");
  });

  test("rewrites every usage site to the flat name", () => {
    const u = buildScenarioA();
    new GenericsMonomorphizer().monomorphize(u);

    for (const varName of ["b1", "b2"] as const) {
      const v = findVar(u.members, varName);
      assert.ok(v?.type);
      assert.equal(v.type.name, "Box_Integer");
      assert.equal(v.type.typeArguments.length, 0);

      assert.ok(v.initializer && v.initializer.kind === "ObjectCreationExpression");
      assert.equal(v.initializer.type.name, "Box_Integer");
      assert.equal(v.initializer.type.typeArguments.length, 0);
    }
  });

  test("Scenario A produces zero warnings", () => {
    const u = buildScenarioA();
    const result = new GenericsMonomorphizer().monomorphize(u);
    assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
  });
});

describe("GenericsMonomorphizer — generic methods, delegates and return types", () => {
  test("monomorphizes `Sub ProcessItem<T>(item As T)` invoked with <Integer>", () => {
    const T = typeParam("T");
    const tpl = method("ProcessItem", {
      typeParameters: [T],
      parameters: [param("item", typeRef("T"))],
    });

    const callSite = call("ProcessItem", [typeRef("Integer")], [lit(10)]);
    const u = unit([tpl, { kind: "ExpressionStatement", expression: callSite }]);

    new GenericsMonomorphizer().monomorphize(u);

    const concrete = findMethod(u.members, "ProcessItem_Integer");
    assert.ok(concrete);
    assert.equal(concrete.typeParameters.length, 0);
    assert.equal(concrete.parameters[0]?.type.name, "Integer");

    assert.equal(callSite.methodName, "ProcessItem_Integer");
    assert.equal(callSite.typeArguments.length, 0);
  });

  test("substitutes T in the return type: `Function Make<T>() As T` → `Make_Integer`", () => {
    const T = typeParam("T");
    const tpl = method("Make", { typeParameters: [T], returnType: typeRef("T") });

    const callSite = call("Make", [typeRef("Integer")]);
    const u = unit([tpl, dim("x", undefined, callSite)]);

    new GenericsMonomorphizer().monomorphize(u);

    const concrete = findMethod(u.members, "Make_Integer");
    assert.ok(concrete);
    assert.equal(concrete.returnType?.name, "Integer");
    assert.equal(concrete.returnType?.typeArguments.length, 0);
    assert.equal(callSite.methodName, "Make_Integer");
  });

  test("monomorphizes `Delegate Function Handler<T>(val As T) As Boolean`", () => {
    const T = typeParam("T");
    const handler = delegateDecl("Handler", {
      typeParameters: [T],
      parameters: [param("val", typeRef("T"))],
      returnType: typeRef("Boolean"),
    });
    const consumer = method("Run", {
      parameters: [param("h", typeRef("Handler", [typeRef("Integer")]))],
    });
    const u = unit([handler, consumer]);

    new GenericsMonomorphizer().monomorphize(u);

    const concrete = findDelegate(u.members, "Handler_Integer");
    assert.ok(concrete);
    assert.equal(concrete.parameters[0]?.type.name, "Integer");
    assert.equal(concrete.returnType?.name, "Boolean");

    assert.equal(consumer.parameters[0]?.type.name, "Handler_Integer");
  });

  test("monomorphizes overloaded generic member methods and rewrites self-overload calls", () => {
    const T = typeParam("T");
    const U = typeParam("U");
    const list = classDecl("List", {
      typeParameters: [T],
      members: [
        method("Map", {
          typeParameters: [U],
          parameters: [param("handler", typeRef("Variant"))],
          returnType: typeRef("List", [typeRef("U")]),
          body: [
            assign(id("Map"), {
              kind: "MethodInvocation",
              callee: id("me"),
              methodName: "Map",
              typeArguments: [],
              arguments: [id("handler"), lit(0)],
            }),
          ],
        }),
        method("Map", {
          typeParameters: [U],
          parameters: [param("handler", typeRef("Variant")), param("extra", typeRef("Variant"))],
          returnType: typeRef("List", [typeRef("U")]),
        }),
      ],
    });
    const callSite: MethodInvocation = {
      kind: "MethodInvocation",
      callee: id("items"),
      methodName: "Map",
      typeArguments: [typeRef("String")],
      arguments: [id("handler")],
    };
    const u = unit([
      list,
      dim("items", typeRef("List", [typeRef("Integer")])),
      dim("handler", typeRef("Variant")),
      dim("mapped", undefined, callSite),
    ]);
    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
    const concrete = findClass(u.members, "List_Integer");
    assert.ok(concrete);
    const overloads = concrete.members.filter(
      (member): member is MethodDeclaration =>
        member.kind === "MethodDeclaration" && member.name === "Map_String",
    );
    assert.equal(overloads.length, 2);
    assert.ok(findClass(u.members, "List_String"));
    assert.equal(callSite.methodName, "Map_String");
    assert.equal(callSite.typeArguments.length, 0);

    const overloadWithBody = overloads.find((overload) => overload.body.length > 0);
    const firstBody = overloadWithBody?.body[0];
    assert.ok(firstBody?.kind === "Assignment");
    assert.equal(firstBody.value.kind, "MethodInvocation");
    if (firstBody.value.kind === "MethodInvocation") {
      assert.equal(firstBody.value.methodName, "Map_String");
    }
  });

  test("materializes requested generic member methods in template-only modules", () => {
    const T = typeParam("T");
    const U = typeParam("U");
    const list = classDecl("List", {
      typeParameters: [T],
      members: [
        method("Map", {
          typeParameters: [U],
          parameters: [param("handler", typeRef("Variant"))],
          returnType: typeRef("List", [typeRef("U")]),
        }),
      ],
    });
    const u = unit([list]);
    const result = new GenericsMonomorphizer({
      requestedInstantiations: [
        { templateName: "List", typeArgs: ["Integer"] },
        { templateName: "List", typeArgs: ["String"] },
        { templateName: "Map", typeArgs: ["String"] },
      ],
    }).monomorphize(u);

    assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
    const concrete = findClass(u.members, "List_Integer");
    assert.ok(concrete);
    const mapString = classMethod(concrete, "Map_String");
    assert.ok(mapString);
    assert.equal(mapString.returnType?.name, "List_String");
    assert.ok(findClass(u.members, "List_String"));
  });

  test("materializes chained generic member methods on mapped list receivers", () => {
    const T = typeParam("T");
    const TOut = typeParam("TOut");
    const TAcc = typeParam("TAcc");
    const list = classDecl("TTList", {
      typeParameters: [T],
      members: [
        method("Filter", {
          parameters: [param("handler", typeRef("Variant"))],
          returnType: typeRef("TTList", [typeRef("T")]),
        }),
        method("Map", {
          typeParameters: [TOut],
          parameters: [param("handler", typeRef("Variant"))],
          returnType: typeRef("TTList", [typeRef("TOut")]),
        }),
        method("Reduce", {
          typeParameters: [TAcc],
          parameters: [param("handler", typeRef("Variant")), param("initial", typeRef("TAcc"))],
          returnType: typeRef("TAcc"),
        }),
      ],
    });
    const filterCall: MethodInvocation = {
      kind: "MethodInvocation",
      callee: id("produtos"),
      methodName: "Filter",
      typeArguments: [],
      arguments: [id("filterHandler")],
    };
    const mapCall: MethodInvocation = {
      kind: "MethodInvocation",
      callee: filterCall,
      methodName: "Map",
      typeArguments: [typeRef("Double")],
      arguments: [id("mapHandler")],
    };
    const reduceCall: MethodInvocation = {
      kind: "MethodInvocation",
      callee: mapCall,
      methodName: "Reduce",
      typeArguments: [typeRef("Double")],
      arguments: [id("reduceHandler"), lit(0)],
    };
    const u = unit([
      list,
      classDecl("Produto"),
      dim("produtos", typeRef("TTList", [typeRef("Produto")])),
      dim("totalProdutosCaros", typeRef("Double"), reduceCall),
    ]);
    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
    const listProduto = findClass(u.members, "TTList_Produto");
    assert.ok(listProduto);
    assert.ok(classMethod(listProduto, "Map_Double"));

    const listDouble = findClass(u.members, "TTList_Double");
    assert.ok(listDouble);
    assert.ok(classMethod(listDouble, "Reduce_Double"));
    assert.equal(mapCall.methodName, "Map_Double");
    assert.equal(mapCall.typeArguments.length, 0);
    assert.equal(reduceCall.methodName, "Reduce_Double");
    assert.equal(reduceCall.typeArguments.length, 0);
  });

  test("tracks arbitrary fluent generic return types across chained method calls", () => {
    const T = typeParam("T");
    const TOut = typeParam("TOut");
    const validator = delegateDecl("Validador", {
      typeParameters: [T],
      parameters: [param("value", typeRef("T"))],
      returnType: typeRef("Boolean"),
    });
    const connector = classDecl("Conector", {
      typeParameters: [T],
      members: [
        method("Validar", {
          parameters: [param("handler", typeRef("Validador", [typeRef("T")]))],
          returnType: typeRef("Conector", [typeRef("T")]),
          body: [opaque("' self type is Conector<T>")],
        }),
        method("Parse", {
          typeParameters: [TOut],
          parameters: [param("parser", typeRef("Variant"))],
          returnType: typeRef("Processador", [typeRef("TOut")]),
        }),
      ],
    });
    const processor = classDecl("Processador", {
      typeParameters: [T],
      members: [
        method("Preparar", {
          returnType: typeRef("Processador", [typeRef("T")]),
        }),
        method("Construir", {
          returnType: typeRef("T"),
        }),
      ],
    });
    const validarCall: MethodInvocation = {
      kind: "MethodInvocation",
      callee: id("conector"),
      methodName: "Validar",
      typeArguments: [],
      arguments: [id("validator")],
    };
    const parseCall: MethodInvocation = {
      kind: "MethodInvocation",
      callee: validarCall,
      methodName: "Parse",
      typeArguments: [typeRef("Produto")],
      arguments: [id("parser")],
    };
    const prepararCall: MethodInvocation = {
      kind: "MethodInvocation",
      callee: parseCall,
      methodName: "Preparar",
      typeArguments: [],
      arguments: [],
    };
    const construirCall: MethodInvocation = {
      kind: "MethodInvocation",
      callee: prepararCall,
      methodName: "Construir",
      typeArguments: [],
      arguments: [],
    };
    const u = unit([
      validator,
      connector,
      processor,
      classDecl("Produto"),
      dim("conector", typeRef("Conector", [typeRef("String")])),
      dim("produtoFinal", typeRef("Produto"), construirCall),
    ]);
    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
    const connectorString = findClass(u.members, "Conector_String");
    assert.ok(connectorString);
    assert.ok(classMethod(connectorString, "Parse_Produto"));
    assert.ok(findDelegate(u.members, "Validador_String"));
    assert.equal(findClass(u.members, "Conector_T"), undefined);
    assert.equal(findDelegate(u.members, "Validador_T"), undefined);

    const processorProduto = findClass(u.members, "Processador_Produto");
    assert.ok(processorProduto);
    assert.ok(classMethod(processorProduto, "Preparar"));
    assert.ok(classMethod(processorProduto, "Construir"));
    assert.equal(parseCall.methodName, "Parse_Produto");
    assert.equal(parseCall.typeArguments.length, 0);
  });
});

describe("GenericsMonomorphizer — multi-parameter generics", () => {
  test("`Dictionary<TKey, TValue>` flattens to `Dictionary_String_Product`", () => {
    const tk = typeParam("TKey");
    const tv = typeParam("TValue");
    const dict = classDecl("Dictionary", {
      typeParameters: [tk, tv],
      members: [field("LastKey", typeRef("TKey")), field("LastValue", typeRef("TValue"))],
    });
    const dictType = (): TypeReference =>
      typeRef("Dictionary", [typeRef("String"), typeRef("Product")]);
    const dimMap = dim("map", dictType(), newExpr(dictType()));
    const u = unit([dict, dimMap]);

    new GenericsMonomorphizer().monomorphize(u);

    const concrete = findClass(u.members, "Dictionary_String_Product");
    assert.ok(concrete);
    assert.equal(classFieldType(concrete, "LastKey")?.name, "String");
    assert.equal(classFieldType(concrete, "LastValue")?.name, "Product");
  });

  test("two distinct usages produce two concrete declarations", () => {
    const T = typeParam("T");
    const box = classDecl("Box", {
      typeParameters: [T],
      members: [field("Value", typeRef("T"))],
    });
    const u = unit([
      box,
      dim("a", typeRef("Box", [typeRef("Integer")])),
      dim("b", typeRef("Box", [typeRef("String")])),
    ]);

    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.instantiated.size, 2);
    assert.ok(findClass(u.members, "Box_Integer"));
    assert.ok(findClass(u.members, "Box_String"));
  });
});

describe("GenericsMonomorphizer — nested generics and recursion", () => {
  test("`TList<TList<Integer>>` produces both TList_Integer and TList_TList_Integer", () => {
    const T = typeParam("T");
    const tlist = classDecl("TList", {
      typeParameters: [T],
      members: [field("Head", typeRef("T"))],
    });
    const outerType = typeRef("TList", [typeRef("TList", [typeRef("Integer")])]);
    const u = unit([tlist, dim("outer", outerType)]);

    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.instantiated.has("TList_Integer"), true);
    assert.equal(result.instantiated.has("TList_TList_Integer"), true);

    const inner = findClass(u.members, "TList_Integer");
    const outer = findClass(u.members, "TList_TList_Integer");
    assert.ok(inner && outer);
    assert.equal(classFieldType(outer, "Head")?.name, "TList_Integer");
    assert.equal(classFieldType(inner, "Head")?.name, "Integer");

    assert.equal(findVar(u.members, "outer")?.type?.name, "TList_TList_Integer");
  });

  test("direct recursion: `Class Node<T> { Next As Node<T> }` used as Node<Integer>", () => {
    // The cloned Node_Integer's `Next` field is `Node<Integer>` — same flat
    // name, must not be re-emitted (worklist dedup) and must rewrite to
    // `Node_Integer` in place.
    const T = typeParam("T");
    const nodeClass = classDecl("Node", {
      typeParameters: [T],
      members: [field("Value", typeRef("T")), field("Next", typeRef("Node", [typeRef("T")]))],
    });
    const u = unit([nodeClass, dim("head", typeRef("Node", [typeRef("Integer")]))]);

    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.instantiated.size, 1);
    assert.equal(result.instantiated.has("Node_Integer"), true);

    const concrete = findClass(u.members, "Node_Integer");
    assert.ok(concrete);
    assert.equal(classFieldType(concrete, "Value")?.name, "Integer");
    const nextField = classFieldType(concrete, "Next");
    assert.equal(nextField?.name, "Node_Integer");
    assert.equal(nextField?.typeArguments.length, 0);
  });

  test("mutual recursion: A<T> references B<T> and vice versa", () => {
    const Ta = typeParam("T");
    const Tb = typeParam("T");
    const aClass = classDecl("A", {
      typeParameters: [Ta],
      members: [field("partner", typeRef("B", [typeRef("T")]))],
    });
    const bClass = classDecl("B", {
      typeParameters: [Tb],
      members: [field("partner", typeRef("A", [typeRef("T")]))],
    });
    const u = unit([aClass, bClass, dim("seed", typeRef("A", [typeRef("Integer")]))]);

    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.instantiated.has("A_Integer"), true);
    assert.equal(result.instantiated.has("B_Integer"), true);

    const aInt = findClass(u.members, "A_Integer");
    const bInt = findClass(u.members, "B_Integer");
    assert.ok(aInt && bInt);
    assert.equal(classFieldType(aInt, "partner")?.name, "B_Integer");
    assert.equal(classFieldType(bInt, "partner")?.name, "A_Integer");
  });
});

describe("GenericsMonomorphizer — inheritance with generic base type", () => {
  test("`Class IntBox Inherits Box<Integer>` rewrites the base and emits Box_Integer", () => {
    const T = typeParam("T");
    const box = classDecl("Box", {
      typeParameters: [T],
      members: [field("Value", typeRef("T"))],
    });
    const intBox = classDecl("IntBox", { baseType: typeRef("Box", [typeRef("Integer")]) });
    const u = unit([box, intBox]);

    new GenericsMonomorphizer().monomorphize(u);

    assert.ok(findClass(u.members, "Box_Integer"));
    const ib = findClass(u.members, "IntBox");
    assert.ok(ib);
    assert.equal(ib.baseType?.name, "Box_Integer");
    assert.equal(ib.baseType?.typeArguments.length, 0);
  });
});

describe("GenericsMonomorphizer — namespace scoping", () => {
  test("a generic declared inside a namespace is injected back into that namespace at the end", () => {
    const T = typeParam("T");
    const box = classDecl("Box", {
      typeParameters: [T],
      members: [field("Value", typeRef("T"))],
    });
    const ns = namespaceDecl("Lib", [box, dim("v", typeRef("Box", [typeRef("Integer")]))]);
    const u = unit([ns]);

    new GenericsMonomorphizer().monomorphize(u);

    const lib = findNamespace(u, "Lib");
    assert.ok(lib);
    assert.ok(findClass(lib.members, "Box_Integer"));

    // Assert that the injected class is at the end of the namespace members
    const lastMember = lib.members[lib.members.length - 1];
    assert.equal(lastMember?.kind, "ClassDeclaration");
    assert.equal(lastMember?.name, "Box_Integer");

    // Top level must NOT have received the concrete declaration.
    assert.equal(findClass(u.members, "Box_Integer"), undefined);
    // And the original generic Class must be gone from the namespace.
    assert.equal(findClass(lib.members, "Box"), undefined);
  });

  test("a generic is injected below imports (at the end of the file) when no namespace is present", () => {
    const T = typeParam("T");
    const box = classDecl("Box", {
      typeParameters: [T],
      members: [field("Value", typeRef("T"))],
    });
    // Imports is an OpaqueStatement at the top
    const imp: OpaqueStatement = { kind: "OpaqueStatement", text: "Imports System" };
    const v = dim("v", typeRef("Box", [typeRef("Integer")]));
    const u = unit([imp, box, v]);

    new GenericsMonomorphizer().monomorphize(u);

    // Assert that the imports statement is still first
    const firstMember = u.members[0];
    assert.equal(firstMember?.kind, "OpaqueStatement");
    if (firstMember && firstMember.kind === "OpaqueStatement") {
      assert.equal(firstMember.text, "Imports System");
    }

    // Assert that Box_Integer is appended at the very end
    const lastMember = u.members[u.members.length - 1];
    assert.equal(lastMember?.kind, "ClassDeclaration");
    assert.equal(lastMember?.name, "Box_Integer");
  });
});

describe("GenericsMonomorphizer — typed warnings", () => {
  test("`unknown-template`: a generic usage referencing an unregistered template", () => {
    const u = unit([dim("x", typeRef("Box", [typeRef("Integer")]))]);
    const result = new GenericsMonomorphizer().monomorphize(u);

    const codes = warningCodes(result.warnings);
    assert.ok(codes.includes("unknown-template"), JSON.stringify(result.warnings));
    // The usage was left untouched (still generic).
    const v = findVar(u.members, "x");
    assert.equal(v?.type?.typeArguments.length, 1);
  });

  test("`duplicate-template`: two top-level Class Box<T> declarations", () => {
    const T1 = typeParam("T");
    const T2 = typeParam("T");
    const u = unit([
      classDecl("Box", { typeParameters: [T1], members: [field("a", typeRef("T"))] }),
      classDecl("Box", { typeParameters: [T2], members: [field("b", typeRef("T"))] }),
    ]);
    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.ok(warningCodes(result.warnings).includes("duplicate-template"));
  });

  test("monomorphizes a generic method inside a non-generic class when invoked", () => {
    const T = typeParam("T");
    const fooClass = classDecl("Foo", {
      members: [
        method("Process", {
          typeParameters: [T],
          parameters: [param("item", typeRef("T"))],
        }),
      ],
    });
    const callSite: MethodInvocation = {
      kind: "MethodInvocation",
      callee: id("foo"),
      methodName: "Process",
      typeArguments: [typeRef("Integer")],
      arguments: [lit(1)],
    };
    const u = unit([
      fooClass,
      dim("foo", typeRef("Foo")),
      { kind: "ExpressionStatement", expression: callSite },
    ]);
    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));

    // The generic method must have been removed from the class.
    const foo = findClass(u.members, "Foo");
    assert.ok(foo);
    assert.equal(classMethod(foo, "Process"), undefined);

    const concrete = classMethod(foo, "Process_Integer");
    assert.ok(concrete);
    assert.equal(concrete.typeParameters.length, 0);
    assert.equal(concrete.parameters[0]?.type.name, "Integer");
    assert.equal(callSite.methodName, "Process_Integer");
    assert.equal(callSite.typeArguments.length, 0);
  });

  test("monomorphizes a generic method inside a generic class template when invoked", () => {
    // Class Box<T>
    //   Sub Process<U>(item As U)   ' generic method inside generic class
    // End Class
    const T = typeParam("T");
    const U = typeParam("U");
    const box = classDecl("Box", {
      typeParameters: [T],
      members: [
        field("Value", typeRef("T")),
        method("Process", {
          typeParameters: [U],
          parameters: [param("item", typeRef("U"))],
        }),
      ],
    });
    const callSite: MethodInvocation = {
      kind: "MethodInvocation",
      callee: id("b"),
      methodName: "Process",
      typeArguments: [typeRef("String")],
      arguments: [lit("x")],
    };
    const u = unit([
      box,
      dim("b", typeRef("Box", [typeRef("Integer")])),
      { kind: "ExpressionStatement", expression: callSite },
    ]);
    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));

    const concrete = findClass(u.members, "Box_Integer");
    assert.ok(concrete);
    // Process<U> must NOT be on the concrete class.
    assert.equal(classMethod(concrete, "Process"), undefined);
    const concreteMethod = classMethod(concrete, "Process_String");
    assert.ok(concreteMethod);
    assert.equal(concreteMethod.typeParameters.length, 0);
    assert.equal(concreteMethod.parameters[0]?.type.name, "String");
    // But the substituted T → Integer field must be there.
    assert.equal(classFieldType(concrete, "Value")?.name, "Integer");
    assert.equal(callSite.methodName, "Process_String");
    assert.equal(callSite.typeArguments.length, 0);
  });

  test("`flat-name-collision`: two distinct usages produce the same flat name", () => {
    const T = typeParam("T");
    const dict = classDecl("Dict", {
      typeParameters: [T],
      members: [field("v", typeRef("T"))],
    });
    // Pretend the source has a literal type called `Integer_String`. Both
    // `Dict<Integer_String>` and a hypothetical `Dict_Integer_String` (from
    // a nested instantiation, not modelled here) would be the same flat
    // name as `Dict<Integer>` of a class also named `String`. We force the
    // collision by registering two distinct usages:
    //   - Dict<Integer>  (canonical: "Dict<Integer>")
    //   - Dict<Integer_String>  →  flat: "Dict_Integer_String" (clashes
    //     with what would come from `Dict<Integer, String>` if `Dict` were
    //     binary). To produce a real collision with a single-param Dict,
    //     we model the source as if `_` was already in the type name AND
    //     we add a second template `Dict2` whose usage flattens identically
    //     by picking carefully-chosen names.
    //
    // The simplest reliable repro: register Dict<T> and use it twice with
    // type names that, after the engine's bottom-up flattening, yield the
    // same flat name despite originating from structurally different
    // canonical forms. We construct that artificially below.

    const Dict2 = typeParam("T");
    const dict2 = classDecl("Dict_Integer", {
      typeParameters: [Dict2],
      members: [field("v", typeRef("T"))],
    });
    const u = unit([
      dict,
      dict2,
      // Two usages whose flat names are forced to collide:
      //   - Dict<Integer_String>          → "Dict_Integer_String"
      //   - Dict_Integer<String>          → "Dict_Integer_String"
      dim("a", typeRef("Dict", [typeRef("Integer_String")])),
      dim("b", typeRef("Dict_Integer", [typeRef("String")])),
    ]);

    const result = new GenericsMonomorphizer().monomorphize(u);

    assert.ok(
      warningCodes(result.warnings).includes("flat-name-collision"),
      JSON.stringify(result.warnings),
    );
  });

  test("`invalid-input`: TypeReference with an empty name", () => {
    const u = unit([dim("x", typeRef(""))]);
    const result = new GenericsMonomorphizer().monomorphize(u);
    assert.ok(warningCodes(result.warnings).includes("invalid-input"));
  });
});

describe("GenericsMonomorphizer — naming helpers", () => {
  test("flatNameOf", () => {
    assert.equal(flatNameOf(typeRef("Box", [typeRef("Integer")])), "Box_Integer");
    assert.equal(
      flatNameOf(typeRef("Dictionary", [typeRef("String"), typeRef("Product")])),
      "Dictionary_String_Product",
    );
    assert.equal(
      flatNameOf(typeRef("TList", [typeRef("TList", [typeRef("Integer")])])),
      "TList_TList_Integer",
    );
    assert.equal(flatNameOf(typeRef("Integer")), "Integer");
  });

  test("flatNameFromParts mirrors flatNameOf for generic shapes", () => {
    assert.equal(
      flatNameFromParts("Make", [typeRef("Integer")]),
      flatNameOf(typeRef("Make", [typeRef("Integer")])),
    );
    assert.equal(flatNameFromParts("X", []), "X");
  });

  test("canonicalNameOf preserves angular brackets and commas", () => {
    assert.equal(canonicalNameOf(typeRef("Integer")), "Integer");
    assert.equal(
      canonicalNameOf(typeRef("Dict", [typeRef("String"), typeRef("Integer")])),
      "Dict<String,Integer>",
    );
    assert.equal(
      canonicalNameOf(typeRef("TList", [typeRef("TList", [typeRef("Integer")])])),
      "TList<TList<Integer>>",
    );
  });
});

describe("GenericsMonomorphizer — robustness", () => {
  test("MAX_INSTANTIATIONS is a positive integer constant", () => {
    assert.equal(typeof MAX_INSTANTIATIONS, "number");
    assert.ok(Number.isInteger(MAX_INSTANTIATIONS) && MAX_INSTANTIATIONS > 0);
  });

  test("empty CompilationUnit yields an empty result with no warnings", () => {
    const u = unit([]);
    const result = new GenericsMonomorphizer().monomorphize(u);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.instantiated.size, 0);
    assert.equal(result.templates.size, 0);
    assert.equal(u.members.length, 0);
  });

  test("CompilationUnit without any generic is a no-op", () => {
    const c = classDecl("Plain", { members: [field("x", typeRef("Integer"))] });
    const u = unit([c, dim("v", typeRef("Plain"))]);
    const result = new GenericsMonomorphizer().monomorphize(u);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.instantiated.size, 0);
    assert.equal(u.members.length, 2);
  });

  test("source location is preserved on cloned concrete declarations", () => {
    const T = typeParam("T");
    const box = classDecl("Box", {
      typeParameters: [T],
      members: [field("Value", typeRef("T"))],
    });
    box.loc = { startLine: 1, startChar: 0, endLine: 5, endChar: 10 };

    const u = unit([box, dim("v", typeRef("Box", [typeRef("Integer")]))]);
    new GenericsMonomorphizer().monomorphize(u);

    const concrete = findClass(u.members, "Box_Integer");
    assert.ok(concrete);
    assert.deepEqual(concrete.loc, { startLine: 1, startChar: 0, endLine: 5, endChar: 10 });
  });

  test("substitutes type parameters inside OpaqueStatements in template bodies", () => {
    const T = typeParam("T");
    const K = typeParam("K");

    // Class TListSugarPrimitive<T, K>
    const subClass = classDecl("TListSugarPrimitive", {
      typeParameters: [T, K],
      members: [
        field("Value", typeRef("T")),
        method("GetValue", {
          returnType: typeRef("K"),
          body: [opaque("GetValue = me.Value")],
        }),
      ],
    });

    // Class TListSugar<T, K>
    //   Function Push(pValue As T) As TListSugar
    //      Push = me.Push(TListSugarPrimitive<T, K>.Create(pValue))
    //   End Function
    // End Class
    const listClass = classDecl("TListSugar", {
      typeParameters: [T, K],
      members: [
        method("Push", {
          parameters: [param("pValue", typeRef("T"))],
          returnType: typeRef("TListSugar"),
          body: [
            opaque("Push = me.Push(TListSugarPrimitive<T, K>.Create(pValue))"),
            opaque("PushCType = CType(pValue, TListSugar<T, K>)"),
          ],
        }),
      ],
    });

    const u = unit([
      subClass,
      listClass,
      dim("_list", typeRef("TListSugar", [typeRef("Integer"), typeRef("String")])),
    ]);

    new GenericsMonomorphizer().monomorphize(u);

    // Verify both templates are monomorphized
    const concreteList = findClass(u.members, "TListSugar_Integer_String");
    assert.ok(concreteList);

    const concreteSub = findClass(u.members, "TListSugarPrimitive_Integer_String");
    assert.ok(concreteSub);

    // Verify body statements inside TListSugar_Integer_String have been substituted
    const pushMethod = classMethod(concreteList, "Push");
    assert.ok(pushMethod);
    if (!pushMethod) throw new Error("pushMethod not found");

    const stmt0 = pushMethod.body[0];
    const stmt1 = pushMethod.body[1];
    assert.ok(stmt0 && stmt0.kind === "OpaqueStatement");
    assert.ok(stmt1 && stmt1.kind === "OpaqueStatement");
    if (!stmt0 || stmt0.kind !== "OpaqueStatement") throw new Error("stmt0 not OpaqueStatement");
    if (!stmt1 || stmt1.kind !== "OpaqueStatement") throw new Error("stmt1 not OpaqueStatement");

    assert.equal(stmt0.text, "Push = me.Push(TListSugarPrimitive_Integer_String.Create(pValue))");
    assert.equal(stmt1.text, "PushCType = CType(pValue, TListSugar_Integer_String)");
  });
});

// ============================================================================
// Delegate ordering: must appear before ClassDeclarations in materialized output
// ============================================================================

describe("GenericsMonomorphizer — delegate ordering before classes", () => {
  /**
   * Regression for Data7 compiler hoisting bug: delegates declared after a
   * class that references them cause runtime errors. The monomorphizer must
   * always inject materialized DelegateDeclarations before any
   * ClassDeclaration in the same scope.
   */
  test("delegates are placed before classes when templates are declared in class-first order", () => {
    // Simulate: Class template declared BEFORE delegate template in source.
    // Without the fix, the class would be pushed first (end of array),
    // then the delegate would also be pushed to the end — after the class.
    const T = typeParam("T");

    const listClass = classDecl("MyList", {
      typeParameters: [T],
      members: [field("Item", typeRef("T"))],
    });

    const findDel = delegateDecl("TFindDel", {
      typeParameters: [T],
      parameters: [param("pValue", typeRef("T")), param("i", typeRef("Integer"))],
      returnType: typeRef("Boolean"),
    });

    // Declare class first, then delegate — this is the "bad" order in source
    // that previously caused runtime errors.
    const u = unit([
      listClass,
      findDel,
      dim("_list", typeRef("MyList", [typeRef("Integer")])),
      dim("_found", undefined, {
        kind: "MethodInvocation",
        methodName: "TFindDel",
        typeArguments: [typeRef("Integer")],
        arguments: [],
      }),
    ]);

    new GenericsMonomorphizer().monomorphize(u);

    // Both should be materialized
    const concreteClass = findClass(u.members, "MyList_Integer");
    const concreteDelegate = findDelegate(u.members, "TFindDel_Integer");
    assert.ok(concreteClass, "MyList_Integer class should be materialized");
    assert.ok(concreteDelegate, "TFindDel_Integer delegate should be materialized");

    // The delegate must appear BEFORE the class in the output
    const delegateIdx = u.members.indexOf(concreteDelegate);
    const classIdx = u.members.indexOf(concreteClass);
    assert.ok(
      delegateIdx < classIdx,
      `TFindDel_Integer (idx ${String(delegateIdx)}) must come before MyList_Integer (idx ${String(classIdx)})`,
    );
  });

  test("delegates are placed before classes inside a namespace", () => {
    const T = typeParam("T");

    const listClass = classDecl("NsList", {
      typeParameters: [T],
      members: [field("Value", typeRef("T"))],
    });

    const forEachDel = delegateDecl("TForEachDel", {
      typeParameters: [T],
      parameters: [param("pValue", typeRef("T")), param("i", typeRef("Integer"))],
    });

    const ns = namespaceDecl("mod_test", [
      listClass,
      forEachDel,
      dim("_ns_list", typeRef("NsList", [typeRef("String")])),
      dim("_ns_cb", undefined, {
        kind: "MethodInvocation",
        methodName: "TForEachDel",
        typeArguments: [typeRef("String")],
        arguments: [],
      }),
    ]);

    const u = unit([ns]);

    new GenericsMonomorphizer().monomorphize(u);

    const nsDecl = findNamespace(u, "mod_test");
    assert.ok(nsDecl, "namespace mod_test must exist");

    const concreteClass = findClass(nsDecl.members, "NsList_String");
    const concreteDelegate = findDelegate(nsDecl.members, "TForEachDel_String");
    assert.ok(concreteClass, "NsList_String class should be materialized inside namespace");
    assert.ok(
      concreteDelegate,
      "TForEachDel_String delegate should be materialized inside namespace",
    );

    const delegateIdx = nsDecl.members.indexOf(concreteDelegate);
    const classIdx = nsDecl.members.indexOf(concreteClass);
    assert.ok(
      delegateIdx < classIdx,
      `TForEachDel_String (idx ${String(delegateIdx)}) must come before NsList_String (idx ${String(classIdx)}) in namespace`,
    );
  });

  test("multiple delegates all appear before all classes", () => {
    const T = typeParam("T");

    const listClass = classDecl("AList", {
      typeParameters: [T],
      members: [field("Head", typeRef("T"))],
    });

    const findDel = delegateDecl("AFindDel", {
      typeParameters: [T],
      parameters: [param("v", typeRef("T"))],
      returnType: typeRef("Boolean"),
    });

    const mapDel = delegateDecl("AMapDel", {
      typeParameters: [T],
      parameters: [param("v", typeRef("T"))],
      returnType: typeRef("String"),
    });

    const u = unit([
      listClass,
      findDel,
      mapDel,
      dim("_al", typeRef("AList", [typeRef("Integer")])),
      dim("_fd", undefined, {
        kind: "MethodInvocation",
        methodName: "AFindDel",
        typeArguments: [typeRef("Integer")],
        arguments: [],
      }),
      dim("_md", undefined, {
        kind: "MethodInvocation",
        methodName: "AMapDel",
        typeArguments: [typeRef("Integer")],
        arguments: [],
      }),
    ]);

    new GenericsMonomorphizer().monomorphize(u);

    const concreteClass = findClass(u.members, "AList_Integer");
    const concreteFindDel = findDelegate(u.members, "AFindDel_Integer");
    const concreteMapDel = findDelegate(u.members, "AMapDel_Integer");
    assert.ok(concreteClass, "AList_Integer class should be materialized");
    assert.ok(concreteFindDel, "AFindDel_Integer delegate should be materialized");
    assert.ok(concreteMapDel, "AMapDel_Integer delegate should be materialized");

    const classIdx = u.members.indexOf(concreteClass);
    const findDelIdx = u.members.indexOf(concreteFindDel);
    const mapDelIdx = u.members.indexOf(concreteMapDel);

    assert.ok(
      findDelIdx < classIdx,
      `AFindDel_Integer (idx ${String(findDelIdx)}) must come before AList_Integer (idx ${String(classIdx)})`,
    );
    assert.ok(
      mapDelIdx < classIdx,
      `AMapDel_Integer (idx ${String(mapDelIdx)}) must come before AList_Integer (idx ${String(classIdx)})`,
    );
  });
});

import type { ClassDeclaration, ClassMember, EnumDeclaration, Statement } from "../../../ast/ast";

/**
 * Formats the description argument for `New EnumName(index, description)`.
 * The base `TEnum` constructor always expects a String — numeric entry values
 * are quoted; string literals are used as-is (already quoted in the AST).
 */
function formatEnumDescription(
  entryName: string,
  value: EnumDeclaration["entries"][number]["value"],
): string {
  if (!value) {
    return `"${entryName}"`;
  }
  if (value.kind === "Literal") {
    const literal = value.value;
    if (typeof literal === "string") {
      // Lexer keeps surrounding quotes on string tokens (e.g. `"Stone"`).
      return literal;
    }
    if (literal === null) {
      return "NULL";
    }
    // Numbers (and any other non-string literal) must be stringified for TEnum.
    return `"${String(literal)}"`;
  }
  if (value.kind === "Identifier") {
    return value.name;
  }
  return `"${entryName}"`;
}

/** Expands a declarative enum into the TEnum-compatible class representation. */
export function expandEnumDeclaration(declaration: EnumDeclaration): Statement {
  const enumName = declaration.name;
  const entries = declaration.entries.map((entry) => ({
    name: entry.name,
    description: formatEnumDescription(entry.name, entry.value),
  }));

  const classMembers: ClassMember[] = [
    {
      kind: "FieldDeclaration",
      name: "_Initialized",
      type: { kind: "TypeReference", name: "Boolean", typeArguments: [], loc: declaration.loc },
      modifiers: ["private", "shared"],
      loc: declaration.loc,
    },
  ];

  const initBody: Statement[] = [
    { kind: "OpaqueStatement", text: "If _Initialized Then Exit Sub", loc: declaration.loc },
  ];
  entries.forEach((entry, index) => {
    initBody.push({
      kind: "OpaqueStatement",
      text: `TEnum._AddEnumItem("${enumName}", New ${enumName}(${index}, ${entry.description}))`,
      loc: declaration.loc,
    });
  });
  initBody.push({ kind: "OpaqueStatement", text: "_Initialized = True", loc: declaration.loc });

  classMembers.push({
    kind: "MethodDeclaration",
    name: "Initialize",
    typeParameters: [],
    parameters: [],
    body: initBody,
    modifiers: ["private", "shared"],
    loc: declaration.loc,
  });

  for (const entry of entries) {
    classMembers.push({
      kind: "MethodDeclaration",
      name: entry.name,
      typeParameters: [],
      parameters: [],
      returnType: {
        kind: "TypeReference",
        name: enumName,
        typeArguments: [],
        loc: declaration.loc,
      },
      body: [
        {
          kind: "OpaqueStatement",
          text: `${entry.name} = Load(${entry.description})`,
          loc: declaration.loc,
        },
      ],
      modifiers: ["shared"],
      loc: declaration.loc,
      noParentheses: true,
    });
  }

  classMembers.push(
    {
      kind: "MethodDeclaration",
      name: "Load",
      typeParameters: [],
      parameters: [
        {
          kind: "ParameterDeclaration",
          name: "pValue",
          type: { kind: "TypeReference", name: enumName, typeArguments: [], loc: declaration.loc },
          loc: declaration.loc,
        },
      ],
      returnType: {
        kind: "TypeReference",
        name: enumName,
        typeArguments: [],
        loc: declaration.loc,
      },
      body: [
        {
          kind: "OpaqueStatement",
          text: "Load = Load(pValue.AsString)",
          loc: declaration.loc,
        },
      ],
      modifiers: ["shared"],
      loc: declaration.loc,
    },
    {
      kind: "MethodDeclaration",
      name: "Load",
      typeParameters: [],
      parameters: [
        {
          kind: "ParameterDeclaration",
          name: "pValue",
          type: { kind: "TypeReference", name: "Integer", typeArguments: [], loc: declaration.loc },
          loc: declaration.loc,
        },
      ],
      returnType: {
        kind: "TypeReference",
        name: enumName,
        typeArguments: [],
        loc: declaration.loc,
      },
      body: [
        { kind: "OpaqueStatement", text: `${enumName}.Initialize()`, loc: declaration.loc },
        {
          kind: "OpaqueStatement",
          text: `Load = ${enumName}(TEnum._GetCache("${enumName}", pValue))`,
          loc: declaration.loc,
        },
      ],
      modifiers: ["shared"],
      loc: declaration.loc,
    },
    {
      kind: "MethodDeclaration",
      name: "Load",
      typeParameters: [],
      parameters: [
        {
          kind: "ParameterDeclaration",
          name: "pValue",
          type: { kind: "TypeReference", name: "String", typeArguments: [], loc: declaration.loc },
          loc: declaration.loc,
        },
      ],
      returnType: {
        kind: "TypeReference",
        name: enumName,
        typeArguments: [],
        loc: declaration.loc,
      },
      body: [
        { kind: "OpaqueStatement", text: `${enumName}.Initialize()`, loc: declaration.loc },
        {
          kind: "OpaqueStatement",
          text: `Load = ${enumName}(TEnum._GetCache("${enumName}", pValue))`,
          loc: declaration.loc,
        },
      ],
      modifiers: ["shared"],
      loc: declaration.loc,
    },
    {
      kind: "MethodDeclaration",
      name: "GetOptions",
      typeParameters: [],
      parameters: [],
      returnType: {
        kind: "TypeReference",
        name: "String",
        typeArguments: [],
        loc: declaration.loc,
      },
      body: [
        { kind: "OpaqueStatement", text: `${enumName}.Initialize()`, loc: declaration.loc },
        {
          kind: "OpaqueStatement",
          text: `GetOptions = TEnum._GetEnumOptions("${enumName}")`,
          loc: declaration.loc,
        },
      ],
      modifiers: ["shared"],
      loc: declaration.loc,
    },
  );

  const classDeclaration: ClassDeclaration = {
    kind: "ClassDeclaration",
    name: enumName,
    typeParameters: [],
    baseType: declaration.baseType ?? {
      kind: "TypeReference",
      name: "TEnum",
      typeArguments: [],
      loc: declaration.loc,
    },
    members: classMembers,
    modifiers: declaration.modifiers ?? [],
    loc: declaration.loc,
  };

  return classDeclaration as unknown as Statement;
}

import type { ClassDeclaration, ClassMember, EnumDeclaration, Statement } from "../../../ast/ast";

/** Expands a declarative enum into the BaseEnum-compatible class representation. */
export function expandEnumDeclaration(declaration: EnumDeclaration): Statement {
  const enumName = declaration.name;
  const entries = declaration.entries.map((entry) => {
    let valueStr = `"${entry.name}"`;
    if (entry.value) {
      if (entry.value.kind === "Literal") {
        const value = entry.value.value;
        if (typeof value === "string") valueStr = value;
        else if (value === null) valueStr = "NULL";
        else valueStr = String(value);
      } else if (entry.value.kind === "Identifier") {
        valueStr = entry.value.name;
      }
    }
    return { name: entry.name, value: valueStr };
  });

  const classMembers: ClassMember[] = [
    {
      kind: "FieldDeclaration",
      name: "_Initialized",
      type: { kind: "TypeReference", name: "Boolean", typeArguments: [], loc: declaration.loc },
      modifiers: ["Private", "Shared"],
      loc: declaration.loc,
    },
  ];

  const initBody: Statement[] = [
    { kind: "OpaqueStatement", text: "If _Initialized Then Exit Sub", loc: declaration.loc },
  ];
  entries.forEach((entry, index) => {
    initBody.push({
      kind: "OpaqueStatement",
      text: `CoreSugarBaseEnum._AddEnumItem("${enumName}", New ${enumName}(${index}, ${entry.value}))`,
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
    modifiers: ["Private", "Shared"],
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
          text: `${entry.name} = Load(${entry.value})`,
          loc: declaration.loc,
        },
      ],
      modifiers: ["Shared"],
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
          type: { kind: "TypeReference", name: "String", typeArguments: [], loc: declaration.loc },
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
          text: `Load = CType(CoreSugarBaseEnum._GetCache("${enumName}", pValue), ${enumName})`,
          loc: declaration.loc,
        },
      ],
      modifiers: ["Shared"],
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
          text: `GetOptions = CoreSugarBaseEnum._GetEnumOptions("${enumName}")`,
          loc: declaration.loc,
        },
      ],
      modifiers: ["Shared"],
      loc: declaration.loc,
    },
  );

  const classDeclaration: ClassDeclaration = {
    kind: "ClassDeclaration",
    name: enumName,
    typeParameters: [],
    baseType: {
      kind: "TypeReference",
      name: "CoreSugarBaseEnum",
      typeArguments: [],
      loc: declaration.loc,
    },
    members: classMembers,
    modifiers: declaration.modifiers ?? [],
    loc: declaration.loc,
  };

  return classDeclaration as unknown as Statement;
}

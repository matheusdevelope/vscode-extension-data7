import * as vscode from "../platform/vscode-api";
import type { ParameterInfo, SymbolInfo, WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { SYSTEM_SYMBOLS } from "../system-library";
import { DiagnosticCodes, setDiagnosticPayload } from "./diagnostic-codes";
import type { DuplicateDeclarationPayload, NamespaceNameConflictPayload } from "./diagnostic-codes";
import { LocalDeclarationCollector } from "./ast-collectors";
import {
  ASTWalker,
  type CompilationUnit,
  type MethodDeclaration,
  type MethodInvocation,
  type Node,
  type SourceLocation,
} from "../project/ast/ast";

function isStructureDeclaration(node: { readonly modifiers?: readonly string[] }): boolean {
  return node.modifiers?.some((modifier) => modifier.toLowerCase() === "structure") ?? false;
}

export function validateDuplicateDeclarations(
  unit: CompilationUnit,
  document: vscode.TextDocument,
  indexer: WorkspaceSymbolIndexer,
  diagnostics: vscode.Diagnostic[],
): void {
  const fileSyms = indexer.getFileSymbols(document.uri.toString());
  if (!fileSyms) return;

  const activeNamespace = fileSyms.symbols.find((s) => s.kind === "namespace")?.name;
  const activeNsLower = activeNamespace?.toLowerCase();

  const imports = fileSyms.imports;
  const importedNs = new Set(imports.map((imp) => imp.toLowerCase()));

  const outerSymbols = new Map<string, { kind: string; container?: string }>();
  const primitives = ["string", "integer", "boolean", "double", "variant", "tobject", "void"];
  primitives.forEach((p) => outerSymbols.set(p, { kind: "tipo primitivo" }));

  SYSTEM_SYMBOLS.forEach((s) => {
    if (
      (s.kind === "class" || s.kind === "structure" || s.kind === "delegate") &&
      (!s.containerName ||
        s.containerName.toLowerCase() === "system" ||
        s.containerName.toLowerCase() === "globals")
    ) {
      outerSymbols.set(s.name.toLowerCase(), {
        kind: "símbolo global do sistema",
        container: s.containerName,
      });
    }
  });

  // Localiza símbolos globais declarados em principal.bas sem percorrer todos os símbolos
  let principalUri: string | undefined;
  for (const fileSym of indexer.getAllFileSymbols()) {
    if (/(?:^|[/\\])principal\.bas$/i.test(fileSym.fileUri)) {
      principalUri = fileSym.fileUri;
      break;
    }
  }
  if (principalUri && principalUri !== document.uri.toString()) {
    const fileSyms = indexer.getFileSymbols(principalUri);
    if (fileSyms) {
      fileSyms.symbols.forEach((s) => {
        outerSymbols.set(s.name.toLowerCase(), {
          kind: "símbolo global (Principal.bas)",
          container: s.containerName,
        });
      });
    }
  }

  const checkTopLevel = (s: SymbolInfo): void => {
    if (s.kind === "namespace") return;
    if (s.isSyntheticGenericInstantiation) return;
    if (!s.containerName) return;
    if (s.fileUri && indexer.isSameFileUri(s.fileUri, document.uri.toString())) return;

    const containerLower = s.containerName.toLowerCase();
    const isImportedType = s.kind === "class" || s.kind === "structure" || s.kind === "delegate";
    if (importedNs.has(containerLower) && isImportedType) {
      outerSymbols.set(s.name.toLowerCase(), {
        kind: `tipo importado de ${s.containerName}`,
        container: s.containerName,
      });
    }
    if (activeNsLower && containerLower === activeNsLower) {
      outerSymbols.set(s.name.toLowerCase(), {
        kind: `tipo no namespace ${s.containerName}`,
        container: s.containerName,
      });
    }
  };
  SYSTEM_SYMBOLS.forEach((s) => {
    checkTopLevel(s);
  });

  // Busca rápida apenas nos containers importados e ativo em O(1)
  const namespacesToCollect = new Set<string>([...importedNs]);
  if (activeNsLower) {
    namespacesToCollect.add(activeNsLower);
  }
  for (const ns of namespacesToCollect) {
    indexer.getSymbolsByContainer(ns).forEach(checkTopLevel);
  }

  const createConflictDiag = (
    range: vscode.Range,
    message: string,
    payload: DuplicateDeclarationPayload,
    related?: { uri?: string; range: vscode.Range; message: string },
  ): void => {
    const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    diag.code = DiagnosticCodes.DuplicateDeclaration;
    if (related) {
      diag.relatedInformation = [
        {
          location: new vscode.Location(
            related.uri ? vscode.Uri.parse(related.uri) : document.uri,
            related.range,
          ),
          message: related.message,
        },
      ];
    }
    setDiagnosticPayload(diag, payload);
    diagnostics.push(diag);
  };

  const symbolRange = (s: SymbolInfo): vscode.Range =>
    new vscode.Range(s.range.startLine, s.range.startChar, s.range.startLine, s.range.endChar);
  const locRange = (loc: SourceLocation): vscode.Range =>
    new vscode.Range(loc.startLine - 1, loc.startChar, loc.endLine - 1, loc.endChar);

  const fileTopLevel = new Map<string, SymbolInfo[]>();
  const fileTypeNames = new Set(
    fileSyms.symbols
      .filter((s) => s.kind === "class" || s.kind === "structure")
      .map((s) => s.name.toLowerCase()),
  );

  // Namespace level checks
  fileSyms.symbols.forEach((s) => {
    if (s.kind === "namespace") return;
    if (s.isSyntheticGenericInstantiation) return;
    const isTypeDeclaration = s.kind === "class" || s.kind === "structure" || s.kind === "delegate";
    const isClassMember =
      !!s.containerName && fileTypeNames.has(s.containerName.toLowerCase()) && !isTypeDeclaration;
    const isTopLevel =
      !isClassMember &&
      (!s.containerName || (activeNamespace && s.containerName === activeNamespace));
    if (!isTopLevel) return;

    const nameLower = s.name.toLowerCase();
    const existingList = fileTopLevel.get(nameLower);
    if (existingList) {
      for (const existing of existingList) {
        const conflict = classifyMemberNameConflict(existing, s);
        if (conflict === "ok-overload") {
          continue;
        }

        if (conflict === "same-signature") {
          createConflictDiag(
            new vscode.Range(
              s.range.startLine,
              s.range.startChar,
              s.range.startLine,
              s.range.endChar,
            ),
            `Declaração duplicada: o método '${s.name}' já foi declarado neste arquivo com a mesma assinatura (tipo e ordem de parâmetros).`,
            {
              code: DiagnosticCodes.DuplicateDeclaration,
              name: s.name,
              scope: "namespace",
              conflictingWithName: existing.name,
            },
            {
              uri: existing.fileUri,
              range: symbolRange(existing),
              message: `Declaração anterior de '${existing.name}'.`,
            },
          );
          return;
        }

        createConflictDiag(
          new vscode.Range(
            s.range.startLine,
            s.range.startChar,
            s.range.startLine,
            s.range.endChar,
          ),
          `Declaração duplicada: o tipo/símbolo '${s.name}' já foi declarado neste arquivo.`,
          {
            code: DiagnosticCodes.DuplicateDeclaration,
            name: s.name,
            scope: "namespace",
            conflictingWithName: existing.name,
          },
          {
            uri: existing.fileUri,
            range: symbolRange(existing),
            message: `Declaração anterior de '${existing.name}'.`,
          },
        );
        return;
      }
      existingList.push(s);
    } else {
      fileTopLevel.set(nameLower, [s]);
    }

    const otherFileSymbol = indexer
      .getSymbolsByName(s.name)
      .find(
        (other) =>
          other.kind === s.kind &&
          !other.isSyntheticGenericInstantiation &&
          other.containerName?.toLowerCase() === s.containerName?.toLowerCase() &&
          other.fileUri !== s.fileUri,
      );
    if (otherFileSymbol) {
      createConflictDiag(
        new vscode.Range(s.range.startLine, s.range.startChar, s.range.startLine, s.range.endChar),
        `Declaração duplicada: o tipo/símbolo '${s.name}' já foi declarado no namespace '${s.containerName}' no arquivo '${otherFileSymbol.fileUri}'.`,
        {
          code: DiagnosticCodes.DuplicateDeclaration,
          name: s.name,
          scope: "namespace",
          conflictingWithName: otherFileSymbol.name,
        },
        {
          uri: otherFileSymbol.fileUri,
          range: symbolRange(otherFileSymbol),
          message: `Declaração anterior de '${otherFileSymbol.name}'.`,
        },
      );
      return;
    }

    const outerSym = outerSymbols.get(nameLower);
    if (outerSym) {
      createConflictDiag(
        new vscode.Range(s.range.startLine, s.range.startChar, s.range.startLine, s.range.endChar),
        `O tipo/símbolo '${s.name}' conflita com o ${outerSym.kind} '${s.name}'.`,
        {
          code: DiagnosticCodes.DuplicateDeclaration,
          name: s.name,
          scope: "imported",
          conflictingWithName: s.name,
        },
      );
    }
  });

  // Class members checks — Shared and instance share one name table.
  // Overloads are allowed when both are callables and parameter types differ
  // (return types may diverge, matching Data7 TTList First/Last patterns).
  const classes = fileSyms.symbols.filter((s) => s.kind === "class" || s.kind === "structure");
  classes.forEach((C) => {
    const members = fileSyms.symbols.filter(
      (s) =>
        s.kind !== "class" &&
        s.kind !== "structure" &&
        s.kind !== "namespace" &&
        s.containerName?.toLowerCase() === C.name.toLowerCase(),
    );

    const declaredInClass = new Map<string, SymbolInfo[]>();

    members.forEach((m) => {
      const nameLower = m.name.toLowerCase();
      const existingList = declaredInClass.get(nameLower);
      if (!existingList) {
        declaredInClass.set(nameLower, [m]);
        return;
      }

      for (const existing of existingList) {
        const conflict = classifyMemberNameConflict(existing, m);
        if (conflict === "ok-overload") {
          continue;
        }

        if (conflict === "same-signature") {
          createConflictDiag(
            new vscode.Range(
              m.range.startLine,
              m.range.startChar,
              m.range.startLine,
              m.range.endChar,
            ),
            `Membro duplicado: a classe '${C.name}' já declara um método '${m.name}' com a mesma assinatura (tipo e ordem de parâmetros).`,
            {
              code: DiagnosticCodes.DuplicateDeclaration,
              name: m.name,
              scope: "class",
              conflictingWithName: existing.name,
            },
            {
              uri: existing.fileUri,
              range: symbolRange(existing),
              message: `Membro anterior '${existing.name}'.`,
            },
          );
          return;
        }

        createConflictDiag(
          new vscode.Range(
            m.range.startLine,
            m.range.startChar,
            m.range.startLine,
            m.range.endChar,
          ),
          `Membro duplicado: o nome '${m.name}' já é utilizado por outro membro na classe '${C.name}'.`,
          {
            code: DiagnosticCodes.DuplicateDeclaration,
            name: m.name,
            scope: "class",
            conflictingWithName: existing.name,
          },
          {
            uri: existing.fileUri,
            range: symbolRange(existing),
            message: `Membro anterior '${existing.name}'.`,
          },
        );
        return;
      }

      existingList.push(m);
    });
  });

  // Local / Method level variable checks using AST collector
  visitRoutineBodies(unit, (node) => {
    const C = classes.find(
      (c) =>
        c.name.toLowerCase() === node.modifiers?.[0]?.toLowerCase() ||
        c.name.toLowerCase() ===
          fileSyms.symbols
            .find((s) => s.name === node.name && s.kind === "method")
            ?.containerName?.toLowerCase(),
    );
    const collector = new LocalDeclarationCollector(node);
    collector.collect();

    const declaredInMethod = new Map<string, SourceLocation>();
    collector.declarations.forEach((v) => {
      if (v.isCatchVariable) return;

      const nameLower = v.name.toLowerCase();
      const range = new vscode.Range(
        v.loc.startLine - 1,
        v.loc.startChar,
        v.loc.endLine - 1,
        v.loc.endChar,
      );

      const existingRange = declaredInMethod.get(nameLower);
      if (existingRange) {
        createConflictDiag(
          range,
          `Declaração duplicada: o identificador '${v.name}' já foi declarado neste método.`,
          {
            code: DiagnosticCodes.DuplicateDeclaration,
            name: v.name,
            scope: "method",
            conflictingWithName: v.name,
          },
          {
            range: locRange(existingRange),
            message: `Declaração anterior de '${v.name}'.`,
          },
        );
        return;
      }
      declaredInMethod.set(nameLower, v.loc);

      if (C) {
        if (nameLower === C.name.toLowerCase()) {
          createConflictDiag(
            range,
            `O identificador '${v.name}' conflita com o nome da classe envolvente '${C.name}'.`,
            {
              code: DiagnosticCodes.DuplicateDeclaration,
              name: v.name,
              scope: "class",
              conflictingWithName: C.name,
            },
            {
              uri: C.fileUri,
              range: symbolRange(C),
              message: `Classe declarada aqui: '${C.name}'.`,
            },
          );
        }
      }
    });
  });
}

function visitRoutineBodies(
  unit: CompilationUnit,
  onMethod: (method: MethodDeclaration) => void,
): void {
  const visitMembers = (members: readonly Node[]): void => {
    for (const member of members) {
      if (member.kind === "NamespaceDeclaration") {
        visitMembers(member.members);
        continue;
      }
      if (member.kind === "ClassDeclaration") {
        for (const classMember of member.members) {
          if (classMember.kind === "MethodDeclaration") {
            onMethod(classMember);
          } else if (classMember.kind === "PropertyDeclaration") {
            if (classMember.getter) onMethod(classMember.getter);
            if (classMember.setter) onMethod(classMember.setter);
          }
        }
        continue;
      }
      if (member.kind === "MethodDeclaration") {
        onMethod(member);
      }
    }
  };
  visitMembers(unit.members);
}

function isCallableMemberKind(kind: SymbolInfo["kind"]): boolean {
  return kind === "method" || kind === "declare_sub" || kind === "declare_function";
}

type MemberNameConflict = "ok-overload" | "same-signature" | "name-collision";

/**
 * Overloads are accepted when both declarations are callables and the
 * parameter type sequences differ. Return types may diverge (Data7 allows
 * `First() As T` alongside `First(n As Integer) As TTList<T>`). Shared vs
 * instance does not create a separate name space — a field and a Shared
 * factory with the same name collide.
 */
function classifyMemberNameConflict(
  existing: SymbolInfo,
  candidate: SymbolInfo,
): MemberNameConflict {
  const bothCallable = isCallableMemberKind(existing.kind) && isCallableMemberKind(candidate.kind);
  if (!bothCallable) {
    return "name-collision";
  }

  if (isSameSignature(existing.parameters, candidate.parameters)) {
    return "same-signature";
  }

  return "ok-overload";
}

function isSameSignature(
  params1: ParameterInfo[] | undefined,
  params2: ParameterInfo[] | undefined,
): boolean {
  const p1 = params1 ?? [];
  const p2 = params2 ?? [];
  if (p1.length !== p2.length) return false;
  for (let i = 0; i < p1.length; i++) {
    const type1 = p1[i]?.type.toLowerCase() ?? "variant";
    const type2 = p2[i]?.type.toLowerCase() ?? "variant";
    if (type1 !== type2) return false;
  }
  return true;
}

export function validateMyBaseNewCalls(
  unit: CompilationUnit,
  diagnostics: vscode.Diagnostic[],
): void {
  const walker = new (class extends ASTWalker {
    private currentClassName = "";
    private currentClassIsStructure = false;

    public override walk(node: Node): void {
      if (node.kind === "ClassDeclaration") {
        const prev = this.currentClassName;
        const prevIsStructure = this.currentClassIsStructure;
        this.currentClassName = node.name;
        this.currentClassIsStructure = isStructureDeclaration(node);
        if (!this.currentClassIsStructure) {
          const baseName = node.baseType?.name.toLowerCase() ?? "";
          if (baseName === "tenum" || baseName.endsWith(".tenum")) {
            super.walk(node);
            this.currentClassName = prev;
            this.currentClassIsStructure = prevIsStructure;
            return;
          }
          const constructors = node.members.filter(
            (member): member is MethodDeclaration =>
              member.kind === "MethodDeclaration" && !!member.isConstructor,
          );
          const hasOnlyStaticUtilityMembers = node.members.every((member) => {
            if (member.kind === "MethodDeclaration") {
              const name = member.name.toLowerCase();
              if (name === "free" || name === "dispose") return true;
              return member.modifiers?.includes("shared") ?? false;
            }
            if (member.kind === "PropertyDeclaration") {
              return member.modifiers?.includes("shared") ?? false;
            }
            if (member.kind === "FieldDeclaration") {
              return member.modifiers?.includes("shared") ?? false;
            }
            return false;
          });
          if (constructors.length === 0 && node.loc && !hasOnlyStaticUtilityMembers) {
            const range = new vscode.Range(
              node.loc.startLine - 1,
              node.loc.startChar,
              node.loc.startLine - 1,
              node.loc.endChar,
            );
            const diag = new vscode.Diagnostic(
              range,
              `Classe '${node.name}' deve declarar pelo menos um construtor 'Sub New'. Toda classe Data7 deve inicializar o objeto base no construtor.`,
              vscode.DiagnosticSeverity.Error,
            );
            diag.code = DiagnosticCodes.MissingMyBaseNew;
            setDiagnosticPayload(diag, {
              code: DiagnosticCodes.MissingMyBaseNew,
              className: node.name,
              action: "create-constructor",
            });
            diagnostics.push(diag);
          }
        }
        super.walk(node);
        this.currentClassName = prev;
        this.currentClassIsStructure = prevIsStructure;
        return;
      }

      if (node.kind === "MethodDeclaration") {
        if (node.isConstructor && !this.currentClassIsStructure) {
          let hasMyBaseNew = false;
          const checkCalls = new (class extends ASTWalker {
            protected override visitMethodInvocation(call: MethodInvocation): void {
              if (
                call.methodName.toLowerCase() === "new" &&
                call.callee?.kind === "Identifier" &&
                call.callee.name.toLowerCase() === "mybase"
              ) {
                hasMyBaseNew = true;
              }
            }
          })();
          for (const s of node.body) {
            checkCalls.walk(s);
          }

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!hasMyBaseNew && node.loc) {
            const range = new vscode.Range(
              node.loc.startLine - 1,
              node.loc.startChar,
              node.loc.startLine - 1,
              node.loc.endChar,
            );
            const msg =
              `Construtor 'Sub New' da classe '${this.currentClassName || "desconhecida"}' não chama ` +
              `'MyBase.New()'. Toda classe Data7 deve inicializar o objeto base no construtor. ` +
              `Se a classe herda de outra, passe os argumentos necessários: 'MyBase.New(pParam As String)'.`;
            const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
            diag.code = DiagnosticCodes.MissingMyBaseNew;
            setDiagnosticPayload(diag, {
              code: DiagnosticCodes.MissingMyBaseNew,
              className: this.currentClassName || "",
              action: "insert-mybase-new",
            });
            diagnostics.push(diag);
          }
        }
      }
      super.walk(node);
    }
  })();
  walker.walk(unit);
}

export function validateMyBaseFreeCalls(
  unit: CompilationUnit,
  fileSyms: ReturnType<WorkspaceSymbolIndexer["getFileSymbols"]>,
  diagnostics: vscode.Diagnostic[],
): void {
  if (!fileSyms) return;

  const walker = new (class extends ASTWalker {
    public override walk(node: Node): void {
      if (node.kind === "ClassDeclaration") {
        if (isStructureDeclaration(node)) {
          super.walk(node);
          return;
        }

        const baseName = node.baseType?.name.toLowerCase() ?? "";
        if (baseName === "tenum" || baseName.endsWith(".tenum")) {
          return;
        }

        const freeMethod = node.members.find(
          (m): m is MethodDeclaration =>
            m.kind === "MethodDeclaration" && m.name.toLowerCase() === "free",
        );

        if (!freeMethod && node.loc) {
          const range = new vscode.Range(
            node.loc.startLine - 1,
            node.loc.startChar,
            node.loc.startLine - 1,
            node.loc.endChar,
          );
          const msg = `Classe '${node.name}' não possui o método 'Sub Free()'. Toda classe deve ter 'Sub Free()' para liberação de recursos.`;
          const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
          diag.code = DiagnosticCodes.MissingMyBaseFree;
          setDiagnosticPayload(diag, {
            code: DiagnosticCodes.MissingMyBaseFree,
            className: node.name,
          });
          diagnostics.push(diag);
        } else if (freeMethod?.loc) {
          let hasMyBaseFree = false;
          const checkCalls = new (class extends ASTWalker {
            protected override visitMethodInvocation(call: MethodInvocation): void {
              if (
                call.methodName.toLowerCase() === "free" &&
                call.callee?.kind === "Identifier" &&
                call.callee.name.toLowerCase() === "mybase"
              ) {
                hasMyBaseFree = true;
              }
            }
          })();
          for (const s of freeMethod.body) {
            checkCalls.walk(s);
          }

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!hasMyBaseFree) {
            const range = new vscode.Range(
              freeMethod.loc.startLine - 1,
              freeMethod.loc.startChar,
              freeMethod.loc.startLine - 1,
              freeMethod.loc.endChar,
            );
            const msg = `O método 'Sub Free()' da classe '${node.name}' não chama 'MyBase.Free()'.`;
            const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
            diag.code = DiagnosticCodes.MissingMyBaseFree;
            setDiagnosticPayload(diag, {
              code: DiagnosticCodes.MissingMyBaseFree,
              className: node.name,
            });
            diagnostics.push(diag);
          }
        }
      }
      super.walk(node);
    }
  })();
  walker.walk(unit);
}

/**
 * Validates that no `Class`, `Structure`, or `Delegate` at the top level of a
 * `Namespace` shares the namespace's name.
 *
 * When the same identifier refers to both the namespace and a type inside it,
 * the Data7 compiler cannot resolve unqualified references (e.g.
 * `Dim x As ControleTitulos = New ControleTitulos()`) and emits a
 * "tipo não declarado" error even when module ordering is correct.
 *
 * Only top-level type declarations are checked here. Local variables and
 * method parameters may legitimately use a type imported from another
 * namespace that happens to share the current namespace's name.
 */
export function validateNamespaceNameConflicts(
  document: vscode.TextDocument,
  indexer: WorkspaceSymbolIndexer,
  diagnostics: vscode.Diagnostic[],
): void {
  const fileSyms = indexer.getFileSymbols(document.uri.toString());
  if (!fileSyms) return;

  const namespaceSym = fileSyms.symbols.find((s) => s.kind === "namespace");
  if (!namespaceSym) return;

  const nsNameLower = namespaceSym.name.toLowerCase();

  for (const sym of fileSyms.symbols) {
    if (sym.kind !== "class" && sym.kind !== "structure" && sym.kind !== "delegate") {
      continue;
    }
    if (sym.isSyntheticGenericInstantiation) continue;
    // Only top-level declarations inside this namespace
    if (sym.containerName?.toLowerCase() !== nsNameLower) continue;
    // Conflict: the type shares its name with the enclosing namespace
    if (sym.name.toLowerCase() !== nsNameLower) continue;

    const range = new vscode.Range(
      sym.range.startLine,
      sym.range.startChar,
      sym.range.startLine,
      sym.range.endChar,
    );
    const payload: NamespaceNameConflictPayload = {
      code: DiagnosticCodes.NamespaceNameConflict,
      name: sym.name,
      memberKind: sym.kind,
    };
    const diag = new vscode.Diagnostic(
      range,
      `O ${sym.kind} '${sym.name}' tem o mesmo nome que o namespace '${namespaceSym.name}' que o contém. ` +
        `Renomeie o ${sym.kind} ou o namespace para evitar ambiguidade no compilador.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.NamespaceNameConflict;
    diag.relatedInformation = [
      {
        location: new vscode.Location(document.uri, range),
        message: `Namespace '${namespaceSym.name}' declarado aqui.`,
      },
    ];
    setDiagnosticPayload(diag, payload);
    diagnostics.push(diag);
  }
}

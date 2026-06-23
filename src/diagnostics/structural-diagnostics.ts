import * as vscode from "vscode";
import type { ParameterInfo, SymbolInfo, WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { SYSTEM_SYMBOLS } from "../system-library";
import { DiagnosticCodes, setDiagnosticPayload } from "./diagnostic-codes";
import type { DuplicateDeclarationPayload } from "./diagnostic-codes";
import { LocalDeclarationCollector } from "./ast-collectors";
import {
  ASTWalker,
  type CompilationUnit,
  type MethodDeclaration,
  type MethodInvocation,
  type Node,
  type SourceLocation,
} from "../project/ast/ast";

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
      !s.containerName ||
      s.containerName.toLowerCase() === "system" ||
      s.containerName.toLowerCase() === "globals"
    ) {
      outerSymbols.set(s.name.toLowerCase(), {
        kind: "símbolo global do sistema",
        container: s.containerName,
      });
    }
  });

  indexer.getAllSymbols().forEach((s) => {
    if (s.fileUri && s.fileUri === document.uri.toString()) return;
    if (s.fileUri && /principal\.bas$/i.test(s.fileUri)) {
      outerSymbols.set(s.name.toLowerCase(), {
        kind: "símbolo global (Principal.bas)",
        container: s.containerName,
      });
    }
  });

  const checkTopLevel = (s: SymbolInfo): void => {
    if (s.kind === "namespace") return;
    if (s.isSyntheticGenericInstantiation) return;
    if (!s.containerName) return;
    if (s.fileUri && s.fileUri === document.uri.toString()) return;

    const containerLower = s.containerName.toLowerCase();
    if (importedNs.has(containerLower)) {
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
  indexer.getAllSymbols().forEach((s) => {
    checkTopLevel(s);
  });

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

  const fileTopLevel = new Map<string, SymbolInfo>();

  // Namespace level checks
  fileSyms.symbols.forEach((s) => {
    if (s.kind === "namespace") return;
    if (s.isSyntheticGenericInstantiation) return;
    const isTopLevel = !s.containerName || (activeNamespace && s.containerName === activeNamespace);
    if (!isTopLevel) return;

    const nameLower = s.name.toLowerCase();
    const existing = fileTopLevel.get(nameLower);
    if (existing) {
      const bothMethods = s.kind === "method" && existing.kind === "method";
      if (bothMethods && !isSameSignature(s.parameters, existing.parameters)) {
        return;
      }
      createConflictDiag(
        new vscode.Range(s.range.startLine, s.range.startChar, s.range.startLine, s.range.endChar),
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
    fileTopLevel.set(nameLower, s);

    const otherFileSymbol = indexer
      .getAllSymbols()
      .find(
        (other) =>
          other.name.toLowerCase() === nameLower &&
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

  // Class members checks
  const classes = fileSyms.symbols.filter((s) => s.kind === "class" || s.kind === "structure");
  classes.forEach((C) => {
    const members = fileSyms.symbols.filter(
      (s) => s.containerName?.toLowerCase() === C.name.toLowerCase(),
    );

    const sharedMembers = members.filter((m) => m.isShared);
    const instanceMembers = members.filter((m) => !m.isShared);

    const validateMemberGroup = (group: SymbolInfo[]): void => {
      const declaredInGroup = new Map<string, SymbolInfo[]>();

      group.forEach((m) => {
        const nameLower = m.name.toLowerCase();

        if (nameLower === C.name.toLowerCase() && nameLower !== "new") {
          createConflictDiag(
            new vscode.Range(
              m.range.startLine,
              m.range.startChar,
              m.range.startLine,
              m.range.endChar,
            ),
            `O membro '${m.name}' conflita com o nome da classe/estrutura '${C.name}'.`,
            {
              code: DiagnosticCodes.DuplicateDeclaration,
              name: m.name,
              scope: "class",
              conflictingWithName: C.name,
            },
          );
          return;
        }

        const existingList = declaredInGroup.get(nameLower);
        if (existingList) {
          for (const existing of existingList) {
            const bothMethods = m.kind === "method" && existing.kind === "method";
            if (bothMethods) {
              if (isSameSignature(m.parameters, existing.parameters)) {
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
            } else {
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
          }
          existingList.push(m);
        } else {
          declaredInGroup.set(nameLower, [m]);
        }
      });
    };

    validateMemberGroup(sharedMembers);
    validateMemberGroup(instanceMembers);
  });

  // Local / Method level variable checks using AST collector
  const walker = new (class extends ASTWalker {
    public override walk(node: Node): void {
      if (node.kind === "MethodDeclaration") {
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
            const members = fileSyms.symbols.filter(
              (s) => s.containerName?.toLowerCase() === C.name.toLowerCase(),
            );
            const isShared = node.modifiers?.includes("shared") ?? false;
            const visibleMembers = isShared ? members.filter((m) => m.isShared) : members;

            const conflictingMember = visibleMembers.find(
              (m) => m.name.toLowerCase() === nameLower,
            );
            if (conflictingMember) {
              createConflictDiag(
                range,
                `O identificador '${v.name}' conflita com o membro '${conflictingMember.name}' da classe '${C.name}'.`,
                {
                  code: DiagnosticCodes.DuplicateDeclaration,
                  name: v.name,
                  scope: "class",
                  conflictingWithName: conflictingMember.name,
                },
                {
                  uri: conflictingMember.fileUri,
                  range: symbolRange(conflictingMember),
                  message: `Membro declarado aqui: '${conflictingMember.name}'.`,
                },
              );
              return;
            }

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
              return;
            }
          }
        });
      }
      super.walk(node);
    }
  })();
  walker.walk(unit);
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

    public override walk(node: Node): void {
      if (node.kind === "ClassDeclaration") {
        const prev = this.currentClassName;
        this.currentClassName = node.name;
        super.walk(node);
        this.currentClassName = prev;
        return;
      }

      if (node.kind === "MethodDeclaration") {
        if (node.isConstructor) {
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
            const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
            diag.code = DiagnosticCodes.MissingMyBaseNew;
            setDiagnosticPayload(diag, {
              code: DiagnosticCodes.MissingMyBaseNew,
              className: this.currentClassName || "",
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
        const baseNameLower = node.baseType?.name.toLowerCase();
        if (baseNameLower === "baseenum" || baseNameLower === "coresugarbaseenum") {
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

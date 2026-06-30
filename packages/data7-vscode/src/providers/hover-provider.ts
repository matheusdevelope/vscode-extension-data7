import * as vscode from "vscode";
import {
  D7AstContext,
  LANGUAGE_IDS,
  TimeTracker,
  TypeResolver,
  WorkspaceSymbolIndexer,
  astLocalToSymbol,
  detectEnumerable,
  formatParameterList,
  inferLiteralType,
  lookupSystemByName,
  typeRefToString,
} from "@data7/core";
import type { SymbolInfo } from "@data7/core";

export class D7BasicHoverProvider implements vscode.HoverProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  private static getSymbolSignature(s: SymbolInfo): string {
    let modPart = "";
    if (s.isPrivate) modPart += "Private ";
    else modPart += "Public ";
    if (s.isShared && s.kind !== "declare_sub" && s.kind !== "declare_function") {
      modPart += "Shared ";
    }

    const paramsPart = s.parameters ? formatParameterList(s.parameters) : "";

    switch (s.kind) {
      case "namespace":
        return `Namespace ${s.name}`;
      case "class":
        return `${modPart}Class ${s.name}${s.inheritsFrom ? `\nInherits ${s.inheritsFrom}` : ""}`;
      case "structure":
        return `${modPart}Structure ${s.name}`;
      case "delegate":
        return `${modPart}Delegate ${s.type === "Void" ? "Sub" : "Function"} ${s.name}${paramsPart}${s.type !== "Void" ? ` As ${s.type}` : ""}`;
      case "declare_sub":
        return `${modPart}Declare Sub ${s.name}${paramsPart}`;
      case "declare_function":
        return `${modPart}Declare Function ${s.name}${paramsPart} As ${s.type}`;
      case "method": {
        const isSub = s.type === "Void";
        return `${modPart}${isSub ? "Sub" : "Function"} ${s.name}${paramsPart}${!isSub ? ` As ${s.type}` : ""}`;
      }
      case "property":
        return `${modPart}Property ${s.name} As ${s.type}`;
      case "indexed-property":
        return `${modPart}Property ${s.name}${paramsPart} As ${s.type}`;
      case "variable":
        if (s.isConst) {
          const isClassMember =
            s.containerName &&
            !s.containerName.toLowerCase().startsWith("mod_") &&
            !s.containerName.toLowerCase().includes("namespace");
          if (isClassMember) {
            const vis = s.isPrivate ? "Private " : s.isProtected ? "Protected " : "Public ";
            return `${vis}Const ${s.name} As ${s.type}`;
          }
          return `Const ${s.name} As ${s.type}`;
        }
        return `${modPart}Dim ${s.name} As ${s.type}`;
      default:
        return s.name;
    }
  }

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Hover> {
    if (token.isCancellationRequested) return undefined;
    const tracker = new TimeTracker(
      `Hover no arquivo ${vscode.workspace.asRelativePath(document.uri)}`,
    );

    try {
      const result = this.provideHoverInternal(document, position, token);
      tracker.stopAndLog();
      return result;
    } catch (err) {
      tracker.stopAndLog();
      throw err;
    }
  }

  private provideHoverInternal(
    document: vscode.TextDocument,
    position: vscode.Position,
    _: vscode.CancellationToken,
  ): vscode.Hover | undefined {
    const ast = new D7AstContext(document, position, this.indexer);
    const range = ast.wordRange;
    const word = ast.word;
    if (!range || !word) return undefined;

    const forEachHover = this.tryForEachHover(document, ast, range);
    if (forEachHover) return forEachHover;

    const literalType = inferLiteralType(word);
    if (literalType) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock(`(literal) ${word} As ${literalType}`, LANGUAGE_IDS.d7basic);
      return new vscode.Hover(md, range);
    }

    let targetSymbol: SymbolInfo | undefined;

    // Tentar resolver classes aninhadas ou símbolos qualificados primeiro
    const lineText = document.lineAt(position.line).text;
    const qualifiedWord = getQualifiedWordAtPosition(lineText, position.character);
    if (qualifiedWord && qualifiedWord.includes(".")) {
      targetSymbol = resolveQualifiedSymbol(qualifiedWord, document.uri.toString(), this.indexer);
    }

    if (!targetSymbol) {
      const memberAccess = ast.getMemberAccessContext();
      if (memberAccess) {
        targetSymbol = memberAccess.symbol;
      }
    }

    if (!targetSymbol) {
      const wordLower = word.toLowerCase();
      if (wordLower === "me" || wordLower === "mybase") {
        const activeClass = ast.getActiveClassSymbol();
        if (activeClass) {
          if (wordLower === "me") {
            targetSymbol = {
              ...activeClass,
              description:
                `Representa a instancia atual da classe \`${activeClass.name}\`.` +
                (activeClass.description ? `\n\n${activeClass.description}` : ""),
            };
          } else {
            const parentName = activeClass.inheritsFrom ?? "TObject";
            const parentSymbol = this.indexer.findSymbolByName(parentName, document.uri.toString());
            if (parentSymbol) {
              targetSymbol = {
                ...parentSymbol,
                description:
                  `Acessa membros da classe base herdada \`${parentName}\`.` +
                  (parentSymbol.description ? `\n\n${parentSymbol.description}` : ""),
              };
            } else {
              targetSymbol = {
                name: parentName,
                kind: "class",
                type: parentName,
                isShared: false,
                isPrivate: false,
                range: activeClass.range,
                fileUri: activeClass.fileUri,
                description: `Acessa membros da classe base herdada \`${parentName}\`.`,
              };
            }
          }
        }
      }

      if (!targetSymbol) {
        const local = ast.findLocal(word);
        if (local) targetSymbol = astLocalToSymbol(local, document);
      }

      if (!targetSymbol) {
        const activeMethod = ast.getActiveMethodSymbol();
        if (activeMethod?.name.toLowerCase() === wordLower) {
          targetSymbol = activeMethod;
        } else {
          const activeProperty = ast.getActivePropertySymbol();
          if (activeProperty?.name.toLowerCase() === wordLower) {
            targetSymbol = activeProperty;
          }
        }
      }

      if (!targetSymbol) {
        const activeClass = ast.getActiveClassSymbol();
        if (activeClass) {
          const member = TypeResolver.findMember(activeClass.name, word, this.indexer);
          if (member) {
            targetSymbol = member;
          }
        }
      }

      targetSymbol ??=
        this.indexer.findSymbolByName(word, document.uri.toString()) ??
        lookupSystemByName(word).find(
          (s) => !s.containerName || s.kind === "namespace" || s.kind === "class",
        );

      if (!targetSymbol) {
        const constraint = ast.getGenericParametersInScope().get(wordLower);
        if (constraint) {
          const constraintSymbol =
            this.indexer.findSymbolByName(constraint, document.uri.toString()) ??
            lookupSystemByName(constraint).find(
              (s) => !s.containerName || s.kind === "namespace" || s.kind === "class",
            );
          if (constraintSymbol) {
            targetSymbol = {
              ...constraintSymbol,
              name: word,
              inheritsFrom: constraint,
              description:
                `Parametro de tipo generico com restricao a \`${constraint}\`.` +
                (constraintSymbol.description ? `\n\n${constraintSymbol.description}` : ""),
              isGenericParam: true,
              constraintName: constraint,
            };
          }
        }
      }
    }

    if (!targetSymbol) return undefined;

    const signature = D7BasicHoverProvider.getSymbolSignature(targetSymbol);
    const markdown = new vscode.MarkdownString();
    markdown.appendCodeblock(signature, LANGUAGE_IDS.d7basic);

    if (targetSymbol.isUnsupported) {
      markdown.appendMarkdown("\n---\n");
      markdown.appendMarkdown(
        "> **Nao suportado pelo compilador Data7.** O membro aparece no autocomplete original, mas o compilador rejeita seu uso.",
      );
    }

    if (targetSymbol.description) {
      markdown.appendMarkdown("\n---\n");
      markdown.appendMarkdown(targetSymbol.description);
    }

    if (
      targetSymbol.kind === "class" ||
      targetSymbol.kind === "structure" ||
      targetSymbol.kind === "namespace"
    ) {
      const memberLookupName =
        targetSymbol.isGenericParam && targetSymbol.constraintName
          ? targetSymbol.constraintName
          : targetSymbol.name;
      this.appendMemberPreview(markdown, memberLookupName);
    }

    markdown.appendMarkdown("\n\n---\n");
    if (targetSymbol.fileUri.startsWith("system://")) {
      markdown.appendMarkdown("*Biblioteca do Sistema (Delphi ERP)*");
    } else if (targetSymbol.fileUri.toLowerCase().includes("data7_modules")) {
      markdown.appendMarkdown("*Modulo de Dependencia Compartilhada (data7_modules)*");
    } else {
      markdown.appendMarkdown("*Simbolo Local do Projeto*");
    }

    return new vscode.Hover(markdown, range);
  }

  private appendMemberPreview(markdown: vscode.MarkdownString, typeName: string): void {
    const members = TypeResolver.getAllMembersForType(typeName, this.indexer);
    if (members.length === 0) return;

    markdown.appendMarkdown("\n---\n**Membros:**\n");
    const uniqueMembers = new Map<string, SymbolInfo>();
    members.forEach((m) => {
      let paramsPart = "";
      if (m.parameters && m.parameters.length > 0) {
        paramsPart = m.parameters.map((p) => p.type.toLowerCase()).join(",");
      }
      const key = `${m.kind}:${m.name.toLowerCase()}#${paramsPart}`;
      if (!uniqueMembers.has(key)) uniqueMembers.set(key, m);
    });

    const sortedMembers = Array.from(uniqueMembers.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    sortedMembers.forEach((m) => {
      let mSig = m.name;
      if (m.kind === "method" || m.kind === "declare_sub" || m.kind === "declare_function") {
        const params = m.parameters ? m.parameters.map((p) => p.type).join(", ") : "";
        mSig = `${m.name}(${params}) As ${m.type}`;
      } else if (m.kind === "indexed-property") {
        const params = m.parameters ? m.parameters.map((p) => p.type).join(", ") : "";
        mSig = `${m.name}(${params}) As ${m.type}`;
      } else if (m.kind === "property" || m.kind === "variable") {
        mSig = `${m.name} As ${m.type}`;
      }
      markdown.appendMarkdown(`- \`${mSig}\` (${m.kind})\n`);
    });
  }

  private tryForEachHover(
    document: vscode.TextDocument,
    ast: D7AstContext,
    range: vscode.Range,
  ): vscode.Hover | undefined {
    const forEach = ast.getForEachAtPosition();
    if (!forEach) return undefined;

    const operandType = ast.resolveExpressionType(forEach.enumerable);
    if (!operandType) return undefined;

    const explicitType = typeRefToString(forEach.elementType);
    const operandName = ast.expressionToText(forEach.enumerable);
    const lineText = document.lineAt(range.start.line).text.trim();
    const enumerable = detectEnumerable(
      operandType,
      (t) => TypeResolver.getAllMembersForType(t, this.indexer),
      explicitType,
    );

    const md = new vscode.MarkdownString();
    md.appendCodeblock(lineText, LANGUAGE_IDS.d7basic);
    md.appendMarkdown("\n---\n");
    if (enumerable) {
      md.appendMarkdown(
        `**Iterando \`${operandType}\`** via \`${operandName}.${enumerable.indexerMember}(i): ${enumerable.elementType}\``,
      );
      const declaredType = explicitType ?? enumerable.elementType;
      md.appendMarkdown(
        `\n\nO Builder vai expandir esta linha em \`For i = 0 To ${operandName}.${enumerable.countMember} - 1\` ` +
          `e injetar um \`Dim ${forEach.elementVar.name} As ${declaredType} = ${operandName}.${enumerable.indexerMember}(i)\` ` +
          `(forma nativa equivalente).`,
      );
    } else {
      md.appendMarkdown(
        `**\`${operandType}\` nao e enumeravel**: falta a propriedade \`Count As Integer\` ou um acessor indexado.`,
      );
      md.appendMarkdown(
        "\n\nO Builder vai deixar esta linha intacta no `.7Proj` e o executor falhara em runtime.",
      );
    }
    return new vscode.Hover(md, range);
  }
}

function getQualifiedWordAtPosition(lineText: string, charIndex: number): string | undefined {
  if (charIndex < 0 || charIndex >= lineText.length) return undefined;
  let start = charIndex;
  while (start > 0 && /[A-Za-z0-9_.]/.test(lineText[start - 1] ?? "")) {
    start--;
  }
  let end = charIndex;
  while (end < lineText.length && /[A-Za-z0-9_.]/.test(lineText[end] ?? "")) {
    end++;
  }
  const word = lineText.slice(start, end).trim();
  return word.replace(/^\.+|\.+$/g, "") || undefined;
}

function resolveQualifiedSymbol(
  qualifiedName: string,
  uri: string,
  indexer: WorkspaceSymbolIndexer,
): SymbolInfo | undefined {
  const parts = qualifiedName.split(".");
  if (parts.length <= 1) return undefined;

  let currentContainer: string | undefined;
  let currentSymbol: SymbolInfo | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i === 0) {
      currentSymbol =
        indexer.findSymbolByName(part, uri) ??
        lookupSystemByName(part).find(
          (s) => !s.containerName || s.kind === "namespace" || s.kind === "class",
        );
      if (!currentSymbol) return undefined;
      currentContainer = currentSymbol.name;
    } else {
      const containerLower = currentContainer!.toLowerCase();
      const partLower = part.toLowerCase();
      const nextSymbol =
        indexer
          .getAllSymbols()
          .find(
            (s) =>
              s.name.toLowerCase() === partLower &&
              s.containerName?.toLowerCase() === containerLower,
          ) ??
        lookupSystemByName(part).find((s) => s.containerName?.toLowerCase() === containerLower);
      if (!nextSymbol) return undefined;
      currentSymbol = nextSymbol;
      currentContainer = currentSymbol.name;
    }
  }

  return currentSymbol;
}

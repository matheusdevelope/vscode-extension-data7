import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { lookupSystemNamespaceOrClassByName, lookupSystemByName } from "../system-library";
import { TypeResolver } from "../analysis/type-resolver";
import { detectEnumerable } from "../analysis/enumerable-detector";
import { formatParameterList } from "../utils/format-helpers";
import { LANGUAGE_IDS } from "../infra/constants";
import { getChainPrefix } from "../utils/chain-parser";

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
    const range = document.getWordRangeAtPosition(position);
    if (!range) return undefined;

    const word = document.getText(range);
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, range.start.character).trim();

    // Special case: hovering on the `For` / `Each` / `In` / loop var of a
    // `For Each` line. Surface the enumerable info the linter resolves so
    // the user understands which Count/indexer the Builder will use, without
    // needing to peek at docs/exemple/.
    const forEachHover = this.tryForEachHover(document, position, range);
    if (forEachHover) return forEachHover;

    let targetSymbol: SymbolInfo | undefined;
    let isMemberAccess = false; // <-- ADICIONE ESTA FLAG

    // Case A: Hovering on a member of an object (e.g. `obj.Member`)
    if (textBeforeCursor.endsWith(".")) {
      isMemberAccess = true; // <-- MARQUE COMO TRUE
      const dotIndex = lineText.lastIndexOf(".", range.start.character);
      if (dotIndex !== -1) {
        const prefix = getChainPrefix(lineText, dotIndex);
        const prefixLower = prefix.toLowerCase();

        if (prefixLower === "me" || prefixLower === "mybase") {
          const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
          if (fileSyms) {
            const currentClass = fileSyms.symbols.find(
              (s) =>
                s.kind === "class" &&
                position.line >= s.range.startLine &&
                position.line <= s.range.endLine,
            );
            if (currentClass) {
              targetSymbol = this.findClassMember(currentClass.name, word);
            }
          }
        } else {
          // Try resolving the type of the entire prefix expression (supports complex/nested chains)
          const typeName = TypeResolver.inferExpressionType(
            prefix,
            document,
            position.line,
            this.indexer,
          );
          if (typeName) {
            targetSymbol = this.findClassMember(typeName, word);
          } else {
            const lastWordMatch = /([a-zA-Z0-9_]+)$/.exec(prefix);

            if (lastWordMatch?.[1]) {
              const triggerWord = lastWordMatch[1];

              // Resolve variable type or namespace/class name
              let typeName = TypeResolver.getVariableType(
                triggerWord,
                document,
                position,
                this.indexer,
              );
              typeName ??=
                this.indexer.findSymbolByName(triggerWord, document.uri.toString())?.name ??
                // `lookupSystemNamespaceOrClassByName(...)[0]` may legitimately be
                // undefined; the cast keeps that runtime fact in the type system.
                (lookupSystemNamespaceOrClassByName(triggerWord)[0] as { name: string } | undefined)
                  ?.name;

              if (typeName) {
                targetSymbol = this.findClassMember(typeName, word);
              }
            }
          }
        }
      }
    }

    // Case B: Hovering on a global or direct identifier
    if (!isMemberAccess) {
      targetSymbol ??=
        this.indexer.findSymbolByName(word, document.uri.toString()) ??
        lookupSystemByName(word).find(
          (s) => !s.containerName || s.kind === "namespace" || s.kind === "class",
        );

      if (!targetSymbol) {
        // --- 1. CHECAR SE É UM PARÂMETRO DO MÉTODO ATUAL ---
        const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
        const currentMethod = fileSyms?.symbols.find(
          (s) =>
            s.kind === "method" &&
            position.line >= s.range.startLine &&
            position.line <= s.range.endLine,
        );

        if (currentMethod?.parameters) {
          const param = currentMethod.parameters.find(
            (p) => p.name.toLowerCase() === word.toLowerCase(),
          );
          if (param) {
            // Criamos um "SymbolInfo" sintético só para o Hover exibir a caixa de informação
            targetSymbol = {
              name: param.name,
              kind: "variable", // Tratamos como variável para o formatação padrão
              type: param.type,
              isShared: false,
              isPrivate: false,
              fileUri: document.uri.toString(),
              range: currentMethod.range,
              description: `Parâmetro de \`${currentMethod.name}\``,
            };
          }
        }

        // --- 2. CHECAR SE É UMA VARIÁVEL LOCAL (DIM) ---
        if (!targetSymbol) {
          // O seu TypeResolver já sabe fazer o regex reverso para achar Dims!
          const localType = TypeResolver.getVariableType(word, document, position, this.indexer);
          if (localType) {
            targetSymbol = {
              name: word,
              kind: "variable",
              type: localType,
              isShared: false,
              isPrivate: false,
              fileUri: document.uri.toString(),
              // range: new vscode.Range(position.line, 0, position.line, 0),
              range: {
                startLine: position.line,
                startChar: 0,
                endLine: position.line,
                endChar: 0,
              },
              description: "Variável local",
            };
          }
        }

        // --- 3. CÓDIGO EXISTENTE DOS PARÂMETROS GENÉRICOS (<T>) ---
        if (!targetSymbol) {
          const genericParams = TypeResolver.getGenericParametersInScope(
            document,
            position,
            this.indexer,
          );
          const constraint = genericParams.get(word.toLowerCase());
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
                  `Parâmetro de tipo genérico com restrição a \`${constraint}\`.` +
                  (constraintSymbol.description ? `\n\n${constraintSymbol.description}` : ""),
                isGenericParam: true,
                constraintName: constraint,
              };
            }
          }
        }
      }
    }

    if (targetSymbol) {
      const signature = D7BasicHoverProvider.getSymbolSignature(targetSymbol);
      const markdown = new vscode.MarkdownString();
      markdown.appendCodeblock(signature, LANGUAGE_IDS.d7basic);

      if (targetSymbol.isUnsupported) {
        markdown.appendMarkdown("\n---\n");
        markdown.appendMarkdown(
          "> ⚠️ **Não suportado pelo compilador Data7.** O membro aparece no autocomplete original, mas o compilador rejeita seu uso.",
        );
      }

      if (targetSymbol.description) {
        markdown.appendMarkdown("\n---\n");
        markdown.appendMarkdown(targetSymbol.description);
      }

      // Add preview of members for class, structure, or namespace (including inherited)
      if (
        targetSymbol.kind === "class" ||
        targetSymbol.kind === "structure" ||
        targetSymbol.kind === "namespace"
      ) {
        const memberLookupName =
          targetSymbol.isGenericParam && targetSymbol.constraintName
            ? targetSymbol.constraintName
            : targetSymbol.name;
        const members = TypeResolver.getAllMembersForType(memberLookupName, this.indexer);

        if (members.length > 0) {
          markdown.appendMarkdown("\n---\n**Membros:**\n");
          const uniqueMembers = new Map<string, SymbolInfo>();
          members.forEach((m) => {
            const key = `${m.kind}:${m.name.toLowerCase()}`;
            if (!uniqueMembers.has(key)) {
              uniqueMembers.set(key, m);
            }
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
      }

      // Add file origin metadata
      markdown.appendMarkdown("\n\n---\n");
      if (targetSymbol.fileUri.startsWith("system://")) {
        markdown.appendMarkdown("*Biblioteca do Sistema (Delphi ERP)*");
      } else if (targetSymbol.fileUri.toLowerCase().includes("data7_modules")) {
        markdown.appendMarkdown("*Módulo de Dependência Compartilhada (data7_modules)*");
      } else {
        markdown.appendMarkdown("*Símbolo Local do Projeto*");
      }

      return new vscode.Hover(markdown, range);
    }

    return undefined;
  }

  private findClassMember(className: string, memberName: string): SymbolInfo | undefined {
    return TypeResolver.findMember(className, memberName, this.indexer);
  }

  /**
   * When the hover sits anywhere on a `For Each <var>[ As <T>] In <ident>`
   * header, returns a Hover that documents the resolved {@link EnumerableInfo}:
   * the underlying type, the `Count` member used as the bound, the indexer
   * called per iteration, and the inferred element type. The same machinery
   * the linter uses to emit `not-enumerable` powers this hover, so the user
   * sees exactly what the build pipeline would consume.
   */
  private tryForEachHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    range: vscode.Range,
  ): vscode.Hover | undefined {
    const lineText = document.lineAt(position.line).text;
    const match = /^(\s*)For\s+Each\s+(\w+)(?:\s+As\s+([\w.]+))?\s+In\s+([A-Za-z_]\w*)\b/i.exec(
      lineText,
    );
    if (!match) return undefined;
    const operandName = match[4];
    const explicitType: string | undefined = match[3];
    if (!operandName) return undefined;

    // Resolve operand type from the lines BEFORE the For Each (`getVariableType`
    // would otherwise match the `In <operand>` on the very same line).
    const operandType = TypeResolver.getVariableType(
      operandName,
      document,
      new vscode.Position(Math.max(0, position.line - 1), 0),
      this.indexer,
    );
    if (!operandType) return undefined;

    const enumerable = detectEnumerable(
      operandType,
      (t) => TypeResolver.getAllMembersForType(t, this.indexer),
      explicitType,
    );

    const md = new vscode.MarkdownString();
    md.appendCodeblock(lineText.trim(), LANGUAGE_IDS.d7basic);
    md.appendMarkdown("\n---\n");
    if (enumerable) {
      md.appendMarkdown(
        `**Iterando \`${operandType}\`** via \`${operandName}.${enumerable.indexerMember}(i): ${enumerable.elementType}\``,
      );
      const declaredType = explicitType ?? enumerable.elementType;
      md.appendMarkdown(
        `\n\nO Builder vai expandir esta linha em \`For i = 0 To ${operandName}.${enumerable.countMember} - 1\` ` +
          `e injetar um \`Dim ${match[2]} As ${declaredType} = ${operandName}.${enumerable.indexerMember}(i)\` ` +
          `(forma nativa equivalente).`,
      );
    } else {
      md.appendMarkdown(
        `⚠️ **\`${operandType}\` não é enumerável** — falta a propriedade \`Count As Integer\` ou um acessor indexado.`,
      );
      md.appendMarkdown(
        "\n\nO Builder vai deixar esta linha intacta no `.7Proj` e o executor falhará em runtime.",
      );
    }
    return new vscode.Hover(md, range);
  }
}

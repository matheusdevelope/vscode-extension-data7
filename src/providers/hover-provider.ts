import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { lookupSystemNamespaceOrClassByName, lookupSystemByName } from "../system-library";
import { TypeResolver } from "../analysis/type-resolver";
import { formatParameterList } from "../utils/format-helpers";
import { LANGUAGE_IDS } from "../infra/constants";

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

    let targetSymbol: SymbolInfo | undefined;

    // Case A: Hovering on a member of an object (e.g. `obj.Member`)
    if (textBeforeCursor.endsWith(".")) {
      const dotIndex = lineText.lastIndexOf(".", range.start.character);
      if (dotIndex !== -1) {
        const prefix = lineText.substring(0, dotIndex).trim();
        const lastWordMatch = /([a-zA-Z0-9_]+)$/.exec(prefix);

        if (lastWordMatch) {
          const triggerWord = lastWordMatch[1];
          const triggerLower = triggerWord.toLowerCase();

          if (triggerLower === "me" || triggerLower === "mybase") {
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

    // Case B: Hovering on a global or direct identifier
    targetSymbol ??=
      this.indexer.findSymbolByName(word, document.uri.toString()) ??
      lookupSystemByName(word).find(
        (s) => !s.containerName || s.kind === "namespace" || s.kind === "class",
      );

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
        const members = TypeResolver.getAllMembersForType(targetSymbol.name, this.indexer);

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
}

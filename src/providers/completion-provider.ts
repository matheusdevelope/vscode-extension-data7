import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemNamespaceOrClassByName,
} from "../system-library";
import { TypeResolver } from "../analysis/type-resolver";
import { getChainPrefix } from "../utils/chain-parser";

const KEYWORDS = [
  "Imports",
  "Namespace",
  "Class",
  "Structure",
  "Delegate",
  "Property",
  "Get",
  "Set",
  "Shared",
  "Sub",
  "Function",
  "Dim",
  "As",
  "If",
  "Then",
  "Else",
  "ElseIf",
  "End If",
  "Select Case",
  "Case",
  "End Select",
  "For",
  "To",
  "Step",
  "Next",
  "Each",
  "In",
  "Do",
  "Loop",
  "While",
  "Until",
  "Try",
  "Catch",
  "Finally",
  "End Try",
  "Return",
  "New",
  "Inherits",
  "MyBase",
  "Me",
  "Null",
  "Exit",
  "Overrides",
  "Overridable",
  "Private",
  "Public",
  "Protected",
  "Declare",
  "Lib",
  "Alias",
];

// Re-export for backwards compatibility with code that imports `TypeResolver`
// from `./completion-provider`. New code should import directly from `./type-resolver`.
export { TypeResolver };

/**
 * Detects `Imports <maybe-partial-name>` typing context. Returns the partial
 * namespace prefix when the cursor is positioned to complete the namespace,
 * `undefined` otherwise.
 */
function matchImportsPrefix(textBeforeCursor: string): string | undefined {
  // Allow optional leading whitespace + `Imports` + at least one space, then
  // an optional partial namespace identifier (letters/digits/dots/underscore).
  const m = /^\s*Imports\s+([A-Za-z_][\w.]*)?$/i.exec(textBeforeCursor);
  // The capturing group is optional — `m[1]` is `string | undefined` under
  // `noUncheckedIndexedAccess`; `?? ""` covers the `Imports ` (no namespace yet) case.
  return m ? (m[1] ?? "") : undefined;
}

export class D7BasicCompletionProvider implements vscode.CompletionItemProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    if (token.isCancellationRequested) return undefined;

    const items: vscode.CompletionItem[] = [];
    const lineText = document.lineAt(position.line).text;

    const textBeforeCursor = lineText.substring(0, position.character);
    const dotIndex = textBeforeCursor.lastIndexOf(".");

    // Case 0: cursor is right after `Imports ` (or partial namespace name).
    //         Offer every known namespace as a completion target so the user
    //         doesn't have to remember module names.
    const importsCtx = matchImportsPrefix(textBeforeCursor);
    if (importsCtx) {
      const seen = new Set<string>();
      const pushNamespace = (name: string, detail: string): void => {
        const lower = name.toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module);
        item.detail = detail;
        items.push(item);
      };
      // Namespaces declared by the System Library.
      SYSTEM_SYMBOLS.forEach((s) => {
        if (s.kind === "namespace") pushNamespace(s.name, "System Library");
      });
      // Workspace namespaces (each `Namespace mod_xxx` declaration).
      this.indexer.getAllSymbols().forEach((s) => {
        if (s.kind === "namespace") pushNamespace(s.name, "Workspace");
      });
      return items;
    }

    // Case A: cursor is positioned after a dot (e.g. `obj.`, `me.`, `Forms.`).
    if (
      dotIndex !== -1 &&
      textBeforeCursor.substring(dotIndex + 1).trim() === textBeforeCursor.substring(dotIndex + 1)
    ) {
      const prefix = getChainPrefix(textBeforeCursor, dotIndex);
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
            if (prefixLower === "me") {
              const locals = fileSyms.symbols.filter(
                (s) => s.containerName?.toLowerCase() === currentClass.name.toLowerCase(),
              );
              locals.forEach((s) => items.push(this.createCompletionItem(s, document)));
            }
            const inherited = TypeResolver.getInheritedMembers(currentClass.name, this.indexer);
            inherited.forEach((s) => items.push(this.createCompletionItem(s, document)));
          }
        }
        return items;
      }

      // Try resolving the type of the entire prefix expression (supports complex/nested chains)
      const typeName = TypeResolver.inferExpressionType(
        prefix,
        document,
        position.line,
        this.indexer,
      );
      if (typeName) {
        const allMembers = TypeResolver.getAllMembersForType(typeName, this.indexer);
        allMembers.forEach((s) => items.push(this.createCompletionItem(s, document)));
        return items;
      }

      const lastWordMatch = /([a-zA-Z0-9_]+)$/.exec(prefix);

      if (lastWordMatch?.[1]) {
        const triggerWord = lastWordMatch[1];
        const triggerLower = triggerWord.toLowerCase();

        const isNamespaceOrStaticClass =
          lookupSystemNamespaceOrClassByName(triggerWord).length > 0 ||
          lookupSystemByContainer(triggerWord).length > 0 ||
          this.indexer
            .getAllSymbols()
            .some(
              (s) =>
                (s.name.toLowerCase() === triggerLower &&
                  (s.kind === "namespace" || s.kind === "class")) ||
                s.containerName?.toLowerCase() === triggerLower,
            );

        if (isNamespaceOrStaticClass) {
          lookupSystemByContainer(triggerWord).forEach((s) =>
            items.push(this.createCompletionItem(s, document)),
          );
          const workspaceMembers = this.indexer
            .getAllSymbols()
            .filter((s) => s.containerName?.toLowerCase() === triggerLower);
          workspaceMembers.forEach((s) => items.push(this.createCompletionItem(s, document)));
          return items;
        }

        const fallbackTypeName = TypeResolver.getVariableType(
          triggerWord,
          document,
          position,
          this.indexer,
        );
        if (fallbackTypeName) {
          const allMembers = TypeResolver.getAllMembersForType(fallbackTypeName, this.indexer);
          allMembers.forEach((s) => items.push(this.createCompletionItem(s, document)));
        }
      }
      return items;
    }

    // Case B: general context completion (Keywords, Snippets, Globals).
    KEYWORDS.forEach((kw) => {
      items.push(new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword));
    });
    this.addSnippets(items);

    SYSTEM_SYMBOLS.forEach((s) => {
      if (
        !s.containerName ||
        s.kind === "namespace" ||
        s.kind === "class" ||
        s.kind === "declare_function" ||
        s.kind === "declare_sub"
      ) {
        items.push(this.createCompletionItem(s, document));
      }
    });

    this.indexer.getAllSymbols().forEach((s) => {
      if (!s.containerName || s.kind === "namespace" || s.kind === "class") {
        items.push(this.createCompletionItem(s, document));
      }
    });

    return items;
  }

  private createCompletionItem(
    s: SymbolInfo,
    document: vscode.TextDocument,
  ): vscode.CompletionItem {
    let kind = vscode.CompletionItemKind.Variable;
    switch (s.kind) {
      case "namespace":
        kind = vscode.CompletionItemKind.Module;
        break;
      case "class":
        kind = vscode.CompletionItemKind.Class;
        break;
      case "structure":
        kind = vscode.CompletionItemKind.Struct;
        break;
      case "delegate":
        kind = vscode.CompletionItemKind.Interface;
        break;
      case "method":
        kind = vscode.CompletionItemKind.Method;
        break;
      case "declare_function":
        kind = vscode.CompletionItemKind.Function;
        break;
      case "declare_sub":
        kind = vscode.CompletionItemKind.Method;
        break;
      case "property":
        kind = vscode.CompletionItemKind.Property;
        break;
      case "indexed-property":
        kind = vscode.CompletionItemKind.Property;
        break;
      case "variable":
        kind = vscode.CompletionItemKind.Field;
        break;
    }

    let labelInput: string | vscode.CompletionItemLabel = s.name;
    const hasParams =
      s.kind === "method" ||
      s.kind === "declare_function" ||
      s.kind === "declare_sub" ||
      s.kind === "delegate" ||
      s.kind === "indexed-property";
    if (hasParams) {
      const params = s.parameters ?? [];
      const paramsStr = params
        .map((p) => {
          let pStr = "";
          if (p.isByRef) pStr += "ByRef ";
          pStr += p.name;
          if (p.type) pStr += " As " + p.type;
          if (p.isOptional) {
            pStr += " = " + (p.defaultValue ?? "...");
          }
          return pStr;
        })
        .join(", ");

      labelInput = { label: s.name, detail: `(${paramsStr})` };
    }

    const item = new vscode.CompletionItem(labelInput, kind);
    item.insertText = s.name;
    item.detail = s.kind.toUpperCase() + (s.type ? `: ${s.type}` : "");

    if (s.isUnsupported) {
      item.tags = [vscode.CompletionItemTag.Deprecated];
      item.detail = `(Não suportado pelo compilador Data7) ${item.detail}`;
    }

    if (
      s.containerName &&
      (s.kind === "class" || s.kind === "structure" || s.kind === "delegate")
    ) {
      const containerLower = s.containerName.toLowerCase();
      // Skip auto-import only for genuine Delphi/VCL low-level namespaces.
      const isVclOrSystem = containerLower.startsWith("vcl") || containerLower.startsWith("system");
      if (!isVclOrSystem) {
        const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
        const activeNamespace = fileSyms?.symbols.find((x) => x.kind === "namespace")?.name;

        const isCurrentNamespace = activeNamespace?.toLowerCase() === containerLower;
        const isAlreadyImported = fileSyms?.imports.some(
          (imp) => imp.toLowerCase() === containerLower,
        );

        if (!isCurrentNamespace && !isAlreadyImported) {
          let insertLine = 0;
          for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text.trim();
            if (lineText.toLowerCase().startsWith("imports ")) {
              insertLine = i + 1;
            }
          }

          item.detail = `(Auto Import de ${s.containerName}) ${item.detail}`;
          const importEdit = new vscode.TextEdit(
            new vscode.Range(
              new vscode.Position(insertLine, 0),
              new vscode.Position(insertLine, 0),
            ),
            `Imports ${s.containerName}\r\n`,
          );
          item.additionalTextEdits = [importEdit];
        }
      }
    }

    if (s.description) {
      item.documentation = new vscode.MarkdownString(s.description);
    }
    return item;
  }

  private addSnippets(items: vscode.CompletionItem[]): void {
    const ifSnippet = new vscode.CompletionItem("If...Then", vscode.CompletionItemKind.Snippet);
    ifSnippet.insertText = new vscode.SnippetString("If ${1:condition}\n\t$0\nEnd If");
    ifSnippet.documentation = "Estrutura Condicional If Then";
    items.push(ifSnippet);

    const forSnippet = new vscode.CompletionItem("For...Next", vscode.CompletionItemKind.Snippet);
    forSnippet.insertText = new vscode.SnippetString(
      "For ${1:i} = 0 To ${2:count} - 1\n\t$0\nNext",
    );
    forSnippet.documentation = "Loop For Incremental";
    items.push(forSnippet);

    const forEachSnippet = new vscode.CompletionItem(
      "For Each...Next",
      vscode.CompletionItemKind.Snippet,
    );
    forEachSnippet.insertText = new vscode.SnippetString(
      "For Each ${1:item} As ${2:Tipo} In ${3:colecao}\n\t$0\nNext",
    );
    forEachSnippet.documentation =
      "Loop de enumeração (açúcar — transpilado para For clássico no build).";
    items.push(forEachSnippet);

    const forEachRangeSnippet = new vscode.CompletionItem(
      "For Each In range",
      vscode.CompletionItemKind.Snippet,
    );
    forEachRangeSnippet.insertText = new vscode.SnippetString(
      "For Each ${1:i} In ${2:0}..${3:n}\n\t$0\nNext",
    );
    forEachRangeSnippet.documentation =
      "Loop sobre intervalo numérico (açúcar — transpilado para `For i = a To b` no build).";
    items.push(forEachRangeSnippet);

    const interpolationSnippet = new vscode.CompletionItem(
      'String Interpolation $"..."',
      vscode.CompletionItemKind.Snippet,
    );
    interpolationSnippet.insertText = new vscode.SnippetString('$"${1:texto} {${2:expr}}$0"');
    interpolationSnippet.documentation =
      'String interpolada (açúcar — transpilada para `"texto " & (expr)` com `&` no build).';
    items.push(interpolationSnippet);

    const ternarySnippet = new vscode.CompletionItem(
      "Dim ternary x = cond ? a : b",
      vscode.CompletionItemKind.Snippet,
    );
    ternarySnippet.insertText = new vscode.SnippetString(
      "Dim ${1:nome} As ${2:Tipo} = ${3:cond} ? ${4:valorTrue} : ${5:valorFalse}",
    );
    ternarySnippet.documentation =
      "Atribuição ternária (açúcar — transpilada para `If/Then/Else/End If` no build).";
    items.push(ternarySnippet);

    const trySnippet = new vscode.CompletionItem("Try...Catch", vscode.CompletionItemKind.Snippet);
    trySnippet.insertText = new vscode.SnippetString(
      "Try\n\t$1\nCatch ${2:ex} As Exception\n\t$0\nEnd Try",
    );
    trySnippet.documentation = "Tratamento de Exceções Try Catch";
    items.push(trySnippet);

    const propSnippet = new vscode.CompletionItem(
      "Property Block",
      vscode.CompletionItemKind.Snippet,
    );
    propSnippet.insertText = new vscode.SnippetString(
      "Property ${1:PropName} As ${2:DataType}\n\tGet\n\t\t${1:PropName} = me._${3:fieldName}\n\tEnd Get\n\tSet(pValue As ${2:DataType})\n\t\tme._${3:fieldName} = pValue\n\tEnd Set\nEnd Property",
    );
    propSnippet.documentation = "Declaração de Bloco de Propriedade Completa";
    items.push(propSnippet);

    const funcSnippet = new vscode.CompletionItem(
      "Function Block",
      vscode.CompletionItemKind.Snippet,
    );
    funcSnippet.insertText = new vscode.SnippetString(
      "Function ${1:FuncName}($2) As ${3:DataType}\n\t$0\n\t${1:FuncName} = $4\nEnd Function",
    );
    funcSnippet.documentation = "Declaração de Nova Função";
    items.push(funcSnippet);

    const subSnippet = new vscode.CompletionItem("Sub Block", vscode.CompletionItemKind.Snippet);
    subSnippet.insertText = new vscode.SnippetString("Sub ${1:SubName}($2)\n\t$0\nEnd Sub");
    subSnippet.documentation = "Declaração de Novo Sub/Procedimento";
    items.push(subSnippet);

    const ctorSnippet = new vscode.CompletionItem(
      "Constructor (Sub New)",
      vscode.CompletionItemKind.Snippet,
    );
    ctorSnippet.insertText = new vscode.SnippetString(
      "Sub New($1)\n\tMyBase.New($2)\n\t$0\nEnd Sub",
    );
    ctorSnippet.documentation = "Construtor da Classe (Sub New)";
    items.push(ctorSnippet);
  }
}

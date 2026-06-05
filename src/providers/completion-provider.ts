import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemNamespaceOrClassByName,
} from "../system-library";
import { TypeResolver } from "../analysis/type-resolver";
import { D7AstContext } from "./ast-context";

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
  "Const",
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
  "And",
  "Or",
  "Not",
  "Xor",
  "AndAlso",
  "OrElse",
  "Mod",
  "Is",
  "IsNot",
  "Like",
  "ByRef",
  "ByVal",
  "Enum",
  "Let",
  "Nothing",
  "ReadOnly",
  "When",
  "CType",
];

// Re-export for backwards compatibility with code that imports `TypeResolver`
// from `./completion-provider`. New code should import directly from `../analysis/type-resolver`.
export { TypeResolver };

function inheritsFromClass(
  subClassName: string,
  baseClassName: string,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  return TypeResolver.isSubclassOf(subClassName, baseClassName, indexer);
}

function isSymbolVisible(
  s: SymbolInfo,
  activeClass: SymbolInfo | undefined,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  if (!s.containerName) return true;
  const declaringClassLower = s.containerName.toLowerCase();
  if (activeClass) {
    const activeClassLower = activeClass.name.toLowerCase();
    if (declaringClassLower === activeClassLower) return true;
    if (inheritsFromClass(activeClass.name, s.containerName, indexer)) return !s.isPrivate;
  }
  return !s.isPrivate && !s.isProtected;
}

function getSignatureKey(s: SymbolInfo): string {
  const namePart = s.name.toLowerCase();
  let paramsPart = "";
  if (s.parameters && s.parameters.length > 0) {
    paramsPart = s.parameters.map((p) => p.type.toLowerCase()).join(",");
  }
  return `${namePart}#${paramsPart}`;
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
    const ast = new D7AstContext(document, position, this.indexer);
    const importsCtx = ast.getImportsCompletionContext();
    if (importsCtx !== undefined) {
      this.addNamespaceCompletions(items);
      return items;
    }

    const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
    const activeClass = ast.getActiveClassSymbol();
    const memberAccess = ast.getMemberAccessContext();

    if (memberAccess?.receiver) {
      const receiverText = ast.expressionToText(memberAccess.receiver);
      const receiverLower = receiverText.toLowerCase();

      if (receiverLower === "me" || receiverLower === "mybase") {
        if (activeClass) {
          const list: SymbolInfo[] = [];
          if (receiverLower === "me") {
            const ownSymbols = fileSyms?.symbols.filter(
              (s) => s.containerName?.toLowerCase() === activeClass.name.toLowerCase()
            ) ?? [];
            list.push(...ownSymbols);
          }
          const inherited = TypeResolver.getInheritedMembers(activeClass.name, this.indexer)
            .filter((s) => !s.isPrivate);

          // Deduplicate based on signature (override/shadowing)
          inherited.forEach((s) => {
            const sigKey = getSignatureKey(s);
            const hasOverride = list.some((existing) => getSignatureKey(existing) === sigKey);
            if (!hasOverride) {
              list.push(s);
            }
          });

          list.forEach((s) => items.push(this.createCompletionItem(s, document)));
        }
        return items;
      }

      if (this.addStaticContainerCompletions(items, receiverText, activeClass, document)) {
        return items;
      }

      if (memberAccess.receiverType) {
        TypeResolver.getAllMembersForType(memberAccess.receiverType, this.indexer).forEach((s) => {
          if (isSymbolVisible(s, activeClass, this.indexer)) {
            items.push(this.createCompletionItem(s, document));
          }
        });
      }
      return items;
    }

    const seenNames = new Set<string>();
    ast.getVisibleLocals().forEach((local) => {
      const lower = local.name.toLowerCase();
      if (seenNames.has(lower)) return;
      seenNames.add(lower);
      const item = new vscode.CompletionItem(
        local.name,
        local.isConst ? vscode.CompletionItemKind.Constant : vscode.CompletionItemKind.Variable,
      );
      item.detail = `${local.isConst ? "CONSTANT" : local.description.toUpperCase()}: ${local.type}`;
      items.push(item);
    });

    if (activeClass) {
      fileSyms?.symbols
        .filter((s) => s.containerName?.toLowerCase() === activeClass.name.toLowerCase())
        .forEach((s) => {
          const lowerName = s.name.toLowerCase();
          const sigKey = getSignatureKey(s);
          if (!seenNames.has(lowerName) && !seenNames.has(sigKey)) {
            seenNames.add(sigKey);
            items.push(this.createCompletionItem(s, document));
          }
        });

      TypeResolver.getInheritedMembers(activeClass.name, this.indexer).forEach((s) => {
        if (s.isPrivate) return;
        const lowerName = s.name.toLowerCase();
        const sigKey = getSignatureKey(s);
        if (!seenNames.has(lowerName) && !seenNames.has(sigKey)) {
          seenNames.add(sigKey);
          items.push(this.createCompletionItem(s, document));
        }
      });
    }

    KEYWORDS.forEach((kw) => items.push(new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword)));
    this.addSnippets(items);
    this.addGlobalSymbols(items, seenNames, document);

    return items;
  }

  private addNamespaceCompletions(items: vscode.CompletionItem[]): void {
    const seen = new Set<string>();
    const pushNamespace = (name: string, detail: string): void => {
      const lower = name.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module);
      item.detail = detail;
      items.push(item);
    };

    SYSTEM_SYMBOLS.forEach((s) => {
      if (s.kind === "namespace") pushNamespace(s.name, "System Library");
    });
    this.indexer.getAllSymbols().forEach((s) => {
      if (s.kind === "namespace") pushNamespace(s.name, "Workspace");
    });
  }

  private addStaticContainerCompletions(
    items: vscode.CompletionItem[],
    triggerWord: string,
    activeClass: SymbolInfo | undefined,
    document: vscode.TextDocument,
  ): boolean {
    if (!isSimpleIdentifier(triggerWord)) return false;

    const triggerLower = triggerWord.toLowerCase();
    const targetClass = TypeResolver.findClassSymbol(triggerWord, this.indexer);
    const isClassOrStruct =
      targetClass && (targetClass.kind === "class" || targetClass.kind === "structure");

    const isNamespaceOrStaticClass =
      isClassOrStruct ??
      (lookupSystemNamespaceOrClassByName(triggerWord).length > 0 ||
        lookupSystemByContainer(triggerWord).length > 0 ||
        this.indexer
          .getAllSymbols()
          .some(
            (s) =>
              (s.name.toLowerCase() === triggerLower &&
                (s.kind === "namespace" || s.kind === "class")) ||
              s.containerName?.toLowerCase() === triggerLower,
          ));

    if (!isNamespaceOrStaticClass) return false;

    const isNamespace =
      !isClassOrStruct &&
      (this.indexer
        .getAllSymbols()
        .some((s) => s.name.toLowerCase() === triggerLower && s.kind === "namespace") ||
        SYSTEM_SYMBOLS.some(
          (s) => s.name.toLowerCase() === triggerLower && s.kind === "namespace",
        ));

    lookupSystemByContainer(triggerWord).forEach((s) => {
      if (isSymbolVisible(s, activeClass, this.indexer) && (isNamespace || s.isShared)) {
        items.push(this.createCompletionItem(s, document));
      }
    });
    this.indexer
      .getAllSymbols()
      .filter((s) => s.containerName?.toLowerCase() === triggerLower)
      .forEach((s) => {
        if (isSymbolVisible(s, activeClass, this.indexer) && (isNamespace || s.isShared)) {
          items.push(this.createCompletionItem(s, document));
        }
      });
    return true;
  }

  private addGlobalSymbols(
    items: vscode.CompletionItem[],
    seenNames: Set<string>,
    document: vscode.TextDocument,
  ): void {
    SYSTEM_SYMBOLS.forEach((s) => {
      if (
        !s.containerName ||
        s.kind === "namespace" ||
        s.kind === "class" ||
        s.kind === "declare_function" ||
        s.kind === "declare_sub"
      ) {
        const lowerName = s.name.toLowerCase();
        if (!seenNames.has(lowerName)) {
          seenNames.add(lowerName);
          items.push(this.createCompletionItem(s, document));
        }
      }
    });

    this.indexer.getAllSymbols().forEach((s) => {
      if (!s.containerName || s.kind === "namespace" || s.kind === "class") {
        const lowerName = s.name.toLowerCase();
        if (!seenNames.has(lowerName)) {
          seenNames.add(lowerName);
          items.push(this.createCompletionItem(s, document));
        }
      }
    });
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
          if (p.isOptional) pStr += " = " + (p.defaultValue ?? "...");
          return pStr;
        })
        .join(", ");

      const isSubOrVoid = s.type === "Void" || s.kind === "declare_sub";
      const returnPart = isSubOrVoid ? "" : ` As ${s.type}`;
      labelInput = { label: s.name, detail: `(${paramsStr})${returnPart}` };
    } else if (s.type && s.type !== "Void") {
      labelInput = { label: s.name, detail: ` As ${s.type}` };
    }

    const item = new vscode.CompletionItem(labelInput, kind);
    item.insertText = s.name;
    item.detail = s.kind.toUpperCase() + (s.type ? `: ${s.type}` : "");

    if (s.isUnsupported) {
      item.tags = [vscode.CompletionItemTag.Deprecated];
      item.detail = `(Nao suportado pelo compilador Data7) ${item.detail}`;
    }

    if (
      s.containerName &&
      (s.kind === "class" || s.kind === "structure" || s.kind === "delegate")
    ) {
      this.addAutoImportEdit(item, s, document);
    }

    if (s.description) item.documentation = new vscode.MarkdownString(s.description);
    return item;
  }

  private addAutoImportEdit(
    item: vscode.CompletionItem,
    s: SymbolInfo,
    document: vscode.TextDocument,
  ): void {
    if (!s.containerName) return;
    const containerLower = s.containerName.toLowerCase();
    const isVclOrSystem = containerLower.startsWith("vcl") || containerLower.startsWith("system");
    if (isVclOrSystem) return;

    const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
    const activeNamespace = fileSyms?.symbols.find((x) => x.kind === "namespace")?.name;
    const isCurrentNamespace = activeNamespace?.toLowerCase() === containerLower;
    const isAlreadyImported = fileSyms?.imports.some((imp) => imp.toLowerCase() === containerLower);
    if (isCurrentNamespace || isAlreadyImported) return;

    let insertLine = 0;
    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text.trim();
      if (lineText.toLowerCase().startsWith("imports ")) insertLine = i + 1;
    }

    item.detail = `(Auto Import de ${s.containerName}) ${item.detail}`;
    item.additionalTextEdits = [
      new vscode.TextEdit(
        new vscode.Range(new vscode.Position(insertLine, 0), new vscode.Position(insertLine, 0)),
        `Imports ${s.containerName}\r\n`,
      ),
    ];
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
      "Loop de enumeracao (acucar, transpilado para For classico no build).";
    items.push(forEachSnippet);

    const forEachRangeSnippet = new vscode.CompletionItem(
      "For Each In range",
      vscode.CompletionItemKind.Snippet,
    );
    forEachRangeSnippet.insertText = new vscode.SnippetString(
      "For Each ${1:i} In ${2:0}..${3:n}\n\t$0\nNext",
    );
    forEachRangeSnippet.documentation =
      "Loop sobre intervalo numerico (acucar, transpilado para `For i = a To b` no build).";
    items.push(forEachRangeSnippet);

    const interpolationSnippet = new vscode.CompletionItem(
      'String Interpolation $"..."',
      vscode.CompletionItemKind.Snippet,
    );
    interpolationSnippet.insertText = new vscode.SnippetString('$"${1:texto} {${2:expr}}$0"');
    interpolationSnippet.documentation =
      'String interpolada (acucar, transpilada para `"texto " & (expr)` com `&` no build).';
    items.push(interpolationSnippet);

    const ternarySnippet = new vscode.CompletionItem(
      "Dim ternary x = cond ? a : b",
      vscode.CompletionItemKind.Snippet,
    );
    ternarySnippet.insertText = new vscode.SnippetString(
      "Dim ${1:nome} As ${2:Tipo} = ${3:cond} ? ${4:valorTrue} : ${5:valorFalse}",
    );
    ternarySnippet.documentation =
      "Atribuicao ternaria (acucar, transpilada para `If/Then/Else/End If` no build).";
    items.push(ternarySnippet);

    const trySnippet = new vscode.CompletionItem("Try...Catch", vscode.CompletionItemKind.Snippet);
    trySnippet.insertText = new vscode.SnippetString(
      "Try\n\t$1\nCatch ${2:ex} As Exception\n\t$0\nEnd Try",
    );
    trySnippet.documentation = "Tratamento de Excecoes Try Catch";
    items.push(trySnippet);

    const propSnippet = new vscode.CompletionItem(
      "Property Block",
      vscode.CompletionItemKind.Snippet,
    );
    propSnippet.insertText = new vscode.SnippetString(
      "Property ${1:PropName} As ${2:DataType}\n\tGet\n\t\t${1:PropName} = me._${3:fieldName}\n\tEnd Get\n\tSet(pValue As ${2:DataType})\n\t\tme._${3:fieldName} = pValue\n\tEnd Set\nEnd Property",
    );
    propSnippet.documentation = "Declaracao de Bloco de Propriedade Completa";
    items.push(propSnippet);

    const funcSnippet = new vscode.CompletionItem(
      "Function Block",
      vscode.CompletionItemKind.Snippet,
    );
    funcSnippet.insertText = new vscode.SnippetString(
      "Function ${1:FuncName}($2) As ${3:DataType}\n\t$0\n\t${1:FuncName} = $4\nEnd Function",
    );
    funcSnippet.documentation = "Declaracao de Nova Funcao";
    items.push(funcSnippet);

    const subSnippet = new vscode.CompletionItem("Sub Block", vscode.CompletionItemKind.Snippet);
    subSnippet.insertText = new vscode.SnippetString("Sub ${1:SubName}($2)\n\t$0\nEnd Sub");
    subSnippet.documentation = "Declaracao de Novo Sub/Procedimento";
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

function isSimpleIdentifier(value: string): boolean {
  if (value.length === 0) return false;
  const first = value.charCodeAt(0);
  const isFirst = (first >= 65 && first <= 90) || (first >= 97 && first <= 122) || first === 95;
  if (!isFirst) return false;
  for (let i = 1; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const ok =
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      (c >= 48 && c <= 57) ||
      c === 95;
    if (!ok) return false;
  }
  return true;
}

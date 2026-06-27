import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { D7AstContext, type AstBindingScope } from "../analysis/ast-context";
import { TypeResolver } from "../analysis/type-resolver";
import { TimeTracker } from "../utils/performance";
import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemNamespaceOrClassByName,
} from "../system-library";
import { LANGUAGE_KEYWORD_CANONICALS } from "../project/language/keywords";

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

const enum CompletionBucket {
  Block = 0,
  Method = 1,
  Class = 2,
  Inherited = 3,
  Namespace = 4,
  Global = 5,
  Keyword = 6,
  Snippet = 7,
}

interface RankedCompletionItem {
  readonly key: string;
  readonly bucket: CompletionBucket;
  readonly sortLabel: string;
  readonly item: vscode.CompletionItem;
}

function completionLabelText(item: vscode.CompletionItem): string {
  return typeof item.label === "string" ? item.label : item.label.label;
}

function toSortLabel(value: string): string {
  return value.toLowerCase();
}

function isTypeSymbol(s: SymbolInfo): boolean {
  return s.kind === "class" || s.kind === "structure" || s.kind === "delegate";
}

function getSymbolCompletionKey(s: SymbolInfo): string {
  return s.parameters && s.parameters.length > 0 ? getSignatureKey(s) : s.name.toLowerCase();
}

function getLocalCompletionBucket(
  scope: AstBindingScope,
  hasNamespaceScope: boolean,
): CompletionBucket {
  if (scope === "block") return CompletionBucket.Block;
  if (scope === "routine") return CompletionBucket.Method;
  return hasNamespaceScope ? CompletionBucket.Namespace : CompletionBucket.Global;
}

function matchesContainer(containerName: string | undefined, typeName: string): boolean {
  if (!containerName) return false;
  const containerLower = containerName.toLowerCase();
  const typeLower = typeName.toLowerCase();
  const shortLower = typeLower.includes(".")
    ? (typeLower.split(".").pop() ?? typeLower).toLowerCase()
    : typeLower;
  return (
    containerLower === typeLower ||
    containerLower === shortLower ||
    containerLower.endsWith("." + shortLower)
  );
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
    const tracker = new TimeTracker(`Completion no arquivo ${vscode.workspace.asRelativePath(document.uri)}`);

    try {
      const result = this.provideCompletionItemsInternal(document, position, token, _context);
      tracker.stopAndLog();
      return result;
    } catch (err) {
      tracker.stopAndLog();
      throw err;
    }
  }

  private provideCompletionItemsInternal(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): vscode.CompletionItem[] | vscode.CompletionList | undefined {
    const ast = new D7AstContext(document, position, this.indexer);
    const importsCtx = ast.getImportsCompletionContext();
    if (importsCtx !== undefined) {
      return this.getNamespaceCompletions();
    }

    const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
    const activeClass = ast.getActiveClassSymbol();
    const memberAccess = ast.getMemberAccessContext();

    if (memberAccess?.receiver) {
      const receiverText = ast.expressionToText(memberAccess.receiver);
      const receiverLower = receiverText.toLowerCase();

      if (receiverLower === "me" || receiverLower === "mybase") {
        if (!activeClass) return [];

        const entries: RankedCompletionItem[] = [];
        if (receiverLower === "me") {
          this.getOwnClassMembers(fileSyms, activeClass).forEach((s) => {
            entries.push(
              this.createRankedSymbolItem(
                s,
                document,
                CompletionBucket.Class,
                getSymbolCompletionKey(s),
              ),
            );
          });
        }

        TypeResolver.getInheritedMembers(activeClass.name, this.indexer)
          .filter((s) => !s.isPrivate)
          .forEach((s) => {
            entries.push(
              this.createRankedSymbolItem(
                s,
                document,
                CompletionBucket.Inherited,
                getSymbolCompletionKey(s),
              ),
            );
          });

        return this.finalizeCompletions(entries);
      }

      const staticCompletions = this.getStaticContainerCompletions(
        receiverText,
        activeClass,
        document,
      );
      if (staticCompletions) return staticCompletions;

      if (memberAccess.receiverType) {
        const receiverType = memberAccess.receiverType;
        const entries: RankedCompletionItem[] = [];
        TypeResolver.getAllMembersForType(receiverType, this.indexer).forEach((s) => {
          if (!isSymbolVisible(s, activeClass, this.indexer)) return;
          const bucket = matchesContainer(s.containerName, receiverType)
            ? CompletionBucket.Class
            : CompletionBucket.Inherited;
          entries.push(this.createRankedSymbolItem(s, document, bucket, getSymbolCompletionKey(s)));
        });
        return this.finalizeCompletions(entries);
      }

      return [];
    }

    const entries: RankedCompletionItem[] = [];
    const namespaceScopeNames = this.getNamespaceScopeNames(fileSyms, position);
    const hasNamespaceScope = namespaceScopeNames.size > 0;

    ast.getVisibleLocals().forEach((local) => {
      const item = new vscode.CompletionItem(
        local.name,
        local.isConst ? vscode.CompletionItemKind.Constant : vscode.CompletionItemKind.Variable,
      );
      item.detail = `${local.isConst ? "CONSTANT" : local.description.toUpperCase()}: ${local.type}`;
      entries.push(
        this.createRankedItem(
          item,
          getLocalCompletionBucket(local.scope, hasNamespaceScope),
          local.name.toLowerCase(),
        ),
      );
    });

    if (activeClass) {
      this.getOwnClassMembers(fileSyms, activeClass).forEach((s) => {
        entries.push(
          this.createRankedSymbolItem(
            s,
            document,
            CompletionBucket.Class,
            getSymbolCompletionKey(s),
          ),
        );
      });

      TypeResolver.getInheritedMembers(activeClass.name, this.indexer).forEach((s) => {
        if (s.isPrivate) return;
        entries.push(
          this.createRankedSymbolItem(
            s,
            document,
            CompletionBucket.Inherited,
            getSymbolCompletionKey(s),
          ),
        );
      });
    }

    this.getNamespaceScopedSymbols(namespaceScopeNames, activeClass).forEach((s) => {
      entries.push(
        this.createRankedSymbolItem(
          s,
          document,
          CompletionBucket.Namespace,
          getSymbolCompletionKey(s),
        ),
      );
    });

    this.getGlobalSymbols(namespaceScopeNames).forEach((s) => {
      entries.push(
        this.createRankedSymbolItem(
          s,
          document,
          CompletionBucket.Global,
          getSymbolCompletionKey(s),
        ),
      );
    });

    LANGUAGE_KEYWORD_CANONICALS.forEach((kw) => {
      entries.push(
        this.createRankedItem(
          new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword),
          CompletionBucket.Keyword,
          kw.toLowerCase(),
        ),
      );
    });

    this.addSnippets(entries);
    return this.finalizeCompletions(entries);
  }

  private finalizeCompletions(entries: readonly RankedCompletionItem[]): vscode.CompletionItem[] {
    const deduped = new Map<string, RankedCompletionItem>();
    for (const entry of entries) {
      if (!deduped.has(entry.key)) {
        deduped.set(entry.key, entry);
      }
    }

    const sorted = Array.from(deduped.values()).sort((left, right) => {
      if (left.bucket !== right.bucket) return left.bucket - right.bucket;
      return left.sortLabel.localeCompare(right.sortLabel, "en", { sensitivity: "base" });
    });

    sorted.forEach((entry, index) => {
      entry.item.sortText = `${String(entry.bucket).padStart(2, "0")}:${entry.sortLabel}:${String(index).padStart(4, "0")}`;
    });

    return sorted.map((entry) => entry.item);
  }

  private createRankedItem(
    item: vscode.CompletionItem,
    bucket: CompletionBucket,
    key: string,
  ): RankedCompletionItem {
    return {
      item,
      bucket,
      key,
      sortLabel: toSortLabel(completionLabelText(item)),
    };
  }

  private createRankedSymbolItem(
    symbol: SymbolInfo,
    document: vscode.TextDocument,
    bucket: CompletionBucket,
    key: string,
  ): RankedCompletionItem {
    return this.createRankedItem(this.createCompletionItem(symbol, document), bucket, key);
  }

  private getNamespaceCompletions(): vscode.CompletionItem[] {
    const entries: RankedCompletionItem[] = [];
    const seen = new Set<string>();
    const pushNamespace = (name: string, detail: string): void => {
      const lower = name.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module);
      item.detail = detail;
      entries.push(this.createRankedItem(item, CompletionBucket.Namespace, lower));
    };

    SYSTEM_SYMBOLS.forEach((s) => {
      if (s.kind === "namespace") pushNamespace(s.name, "System Library");
    });
    this.indexer.getAllSymbols().forEach((s) => {
      if (s.kind === "namespace") pushNamespace(s.name, "Workspace");
    });

    return this.finalizeCompletions(entries);
  }

  private getOwnClassMembers(
    fileSyms: ReturnType<WorkspaceSymbolIndexer["getFileSymbols"]>,
    activeClass: SymbolInfo,
  ): SymbolInfo[] {
    return (
      fileSyms?.symbols.filter(
        (s) => s.containerName?.toLowerCase() === activeClass.name.toLowerCase(),
      ) ?? []
    );
  }

  private getNamespaceScopeNames(
    fileSyms: ReturnType<WorkspaceSymbolIndexer["getFileSymbols"]>,
    position: vscode.Position,
  ): Set<string> {
    const names = new Set<string>();
    const activeNamespace = fileSyms?.symbols.find(
      (s) =>
        s.kind === "namespace" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    if (activeNamespace) names.add(activeNamespace.name.toLowerCase());
    fileSyms?.imports.forEach((imp) => names.add(imp.toLowerCase()));
    return names;
  }

  private getNamespaceScopedSymbols(
    namespaceScopeNames: ReadonlySet<string>,
    activeClass: SymbolInfo | undefined,
  ): SymbolInfo[] {
    if (namespaceScopeNames.size === 0) return [];

    const matchesScope = (s: SymbolInfo): boolean =>
      s.containerName !== undefined &&
      namespaceScopeNames.has(s.containerName.toLowerCase()) &&
      isSymbolVisible(s, activeClass, this.indexer);

    return [
      ...SYSTEM_SYMBOLS.filter(matchesScope),
      ...this.indexer.getAllSymbols().filter(matchesScope),
    ];
  }

  private getStaticContainerCompletions(
    triggerWord: string,
    activeClass: SymbolInfo | undefined,
    document: vscode.TextDocument,
  ): vscode.CompletionItem[] | undefined {
    if (!isSimpleIdentifier(triggerWord)) return undefined;

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

    if (!isNamespaceOrStaticClass) return undefined;

    const isNamespace =
      !isClassOrStruct &&
      (this.indexer
        .getAllSymbols()
        .some((s) => s.name.toLowerCase() === triggerLower && s.kind === "namespace") ||
        SYSTEM_SYMBOLS.some(
          (s) => s.name.toLowerCase() === triggerLower && s.kind === "namespace",
        ));

    const entries: RankedCompletionItem[] = [];
    const pushSymbol = (s: SymbolInfo): void => {
      if (!isSymbolVisible(s, activeClass, this.indexer)) return;
      if (!isNamespace && !s.isShared) return;
      entries.push(
        this.createRankedSymbolItem(
          s,
          document,
          isNamespace ? CompletionBucket.Namespace : CompletionBucket.Class,
          getSymbolCompletionKey(s),
        ),
      );
    };

    lookupSystemByContainer(triggerWord).forEach(pushSymbol);
    this.indexer
      .getAllSymbols()
      .filter((s) => s.containerName?.toLowerCase() === triggerLower)
      .forEach(pushSymbol);

    return this.finalizeCompletions(entries);
  }

  private getGlobalSymbols(namespaceScopeNames: ReadonlySet<string>): SymbolInfo[] {
    const includeSymbol = (s: SymbolInfo): boolean => {
      if (!s.containerName) return true;
      if (s.kind === "namespace") return true;
      if (s.kind === "declare_function" || s.kind === "declare_sub") return true;
      return isTypeSymbol(s) && !namespaceScopeNames.has(s.containerName.toLowerCase());
    };

    return [
      ...SYSTEM_SYMBOLS.filter(includeSymbol),
      ...this.indexer.getAllSymbols().filter(includeSymbol),
    ];
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

  private addSnippets(entries: RankedCompletionItem[]): void {
    const pushSnippet = (item: vscode.CompletionItem): void => {
      entries.push(
        this.createRankedItem(
          item,
          CompletionBucket.Snippet,
          completionLabelText(item).toLowerCase(),
        ),
      );
    };

    const ifSnippet = new vscode.CompletionItem("If...Then", vscode.CompletionItemKind.Snippet);
    ifSnippet.insertText = new vscode.SnippetString("If ${1:condition}\n\t$0\nEnd If");
    ifSnippet.documentation = "Estrutura Condicional If Then";
    pushSnippet(ifSnippet);

    const forSnippet = new vscode.CompletionItem("For...Next", vscode.CompletionItemKind.Snippet);
    forSnippet.insertText = new vscode.SnippetString(
      "For ${1:i} = 0 To ${2:count} - 1\n\t$0\nNext",
    );
    forSnippet.documentation = "Loop For Incremental";
    pushSnippet(forSnippet);

    const forEachSnippet = new vscode.CompletionItem(
      "For Each...Next",
      vscode.CompletionItemKind.Snippet,
    );
    forEachSnippet.insertText = new vscode.SnippetString(
      "For Each ${1:item} As ${2:Tipo} In ${3:colecao}\n\t$0\nNext",
    );
    forEachSnippet.documentation =
      "Loop de enumeracao (acucar, transpilado para For classico no build).";
    pushSnippet(forEachSnippet);

    const forEachRangeSnippet = new vscode.CompletionItem(
      "For Each In range",
      vscode.CompletionItemKind.Snippet,
    );
    forEachRangeSnippet.insertText = new vscode.SnippetString(
      "For Each ${1:i} In ${2:0}..${3:n}\n\t$0\nNext",
    );
    forEachRangeSnippet.documentation =
      "Loop sobre intervalo numerico (acucar, transpilado para `For i = a To b` no build).";
    pushSnippet(forEachRangeSnippet);

    const interpolationSnippet = new vscode.CompletionItem(
      'String Interpolation $"..."',
      vscode.CompletionItemKind.Snippet,
    );
    interpolationSnippet.insertText = new vscode.SnippetString('$"${1:texto} {${2:expr}}$0"');
    interpolationSnippet.documentation =
      'String interpolada (acucar, transpilada para `"texto " & (expr)` com `&` no build).';
    pushSnippet(interpolationSnippet);

    const ternarySnippet = new vscode.CompletionItem(
      "Dim ternary x = cond ? a : b",
      vscode.CompletionItemKind.Snippet,
    );
    ternarySnippet.insertText = new vscode.SnippetString(
      "Dim ${1:nome} As ${2:Tipo} = ${3:cond} ? ${4:valorTrue} : ${5:valorFalse}",
    );
    ternarySnippet.documentation =
      "Atribuicao ternaria (acucar, transpilada para `If/Then/Else/End If` no build).";
    pushSnippet(ternarySnippet);

    const trySnippet = new vscode.CompletionItem("Try...Catch", vscode.CompletionItemKind.Snippet);
    trySnippet.insertText = new vscode.SnippetString(
      "Try\n\t$1\nCatch ${2:ex} As Exception\n\t$0\nEnd Try",
    );
    trySnippet.documentation = "Tratamento de Excecoes Try Catch";
    pushSnippet(trySnippet);

    const enunSnippet = new vscode.CompletionItem(
      "Enun...End Enun",
      vscode.CompletionItemKind.Snippet,
    );
    enunSnippet.insertText = new vscode.SnippetString("Enun ${1:Nome}\n\t${2:Valor}\nEnd Enun");
    enunSnippet.documentation =
      "Enum rico do Data7 sugar, transpilado para uma classe que herda de TEnum.";
    pushSnippet(enunSnippet);

    const propSnippet = new vscode.CompletionItem(
      "Property Block",
      vscode.CompletionItemKind.Snippet,
    );
    propSnippet.insertText = new vscode.SnippetString(
      "Property ${1:PropName} As ${2:DataType}\n\tGet\n\t\t${1:PropName} = me._${3:fieldName}\n\tEnd Get\n\tSet(pValue As ${2:DataType})\n\t\tme._${3:fieldName} = pValue\n\tEnd Set\nEnd Property",
    );
    propSnippet.documentation = "Declaracao de Bloco de Propriedade Completa";
    pushSnippet(propSnippet);

    const funcSnippet = new vscode.CompletionItem(
      "Function Block",
      vscode.CompletionItemKind.Snippet,
    );
    funcSnippet.insertText = new vscode.SnippetString(
      "Function ${1:FuncName}($2) As ${3:DataType}\n\t$0\n\t${1:FuncName} = $4\nEnd Function",
    );
    funcSnippet.documentation = "Declaracao de Nova Funcao";
    pushSnippet(funcSnippet);

    const subSnippet = new vscode.CompletionItem("Sub Block", vscode.CompletionItemKind.Snippet);
    subSnippet.insertText = new vscode.SnippetString("Sub ${1:SubName}($2)\n\t$0\nEnd Sub");
    subSnippet.documentation = "Declaracao de Novo Sub/Procedimento";
    pushSnippet(subSnippet);

    const ctorSnippet = new vscode.CompletionItem(
      "Constructor (Sub New)",
      vscode.CompletionItemKind.Snippet,
    );
    ctorSnippet.insertText = new vscode.SnippetString(
      "Sub New($1)\n\tMyBase.New($2)\n\t$0\nEnd Sub",
    );
    ctorSnippet.documentation = "Construtor da Classe (Sub New)";
    pushSnippet(ctorSnippet);
  }
}

function isSimpleIdentifier(value: string): boolean {
  if (value.length === 0) return false;
  const first = value.charCodeAt(0);
  const isFirst = (first >= 65 && first <= 90) || (first >= 97 && first <= 122) || first === 95;
  if (!isFirst) return false;
  for (let i = 1; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
    if (!ok) return false;
  }
  return true;
}

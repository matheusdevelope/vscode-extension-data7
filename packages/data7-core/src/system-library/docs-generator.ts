import { createHash } from "crypto";
import { SYSTEM_SYMBOLS } from ".";
import type { ParameterInfo, SymbolInfo } from "../analysis/symbol-indexer";
import { formatParameterList } from "../utils/format-helpers";

/**
 * Generates Markdown documentation for namespaces declared in the System Library.
 *
 * The generator is a pure function over `SYSTEM_SYMBOLS` — it does not depend on
 * VS Code APIs and can therefore be reused both by the in-IDE command
 * (`DocsService`) and by stand-alone Node scripts in `scripts/`.
 */
export class DocsGenerator {
  /**
   * Returns every distinct namespace name declared in the System Library
   * (`kind === 'namespace'`), alphabetically sorted.
   */
  public static getNamespaceNames(): string[] {
    const set = new Set<string>();
    for (const s of SYSTEM_SYMBOLS) {
      if (s.kind === "namespace") set.add(s.name);
    }
    return Array.from(set).sort();
  }

  /**
   * Returns the namespaces that have at least one classifiable member
   * (class/structure/delegate/function). Useful to skip empty namespaces in
   * pickers without generating files for them.
   */
  public static getNamespacesWithContent(): string[] {
    const counts = new Map<string, number>();
    for (const s of SYSTEM_SYMBOLS) {
      if (!s.containerName) continue;
      counts.set(s.containerName, (counts.get(s.containerName) ?? 0) + 1);
    }
    return this.getNamespaceNames().filter((ns) => (counts.get(ns) ?? 0) > 0);
  }

  /**
   * Builds the markdown body for a single namespace.
   * Returns an empty string if the namespace is unknown.
   */
  public static generateNamespaceMarkdown(namespace: string): string {
    if (!this.getNamespaceNames().includes(namespace)) return "";
    return new MarkdownBuilder(namespace).build();
  }

  /**
   * Builds an index README linking to the chosen per-namespace files.
   */
  public static generateIndexMarkdown(namespaces: string[]): string {
    const lines: string[] = [];
    lines.push("# System Library do Data7 — Documentação");
    lines.push("");
    lines.push("> Conjunto de definições nativas reconhecidas pela extensão **Data7 Dev Studio**.");
    lines.push(
      "> Use este conteúdo como contexto para agentes de IA no VS Code ou como referência rápida.",
    );
    lines.push("");
    lines.push("## Namespaces incluídos");
    lines.push("");
    for (const ns of namespaces) {
      const sym = SYSTEM_SYMBOLS.find((s) => s.kind === "namespace" && s.name === ns);
      const desc = sym?.description ? ` — ${sym.description.split("\n")[0]}` : "";
      lines.push(`- [\`${ns}\`](./${ns}.md)${desc}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(
      `_Snapshot \`${this.computeSnapshotHash()}\` — gerado em ${new Date().toISOString()} pela extensão Data7 Dev Studio._`,
    );
    return lines.join("\n") + "\n";
  }

  /**
   * Stable short hash (first 12 hex chars of SHA-256) of the current
   * `SYSTEM_SYMBOLS` snapshot. Lets consumers detect when generated docs
   * fell out of sync with the underlying definitions.
   */
  public static computeSnapshotHash(): string {
    const projection = SYSTEM_SYMBOLS.map((s) => ({
      n: s.name,
      k: s.kind,
      t: s.type,
      c: s.containerName,
      i: s.inheritsFrom,
      p: s.parameters?.map((p) => `${p.name}:${p.type}${p.isByRef ? ":br" : ""}`).join(",") ?? "",
    }));
    return createHash("sha256").update(JSON.stringify(projection)).digest("hex").slice(0, 12);
  }
}

// ---------------------------------------------------------------------------
// Internal builder — encapsulates indexing/lookup for a single namespace pass.
// ---------------------------------------------------------------------------

class MarkdownBuilder {
  private readonly namespace: string;
  private readonly byName = new Map<string, SymbolInfo>();
  private readonly byContainer = new Map<string, SymbolInfo[]>();
  private readonly directs: SymbolInfo[];
  private readonly classesInNs: SymbolInfo[];
  private readonly delegatesInNs: SymbolInfo[];
  private readonly functionsInNs: SymbolInfo[];
  private readonly classNamesInNsLower = new Set<string>();
  private readonly lines: string[] = [];

  constructor(namespace: string) {
    this.namespace = namespace;

    for (const s of SYSTEM_SYMBOLS) {
      if (!this.byName.has(s.name)) this.byName.set(s.name, s);
      if (s.containerName) {
        const a = this.byContainer.get(s.containerName) ?? [];
        a.push(s);
        this.byContainer.set(s.containerName, a);
      }
    }

    this.directs = (this.byContainer.get(namespace) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    this.classesInNs = this.directs.filter((s) => s.kind === "class" || s.kind === "structure");
    this.delegatesInNs = this.directs.filter((s) => s.kind === "delegate");
    this.functionsInNs = this.directs.filter(
      (s) => s.kind === "method" || s.kind === "declare_function" || s.kind === "declare_sub",
    );
    for (const c of this.classesInNs) this.classNamesInNsLower.add(c.name.toLowerCase());
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------

  public build(): string {
    const nsSymbol = this.byName.get(this.namespace);

    this.push(`# Namespace \`${this.namespace}\``);
    this.blank();
    this.push("> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.");
    this.push("> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.");
    this.blank();

    this.renderOverview(nsSymbol);
    this.renderTree();
    this.renderClassesWithMembers();
    this.renderEnums();
    this.renderDelegates();
    this.renderAliases();
    this.renderFunctions();
    this.renderFooter();

    return this.lines.join("\n") + "\n";
  }

  // -------------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------------

  private renderOverview(nsSymbol: SymbolInfo | undefined): void {
    this.push("## 1. Visão geral");
    this.blank();
    if (nsSymbol?.description) {
      this.push(nsSymbol.description);
    } else {
      this.push(`Namespace \`${this.namespace}\` da System Library do Data7.`);
    }
    this.blank();
    this.push("**Como importar:**");
    this.blank();
    this.push("```basic");
    this.push(`Imports ${this.namespace}`);
    this.push("```");
    this.blank();
  }

  private renderTree(): void {
    const rootClasses = this.classesInNs.filter((c) => c.kind === "class");
    if (rootClasses.length === 0) return;

    // Build child→list-of-children map keyed by parent name (lower-cased so we
    // can match across nominal mismatches in `inheritsFrom`).
    const childrenByParent = new Map<string, SymbolInfo[]>();
    for (const c of rootClasses) {
      const parent = (c.inheritsFrom ?? "").toLowerCase();
      if (!parent) continue;
      const a = childrenByParent.get(parent) ?? [];
      a.push(c);
      childrenByParent.set(parent, a);
    }
    const hasChildren = (name: string): boolean => childrenByParent.has(name.toLowerCase());

    // Partition roots:
    //  - externalParents: classes outside the namespace that are inherited from
    //    (TPersistent, TObject, etc.) — rendered as plain labels with a note.
    //  - inNsRoots: in-namespace classes without a parent BUT with descendants
    //    in this namespace — rendered as plain labels.
    //  Isolated leaves (no parent, no children) are skipped: they have nothing
    //  meaningful to show in a tree and appear in sections 3/4/6 already.
    const externalParents = new Set<string>();
    const inNsRoots: SymbolInfo[] = [];
    for (const c of rootClasses) {
      const parent = c.inheritsFrom;
      if (!parent) {
        if (hasChildren(c.name)) inNsRoots.push(c);
      } else if (!this.classNamesInNsLower.has(parent.toLowerCase())) {
        externalParents.add(parent);
      }
    }

    if (externalParents.size === 0 && inNsRoots.length === 0) return;

    this.push("## 2. Árvore de herança das classes");
    this.blank();
    this.push("```");

    for (const ep of Array.from(externalParents).sort()) {
      const note = this.containerNote(ep);
      this.push(`${ep}${note}`);
      this.renderChildrenOf(ep, "", childrenByParent);
    }

    for (const r of inNsRoots.sort((a, b) => a.name.localeCompare(b.name))) {
      this.push(r.name);
      this.renderChildrenOf(r.name, "", childrenByParent);
    }

    this.push("```");
    this.blank();
  }

  private renderChildrenOf(
    parentName: string,
    prefix: string,
    childrenByParent: Map<string, SymbolInfo[]>,
  ): void {
    const children = (childrenByParent.get(parentName.toLowerCase()) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    children.forEach((c, i) => {
      const isLast = i === children.length - 1;
      const connector = isLast ? "└─ " : "├─ ";
      this.push(prefix + connector + c.name);
      const nextPrefix = prefix + (isLast ? "   " : "│  ");
      this.renderChildrenOf(c.name, nextPrefix, childrenByParent);
    });
  }

  private containerNote(name: string): string {
    const sym = this.byName.get(name);
    return sym?.containerName ? `  (${sym.containerName})` : "  (externo)";
  }

  private renderClassesWithMembers(): void {
    const withMembers = this.classesInNs
      .filter((c) => this.memberCount(c.name) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (withMembers.length === 0) return;

    this.push("## 3. Classes (com membros próprios)");
    this.blank();
    this.push(
      "> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.",
    );
    this.blank();

    for (const c of withMembers) {
      this.renderClassSection(c, 3);
    }
  }

  private renderClassSection(sym: SymbolInfo, baseLevel: number): void {
    const prefix = "#".repeat(baseLevel);
    this.push(`${prefix}# \`${sym.name}\``);
    this.blank();

    // Inheritance line: "Herda de:" + the full chain rendered as cross-links.
    if (sym.inheritsFrom) {
      this.push(`**Herda de:** ${this.linkType(sym.inheritsFrom)}`);
      this.blank();
      const chain = this.buildAncestorChain(sym);
      if (chain.length > 1) {
        const linked = chain.map((c) => this.linkType(c)).join(" → ");
        this.push(`**Cadeia completa:** ${linked}`);
        this.blank();
      }
    }

    if (sym.description) {
      this.push(sym.description);
      this.blank();
    }

    const members = this.byContainer.get(sym.name) ?? [];
    const events = members.filter((m) => m.kind === "property" && this.isEventName(m.name));
    const props = members.filter((m) => m.kind === "property" && !this.isEventName(m.name));
    const methods = members.filter((m) => m.kind === "method");
    const vars = members.filter((m) => m.kind === "variable");

    if (props.length > 0) {
      this.push("**Propriedades:**");
      this.blank();
      this.push("| Nome | Tipo | Descrição |");
      this.push("|---|---|---|");
      props
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((p) => {
          this.push(`| \`${esc(p.name)}\` | ${this.linkType(p.type)} | ${esc(p.description)} |`);
        });
      this.blank();
    }

    if (methods.length > 0) {
      this.push("**Métodos:**");
      this.blank();
      this.push("| Nome | Retorno | Parâmetros | Descrição |");
      this.push("|---|---|---|---|");
      methods
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((m) => {
          this.push(
            `| \`${esc(m.name)}\` | ${this.linkType(m.type)} | \`${esc(paramSignature(m.parameters))}\` | ${esc(m.description)} |`,
          );
        });
      this.blank();
    }

    if (events.length > 0) {
      this.push("**Eventos:**");
      this.blank();
      this.push("| Nome | Delegate | Assinatura | Descrição |");
      this.push("|---|---|---|---|");
      events
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((e) => {
          const delegate = this.byName.get(e.type);
          const sig = delegate?.kind === "delegate" ? paramSignature(delegate.parameters) : "(...)";
          this.push(
            `| \`${esc(e.name)}\` | ${this.linkType(e.type)} | \`${esc(sig)}\` | ${esc(e.description)} |`,
          );
        });
      this.blank();
    }

    if (vars.length > 0) {
      this.push("**Constantes/Variáveis:**");
      this.blank();
      this.push("| Nome | Tipo | Descrição |");
      this.push("|---|---|---|");
      vars
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((v) => {
          this.push(`| \`${esc(v.name)}\` | ${this.linkType(v.type)} | ${esc(v.description)} |`);
        });
      this.blank();
    }
  }

  private renderEnums(): void {
    const enums = this.directs
      .filter((s) => (s.kind === "class" || s.kind === "structure") && this.hasConstants(s.name))
      .filter((s) => this.memberCount(s.name) === 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (enums.length === 0) return;

    this.push("## 4. Tipos enumerados (com constantes)");
    this.blank();
    this.push(
      "> Tipos sem membros próprios cuja função é agrupar um conjunto fechado de constantes acessíveis globalmente.",
    );
    this.blank();

    for (const e of enums) {
      this.push(`### \`${e.name}\``);
      this.blank();
      if (e.description) {
        this.push(e.description);
        this.blank();
      }
      const constants = SYSTEM_SYMBOLS.filter(
        (s) => s.kind === "variable" && s.type === e.name && s.name !== e.name,
      ).sort((a, b) => a.name.localeCompare(b.name));
      if (constants.length === 0) {
        this.push("_Sem constantes registradas._");
        this.blank();
        continue;
      }
      this.push("| Constante | Descrição |");
      this.push("|---|---|");
      for (const c of constants) {
        this.push(`| \`${esc(c.name)}\` | ${esc(c.description)} |`);
      }
      this.blank();
    }
  }

  private renderDelegates(): void {
    if (this.delegatesInNs.length === 0) return;

    this.push("## 5. Delegates / assinaturas de evento");
    this.blank();
    for (const d of this.delegatesInNs.sort((a, b) => a.name.localeCompare(b.name))) {
      this.push(`### \`${d.name}\``);
      this.blank();
      if (d.description) {
        this.push(d.description);
        this.blank();
      }
      this.push("**Assinatura:**");
      this.blank();
      this.push("```basic");
      this.push(`Sub ${d.name}${paramSignature(d.parameters)}`);
      this.push("```");
      this.blank();
    }
  }

  private renderAliases(): void {
    const aliases = this.classesInNs
      .filter((c) => this.memberCount(c.name) === 0)
      .filter((c) => !this.hasConstants(c.name))
      .filter((c) => c.kind === "class")
      .sort((a, b) => a.name.localeCompare(b.name));
    if (aliases.length === 0) return;

    this.push("## 6. Aliases / classes intermediárias (sem membros próprios)");
    this.blank();
    this.push(
      "> Classes da cadeia de herança real (Delphi/VCL/DevExpress/TMS/Data7) que existem para que tipos como `Dim x As TBotao` sejam reconhecidos. Todos os seus membros são herdados.",
    );
    this.blank();
    this.push("| Tipo | Herda de | Descrição |");
    this.push("|---|---|---|");
    for (const a of aliases) {
      this.push(
        `| \`${esc(a.name)}\` | ${this.linkType(a.inheritsFrom ?? "-")} | ${esc(a.description)} |`,
      );
    }
    this.blank();
  }

  private renderFunctions(): void {
    if (this.functionsInNs.length === 0) return;

    this.push("## 7. Funções e procedimentos do namespace");
    this.blank();
    this.push("| Nome | Retorno | Parâmetros | Descrição |");
    this.push("|---|---|---|---|");
    for (const f of this.functionsInNs.sort((a, b) => a.name.localeCompare(b.name))) {
      this.push(
        `| \`${esc(f.name)}\` | ${this.linkType(f.type)} | \`${esc(paramSignature(f.parameters))}\` | ${esc(f.description)} |`,
      );
    }
    this.blank();
  }

  private renderFooter(): void {
    const totalMembers = this.classesInNs.reduce((acc, c) => acc + this.memberCount(c.name), 0);
    const totalConstants = this.directs
      .filter((s) => (s.kind === "class" || s.kind === "structure") && this.hasConstants(s.name))
      .reduce(
        (acc, e) =>
          acc + SYSTEM_SYMBOLS.filter((v) => v.kind === "variable" && v.type === e.name).length,
        0,
      );

    this.push("---");
    this.blank();
    this.push(
      `_${this.classesInNs.length} classes/tipos, ${this.delegatesInNs.length} delegates, ${this.functionsInNs.length} funções, ` +
        `~${totalMembers} membros próprios em classes, ${totalConstants} constantes associadas a tipos enumerados._`,
    );
    this.push("");
    this.push(
      `_Snapshot \`${DocsGenerator.computeSnapshotHash()}\` — gerado em ${new Date().toISOString()} pela extensão Data7 Dev Studio._`,
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private push(s: string): void {
    this.lines.push(s);
  }
  private blank(): void {
    this.lines.push("");
  }

  private memberCount(className: string): number {
    const arr = this.byContainer.get(className);
    if (!arr) return 0;
    return arr.filter((m) => m.kind === "property" || m.kind === "method" || m.kind === "variable")
      .length;
  }

  private hasConstants(typeName: string): boolean {
    return SYSTEM_SYMBOLS.some(
      (s) => s.kind === "variable" && s.type === typeName && s.name !== typeName,
    );
  }

  private isEventName(name: string): boolean {
    return /^On[A-Z]/.test(name);
  }

  /**
   * Walks `inheritsFrom` upward, returning the full chain starting at `from`'s
   * parent up to the topmost ancestor we know about. Safe against cycles.
   */
  private buildAncestorChain(from: SymbolInfo): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();
    let current = from;
    while (current.inheritsFrom) {
      const parentName = current.inheritsFrom;
      const key = parentName.toLowerCase();
      if (visited.has(key)) break;
      visited.add(key);
      chain.push(parentName);
      const next = this.byName.get(parentName);
      if (!next) break;
      current = next;
    }
    return chain;
  }

  /**
   * Renders a type as `[\`TFoo\`](#tfoo)` when `TFoo` is documented in the
   * current namespace; otherwise falls back to `\`TFoo\`` plain.
   */
  private linkType(typeName: string | undefined): string {
    if (!typeName) return "`-`";
    const trimmed = typeName.trim();
    if (!trimmed || trimmed === "-") return "`-`";
    // For qualified names ("Forms.TForm"), strip the prefix when targeting the local namespace.
    const localName = trimmed.includes(".") ? (trimmed.split(".").pop() ?? trimmed) : trimmed;
    if (this.classNamesInNsLower.has(localName.toLowerCase())) {
      const anchor = anchorize(localName);
      return `[\`${esc(localName)}\`](#${anchor})`;
    }
    return `\`${esc(trimmed)}\``;
  }
}

// ---------------------------------------------------------------------------
// Module-level utilities (reused across instances)
// ---------------------------------------------------------------------------

function esc(s: string | undefined): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/**
 * Approximates GitHub Flavoured Markdown's heading anchor algorithm:
 * lowercase, strip punctuation, collapse runs of spaces to hyphens.
 * (`### \`TForm\`` → `#tform`)
 */
function anchorize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9\u00C0-\u017F\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function paramSignature(parameters: ParameterInfo[] | undefined): string {
  return formatParameterList(parameters);
}

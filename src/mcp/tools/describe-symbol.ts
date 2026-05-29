/**
 * Tool `data7_describe_symbol` — full picture of a single symbol:
 * canonical `SymbolInfo` from the System Library, the inheritance chain
 * (via the type-only `TypeResolver`-equivalent walk), plus the official
 * ERP example from `out/mcp/data/articles.json` when available.
 *
 * This is the tool that closes the loop opened by the old `AGENTS.md`
 * approach: the agent gets exactly one symbol's worth of context —
 * description, signature, example — rather than 62k tokens of namespace.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemByName,
  lookupSystemClassByName,
} from "../../system-library";
import type { SymbolInfo } from "../../analysis/symbol-indexer";
import { findOfficialArticle, type OfficialArticle } from "../resources/official";

interface DescribeResult {
  readonly qualifiedName: string;
  readonly symbol: {
    readonly name: string;
    readonly kind: SymbolInfo["kind"];
    readonly type: string;
    readonly containerName?: string;
    readonly description?: string;
    readonly parameters?: SymbolInfo["parameters"];
    readonly overloads?: SymbolInfo["overloads"];
    readonly inheritsFrom?: string;
    readonly isUnsupported?: boolean;
  };
  readonly inheritanceChain: readonly string[];
  readonly ownMembers?: readonly { name: string; kind: SymbolInfo["kind"]; type: string }[];
  readonly officialExample?: OfficialArticle;
  /**
   * Present only for `Forms` controls. A short, idiomatic snippet showing
   * how to instantiate and position the control inside a parent — the
   * thing the catalog alone does not teach. Mirrors the idiom documented
   * in `docs/linguagem-basic/14-construindo-telas.md`.
   */
  readonly formUsageHint?: string;
}

/** Forms controls that are NOT placed inside a parent (the root window). */
const ROOT_FORM_CLASSES = new Set(["form", "tform", "tframe"]);

/**
 * Collects the event member names (`On*`, kind `property`) declared
 * anywhere in the inheritance chain of `symbol`, walking parents via
 * `inheritsFrom`. Returns a de-duplicated, sorted, capped list so a
 * control with dozens of inherited events does not flood the hint.
 */
function collectControlEvents(symbol: SymbolInfo, limit = 8): string[] {
  const events = new Set<string>();
  const visited = new Set<string>();
  let cursor: SymbolInfo = symbol;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const key = cursor.name.toLowerCase();
    if (visited.has(key)) break;
    visited.add(key);
    for (const m of lookupSystemByContainer(cursor.name)) {
      if (m.kind === "property" && /^On[A-Z]/.test(m.name) && !m.isUnsupported) {
        events.add(m.name);
      }
    }
    const parentRaw: string | undefined = cursor.inheritsFrom;
    if (!parentRaw) break;
    const parentSimple: string = parentRaw.includes(".")
      ? parentRaw.slice(parentRaw.lastIndexOf(".") + 1)
      : parentRaw;
    const next: SymbolInfo | undefined = lookupSystemClassByName(parentSimple)[0];
    if (!next) break;
    cursor = next;
  }
  return Array.from(events).sort().slice(0, limit);
}

/**
 * Builds an instantiation/positioning snippet for `Forms` controls. Returns
 * `undefined` for non-Forms symbols, namespaces, enums, and non-class kinds.
 * Includes the most relevant events (`On*`) resolved across the inheritance
 * chain so the agent knows how to make the control interactive.
 * Exported for unit testing.
 */
export function buildFormUsageHint(symbol: SymbolInfo): string | undefined {
  if (symbol.kind !== "class") return undefined;
  if (symbol.containerName !== "Forms") return undefined;

  const name = symbol.name;
  const lower = name.toLowerCase();
  const events = collectControlEvents(symbol);
  const eventsLine =
    events.length > 0
      ? `' eventos disponíveis (atribua uma referência de método): ${events.join(", ")}`
      : `' este controle não expõe eventos On* no catálogo`;

  if (ROOT_FORM_CLASSES.has(lower)) {
    return [
      `Dim _form As Forms.${name} = New Forms.${name}()`,
      `_form.Caption = "Título"`,
      `' ... montar controles filhos com _form como pai ...`,
      eventsLine,
      `_form.Show()`,
      `_form.Free()`,
    ].join("\n");
  }

  // Generic control: instantiated with a parent and positioned via Align.
  return [
    `' instancie passando o container pai no construtor`,
    `Dim ctrl As Forms.${name} = New Forms.${name}(parent)`,
    `ctrl.Align = alClient   ' ou alTop / alBottom / alLeft / alRight`,
    `' ctrl.Top / ctrl.Left / ctrl.Width / ctrl.Height para posição livre (alNone)`,
    eventsLine,
  ].join("\n");
}

function resolveByQualifiedName(qualifiedName: string): SymbolInfo | undefined {
  const lastDot = qualifiedName.lastIndexOf(".");
  if (lastDot === -1) {
    return lookupSystemByName(qualifiedName)[0];
  }
  const container = qualifiedName.slice(0, lastDot);
  const name = qualifiedName.slice(lastDot + 1);

  // Try the qualified container first ("Collections.StringList"), then fall
  // back to the simple container name ("StringList") — system-library
  // entries use the short form (`containerName: "StringList"`).
  const fullContainerMatch = lookupSystemByContainer(container).find(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  );
  if (fullContainerMatch) return fullContainerMatch;

  const lastContainerDot = container.lastIndexOf(".");
  if (lastContainerDot !== -1) {
    const simpleContainer = container.slice(lastContainerDot + 1);
    const simpleMatch = lookupSystemByContainer(simpleContainer).find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (simpleMatch) return simpleMatch;
  }

  // Last resort: bare name lookup (when the input was actually a simple
  // name with a misleading dot, or the catalog has no container).
  return lookupSystemByName(name)[0];
}

function buildInheritanceChain(symbol: SymbolInfo): string[] {
  const chain: string[] = [];
  if (symbol.kind !== "class" && symbol.kind !== "structure") return chain;
  let cursor: SymbolInfo = symbol;
  const visited = new Set<string>();
  // The loop exits via `break` once a parent is missing or the chain
  // cycles back; the assignment to `cursor` only happens when a next
  // ancestor was actually found.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const currentName = cursor.name.toLowerCase();
    if (visited.has(currentName)) break;
    visited.add(currentName);
    if (cursor !== symbol) chain.push(cursor.name);
    const parentRaw: string | undefined = cursor.inheritsFrom;
    if (!parentRaw) break;
    const parentSimpleName: string = parentRaw.includes(".")
      ? parentRaw.slice(parentRaw.lastIndexOf(".") + 1)
      : parentRaw;
    const next: SymbolInfo | undefined = lookupSystemClassByName(parentSimpleName)[0];
    if (!next) {
      chain.push(parentRaw);
      break;
    }
    cursor = next;
  }
  return chain;
}

function collectOwnMembers(
  symbol: SymbolInfo,
): { name: string; kind: SymbolInfo["kind"]; type: string }[] {
  if (symbol.kind !== "class" && symbol.kind !== "structure" && symbol.kind !== "namespace") {
    return [];
  }
  const containerKey = symbol.name.toLowerCase();
  return SYSTEM_SYMBOLS.filter((s) => s.containerName?.toLowerCase() === containerKey).map((s) => ({
    name: s.name,
    kind: s.kind,
    type: s.type,
  }));
}

export function registerDescribeSymbol(server: McpServer): void {
  server.registerTool(
    "data7_describe_symbol",
    {
      title: "Descrição completa de um símbolo nativo",
      description:
        "Devolve a definição canônica de um símbolo da System Library + cadeia de herança + exemplo oficial do ERP (quando disponível). Use com nome simples (StringList) ou qualificado (Collections.StringList.Add).",
      inputSchema: {
        qualifiedName: z
          .string()
          .min(1)
          .describe(
            "Nome do símbolo. Aceita forma simples (StringList) ou qualificada (Collections.StringList.Add).",
          ),
        includeMembers: z
          .boolean()
          .optional()
          .describe(
            "Quando true e o símbolo é classe/namespace, lista os membros declarados localmente (sem herdados). Default: false.",
          ),
      },
    },
    (args) => {
      const symbol = resolveByQualifiedName(args.qualifiedName);
      if (!symbol) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  qualifiedName: args.qualifiedName,
                  found: false,
                  message:
                    "Símbolo não encontrado na System Library. Tente data7_search_symbol primeiro.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const inheritanceChain = buildInheritanceChain(symbol);
      const officialExample = findOfficialArticle(args.qualifiedName);
      const ownMembers = args.includeMembers ? collectOwnMembers(symbol) : undefined;

      const result: DescribeResult = {
        qualifiedName: args.qualifiedName,
        symbol: {
          name: symbol.name,
          kind: symbol.kind,
          type: symbol.type,
          containerName: symbol.containerName,
          description: symbol.description,
          parameters: symbol.parameters,
          overloads: symbol.overloads,
          inheritsFrom: symbol.inheritsFrom,
          isUnsupported: symbol.isUnsupported,
        },
        inheritanceChain,
        ownMembers,
        officialExample,
        formUsageHint: buildFormUsageHint(symbol),
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}

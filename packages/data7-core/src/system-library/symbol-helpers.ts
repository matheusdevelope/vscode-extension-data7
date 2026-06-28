import type { ParameterInfo } from "../analysis/symbol-indexer";
import type { SystemContainer, SystemSymbolInfo } from "./types";

/**
 * Helpers compartilhados pelos arquivos de `system-library/` que descrevem
 * classes inteiras a partir de tabelas de "autocomplete + suportado" (ver as
 * planilhas `instrução.txt` dentro de `docs/Documentação Data7/`).
 *
 * O objetivo é evitar a repetição dos blocos
 *   `range: { startLine: 0, … }`, `fileUri: "system://library"`,
 *   `isShared: false`, `isPrivate: false` em cada símbolo, e padronizar a
 * mensagem mostrada para itens `isUnsupported: true`.
 */

/** Range "sintético" usado por todos os símbolos do system-library. */
export const SYSTEM_RANGE = {
  startLine: 0,
  startChar: 0,
  endLine: 0,
  endChar: 0,
} as const;

/** URI sintético dos símbolos do system-library. */
export const SYSTEM_URI = "system://library";

/**
 * Sufixo padrão para descrições de membros marcados `isUnsupported: true`.
 * Reutilizar essa string mantém o texto idêntico em todos os arquivos
 * (compatível com testes que façam asserts de mensagem).
 */
export const UNSUP_NOTE =
  " Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member.";

export interface ParamSpec {
  readonly name: string;
  readonly type: string;
  readonly isByRef?: boolean;
  readonly isOptional?: boolean;
  readonly defaultValue?: string;
}

export interface PropSpec {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly isUnsupported?: boolean;
  /**
   * Quando `true`, o símbolo é emitido com `kind: "indexed-property"`,
   * usado para propriedades Delphi que aceitam parâmetros (ex.: `Cells(c, r)`).
   * Nesse caso, declare também `params` para que o SignatureHelp funcione.
   */
  readonly indexed?: boolean;
  readonly params?: readonly ParamSpec[];
}

export interface MethodSpec {
  readonly name: string;
  readonly returns: string;
  readonly params: readonly ParamSpec[];
  readonly description: string;
  readonly isUnsupported?: boolean;
  readonly overloads?: readonly (readonly ParamSpec[])[];
}

export interface ConstSpec {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly isUnsupported?: boolean;
}

interface BuildClassOptions {
  readonly className: SystemContainer;
  /** Container do qual a classe é membro (ex.: `Forms`, `SQL`, `Data7`). */
  readonly namespaceContainer?: SystemContainer;
  readonly inheritsFrom?: string;
  readonly description: string;
  readonly properties?: readonly PropSpec[];
  readonly methods?: readonly MethodSpec[];
  /**
   * `isShared` aplicado à classe e a seus membros. Padrão: `false` (instância).
   * Use `true` para classes "singleton" do ERP (ex.: `SQL.Connection`).
   */
  readonly isShared?: boolean;
}

function mapParams(params: readonly ParamSpec[]): ParameterInfo[] {
  return params.map((p) => ({
    name: p.name,
    type: p.type,
    isByRef: p.isByRef ?? false,
    isOptional: p.isOptional ?? false,
    defaultValue: p.defaultValue,
  }));
}

/** Constrói o vetor completo de `SystemSymbolInfo` para uma classe inteira. */
export function buildClassSymbols(opts: BuildClassOptions): SystemSymbolInfo[] {
  const isShared = opts.isShared ?? false;
  const symbols: SystemSymbolInfo[] = [];

  symbols.push({
    name: opts.className,
    kind: "class",
    type: opts.className,
    isShared,
    isPrivate: false,
    range: { ...SYSTEM_RANGE },
    fileUri: SYSTEM_URI,
    containerName: opts.namespaceContainer,
    inheritsFrom: opts.inheritsFrom,
    description: opts.description,
  });

  for (const prop of opts.properties ?? []) {
    symbols.push({
      name: prop.name,
      kind: prop.indexed ? "indexed-property" : "property",
      type: prop.type,
      isShared,
      isPrivate: false,
      parameters: prop.indexed ? mapParams(prop.params ?? []) : undefined,
      range: { ...SYSTEM_RANGE },
      fileUri: SYSTEM_URI,
      containerName: opts.className,
      description: prop.description,
      isUnsupported: prop.isUnsupported,
    });
  }

  for (const method of opts.methods ?? []) {
    symbols.push({
      name: method.name,
      kind: "method",
      type: method.returns,
      isShared,
      isPrivate: false,
      parameters: mapParams(method.params),
      overloads: method.overloads?.map(mapParams),
      range: { ...SYSTEM_RANGE },
      fileUri: SYSTEM_URI,
      containerName: opts.className,
      description: method.description,
      isUnsupported: method.isUnsupported,
    });
  }

  return symbols;
}

interface BuildNamespaceOptions {
  readonly namespace: SystemContainer;
  readonly description: string;
  readonly functionsAndSubs?: readonly MethodSpec[];
  readonly constants?: readonly ConstSpec[];
  readonly typeAliases?: readonly {
    readonly name: string;
    readonly type: string;
    readonly description: string;
  }[];
}

/**
 * Constrói o vetor de `SystemSymbolInfo` para um namespace inteiro com
 * funções globais, constantes e aliases de tipo (uso típico: `System`).
 */
export function buildNamespaceSymbols(opts: BuildNamespaceOptions): SystemSymbolInfo[] {
  const symbols: SystemSymbolInfo[] = [
    {
      name: opts.namespace,
      kind: "namespace",
      type: opts.namespace,
      isShared: true,
      isPrivate: false,
      range: { ...SYSTEM_RANGE },
      fileUri: SYSTEM_URI,
      description: opts.description,
    },
  ];

  for (const fn of opts.functionsAndSubs ?? []) {
    symbols.push({
      name: fn.name,
      kind: "method",
      type: fn.returns,
      isShared: true,
      isPrivate: false,
      parameters: mapParams(fn.params),
      overloads: fn.overloads?.map(mapParams),
      range: { ...SYSTEM_RANGE },
      fileUri: SYSTEM_URI,
      containerName: opts.namespace,
      description: fn.description,
      isUnsupported: fn.isUnsupported,
    });
  }

  for (const c of opts.constants ?? []) {
    symbols.push({
      name: c.name,
      kind: "property",
      type: c.type,
      isShared: true,
      isPrivate: false,
      range: { ...SYSTEM_RANGE },
      fileUri: SYSTEM_URI,
      containerName: opts.namespace,
      description: c.description,
      isUnsupported: c.isUnsupported,
    });
  }

  for (const t of opts.typeAliases ?? []) {
    symbols.push({
      name: t.name,
      kind: "class",
      type: t.type,
      isShared: true,
      isPrivate: false,
      range: { ...SYSTEM_RANGE },
      fileUri: SYSTEM_URI,
      containerName: opts.namespace,
      description: t.description,
    });
  }

  return symbols;
}

import type { ParameterInfo } from "../analysis/symbol-indexer";
import type { SystemContainer, SystemSymbolInfo } from "./types";

/**
 * Helpers compartilhados por TODOS os arquivos de `system-library/` que
 * descrevem namespaces, classes e enums a partir de tabelas de "autocomplete +
 * suportado" (ver as planilhas `instrução.txt` em `docs/Documentação Data7/`).
 *
 * Convenção de autoria de um novo arquivo de símbolos:
 *
 * ```ts
 * import type { SystemSymbolInfo } from "../types";
 * import { buildClassSymbols, param } from "../symbol-helpers";
 *
 * export const symbols: SystemSymbolInfo[] = buildClassSymbols({
 *   className: "FlatButton",
 *   namespaceContainer: "Forms",
 *   inheritsFrom: "Forms.TButtonControl",
 *   description: "Botão plano customizável.",
 *   properties: [
 *     { name: "Caption", type: "String", description: "Texto exibido no botão." },
 *   ],
 *   methods: [
 *     {
 *       name: "Click",
 *       returns: "Void",
 *       params: [param("pSender", "TObject")],
 *       description: "Dispara o evento de clique.",
 *     },
 *   ],
 * });
 * ```
 *
 * Para namespaces com funções/constantes globais (sem classe "dona"), use
 * `buildNamespaceSymbols`. Para tipos enumerados (`kind: "class"` + um valor
 * `kind: "variable"` por membro), use `defineEnum`. Para funções globais sem
 * namespace (ex.: `CStr`, `Print`, `Left`), use `buildGlobalFunctions`.
 *
 * Nenhum arquivo de símbolos deve declarar `range`/`fileUri` manualmente, nem
 * reimplementar `mapParams`/`UNSUP_NOTE` localmente — sempre importe daqui.
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
  /** Aridade mínima com aceitação de qualquer quantidade extra (ex.: `Array()` VB). */
  readonly variadicParameters?: boolean;
  /** Sobrescreve `kind` (padrão `"method"`). Use `"declare_sub"`/`"declare_function"` para DLL externs. */
  readonly kind?: "method" | "declare_sub" | "declare_function";
  /**
   * Quando `true`, emitido como `kind: "indexed-property"` em vez de método —
   * usado por acessores Delphi como `Cells(ACol, ARow)` que ficam na tabela de
   * `methods` (para reaproveitar `params`) mas se comportam como propriedade.
   */
  readonly indexed?: boolean;
}

export interface ConstSpec {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly isUnsupported?: boolean;
}

/** Atalho para criar um `ParameterInfo` sem repetir `isByRef`/`isOptional` quando falsos. */
export function param(
  name: string,
  type: string,
  opts?: {
    readonly isByRef?: boolean;
    readonly isOptional?: boolean;
    readonly defaultValue?: string;
  },
): ParameterInfo {
  return {
    name,
    type,
    isByRef: opts?.isByRef ?? false,
    isOptional: opts?.isOptional ?? false,
    defaultValue: opts?.defaultValue,
  };
}

function mapParams(params: readonly ParamSpec[]): ParameterInfo[] {
  return params.map((p) => param(p.name, p.type, p));
}

interface BuildClassOptions {
  /**
   * Nome da classe. Tipado como `string` (não `SystemContainer`) porque nem
   * toda classe é referenciada como `containerName` em outro arquivo — mas
   * quando ela TEM `properties`/`methods`, o valor é usado como o
   * `containerName` desses membros (ver cast interno em `containerName`).
   */
  readonly className: string;
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
  /** Sobrescreve `kind` do símbolo raiz (padrão `"class"`). Use `"structure"` para records/tuplas (ex.: `TPoint`, `TRect`). */
  readonly kind?: "class" | "structure";
}

/** Constrói o vetor completo de `SystemSymbolInfo` para uma classe inteira. */
export function buildClassSymbols(opts: BuildClassOptions): SystemSymbolInfo[] {
  const isShared = opts.isShared ?? false;
  const symbols: SystemSymbolInfo[] = [];

  symbols.push({
    name: opts.className,
    kind: opts.kind ?? "class",
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
      containerName: opts.className as SystemContainer,
      description: prop.description,
      isUnsupported: prop.isUnsupported,
    });
  }

  for (const method of opts.methods ?? []) {
    symbols.push({
      name: method.name,
      kind: method.indexed ? "indexed-property" : (method.kind ?? "method"),
      type: method.returns,
      isShared,
      isPrivate: false,
      parameters: mapParams(method.params),
      overloads: method.overloads?.map(mapParams),
      variadicParameters: method.variadicParameters,
      range: { ...SYSTEM_RANGE },
      fileUri: SYSTEM_URI,
      containerName: opts.className as SystemContainer,
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
      kind: fn.kind ?? "method",
      type: fn.returns,
      isShared: true,
      isPrivate: false,
      parameters: mapParams(fn.params),
      overloads: fn.overloads?.map(mapParams),
      variadicParameters: fn.variadicParameters,
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

/** Constrói um membro de enumeração/valor constante de tipo específico. */
export function buildEnumVal(
  name: string,
  type: string,
  description: string,
  containerName?: SystemContainer,
): SystemSymbolInfo {
  return {
    name,
    kind: "variable",
    type,
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description,
    containerName,
  };
}

/** Um valor de enum: `[nome, descrição]` ou a forma expandida com `isUnsupported`. */
export type EnumValueSpec =
  | readonly [name: string, description: string]
  | { readonly name: string; readonly description: string; readonly isUnsupported?: boolean };

interface DefineEnumOptions {
  /** Nome do tipo enumerado (ex.: `TAlign`, `TModalResult`). */
  readonly name: string;
  /** Container do qual o tipo é membro (ex.: `Forms`). Omitido = global. */
  readonly containerName?: SystemContainer;
  readonly description: string;
  readonly values: readonly EnumValueSpec[];
}

/**
 * Constrói um tipo enumerado inteiro (símbolo `kind: "class"` + um símbolo
 * `kind: "variable"` por valor) em uma única chamada. Substitui os três
 * estilos legados: chamadas soltas de `buildEnumVal`, helpers locais
 * (`ak()`, `bs()`, …) e literais manuais completos (ex.: `TModalResult`).
 */
export function defineEnum(opts: DefineEnumOptions): SystemSymbolInfo[] {
  const values = opts.values.map((v) => {
    if (Array.isArray(v)) {
      const [name, description] = v as readonly [string, string];
      return { name, description, isUnsupported: undefined as boolean | undefined };
    }
    return v as {
      readonly name: string;
      readonly description: string;
      readonly isUnsupported?: boolean;
    };
  });
  return [
    {
      name: opts.name,
      kind: "class",
      type: opts.name,
      isShared: false,
      isPrivate: false,
      range: { ...SYSTEM_RANGE },
      fileUri: SYSTEM_URI,
      containerName: opts.containerName,
      description: opts.description,
    },
    ...values.map((v) => ({
      ...buildEnumVal(v.name, opts.name, v.description, opts.containerName),
      isUnsupported: v.isUnsupported,
    })),
  ];
}

/**
 * Constrói funções/subs globais sem namespace "dono" (ex.: `CStr`, `Print`,
 * `Left`, em `Globals/Functions.ts`). Para funções pertencentes a um
 * namespace (`System.Pi`, `dateUtils.toStringFormat`, …), use
 * `buildNamespaceSymbols` com `functionsAndSubs`.
 */
export function buildGlobalFunctions(specs: readonly MethodSpec[]): SystemSymbolInfo[] {
  return specs.map((fn) => ({
    name: fn.name,
    kind: fn.kind ?? "declare_function",
    type: fn.returns,
    isShared: true,
    isPrivate: false,
    parameters: mapParams(fn.params),
    overloads: fn.overloads?.map(mapParams),
    variadicParameters: fn.variadicParameters,
    range: { ...SYSTEM_RANGE },
    fileUri: SYSTEM_URI,
    description: fn.description,
    isUnsupported: fn.isUnsupported,
  }));
}

import type { SystemSymbolInfo } from "../types";
import { buildNamespaceSymbols, type ConstSpec, type MethodSpec } from "../symbol-helpers";

/**
 * Namespace `System` — funções/constantes/tipos básicos do RTL Delphi
 * disponíveis ao código Data7 mediante `Imports System`.
 *
 * Itens listados aqui acompanham o autocomplete original; quando não há
 * tradução pelo compilador Data7, marcamos `isUnsupported: true` para gerar
 * `unsupported-member` no linter.
 */

interface TypeAliasSpec {
  readonly name: string;
  readonly type: string;
  readonly description: string;
}

// ───────── Funções e procedimentos ─────────
const functionsAndSubs: readonly MethodSpec[] = [
  // Memória
  {
    name: "GetMem",
    returns: "Void",
    params: [
      { name: "P", type: "Pointer", isByRef: true },
      { name: "Size", type: "Integer" },
    ],
    description: "Aloca um bloco de memória do tamanho informado e retorna o ponteiro em P.",
  },
  {
    name: "FreeMem",
    returns: "Void",
    params: [
      { name: "P", type: "Pointer" },
      { name: "Size", type: "Integer", isOptional: true },
    ],
    description: "Libera um bloco de memória alocado por GetMem/AllocMem.",
  },
  {
    name: "AllocMem",
    returns: "Pointer",
    params: [{ name: "Size", type: "Cardinal" }],
    description: "Aloca um bloco de memória zerado do tamanho informado.",
  },
  {
    name: "New",
    returns: "Void",
    params: [{ name: "P", type: "Pointer", isByRef: true }],
    description: "Aloca memória dinâmica para o tipo apontado por P.",
  },
  {
    name: "Dispose",
    returns: "Void",
    params: [{ name: "P", type: "Pointer" }],
    description: "Libera memória dinâmica alocada por New.",
  },

  // Matemática
  {
    name: "Abs",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna o valor absoluto de X.",
  },
  {
    name: "ArcTan",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna o arco-tangente de X (em radianos).",
  },
  {
    name: "Cos",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna o cosseno de X (X em radianos).",
  },
  {
    name: "Exp",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna e (base natural) elevado a X.",
  },
  {
    name: "Frac",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna a parte fracionária de X.",
  },
  {
    name: "Int",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna a parte inteira de X (como Extended).",
  },
  {
    name: "Ln",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna o logaritmo natural de X.",
  },
  {
    name: "Sin",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna o seno de X (X em radianos).",
  },
  {
    name: "Sqr",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna o quadrado de X.",
  },
  {
    name: "Sqrt",
    returns: "Extended",
    params: [{ name: "X", type: "Extended" }],
    description: "Retorna a raiz quadrada de X.",
  },
  {
    name: "Trunc",
    returns: "Integer",
    params: [{ name: "X", type: "Extended" }],
    description: "Trunca X para Integer (descarta a parte fracionária).",
  },
  {
    name: "Round",
    returns: "Long",
    params: [{ name: "X", type: "Extended" }],
    description: "Arredonda X para o inteiro mais próximo (banker's rounding).",
  },
  {
    name: "Power",
    returns: "Extended",
    params: [
      { name: "Base", type: "Extended" },
      { name: "Exponent", type: "Extended" },
    ],
    description: "Retorna Base elevado a Exponent.",
  },
  {
    name: "Odd",
    returns: "Boolean",
    params: [{ name: "X", type: "Integer" }],
    description: "Retorna True se X é ímpar.",
  },

  // Operadores escalares (ordinais)
  {
    name: "Inc",
    returns: "Void",
    params: [
      { name: "X", type: "Integer", isByRef: true },
      { name: "N", type: "Integer", isOptional: true },
    ],
    description: "Incrementa X em 1 (ou em N).",
  },
  {
    name: "Dec",
    returns: "Void",
    params: [
      { name: "X", type: "Integer", isByRef: true },
      { name: "N", type: "Integer", isOptional: true },
    ],
    description: "Decrementa X em 1 (ou em N).",
  },
  {
    name: "Pred",
    returns: "Integer",
    params: [{ name: "X", type: "Integer" }],
    description: "Retorna o predecessor ordinal de X.",
  },
  {
    name: "Succ",
    returns: "Integer",
    params: [{ name: "X", type: "Integer" }],
    description: "Retorna o sucessor ordinal de X.",
  },
  {
    name: "Ord",
    returns: "Integer",
    params: [{ name: "X", type: "Variant" }],
    description: "Retorna o valor ordinal de X.",
  },
  {
    name: "Chr",
    returns: "Char",
    params: [{ name: "X", type: "Byte" }],
    description: "Retorna o caractere correspondente ao código informado.",
  },
  {
    name: "Low",
    returns: "Integer",
    params: [{ name: "X", type: "Variant" }],
    description: "Retorna o menor valor ordinal/index possível para X.",
  },
  {
    name: "High",
    returns: "Integer",
    params: [{ name: "X", type: "Variant" }],
    description: "Retorna o maior valor ordinal/index possível para X.",
  },

  // Strings
  {
    name: "Length",
    returns: "Integer",
    params: [{ name: "S", type: "String" }],
    description: "Retorna o comprimento (em caracteres) da string informada.",
  },
  {
    name: "Delete",
    returns: "Void",
    params: [
      { name: "S", type: "String", isByRef: true },
      { name: "Index", type: "Integer" },
      { name: "Count", type: "Integer" },
    ],
    description: "Remove Count caracteres de S a partir da posição Index.",
  },
  {
    name: "Insert",
    returns: "Void",
    params: [
      { name: "Substr", type: "String" },
      { name: "Dest", type: "String", isByRef: true },
      { name: "Index", type: "Integer" },
    ],
    description: "Insere Substr em Dest na posição Index.",
  },
  {
    name: "Copy",
    returns: "String",
    params: [
      { name: "S", type: "String" },
      { name: "Index", type: "Integer" },
      { name: "Count", type: "Integer" },
    ],
    description: "Retorna uma substring de S iniciando em Index com Count caracteres.",
  },
  {
    name: "Pos",
    returns: "Integer",
    params: [
      { name: "Substr", type: "String" },
      { name: "Str", type: "String" },
    ],
    overloads: [
      [
        { name: "Ch", type: "Char" },
        { name: "Str", type: "String" },
      ],
    ],
    description: "Retorna a posição (1-based) da primeira ocorrência de Substr em Str.",
  },
  {
    name: "Str",
    returns: "Void",
    params: [
      { name: "X", type: "Variant" },
      { name: "S", type: "String", isByRef: true },
    ],
    description: "Converte um valor numérico X em sua representação como string em S.",
  },
  {
    name: "Val",
    returns: "Void",
    params: [
      { name: "S", type: "String" },
      { name: "V", type: "Integer", isByRef: true },
      { name: "Code", type: "Integer", isByRef: true },
    ],
    overloads: [
      [
        { name: "S", type: "String" },
        { name: "V", type: "Double", isByRef: true },
        { name: "Code", type: "Integer", isByRef: true },
      ],
    ],
    description:
      "Converte a string S em valor numérico V. Em Code retorna 0 quando bem-sucedido ou a posição do caractere inválido.",
  },
  {
    name: "Upcase",
    returns: "Char",
    params: [{ name: "C", type: "Char" }],
    description: "Converte um caractere para maiúsculo.",
  },

  // Memória/bytes
  {
    name: "Move",
    returns: "Void",
    params: [
      { name: "Source", type: "Pointer" },
      { name: "Dest", type: "Pointer", isByRef: true },
      { name: "Count", type: "Integer" },
    ],
    description: "Copia Count bytes de Source para Dest.",
  },
  {
    name: "FillChar",
    returns: "Void",
    params: [
      { name: "X", type: "Pointer", isByRef: true },
      { name: "Count", type: "Integer" },
      { name: "Value", type: "Byte" },
    ],
    description: "Preenche Count bytes a partir de X com o valor informado.",
  },
  {
    name: "SizeOf",
    returns: "Integer",
    params: [{ name: "X", type: "Variant" }],
    description: "Retorna o tamanho em bytes de X.",
  },

  // Aleatório
  {
    name: "Randomize",
    returns: "Void",
    params: [],
    description: "Inicializa o gerador de números aleatórios com base no relógio do sistema.",
  },
  {
    name: "Random",
    returns: "Integer",
    params: [{ name: "X", type: "Integer", isOptional: true }],
    overloads: [[]],
    description: "Sem argumentos retorna um Double em [0,1). Com X retorna um inteiro em [0,X).",
  },

  // Bytes
  {
    name: "Hi",
    returns: "Byte",
    params: [{ name: "X", type: "Integer" }],
    description: "Retorna o byte mais significativo (alto) de X.",
  },
  {
    name: "Lo",
    returns: "Byte",
    params: [{ name: "X", type: "Integer" }],
    description: "Retorna o byte menos significativo (baixo) de X.",
  },

  // Threads
  {
    name: "BeginThread",
    returns: "Integer",
    params: [
      { name: "SecurityAttributes", type: "Pointer" },
      { name: "StackSize", type: "Cardinal" },
      { name: "ThreadFunc", type: "TThreadFunc" },
      { name: "Parameter", type: "Pointer" },
      { name: "CreationFlags", type: "Cardinal" },
      { name: "ThreadId", type: "Cardinal", isByRef: true },
    ],
    description: "Cria uma nova thread de sistema executando ThreadFunc.",
  },
  {
    name: "EndThread",
    returns: "Void",
    params: [{ name: "ExitCode", type: "Integer" }],
    description: "Finaliza a thread atual com o código de saída informado.",
  },
];

// ───────── Constantes ─────────
const constants: readonly ConstSpec[] = [
  { name: "Pi", type: "Double", description: "Constante matemática π ≈ 3.14159265358979." },
  { name: "MaxLongInt", type: "Integer", description: "Maior valor de Longint (2147483647)." },
  {
    name: "tlbsLF",
    type: "TTextLineBreakStyle",
    description: "Estilo de quebra de linha LF (Unix).",
  },
  {
    name: "tlbsCRLF",
    type: "TTextLineBreakStyle",
    description: "Estilo de quebra de linha CRLF (Windows).",
  },

  // Códigos varType de Variant (subset usado pelo ERP)
  { name: "varEmpty", type: "Integer", description: "Tipo Variant vazio (0)." },
  { name: "varNull", type: "Integer", description: "Tipo Variant Null (1)." },
  { name: "varSmallint", type: "Integer", description: "Tipo Variant SmallInt (2)." },
  { name: "varInteger", type: "Integer", description: "Tipo Variant Integer (3)." },
  { name: "varSingle", type: "Integer", description: "Tipo Variant Single (4)." },
  { name: "varDouble", type: "Integer", description: "Tipo Variant Double (5)." },
  { name: "varCurrency", type: "Integer", description: "Tipo Variant Currency (6)." },
  { name: "varDate", type: "Integer", description: "Tipo Variant Date (7)." },
  { name: "varOleStr", type: "Integer", description: "Tipo Variant OleStr (8)." },
  { name: "varDispatch", type: "Integer", description: "Tipo Variant Dispatch (9)." },
  { name: "varError", type: "Integer", description: "Tipo Variant Error (10)." },
  { name: "varBoolean", type: "Integer", description: "Tipo Variant Boolean (11)." },
  { name: "varVariant", type: "Integer", description: "Tipo Variant Variant (12)." },
  { name: "varUnknown", type: "Integer", description: "Tipo Variant Unknown (13)." },
  { name: "varShortInt", type: "Integer", description: "Tipo Variant ShortInt (16)." },
  { name: "varByte", type: "Integer", description: "Tipo Variant Byte (17)." },
  { name: "varWord", type: "Integer", description: "Tipo Variant Word (18)." },
  { name: "varLongWord", type: "Integer", description: "Tipo Variant LongWord (19)." },
  { name: "varInt64", type: "Integer", description: "Tipo Variant Int64 (20)." },
  { name: "varUInt64", type: "Integer", description: "Tipo Variant UInt64 (21)." },
  { name: "varStrArg", type: "Integer", description: "Tipo Variant StrArg (72)." },
  { name: "varString", type: "Integer", description: "Tipo Variant String (256)." },
  { name: "varAny", type: "Integer", description: "Tipo Variant Any (257)." },
  { name: "varTypeMask", type: "Integer", description: "Máscara para tipos básicos (4095)." },
  { name: "varArray", type: "Integer", description: "Flag de array em Variant (8192)." },
  { name: "varByRef", type: "Integer", description: "Flag de passagem por referência (16384)." },
  { name: "varUString", type: "Integer", description: "Tipo Variant UnicodeString (258)." },
];

// ───────── Type aliases relevantes ─────────
const typeAliases: readonly TypeAliasSpec[] = [
  { name: "Real", type: "Real", description: "Alias para Double (número real)." },
  {
    name: "TDateTime",
    type: "TDateTime",
    description: "Alias para Double que armazena data e hora.",
  },
  { name: "Longint", type: "Long", description: "Alias para inteiro com sinal de 32 bits." },
  { name: "LongWord", type: "Long", description: "Alias para inteiro sem sinal de 32 bits." },
  { name: "THandle", type: "Long", description: "Handle nativo do sistema operacional." },
  { name: "HRESULT", type: "Long", description: "Código HRESULT padrão (COM)." },
  { name: "HMODULE", type: "Long", description: "Handle de módulo carregado." },
  { name: "UTF8String", type: "String", description: "String codificada em UTF-8." },
  { name: "UCS4String", type: "String", description: "String composta por UCS-4 chars." },
  { name: "TVarType", type: "Integer", description: "Código do tipo de Variant (ver var*)." },
  {
    name: "TThreadFunc",
    type: "TThreadFunc",
    description: "Tipo da função executada por uma thread (Pointer).",
  },
  {
    name: "TTextLineBreakStyle",
    type: "Integer",
    description: "Estilo de quebra de linha em texto.",
  },
];

export const symbols: SystemSymbolInfo[] = buildNamespaceSymbols({
  namespace: "System",
  description:
    "Namespace básico do RTL Delphi — funções de memória, matemática, strings, conversão de tipos e constantes Variant.",
  functionsAndSubs,
  constants,
  typeAliases,
});

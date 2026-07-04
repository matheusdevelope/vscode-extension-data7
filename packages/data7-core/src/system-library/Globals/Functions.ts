import { ParameterInfo } from "../../analysis/symbol-indexer";
import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

const fn = (
  name: string,
  type: string,
  params: ParameterInfo[],
  desc: string,
): SystemSymbolInfo => {
  return {
    name,
    kind: "declare_function",
    type,
    isShared: true,
    isPrivate: false,
    parameters: params,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description: desc,
  };
};

const pr = (
  name: string,
  type: string,
  isByRef: boolean = false,
  isOptional: boolean = false,
): ParameterInfo => {
  return {
    name,
    type,
    isByRef,
    isOptional,
  };
};

export const symbols: SystemSymbolInfo[] = [
  // --- Funções de Conversão de Tipo de Dados ---
  fn("CBool", "Boolean", [pr("pValue", "Variant")], "Converte um valor genérico para Boolean."),
  fn("CByte", "Byte", [pr("pValue", "Variant")], "Converte um valor genérico para Byte."),
  fn("CChar", "Char", [pr("pValue", "Variant")], "Converte um valor genérico para Char."),
  fn("CDate", "TDateTime", [pr("pValue", "Variant")], "Converte um valor genérico para Date."),
  fn("CDbl", "Double", [pr("pValue", "Variant")], "Converte um valor genérico para Double."),
  fn("CDec", "Decimal", [pr("pValue", "Variant")], "Converte um valor genérico para Decimal."),
  fn("CInt", "Integer", [pr("pValue", "Variant")], "Converte um valor genérico para Integer."),
  fn("CLng", "Long", [pr("pValue", "Variant")], "Converte um valor genérico para Long."),
  fn("CObj", "Object", [pr("pValue", "Variant")], "Converte um valor genérico para Object."),
  fn("CSByte", "SByte", [pr("pValue", "Variant")], "Converte um valor genérico para SByte."),
  fn("CShort", "Short", [pr("pValue", "Variant")], "Converte um valor genérico para Short."),
  fn("CSng", "Single", [pr("pValue", "Variant")], "Converte um valor genérico para Single."),
  fn("CStr", "String", [pr("pValue", "Variant")], "Converte um valor genérico para String."),
  fn(
    "FormatCurrency",
    "String",
    [pr("pExpression", "Variant")],
    "Retorna uma expressão formatada como um valor de moeda.",
  ),
  fn(
    "FormatDateTime",
    "String",
    [pr("pDate", "TDateTime"), pr("pNamedFormat", "Integer", false, true)],
    "Retorna uma expressão formatada como data ou hora.",
  ),
  fn(
    "FormatNumber",
    "String",
    [pr("pExpression", "Variant")],
    "Retorna uma expressão formatada como um número.",
  ),
  fn(
    "FormatPercent",
    "String",
    [pr("pExpression", "Variant")],
    "Retorna uma expressão formatada como uma porcentagem.",
  ),
  fn(
    "Hex",
    "String",
    [pr("pNumber", "Variant")],
    "Retorna uma String representando o valor hexadecimal de um número.",
  ),

  // --- Funções Matemáticas ---
  fn("Abs", "Double", [pr("pNumber", "Variant")], "Retorna o valor absoluto de um número."),
  fn("Atn", "Double", [pr("pNumber", "Double")], "Retorna o arco tangente de um número."),
  fn("Cos", "Double", [pr("pNumber", "Double")], "Retorna o cosseno de um ângulo."),
  fn(
    "Exp",
    "Double",
    [pr("pNumber", "Double")],
    "Retorna e (a base dos logaritmos naturais) elevado a uma potência.",
  ),
  fn(
    "Fix",
    "Integer",
    [pr("pNumber", "Variant")],
    "Retorna a parte inteira de um número, removendo a parte fracionária.",
  ),
  fn("Int", "Integer", [pr("pValue", "Variant")], "Retorna a parte inteira de um número."),
  fn("Log", "Double", [pr("pNumber", "Double")], "Retorna o logaritmo natural de um número."),
  fn(
    "Round",
    "Double",
    [pr("pNumber", "Variant"), pr("pNumDigitsAfterDecimal", "Integer", false, true)],
    "Retorna um número arredondado para o número especificado de casas decimais.",
  ),
  fn(
    "Sgn",
    "Integer",
    [pr("pNumber", "Variant")],
    "Retorna um número inteiro que indica o sinal de um número.",
  ),
  fn("Sin", "Double", [pr("pNumber", "Double")], "Retorna o seno de um ângulo."),
  fn("Sqr", "Double", [pr("pNumber", "Double")], "Retorna a raiz quadrada de um número."),
  fn("Tan", "Double", [pr("pNumber", "Double")], "Retorna a tangente de um ângulo."),

  // --- Manipulação de Arrays ---
  fn(
    "Array",
    "Variant",
    [pr("pArgList", "Variant", false, true)],
    "Retorna um Variant contendo um array.",
  ),
  fn(
    "Filter",
    "Variant",
    [pr("pSourceArray", "Variant"), pr("pMatch", "String"), pr("pInclude", "Boolean", false, true)],
    "Retorna um array baseado em zero contendo subconjunto de um array de strings.",
  ),
  fn(
    "Join",
    "String",
    [pr("pSourceArray", "Variant"), pr("pDelimiter", "String", false, true)],
    "Retorna uma string criada pela junção de várias substrings contidas em um array.",
  ),
  fn(
    "LBound",
    "Integer",
    [pr("pArray", "Variant")],
    "Retorna o menor índice disponível de um array.",
  ),
  fn(
    "Split",
    "Variant",
    [pr("pExpression", "String"), pr("pDelimiter", "String", false, true)],
    "Retorna um array que contém um número especificado de substrings.",
  ),
  fn(
    "UBound",
    "Integer",
    [pr("pArray", "Variant")],
    "Retorna o maior índice disponível de um array.",
  ),

  // --- Manipulação de Strings ---
  fn(
    "Asc",
    "Integer",
    [pr("pString", "String")],
    "Retorna o código de caractere da primeira letra da string.",
  ),
  fn(
    "Chr",
    "String",
    [pr("pCharCode", "Integer")],
    "Retorna o caractere associado ao código de caractere especificado.",
  ),
  fn(
    "InStr",
    "Integer",
    [pr("pStringCheck", "String"), pr("pStringMatch", "String")],
    "Retorna a posição da primeira ocorrência de uma string dentro de outra.",
  ),
  fn(
    "InStrRev",
    "Integer",
    [pr("pStringCheck", "String"), pr("pStringMatch", "String")],
    "Retorna a posição de uma ocorrência de uma string dentro de outra, a partir do final.",
  ),
  fn("LCase", "String", [pr("pString", "String")], "Converte uma string para minúsculas."),
  fn(
    "Left",
    "String",
    [pr("pString", "String"), pr("pLength", "Integer")],
    "Retorna um número especificado de caracteres do lado esquerdo de uma string.",
  ),
  fn("Len", "Integer", [pr("pString", "String")], "Retorna o número de caracteres de uma string."),
  fn(
    "LTrim",
    "String",
    [pr("pString", "String")],
    "Retorna uma cópia de uma string sem espaços iniciais.",
  ),
  fn(
    "Mid",
    "String",
    [pr("pString", "String"), pr("pStart", "Integer"), pr("pLength", "Integer", false, true)],
    "Retorna um número especificado de caracteres de uma string.",
  ),
  fn(
    "Replace",
    "String",
    [pr("pExpression", "String"), pr("pFind", "String"), pr("pReplace", "String")],
    "Retorna uma string onde uma substring especificada foi substituída.",
  ),
  fn(
    "Right",
    "String",
    [pr("pString", "String"), pr("pLength", "Integer")],
    "Retorna um número especificado de caracteres do lado direito de uma string.",
  ),
  fn(
    "RTrim",
    "String",
    [pr("pString", "String")],
    "Retorna uma cópia de uma string sem espaços finais.",
  ),
  fn(
    "Space",
    "String",
    [pr("pNumber", "Integer")],
    "Retorna uma string que consiste no número especificado de espaços.",
  ),
  fn(
    "StrComp",
    "Integer",
    [pr("pString1", "String"), pr("pString2", "String")],
    "Retorna um valor que indica o resultado da comparação de strings.",
  ),
  fn(
    "StrReverse",
    "String",
    [pr("pExpression", "String")],
    "Retorna uma string na qual a ordem dos caracteres é revertida.",
  ),
  fn(
    "Trim",
    "String",
    [pr("pString", "String")],
    "Retorna uma string que contém uma cópia da string sem espaços iniciais e finais.",
  ),
  fn("UCase", "String", [pr("pString", "String")], "Converte uma string para maiúsculas."),

  // --- Data e Hora ---
  fn("Date", "TDateTime", [], "Retorna a data atual do sistema."),
  fn(
    "DateAdd",
    "TDateTime",
    [pr("pInterval", "String"), pr("pNumber", "Double"), pr("pDate", "TDateTime")],
    "Retorna um Variant contendo uma data à qual foi adicionado um intervalo de tempo.",
  ),
  fn(
    "DateDiff",
    "Long",
    [pr("pInterval", "String"), pr("pDate1", "String"), pr("pDate2", "String")],
    "Retorna o número de intervalos de tempo entre duas datas diferentes.",
  ),
  fn(
    "DatePart",
    "Integer",
    [pr("pInterval", "String"), pr("pDate", "TDateTime")],
    "Retorna um inteiro contendo a parte especificada de uma determinada data.",
  ),
  fn(
    "DateSerial",
    "TDateTime",
    [pr("pYear", "Integer"), pr("pMonth", "Integer"), pr("pDay", "Integer")],
    "Retorna um Variant de data para um ano, mês e dia especificados.",
  ),
  fn("DateTime", "TDateTime", [], "Retorna a data e hora (alias para Now/Date)."),
  fn("DateValue", "TDateTime", [pr("pDate", "Variant")], "Retorna um Variant de data."),
  fn(
    "Day",
    "Integer",
    [pr("pDate", "TDateTime")],
    "Retorna um número inteiro que representa o dia do mês.",
  ),
  fn(
    "Hour",
    "Integer",
    [pr("pTime", "TDateTime")],
    "Retorna um número inteiro que representa a hora do dia.",
  ),
  fn(
    "Minute",
    "Integer",
    [pr("pTime", "TDateTime")],
    "Retorna um número inteiro que representa o minuto da hora.",
  ),
  fn(
    "Month",
    "Integer",
    [pr("pDate", "TDateTime")],
    "Retorna um número inteiro que representa o mês do ano.",
  ),
  fn(
    "MonthName",
    "String",
    [pr("pMonth", "Integer")],
    "Retorna uma string indicando o mês especificado.",
  ),
  fn(
    "Now",
    "TDateTime",
    [],
    "Retorna a data atual do sistema.\nATENÇÃO, essa função não preenche o Time, apenas o Date, use DateTime() para obter o TDateTime completo.",
  ),
  fn(
    "Second",
    "Integer",
    [pr("pTime", "TDateTime")],
    "Retorna um número inteiro que representa o segundo do minuto.",
  ),
  fn(
    "Timer",
    "Single",
    [],
    "Retorna um valor Single representando o número de segundos decorridos desde a meia-noite.",
  ),
  fn(
    "TimeSerial",
    "TDateTime",
    [pr("pHour", "Integer"), pr("pMinute", "Integer"), pr("pSecond", "Integer")],
    "Retorna um Variant de tempo para uma hora, minuto e segundo especificados.",
  ),
  fn("TimeValue", "TDateTime", [pr("pTime", "Variant")], "Retorna um Variant contendo a hora."),
  fn(
    "Weekday",
    "Integer",
    [pr("pDate", "TDateTime")],
    "Retorna um número inteiro representando o dia da semana.",
  ),
  fn(
    "WeekdayName",
    "String",
    [pr("pWeekday", "Integer")],
    "Retorna uma string indicando o dia da semana especificado.",
  ),
  fn(
    "Year",
    "Integer",
    [pr("pDate", "TDateTime")],
    "Retorna um número inteiro que representa o ano.",
  ),

  // --- Checagem e Tipagem ---
  fn(
    "Assigned",
    "Boolean",
    [pr("pExpression", "TObject")],
    "Retorna um valor Booleano indicando se uma objeto foi inicializado.",
  ),
  fn(
    "GetType",
    "Type",
    [pr("pTypeName", "String")],
    "Retorna o objeto Type para o tipo especificado.",
  ),
  fn(
    "IsArray",
    "Boolean",
    [pr("pVarName", "Variant")],
    "Retorna um valor Booleano indicando se uma variável é um array.",
  ),
  fn(
    "IsEmpty",
    "Boolean",
    [pr("pExpression", "Variant")],
    "Retorna um valor Booleano indicando se uma variável foi inicializada.",
  ),
  fn(
    "IsObject",
    "Boolean",
    [pr("pExpression", "Variant")],
    "Retorna um valor Booleano indicando se uma variável é um objeto.",
  ),
  fn(
    "IsNumeric",
    "Boolean",
    [pr("pExpression", "Variant")],
    "Retorna um valor Booleano indicando se uma expressão pode ser avaliada como um número.",
  ),
  fn(
    "TypeName",
    "String",
    [pr("pExpression", "Variant")],
    "Retorna o nome do tipo da expressão passada via parâmetro.",
  ),
  fn(
    "VarType",
    "Integer",
    [pr("pVarName", "Variant")],
    "Retorna um valor Integer indicando o subtipo de uma variável.",
  ),

  // --- Sistema e Utilitários ---
  fn(
    "CreateObject",
    "Variant",
    [pr("pClassName", "String")],
    "Cria e retorna uma referência a um objeto COM.",
  ),
  fn(
    "GetObject",
    "Variant",
    [pr("pPathName", "String")],
    "Retorna uma referência a um objeto COM a partir de um arquivo ou classe.",
  ),
  fn(
    "Sleep",
    "Void",
    [pr("pMilliseconds", "Integer")],
    "Suspende a execução da thread atual pelo tempo especificado.",
  ),
  fn("Print", "Void", [pr("pMessage", "Variant")], "Imprime uma mensagem."),
  fn(
    "RGB",
    "Integer",
    [pr("pRed", "Integer"), pr("pGreen", "Integer"), pr("pBlue", "Integer")],
    "Retorna um número inteiro representando um valor de cor RGB.",
  ),

  // --- Manipulação de Arquivos e Base64 ---
  fn(
    "Base64ToFile",
    "Void",
    [pr("pBase64", "String"), pr("pFilePath", "String")],
    "Decodifica uma string Base64 e a salva em um arquivo.",
  ),
  fn(
    "FileToBase64",
    "String",
    [pr("pFilePath", "String")],
    "Lê um arquivo e o converte para uma string codificada em Base64.",
  ),

  // --- Conversões Específicas e Tratamento de Erros (Str -> Tipo) ---
  fn("StrToCurr", "Currency", [pr("pString", "String")], "Converte uma string para Currency."),
  fn(
    "StrToCurrDef",
    "Currency",
    [pr("pString", "String"), pr("pDefault", "Currency")],
    "Converte uma string para Currency; retorna o valor padrão em caso de erro.",
  ),
  fn("StrToDate", "TDateTime", [pr("pString", "String")], "Converte uma string para Date."),
  fn(
    "StrToDateDef",
    "TDateTime",
    [pr("pString", "String"), pr("pDefault", "TDateTime")],
    "Converte uma string para Date; retorna o valor padrão em caso de erro.",
  ),
  fn(
    "StrToDateTime",
    "TDateTime",
    [pr("pString", "String")],
    "Converte uma string para Data e Hora.",
  ),
  fn(
    "StrToFloat",
    "Double",
    [pr("pString", "String")],
    "Converte uma string para ponto flutuante (Double).",
  ),
  fn(
    "StrToFloatDef",
    "Double",
    [pr("pString", "String"), pr("pDefault", "Double")],
    "Converte uma string para Double; retorna o valor padrão em caso de erro.",
  ),
  fn("StrToInt", "Integer", [pr("pString", "String")], "Converte uma string para Integer."),
  fn(
    "StrToIntDef",
    "Integer",
    [pr("pString", "String"), pr("pDefault", "Integer")],
    "Converte uma string para Integer; retorna o valor padrão em caso de erro.",
  ),
  fn("StrToInt64", "Long", [pr("pString", "String")], "Converte uma string para Long/Int64."),
  fn(
    "StrToInt64Def",
    "Long",
    [pr("pString", "String"), pr("pDefault", "Long")],
    "Converte uma string para Long/Int64; retorna o valor padrão em caso de erro.",
  ),
  fn("StrToUInt64", "ULong", [pr("pString", "String")], "Converte uma string para ULong/UInt64."),
  fn(
    "StrToUInt64Def",
    "ULong",
    [pr("pString", "String"), pr("pDefault", "Long")],
    "Converte uma string para ULong/UInt64; retorna o valor padrão em caso de erro.",
  ),

  // --- Funções "Try" de Conversão Segura (uso de ponteiros/ByRef) ---
  fn(
    "TryStrToCurr",
    "Boolean",
    [pr("pString", "String"), pr("pOutValue", "Currency", true)],
    "Tenta converter uma string para Currency e retorna o status de sucesso.",
  ),
  fn(
    "TryStrToDate",
    "Boolean",
    [pr("pString", "String"), pr("pOutValue", "TDateTime", true)],
    "Tenta converter uma string para Date e retorna o status de sucesso.",
  ),
  fn(
    "TryStrToFloat",
    "Boolean",
    [pr("pString", "String"), pr("pOutValue", "Double", true)],
    "Tenta converter uma string para Double e retorna o status de sucesso.",
  ),
  fn(
    "TryStrToInt",
    "Boolean",
    [pr("pString", "String"), pr("pOutValue", "Integer", true)],
    "Tenta converter uma string para Integer e retorna o status de sucesso.",
  ),
  fn(
    "TryStrToInt64",
    "Boolean",
    [pr("pString", "String"), pr("pOutValue", "Long", true)],
    "Tenta converter uma string para Int64 e retorna o status de sucesso.",
  ),
  fn(
    "TryStrToUInt64",
    "Boolean",
    [pr("pString", "String"), pr("pOutValue", "Long", true)],
    "Tenta converter uma string para UInt64 e retorna o status de sucesso.",
  ),
];

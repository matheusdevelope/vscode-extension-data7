import { ParameterInfo } from "../../analysis/symbol-indexer";
import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

const fn = (name: string, type: string, params: ParameterInfo[], desc: string): SystemSymbolInfo => {
  return {
    name,
    kind: "declare_function",
    type,
    isShared: true,
    isPrivate: false,
    parameters: params,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description: desc
  }
}

const pr = (name: string, type: string, isByRef: boolean = false, isOptional: boolean = false): ParameterInfo => {
  return {
    name,
    type,
    isByRef,
    isOptional,
  }
}

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
  // fn("CType", "Object", [pr("pValue", "Variant"), pr("pType", "Type")], "Retorna o resultado da conversão explícita de uma expressão para um tipo especificado."),
  // fn("TryCast", "Object", [pr("pValue", "Variant"), pr("pType", "Type")], "Tenta converter um objeto para o tipo especificado, retornando Nothing em caso de falha."),

  // --- Manipulação de Arrays ---
  fn("LBound", "Integer", [pr("pArray", "Variant")], "Retorna o menor índice disponível de um array."),
  fn("UBound", "Integer", [pr("pArray", "Variant")], "Retorna o maior índice disponível de um array."),

  // --- Manipulação de Strings ---
  fn("Asc", "Integer", [pr("pString", "String")], "Retorna o código de caractere da primeira letra da string."),
  fn("Chr", "String", [pr("pCharCode", "Integer")], "Retorna o caractere associado ao código de caractere especificado."),
  fn("InStr", "Integer", [pr("pStringCheck", "String"), pr("pStringMatch", "String")], "Retorna a posição da primeira ocorrência de uma string dentro de outra."),
  fn("InStrRev", "Integer", [pr("pStringCheck", "String"), pr("pStringMatch", "String")], "Retorna a posição de uma ocorrência de uma string dentro de outra, a partir do final."),
  fn("LCase", "String", [pr("pString", "String")], "Converte uma string para minúsculas."),
  fn("UCase", "String", [pr("pString", "String")], "Converte uma string para maiúsculas."),
  fn("Left", "String", [pr("pString", "String"), pr("pLength", "Integer")], "Retorna um número especificado de caracteres do lado esquerdo de uma string."),
  fn("Right", "String", [pr("pString", "String"), pr("pLength", "Integer")], "Retorna um número especificado de caracteres do lado direito de uma string."),
  fn("Len", "Integer", [pr("pString", "String")], "Retorna o número de caracteres de uma string."),
  fn("Mid", "String", [pr("pString", "String"), pr("pStart", "Integer"), pr("pLength", "Integer", false, true)], "Retorna um número especificado de caracteres de uma string."),
  fn("Replace", "String", [pr("pExpression", "String"), pr("pFind", "String"), pr("pReplace", "String")], "Retorna uma string onde uma substring especificada foi substituída."),
  fn("Space", "String", [pr("pNumber", "Integer")], "Retorna uma string que consiste no número especificado de espaços."),
  fn("Trim", "String", [pr("pString", "String")], "Retorna uma string que contém uma cópia da string sem espaços iniciais e finais."),

  // --- Funções Matemáticas ---
  fn("Int", "Integer", [pr("pValue", "Variant")], "Retorna a parte inteira de um número."),

  // --- Data e Hora ---
  fn("Now", "TDateTime", [], "Retorna a data e hora atuais do sistema."),
  fn("DateTime", "TDateTime", [], "Retorna a data e hora (alias para Now/Date)."),


  // --- Checagem e Tipagem ---
  fn("Assigned", "Boolean", [pr("pExpression", "TObject")], "Retorna um valor Booleano indicando se uma objeto foi inicializado."),
  fn("IsEmpty", "Boolean", [pr("pExpression", "Variant")], "Retorna um valor Booleano indicando se uma variável foi inicializada."),
  fn("GetType", "Type", [pr("pTypeName", "String")], "Retorna o objeto Type para o tipo especificado."),
  fn("TypeName", "String", [pr("pExpression", "Variant")], "Retorna o nome do tipo da expressão passada via parametro."),
  // fn("TypeOf", "Type", [pr("pValue", "Variant")], "Retorna o tipo da expressão fornecida."),

  // --- Sistema e Utilitários ---
  fn("CreateObject", "Variant", [pr("pClassName", "String")], "Cria e retorna uma referência a um objeto COM."),
  fn("Sleep", "Void", [pr("pMilliseconds", "Integer")], "Suspende a execução da thread atual pelo tempo especificado."),
  fn("Print", "Void", [pr("pMessage", "Variant")], "Imprime uma mensagem (geralmente no console ou arquivo)."),
  fn("RGB", "Integer", [pr("pRed", "Integer"), pr("pGreen", "Integer"), pr("pBlue", "Integer")], "Retorna um número inteiro representando um valor de cor RGB."),

  // --- Manipulação de Arquivos e Base64 ---
  fn("Base64ToFile", "Void", [pr("pBase64", "String"), pr("pFilePath", "String")], "Decodifica uma string Base64 e a salva em um arquivo."),
  fn("FileToBase64", "String", [pr("pFilePath", "String")], "Lê um arquivo e o converte para uma string codificada em Base64."),

  // --- Conversões Específicas e Tratamento de Erros (Str -> Tipo) ---
  fn("StrToCurr", "Currency", [pr("pString", "String")], "Converte uma string para Currency."),
  fn("StrToCurrDef", "Currency", [pr("pString", "String"), pr("pDefault", "Currency")], "Converte uma string para Currency; retorna o valor padrão em caso de erro."),
  fn("StrToDate", "TDateTime", [pr("pString", "String")], "Converte uma string para Date."),
  fn("StrToDateDef", "TDateTime", [pr("pString", "String"), pr("pDefault", "TDateTime")], "Converte uma string para Date; retorna o valor padrão em caso de erro."),
  fn("StrToDateTime", "TDateTime", [pr("pString", "String")], "Converte uma string para Data e Hora."),
  fn("StrToFloat", "Double", [pr("pString", "String")], "Converte uma string para ponto flutuante (Double)."),
  fn("StrToFloatDef", "Double", [pr("pString", "String"), pr("pDefault", "Double")], "Converte uma string para Double; retorna o valor padrão em caso de erro."),
  fn("StrToInt", "Integer", [pr("pString", "String")], "Converte uma string para Integer."),
  fn("StrToIntDef", "Integer", [pr("pString", "String"), pr("pDefault", "Integer")], "Converte uma string para Integer; retorna o valor padrão em caso de erro."),
  fn("StrToInt64", "Long", [pr("pString", "String")], "Converte uma string para Long/Int64."),
  fn("StrToInt64Def", "Long", [pr("pString", "String"), pr("pDefault", "Long")], "Converte uma string para Long/Int64; retorna o valor padrão em caso de erro."),
  fn("StrToUInt64", "ULong", [pr("pString", "String")], "Converte uma string para ULong/UInt64."),
  fn("StrToUInt64Def", "ULong", [pr("pString", "String"), pr("pDefault", "ULong")], "Converte uma string para ULong/UInt64; retorna o valor padrão em caso de erro."),

  // --- Funções "Try" de Conversão Segura (uso de ponteiros/ByRef) ---
  fn("TryStrToCurr", "Boolean", [pr("pString", "String"), pr("pOutValue", "Currency", true)], "Tenta converter uma string para Currency e retorna o status de sucesso."),
  fn("TryStrToDate", "Boolean", [pr("pString", "String"), pr("pOutValue", "TDateTime", true)], "Tenta converter uma string para Date e retorna o status de sucesso."),
  fn("TryStrToFloat", "Boolean", [pr("pString", "String"), pr("pOutValue", "Double", true)], "Tenta converter uma string para Double e retorna o status de sucesso."),
  fn("TryStrToInt", "Boolean", [pr("pString", "String"), pr("pOutValue", "Integer", true)], "Tenta converter uma string para Integer e retorna o status de sucesso."),
  fn("TryStrToInt64", "Boolean", [pr("pString", "String"), pr("pOutValue", "Long", true)], "Tenta converter uma string para Int64 e retorna o status de sucesso."),
  fn("TryStrToUInt64", "Boolean", [pr("pString", "String"), pr("pOutValue", "ULong", true)], "Tenta converter uma string para UInt64 e retorna o status de sucesso."),
];

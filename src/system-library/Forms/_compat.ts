import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const property = (
  containerName: SystemSymbolInfo["containerName"],
  name: string,
  type: string,
  description: string,
): SystemSymbolInfo => ({
  name,
  kind: "property",
  type,
  isShared: false,
  isPrivate: false,
  range,
  fileUri: "system://library",
  containerName,
  description,
});

const value = (name: string, description: string): SystemSymbolInfo => ({
  name,
  kind: "variable",
  type: "Integer",
  isShared: true,
  isPrivate: false,
  range,
  fileUri: "system://library",
  containerName: "Forms",
  description,
});

export const symbols: SystemSymbolInfo[] = [
  property("TControl", "Color", "TColor", "Cor principal do controle."),
  property("TControl", "Font", "TFont", "Fonte padrao usada para renderizar texto no controle."),
  property("TControl", "ParentFont", "Boolean", "Indica se o controle herda a fonte do parent."),

  property(
    "TcxCustomTextEdit",
    "CharCase",
    "Integer",
    "Transformacao aplicada ao texto digitado (ccNormal, ccUpper, ccLower).",
  ),

  property("StaticText", "Text", "String", "Alias textual equivalente ao Caption do componente."),

  value("ccNormal", "Mantem o texto exatamente como digitado."),
  value("ccUpper", "Converte o texto digitado para maiusculas."),
  value("ccLower", "Converte o texto digitado para minusculas."),
  value("ecNormal", "Alias VCL para texto sem transformacao."),
  value("ecUpperCase", "Alias VCL para texto convertido para maiusculas."),
  value("ecLowerCase", "Alias VCL para texto convertido para minusculas."),
];

import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const cursor = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TCursor",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCursor",
    kind: "class",
    type: "TCursor",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    description:
      "Forma do ponteiro do mouse quando passa sobre o controle (TControl.Cursor). Acessível globalmente.",
  },

  cursor("crDefault", "Cursor padrão definido pelo container ou sistema."),
  cursor("crNone", "Sem cursor visível."),
  cursor("crArrow", "Seta padrão do Windows."),
  cursor("crCross", "Cursor em cruz (mira)."),
  cursor("crIBeam", "Cursor de inserção de texto (I-beam)."),
  cursor("crSize", "Cursor de redimensionamento genérico."),
  cursor("crSizeNESW", "Redimensionamento diagonal NE-SW."),
  cursor("crSizeNS", "Redimensionamento vertical (norte-sul)."),
  cursor("crSizeNWSE", "Redimensionamento diagonal NW-SE."),
  cursor("crSizeWE", "Redimensionamento horizontal (oeste-leste)."),
  cursor("crUpArrow", "Seta apontando para cima."),
  cursor("crHourGlass", "Ampulheta (operação em andamento)."),
  cursor("crDrag", "Arrasto em andamento."),
  cursor("crNoDrop", "Arrasto inválido (não pode soltar aqui)."),
  cursor("crHSplit", "Divisor horizontal."),
  cursor("crVSplit", "Divisor vertical."),
  cursor("crMultiDrag", "Arrasto de múltiplos itens."),
  cursor("crSQLWait", "Aguardando operação SQL."),
  cursor("crNo", "Proibido (círculo com barra)."),
  cursor("crAppStart", "Aplicação carregando (seta + ampulheta)."),
  cursor("crHelp", "Ajuda (seta + ponto de interrogação)."),
  cursor("crHandPoint", "Mão apontando (sobre link clicável)."),
  cursor("crSizeAll", "Redimensionamento em todas as direções (movimentar)."),
];

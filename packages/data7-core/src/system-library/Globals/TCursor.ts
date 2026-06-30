import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCursor",
    kind: "class",
    type: "TCursor",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Forma do ponteiro do mouse quando passa sobre o controle (TControl.Cursor). Acessível globalmente.",
  },

  buildEnumVal("crDefault", "TCursor", "Cursor padrão definido pelo container ou sistema."),
  buildEnumVal("crNone", "TCursor", "Sem cursor visível."),
  buildEnumVal("crArrow", "TCursor", "Seta padrão do Windows."),
  buildEnumVal("crCross", "TCursor", "Cursor em cruz (mira)."),
  buildEnumVal("crIBeam", "TCursor", "Cursor de inserção de texto (I-beam)."),
  buildEnumVal("crSize", "TCursor", "Cursor de redimensionamento genérico."),
  buildEnumVal("crSizeNESW", "TCursor", "Redimensionamento diagonal NE-SW."),
  buildEnumVal("crSizeNS", "TCursor", "Redimensionamento vertical (norte-sul)."),
  buildEnumVal("crSizeNWSE", "TCursor", "Redimensionamento diagonal NW-SE."),
  buildEnumVal("crSizeWE", "TCursor", "Redimensionamento horizontal (oeste-leste)."),
  buildEnumVal("crUpArrow", "TCursor", "Seta apontando para cima."),
  buildEnumVal("crHourGlass", "TCursor", "Ampulheta (operação em andamento)."),
  buildEnumVal("crDrag", "TCursor", "Arrasto em andamento."),
  buildEnumVal("crNoDrop", "TCursor", "Arrasto inválido (não pode soltar aqui)."),
  buildEnumVal("crHSplit", "TCursor", "Divisor horizontal."),
  buildEnumVal("crVSplit", "TCursor", "Divisor vertical."),
  buildEnumVal("crMultiDrag", "TCursor", "Arrasto de múltiplos itens."),
  buildEnumVal("crSQLWait", "TCursor", "Aguardando operação SQL."),
  buildEnumVal("crNo", "TCursor", "Proibido (círculo com barra)."),
  buildEnumVal("crAppStart", "TCursor", "Aplicação carregando (seta + ampulheta)."),
  buildEnumVal("crHelp", "TCursor", "Ajuda (seta + ponto de interrogação)."),
  buildEnumVal("crHandPoint", "TCursor", "Mão apontando (sobre link clicável)."),
  buildEnumVal("crSizeAll", "TCursor", "Redimensionamento em todas as direções (movimentar)."),
];

import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TCursor",
  description:
    "Forma do ponteiro do mouse quando passa sobre o controle (TControl.Cursor). Acessível globalmente.",
  values: [
    ["crDefault", "Cursor padrão definido pelo container ou sistema."],
    ["crNone", "Sem cursor visível."],
    ["crArrow", "Seta padrão do Windows."],
    ["crCross", "Cursor em cruz (mira)."],
    ["crIBeam", "Cursor de inserção de texto (I-beam)."],
    ["crSize", "Cursor de redimensionamento genérico."],
    ["crSizeNESW", "Redimensionamento diagonal NE-SW."],
    ["crSizeNS", "Redimensionamento vertical (norte-sul)."],
    ["crSizeNWSE", "Redimensionamento diagonal NW-SE."],
    ["crSizeWE", "Redimensionamento horizontal (oeste-leste)."],
    ["crUpArrow", "Seta apontando para cima."],
    ["crHourGlass", "Ampulheta (operação em andamento)."],
    ["crDrag", "Arrasto em andamento."],
    ["crNoDrop", "Arrasto inválido (não pode soltar aqui)."],
    ["crHSplit", "Divisor horizontal."],
    ["crVSplit", "Divisor vertical."],
    ["crMultiDrag", "Arrasto de múltiplos itens."],
    ["crSQLWait", "Aguardando operação SQL."],
    ["crNo", "Proibido (círculo com barra)."],
    ["crAppStart", "Aplicação carregando (seta + ampulheta)."],
    ["crHelp", "Ajuda (seta + ponto de interrogação)."],
    ["crHandPoint", "Mão apontando (sobre link clicável)."],
    ["crSizeAll", "Redimensionamento em todas as direções (movimentar)."],
  ],
});

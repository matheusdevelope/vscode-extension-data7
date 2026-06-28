import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const color = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TColor",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TColor",
    kind: "class",
    type: "TColor",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    description:
      "Cor em formato Integer (BGR de 24 bits, opcionalmente com prefixo do system color). Acessível globalmente, sem Imports. Use uma constante clXxx ou a função RGB(r, g, b).",
  },

  // ───────── Cores nomeadas ─────────
  color("clBlack", "Preto (0x000000)."),
  color("clMaroon", "Marrom-escuro (0x000080)."),
  color("clGreen", "Verde (0x008000)."),
  color("clOlive", "Verde-oliva (0x008080)."),
  color("clNavy", "Azul-marinho (0x800000)."),
  color("clPurple", "Roxo (0x800080)."),
  color("clTeal", "Verde-azulado (0x808000)."),
  color("clGray", "Cinza (0x808080)."),
  color("clSilver", "Prata (0xC0C0C0)."),
  color("clRed", "Vermelho (0x0000FF)."),
  color("clLime", "Verde-limão (0x00FF00)."),
  color("clYellow", "Amarelo (0x00FFFF)."),
  color("clBlue", "Azul (0xFF0000)."),
  color("clFuchsia", "Magenta/fúcsia (0xFF00FF)."),
  color("clAqua", "Ciano/aqua (0xFFFF00)."),
  color("clLtGray", "Cinza-claro — alias para clSilver."),
  color("clDkGray", "Cinza-escuro — alias para clGray."),
  color("clWhite", "Branco (0xFFFFFF)."),
  color("clMoneyGreen", "Verde-pastel (cor de cédula)."),
  color("clSkyBlue", "Azul-céu."),
  color("clCream", "Creme (off-white)."),
  color("clMedGray", "Cinza-médio."),

  // ───────── System colors (tema do Windows) ─────────
  color("clBtnFace", "Cor da face de botão padrão do sistema."),
  color("clBtnShadow", "Cor de sombra de botão padrão do sistema."),
  color("clBtnHighlight", "Cor de destaque (highlight) de botão padrão do sistema."),
  color("clBtnText", "Cor do texto do botão padrão do sistema."),
  color("clActiveCaption", "Cor da barra de título da janela ativa."),
  color("clInactiveCaption", "Cor da barra de título de janela inativa."),
  color("clCaptionText", "Cor do texto da barra de título ativa."),
  color("clMenu", "Cor de fundo de menus do sistema."),
  color("clMenuText", "Cor do texto de menus."),
  color("clHighlight", "Cor de fundo de itens selecionados."),
  color("clHighlightText", "Cor de texto de itens selecionados."),
  color("clScrollBar", "Cor de fundo de barras de rolagem."),
  color("clWindow", "Cor de fundo padrão de janelas."),
  color("clWindowText", "Cor de texto padrão de janelas."),
  color("clWindowFrame", "Cor de borda de janela."),
  color("clBackground", "Cor de fundo da área de trabalho."),
  color("clAppWorkSpace", "Cor da área de trabalho MDI."),
  color("clInfoBk", "Cor de fundo de tooltips."),
  color("clInfoText", "Cor do texto de tooltips."),
  color("cl3DLight", "Cor 3D clara (highlight de bordas)."),
  color("cl3DDkShadow", "Cor 3D escura (sombra profunda)."),
  color("clGrayText", "Cor de texto desabilitado."),

  // ───────── Especiais ─────────
  color("clNone", "Sem cor (transparente em alguns contextos)."),
  color("clDefault", "Cor padrão (deixa o componente decidir)."),
];

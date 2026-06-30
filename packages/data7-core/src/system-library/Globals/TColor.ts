import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TColor",
    kind: "class",
    type: "TColor",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Cor em formato Integer (BGR de 24 bits, opcionalmente com prefixo do system color). Acessível globalmente, sem Imports. Use uma constante clXxx ou a função RGB(r, g, b).",
  },

  // ───────── Cores nomeadas ─────────
  buildEnumVal("clBlack", "TColor", "Preto (0x000000)."),
  buildEnumVal("clMaroon", "TColor", "Marrom-escuro (0x000080)."),
  buildEnumVal("clGreen", "TColor", "Verde (0x008000)."),
  buildEnumVal("clOlive", "TColor", "Verde-oliva (0x008080)."),
  buildEnumVal("clNavy", "TColor", "Azul-marinho (0x800000)."),
  buildEnumVal("clPurple", "TColor", "Roxo (0x800080)."),
  buildEnumVal("clTeal", "TColor", "Verde-azulado (0x808000)."),
  buildEnumVal("clGray", "TColor", "Cinza (0x808080)."),
  buildEnumVal("clSilver", "TColor", "Prata (0xC0C0C0)."),
  buildEnumVal("clRed", "TColor", "Vermelho (0x0000FF)."),
  buildEnumVal("clLime", "TColor", "Verde-limão (0x00FF00)."),
  buildEnumVal("clYellow", "TColor", "Amarelo (0x00FFFF)."),
  buildEnumVal("clBlue", "TColor", "Azul (0xFF0000)."),
  buildEnumVal("clFuchsia", "TColor", "Magenta/fúcsia (0xFF00FF)."),
  buildEnumVal("clAqua", "TColor", "Ciano/aqua (0xFFFF00)."),
  buildEnumVal("clLtGray", "TColor", "Cinza-claro — alias para clSilver."),
  buildEnumVal("clDkGray", "TColor", "Cinza-escuro — alias para clGray."),
  buildEnumVal("clWhite", "TColor", "Branco (0xFFFFFF)."),
  buildEnumVal("clMoneyGreen", "TColor", "Verde-pastel (cor de cédula)."),
  buildEnumVal("clSkyBlue", "TColor", "Azul-céu."),
  buildEnumVal("clCream", "TColor", "Creme (off-white)."),
  buildEnumVal("clMedGray", "TColor", "Cinza-médio."),

  // ───────── System colors (tema do Windows) ─────────
  buildEnumVal("clBtnFace", "TColor", "Cor da face de botão padrão do sistema."),
  buildEnumVal("clBtnShadow", "TColor", "Cor de sombra de botão padrão do sistema."),
  buildEnumVal("clBtnHighlight", "TColor", "Cor de destaque (highlight) de botão padrão do sistema."),
  buildEnumVal("clBtnText", "TColor", "Cor do texto do botão padrão do sistema."),
  buildEnumVal("clActiveCaption", "TColor", "Cor da barra de título da janela activa."),
  buildEnumVal("clInactiveCaption", "TColor", "Cor da barra de título de janela inativa."),
  buildEnumVal("clCaptionText", "TColor", "Cor do texto da barra de título ativa."),
  buildEnumVal("clMenu", "TColor", "Cor de fundo de menus do sistema."),
  buildEnumVal("clMenuText", "TColor", "Cor do texto de menus."),
  buildEnumVal("clHighlight", "TColor", "Cor de fundo de itens selecionados."),
  buildEnumVal("clHighlightText", "TColor", "Cor de texto de itens selecionados."),
  buildEnumVal("clScrollBar", "TColor", "Cor de fundo de barras de rolagem."),
  buildEnumVal("clWindow", "TColor", "Cor de fundo padrão de janelas."),
  buildEnumVal("clWindowText", "TColor", "Cor de texto padrão de janelas."),
  buildEnumVal("clWindowFrame", "TColor", "Cor de borda de janela."),
  buildEnumVal("clBackground", "TColor", "Cor de fundo da área de trabalho."),
  buildEnumVal("clAppWorkSpace", "TColor", "Cor da área de trabalho MDI."),
  buildEnumVal("clInfoBk", "TColor", "Cor de fundo de tooltips."),
  buildEnumVal("clInfoText", "TColor", "Cor do texto de tooltips."),
  buildEnumVal("cl3DLight", "TColor", "Cor 3D clara (highlight de bordas)."),
  buildEnumVal("cl3DDkShadow", "TColor", "Cor 3D escura (sombra profunda)."),
  buildEnumVal("clGrayText", "TColor", "Cor de texto desabilitado."),

  // ───────── Especiais ─────────
  buildEnumVal("clNone", "TColor", "Sem cor (transparente em alguns contextos)."),
  buildEnumVal("clDefault", "TColor", "Cor padrão (deixa o componente decidir)."),
];

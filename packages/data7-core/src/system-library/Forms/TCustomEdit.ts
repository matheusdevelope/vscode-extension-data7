import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "TCustomEdit",
  namespaceContainer: "Forms",
  inheritsFrom: "TWinControl",
  description:
    "Classe base VCL (`Vcl.StdCtrls.TCustomEdit`) de todos os controles de edição textual nativos do Windows — TEdit, TMaskEdit, TMemo, etc. Adiciona Text, ReadOnly, MaxLength, seleção e operações de clipboard sobre TWinControl.",
  properties: [
    { name: "Text", type: "String", description: "Texto exibido e editado no controle." },
    {
      name: "TextHint",
      type: "String",
      description: "Texto exibido como placeholder quando o controle está vazio.",
    },
    {
      name: "ReadOnly",
      type: "Boolean",
      description:
        "Se o edit é somente leitura — usuário pode selecionar/copiar mas não modificar.",
    },
    {
      name: "MaxLength",
      type: "Integer",
      description: "Número máximo de caracteres permitidos (0 = sem limite).",
    },
    {
      name: "PasswordChar",
      type: "String",
      description: "Caractere usado para mascarar a digitação (ex: '*' para campos de senha).",
    },
    {
      name: "CharCase",
      type: "Integer",
      description: "Caixa do texto (ecNormal=0, ecUpperCase=1, ecLowerCase=2).",
    },
    {
      name: "AutoSelect",
      type: "Boolean",
      description: "Se todo o texto é selecionado automaticamente quando o controle recebe foco.",
    },
    {
      name: "AutoSize",
      type: "Boolean",
      description: "Se a altura do controle se ajusta automaticamente para acomodar a fonte.",
    },
    {
      name: "Alignment",
      type: "TAlignment",
      description: "Alinhamento horizontal do texto dentro do edit.",
    },
    {
      name: "BorderStyle",
      type: "TBorderStyle",
      description: "Se o edit tem borda (bsSingle) ou não (bsNone).",
    },
    {
      name: "Modified",
      type: "Boolean",
      description:
        "Indica se o conteúdo foi modificado pelo usuário desde a última atribuição/save (dirty flag).",
    },
    {
      name: "NumbersOnly",
      type: "Boolean",
      description: "Se o edit aceita apenas caracteres numéricos.",
    },
    {
      name: "OEMConvert",
      type: "Boolean",
      description:
        "Se o texto é convertido entre ANSI e OEM ao perder o foco (compatibilidade com DOS).",
    },
    {
      name: "ParentColor",
      type: "Boolean",
      description: "Se o edit usa a cor de fundo do parent.",
    },
    { name: "SelStart", type: "Integer", description: "Posição inicial (caractere) da seleção." },
    { name: "SelLength", type: "Integer", description: "Comprimento da seleção em caracteres." },
    { name: "SelText", type: "String", description: "Texto atualmente selecionado." },
    {
      name: "CanUndo",
      type: "Boolean",
      description: "Indica se há alterações que podem ser desfeitas (Undo).",
    },
    {
      name: "OnChange",
      type: "TNotifyEvent",
      description:
        "Ocorre quando o texto do edit muda (depois de cada caractere digitado ou atribuição via Text).",
    },
  ],
  methods: [
    { name: "Clear", returns: "Void", params: [], description: "Apaga todo o texto do edit." },
    {
      name: "ClearSelection",
      returns: "Void",
      params: [],
      description: "Remove a porção selecionada do texto.",
    },
    {
      name: "CopyToClipboard",
      returns: "Void",
      params: [],
      description: "Copia a seleção atual para a área de transferência.",
    },
    {
      name: "CutToClipboard",
      returns: "Void",
      params: [],
      description: "Recorta a seleção atual para a área de transferência.",
    },
    {
      name: "PasteFromClipboard",
      returns: "Void",
      params: [],
      description: "Cola o conteúdo da área de transferência na posição atual do cursor.",
    },
    {
      name: "SelectAll",
      returns: "Void",
      params: [],
      description: "Seleciona todo o texto do edit.",
    },
    {
      name: "Undo",
      returns: "Void",
      params: [],
      description: "Desfaz a última alteração no texto.",
    },
    { name: "ClearUndo", returns: "Void", params: [], description: "Limpa o histórico de Undo." },
  ],
});

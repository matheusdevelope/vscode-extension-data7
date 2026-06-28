import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Single",
    kind: "class",
    type: "Single",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    inheritsFrom: "TPrimitive",
    description: "Representa um número de ponto flutuante de precisão simples (tipo primitivo).",
  },
  // {
  //   name: "ToString",
  //   kind: "method",
  //   type: "String",
  //   isShared: false,
  //   isPrivate: false,
  //   parameters: [
  //     {
  //       name: "pFormat",
  //       type: "String",
  //       isByRef: false,
  //       isOptional: true,
  //     },
  //   ],
  //   range: {
  //     startLine: 0,
  //     startChar: 0,
  //     endLine: 0,
  //     endChar: 0,
  //   },
  //   fileUri: "system://library",
  //   containerName: "Single",
  //   description:
  //     "Converte o valor Single para sua representação em String usando um formato opcional.",
  // },
  {
    name: "Round",
    kind: "method",
    type: "Double",
    isShared: false,
    isPrivate: false,
    parameters: [
      {
        name: "pDecimals",
        type: "Integer",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Single",
    description: "Arredonda o valor para o número de casas decimais especificado.",
  },
];

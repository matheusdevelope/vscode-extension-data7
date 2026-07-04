import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Directory",
    kind: "class",
    type: "IO.Directory",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "IO",
    description: "Classe para manipulação e seleção de diretórios.",
  },
  {
    name: "SelectDialog",
    kind: "method",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pCaption",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pRootDir",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Directory",
    description:
      "Exibe uma caixa de diálogo para seleção de um diretório e retorna o caminho do diretório selecionado.\nCaption - Define um título para a caixa de diálogo.\nRoot - Informe um caminho específico para exibir como diretório raiz ou então informe '' para permitir ao usuário selecionar qualquer pasta.",
  },
  {
    name: "Create",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pPath",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Directory",
    description: "Cria um diretório. Retorna true sempre que o diretório for criado com sucesso.",
  },
  {
    name: "Exists",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pPath",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Directory",
    description: "Verifica se o diretório existe.",
  },
];

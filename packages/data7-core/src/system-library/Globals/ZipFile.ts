import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Zip",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pSourceFile",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pZipFile",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "ZipFile",
    description: "Compacta um arquivo.",
  },
  {
    name: "Unzip",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pZipFile",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pDestDir",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "ZipFile",
    description: "Descompacta um arquivo.",
  },
];

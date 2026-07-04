import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "FormButtons",
    kind: "class",
    type: "FormButtons",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TForm",
    description:
      "Formulário padrão do Data7 com barra de botões inferior (Ok/Cancela/auxiliares) já configurada.",
  },
  {
    name: "btnOK",
    kind: "property",
    type: "ButtonOk",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "FormButtons",
    description: "Botao OK padrao exposto pelo formulario FormButtons.",
  },
];

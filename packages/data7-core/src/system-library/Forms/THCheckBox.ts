import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "THCheckBox",
    kind: "class",
    type: "THCheckBox",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TcxCustomEdit",
    description:
      "Especialização de TcxCustomEdit para entradas textuais. Adiciona Text, seleção, hint inline (TextHint), histórico de Undo e operações de caret/clipboard; é a base de todos os editores textuais DevExpress (TextBox, PasswordTextBox, MaskTextBox, MemoTextBox, etc.).",
  },

];

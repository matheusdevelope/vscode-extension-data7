import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TButtonedEdit",
    kind: "class",
    type: "TButtonedEdit",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TCustomButtonedEdit",
    description:
      "Edit nativo VCL com dois botões opcionais embutidos (`Vcl.ExtCtrls.TButtonedEdit`). Use Images para suprir ícones a partir de um TImageList, referenciados pelas propriedades LeftButton e RightButton herdadas. Não introduz membros próprios além dos herdados de TCustomButtonedEdit.",
  },
  // TButtonedEdit não declara membros próprios — todo o comportamento vem de TCustomButtonedEdit
  // (LeftButton, RightButton, Images, OnLeftButtonClick, OnRightButtonClick) e da cadeia
  // TCustomEdit → TWinControl → TControl → TComponent.
];

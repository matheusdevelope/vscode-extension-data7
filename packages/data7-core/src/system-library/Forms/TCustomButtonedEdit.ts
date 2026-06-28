import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCustomButtonedEdit",
    kind: "class",
    type: "TCustomButtonedEdit",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TCustomEdit",
    description:
      "Classe ancestral VCL (`Vcl.ExtCtrls.TCustomButtonedEdit`) de edits com botões embutidos. Adiciona LeftButton e RightButton (TEditButton) sobre TCustomEdit. Base de TButtonedEdit.",
  },

  // ───────── Properties (LeftButton/RightButton + Images) ─────────
  {
    name: "LeftButton",
    kind: "property",
    type: "Variant",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "TCustomButtonedEdit",
    description:
      "Botão embutido à esquerda do texto (TEditButton). Configurável via ImageIndex, HotImageIndex, PressedImageIndex, DisabledImageIndex, Hint, Visible, Enabled.",
  },
  {
    name: "RightButton",
    kind: "property",
    type: "Variant",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "TCustomButtonedEdit",
    description:
      "Botão embutido à direita do texto (TEditButton). Configurável via ImageIndex, HotImageIndex, PressedImageIndex, DisabledImageIndex, Hint, Visible, Enabled.",
  },
  {
    name: "Images",
    kind: "property",
    type: "Variant",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "TCustomButtonedEdit",
    description:
      "ImageList que fornece os ícones para LeftButton e RightButton. Cada botão referencia via ImageIndex.",
  },

  // ───────── Events ─────────
  {
    name: "OnLeftButtonClick",
    kind: "property",
    type: "TNotifyEvent",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "TCustomButtonedEdit",
    description: "Ocorre quando o usuário clica no botão esquerdo (LeftButton).",
  },
  {
    name: "OnRightButtonClick",
    kind: "property",
    type: "TNotifyEvent",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "TCustomButtonedEdit",
    description: "Ocorre quando o usuário clica no botão direito (RightButton).",
  },
];

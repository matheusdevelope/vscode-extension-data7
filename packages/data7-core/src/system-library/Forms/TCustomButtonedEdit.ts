import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "TCustomButtonedEdit",
  namespaceContainer: "Forms",
  inheritsFrom: "TCustomEdit",
  description:
    "Classe ancestral VCL (`Vcl.ExtCtrls.TCustomButtonedEdit`) de edits com botões embutidos. Adiciona LeftButton e RightButton (TEditButton) sobre TCustomEdit.",
  properties: [
    {
      name: "LeftButton",
      type: "Variant",
      description:
        "Botão embutido à esquerda do texto (TEditButton). Configurável via ImageIndex, HotImageIndex, PressedImageIndex, DisabledImageIndex, Hint, Visible, Enabled.",
    },
    {
      name: "RightButton",
      type: "Variant",
      description:
        "Botão embutido à direita do texto (TEditButton). Configurável via ImageIndex, HotImageIndex, PressedImageIndex, DisabledImageIndex, Hint, Visible, Enabled.",
    },
    {
      name: "Images",
      type: "Variant",
      description:
        "ImageList que fornece os ícones para LeftButton e RightButton. Cada botão referencia via ImageIndex.",
    },
    {
      name: "OnLeftButtonClick",
      type: "TNotifyEvent",
      description: "Ocorre quando o usuário clica no botão esquerdo (LeftButton).",
    },
    {
      name: "OnRightButtonClick",
      type: "TNotifyEvent",
      description: "Ocorre quando o usuário clica no botão direito (RightButton).",
    },
  ],
});

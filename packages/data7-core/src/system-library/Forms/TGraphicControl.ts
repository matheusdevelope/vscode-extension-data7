import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TGraphicControl",
    kind: "class",
    type: "TGraphicControl",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TControl",
    description:
      "Classe base de controles visuais sem janela própria (não possuem handle Windows). Renderizam a si mesmos através do Canvas do controle pai. Ex.: Imagem, formas geométricas, FlatButton.",
  },
  // TGraphicControl praticamente não adiciona membros públicos próprios além de Create/Destroy
  // já herdados de TControl/TComponent — todos os recursos vêm da herança.
];

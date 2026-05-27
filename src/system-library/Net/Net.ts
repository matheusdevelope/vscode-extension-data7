import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Net",
    kind: "namespace",
    type: "Net",
    isShared: true,
    isPrivate: false,
    range: { ...SYSTEM_RANGE },
    fileUri: SYSTEM_URI,
    description:
      "Namespace do ERP Data7 para acesso a serviços de rede (FTP, sockets, etc.). " +
      "Atualmente expõe a classe `TFTP` para conexão e transferência de arquivos via FTP.",
  },
];

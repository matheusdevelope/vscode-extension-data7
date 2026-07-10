import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "FontConfig",
  inheritsFrom: "TFont",
  description: "Gerencia as configurações de fontes (TFont) utilizadas nos componentes.",
});

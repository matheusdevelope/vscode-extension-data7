import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";

/**
 * Tipo primitivo `Extended` do Delphi — número de ponto flutuante de
 * 80 bits (10 bytes). Em x64 é tratado como alias de `Double`, mas o
 * autocomplete original do compilador Data7 usa o nome `Extended` em
 * todas as assinaturas de funções matemáticas do RTL (ver
 * `docs/Documentação Data7/System/instrução.txt`).
 *
 * Declarado aqui apenas para que o auditor (`scripts/audit-system-library.js`)
 * reconheça as referências `type: "Extended"` como tipo válido.
 */
export const symbols: SystemSymbolInfo[] = [
  {
    name: "Extended",
    kind: "class",
    type: "Extended",
    isShared: false,
    isPrivate: false,
    range: { ...SYSTEM_RANGE },
    inheritsFrom: "TPrimitive",
    fileUri: SYSTEM_URI,
    description:
      "Tipo primitivo Delphi de ponto flutuante de precisão estendida (alias de Double em x64).",
  },
];

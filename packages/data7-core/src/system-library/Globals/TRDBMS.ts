import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TRDBMS",
    kind: "class",
    type: "TRDBMS",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description: "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL).",
  },

  buildEnumVal(
    "dbASA",
    "TRDBMS",
    "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL).",
  ),
  buildEnumVal(
    "dbMSSQL",
    "TRDBMS",
    "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL).",
  ),
  buildEnumVal(
    "dbPostgreSQL",
    "TRDBMS",
    "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL).",
  ),
];

import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TRDBMS",
  description: "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL).",
  values: [
    ["dbASA", "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL)."],
    ["dbMSSQL", "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL)."],
    ["dbPostgreSQL", "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL)."],
  ],
});

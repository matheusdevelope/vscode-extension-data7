import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Connection",
    kind: "class",
    type: "Connection",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "SQL",
    inheritsFrom: "TObject",
    description: "Classe global que representa a conexão atual com o banco de dados.",
  },

  // ───────── Transações ─────────
  {
    name: "StartTransaction",
    kind: "method",
    type: "Void",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pDescricao",
        type: "String",
        isByRef: false,
        isOptional: true,
        defaultValue: '""',
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Connection",
    description:
      "Inicia uma transação na conexão atual. Permite informar uma descrição opcional registrada nos logs.",
  },
  {
    name: "Commit",
    kind: "method",
    type: "Void",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pDescricao",
        type: "String",
        isByRef: false,
        isOptional: true,
        defaultValue: '""',
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Connection",
    description:
      "Confirma a transação ativa e persiste todas as alterações realizadas desde StartTransaction.",
  },
  {
    name: "Rollback",
    kind: "method",
    type: "Void",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Connection",
    description: "Descarta todas as alterações da transação ativa e a finaliza.",
  },
  {
    name: "InTransaction",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Connection",
    description: "Retorna True quando há uma transação ativa nesta conexão.",
  },
  {
    name: "DefaultSchema",
    kind: "method",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Connection",
    description: "Retorna o schema padrão usado para resolver nomes de objetos no banco.",
  },

  // ───────── Informação do RDBMS ─────────
  {
    name: "RDBMS",
    kind: "property",
    type: "TRDBMS",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Connection",
    description: "Tipo de RDBMS ativo no ERP (ex: ASA, MSSQL, POSTGRESQL).",
  },
];

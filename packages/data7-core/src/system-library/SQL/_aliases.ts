import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";

/**
 * Aliases e tipos auxiliares usados pelas propriedades de `SQL.Command` que
 * vêm da cadeia FireDAC (TFDQuery → TFDCustomQuery → TFDDataSet → TDataSet).
 *
 * Estes tipos são referenciados como `type:` em `Command.ts` (ex.:
 * `TFDDataSetEvent`, `TFilterOptions`). Sem uma declaração aqui, o linter
 * emite `missing-import`/`unknown-member` quando o usuário declara
 * `Dim x As TFDDataSetEvent` ou usa o tipo em uma expressão.
 *
 * Todos os tipos são modelados como classes vazias herdando de `TObject`
 * (apenas estrutural — não há membros para resolver). Eventos FireDAC viram
 * delegates conceituais, mas como o resolver de tipos do Data7 trata
 * delegate/class de forma similar quando não há invocação direta, manter
 * `kind: "class"` é o caminho seguro.
 */

interface AliasSpec {
  readonly name: string;
  readonly inheritsFrom?: string;
  readonly description: string;
}

const aliases: readonly AliasSpec[] = [
  // ───────── Enumerações / sets do FireDAC ─────────
  {
    name: "TFDStoredActivationUsage",
    description: "Conjunto de flags que controla a persistência do estado Active.",
  },
  {
    name: "TFilterOptions",
    description: "Conjunto de opções do filtro local (case-insensitive, no-partial-compare, …).",
  },
  {
    name: "TFDUpdateRecordTypes",
    description:
      "Conjunto de tipos de registro filtrados pelo cache de updates (urInserted/urModified/urDeleted/urUnmodified).",
  },
  // {
  //   name: "TRDBMS",
  //   description: "Identificador do RDBMS conectado (dbASA, dbMSSQL, dbPostgreSQL).",
  // },

  // ───────── Tipos de evento (delegates) ─────────
  {
    name: "TDataSetNotifyEvent",
    description: "Delegate de evento `(DataSet As TDataSet)` usado por Before*/After*.",
  },
  {
    name: "TFilterRecordEvent",
    description:
      "Delegate de evento `(DataSet As TDataSet, ByRef Accept As Boolean)` usado por OnFilterRecord.",
  },
  {
    name: "TFDDataSetEvent",
    description:
      "Delegate de evento FireDAC `(DataSet As TFDDataSet, AEventKind As TFDEventKind)` usado por Before/AfterExecute, BeforeGetRecords, etc.",
  },
  {
    name: "TFDAfterApplyUpdatesEvent",
    description:
      "Delegate `(DataSet As TFDDataSet, AErrors As Integer)` disparado após ApplyUpdates.",
  },
  {
    name: "TFDErrorEvent",
    description:
      "Delegate `(ASender As TObject, AInitiator As IFDStanObject, ByRef AException As Exception)` para o evento OnError.",
  },

  // ───────── Classes auxiliares ─────────
  {
    name: "TFDDataSet",
    inheritsFrom: "TObject",
    description:
      "Ancestral comum dos DataSets FireDAC. Aqui presente como tipo nomeado (membros expostos em SQL.Command).",
  },
];

const symbolsBuilt: SystemSymbolInfo[] = aliases.map((a) => ({
  name: a.name,
  kind: "class",
  type: a.name,
  isShared: false,
  isPrivate: false,
  range: { ...SYSTEM_RANGE },
  fileUri: SYSTEM_URI,
  containerName: "SQL",
  inheritsFrom: a.inheritsFrom,
  description: a.description,
}));

export const symbols: SystemSymbolInfo[] = symbolsBuilt;

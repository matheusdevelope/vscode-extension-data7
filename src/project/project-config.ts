import * as fs from "fs";
import type { ProjectMetadata, ProjectOptions } from "./project-metadata";

/**
 * Single source of truth for reading and narrowing `data7.json` files.
 *
 * Every service that needs to consult the project descriptor consumes this
 * helper instead of repeating `JSON.parse(fs.readFileSync(...)) as ...`
 * plus an ad-hoc `isRecord` guard. When the schema evolves, only this
 * module changes.
 *
 * The module exposes:
 *
 *   - {@link isRecord} — small reusable type guard.
 *   - {@link parseProjectConfig} — pure: takes a JSON string, returns a
 *     narrowed snapshot.
 *   - {@link readProjectConfig} — convenience wrapper that reads from disk
 *     and returns `undefined` when the file does not exist.
 *   - {@link writeProjectConfig} — writes back, preserving unknown keys.
 *
 * The narrowed snapshot is a `Readonly<...>` view. Mutations go through
 * {@link writeProjectConfig} which expects the original raw record, so
 * callers can `{ ...config.raw, opcoes: { ...config.opcoes, X } }` without
 * worrying about losing unknown extension keys.
 */

/** Reusable narrowing helper. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrowed snapshot of a parsed `data7.json`. Only the fields the extension
 * actually consumes are surfaced as typed top-level properties; the original
 * parsed shape is preserved as {@link raw} so write-back operations can
 * round-trip unknown keys safely.
 */
export interface ProjectConfig {
  /** Original parsed object — never loses keys that the typed view does not project. */
  readonly raw: Record<string, unknown>;
  /** Project name. Falls back to the empty string when missing or malformed. */
  readonly nome: string;
  /** Typed snapshot of `opcoes`. Missing fields default to safe values. */
  readonly opcoes: Readonly<ProjectOptions>;
  /** Map of `{ moduleName: version }`. Empty record when absent. */
  readonly dependencies: Readonly<Record<string, string>>;
  /** Convenience accessor for `opcoes.identificacaoBancoDados`. */
  readonly databaseConnectionId: string;
}

const DEFAULT_OPCOES: Readonly<ProjectOptions> = Object.freeze({
  autor: "",
  versao: "1.0.0.0",
  informacoes: "",
  codEmpresa: 1,
  codFilial: 1,
  nomeUsuario: "Administrador",
  preScript: "",
  identificacaoBancoDados: "",
});

/**
 * Parses + narrows a `data7.json` from a JSON string.
 *
 * Throws when the input is not valid JSON or the root is not an object. Use
 * {@link readProjectConfig} for a convenience wrapper that handles a missing
 * file gracefully.
 */
export function parseProjectConfig(text: string): ProjectConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`data7.json inválido: ${message}`);
  }
  if (!isRecord(parsed)) {
    throw new Error("data7.json: esperado um objeto JSON na raiz.");
  }
  return narrow(parsed);
}

/**
 * Reads + parses + narrows a `data7.json` from disk. Returns `undefined` when
 * the file does not exist. Throws when the file exists but is malformed —
 * callers can `try/catch` to log and degrade.
 */
export function readProjectConfig(configPath: string): ProjectConfig | undefined {
  if (!fs.existsSync(configPath)) return undefined;
  return parseProjectConfig(fs.readFileSync(configPath, "utf-8"));
}

/**
 * Writes a (possibly mutated) project metadata back to disk as pretty-printed
 * JSON. Centralised so callers do not re-derive the indentation choice.
 */
export function writeProjectConfig(configPath: string, metadata: ProjectMetadata): void {
  fs.writeFileSync(configPath, JSON.stringify(metadata, null, 2), "utf-8");
}

function narrow(raw: Record<string, unknown>): ProjectConfig {
  const nome = typeof raw.nome === "string" ? raw.nome : "";
  const opcoesRaw = isRecord(raw.opcoes) ? raw.opcoes : {};
  const opcoes: ProjectOptions = {
    autor: typeof opcoesRaw.autor === "string" ? opcoesRaw.autor : DEFAULT_OPCOES.autor,
    versao: typeof opcoesRaw.versao === "string" ? opcoesRaw.versao : DEFAULT_OPCOES.versao,
    informacoes:
      typeof opcoesRaw.informacoes === "string"
        ? opcoesRaw.informacoes
        : DEFAULT_OPCOES.informacoes,
    codEmpresa:
      typeof opcoesRaw.codEmpresa === "number" ? opcoesRaw.codEmpresa : DEFAULT_OPCOES.codEmpresa,
    codFilial:
      typeof opcoesRaw.codFilial === "number" ? opcoesRaw.codFilial : DEFAULT_OPCOES.codFilial,
    nomeUsuario:
      typeof opcoesRaw.nomeUsuario === "string"
        ? opcoesRaw.nomeUsuario
        : DEFAULT_OPCOES.nomeUsuario,
    preScript:
      typeof opcoesRaw.preScript === "string" ? opcoesRaw.preScript : DEFAULT_OPCOES.preScript,
    identificacaoBancoDados:
      typeof opcoesRaw.identificacaoBancoDados === "string"
        ? opcoesRaw.identificacaoBancoDados
        : DEFAULT_OPCOES.identificacaoBancoDados,
    minify: typeof opcoesRaw.minify === "boolean" ? opcoesRaw.minify : undefined,
    stripComments:
      typeof opcoesRaw.stripComments === "boolean" ? opcoesRaw.stripComments : undefined,
  };
  const dependencies: Record<string, string> = {};
  if (isRecord(raw.dependencies)) {
    for (const [k, v] of Object.entries(raw.dependencies)) {
      if (typeof v === "string") dependencies[k] = v;
    }
  }
  return {
    raw,
    nome,
    opcoes,
    dependencies,
    databaseConnectionId: opcoes.identificacaoBancoDados,
  };
}

import "../_setup/global-hooks";
import * as fs from "fs";
import * as path from "path";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { SYSTEM_SYMBOLS } from "../../system-library";
import type { SymbolInfo } from "../../analysis/symbol-indexer";

/**
 * Regression coverage between `docs/Documentação Data7/**\/instrução.txt`
 * (planilha canônica do autocomplete do ERP) e `src/system-library`.
 *
 * Cada linha `Categoria,Nome,…,Suportado` da planilha vira uma asserção:
 *   - Se `Suportado=Sim`, o símbolo deve ser localizável (no container alvo
 *     ou via cadeia de herança).
 *   - Se `Suportado=Não`, o símbolo deve existir E carregar
 *     `isUnsupported: true` em pelo menos uma das definições encontradas.
 *
 * Quando um membro da planilha não aparecer no `SYSTEM_SYMBOLS`, este teste
 * falha — mantendo a documentação e o linter sincronizados.
 */

interface InstrucaoTarget {
  /** Caminho do arquivo de instrução, relativo à raiz do repo. */
  readonly file: string;
  /** Container alvo (`Command`, `Report`, `IXMLNode`, …) ou namespace (`System`). */
  readonly container: string;
  /** Quando o container é um namespace puro (não há "classe alvo"). */
  readonly isNamespace?: boolean;
}

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const REPO_ROOT_FALLBACK = path.resolve(__dirname, "..", "..", "..");

function resolveRepoFile(relative: string): string {
  for (const root of [REPO_ROOT, REPO_ROOT_FALLBACK]) {
    const candidate = path.join(root, relative);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Arquivo de instrução não encontrado em nenhum dos roots: ${relative}`);
}

/**
 * Mapeamento explícito (pasta → container do system-library).
 */
const TARGETS: readonly InstrucaoTarget[] = [
  {
    file: "docs/Documentação Data7/Data7/Report/instrução.txt",
    container: "Report",
  },
  {
    file: "docs/Documentação Data7/Global/TJSONArray/instrução.txt",
    container: "TJSONArray",
  },
  {
    file: "docs/Documentação Data7/Global/TJSONObject/instrução.txt",
    container: "TJSONObject",
  },
  { file: "docs/Documentação Data7/SQL/Command/instrução.txt", container: "Command" },
  { file: "docs/Documentação Data7/SQL/Connection/instrução.txt", container: "Connection" },
  { file: "docs/Documentação Data7/System/instrução.txt", container: "System", isNamespace: true },
  { file: "docs/Documentação Data7/XML/IXMLNode/instrução.txt", container: "IXMLNode" },
  { file: "docs/Documentação Data7/XML/IXMLNodeList/instrução.txt", container: "IXMLNodeList" },
  {
    file: "docs/Documentação Data7/XML/TXMLDocument/instrução.txt",
    container: "TXMLDocument",
  },
];

interface InstrucaoRow {
  readonly category: string;
  readonly name: string;
  readonly supported: boolean;
  /** Linha original (para mensagens de erro). */
  readonly raw: string;
}

/**
 * Parser CSV mínimo que tolera campos entre aspas (com vírgulas internas).
 * Não tenta ser RFC 4180 — só o suficiente para as planilhas do Data7.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((c) => c.trim());
}

function parseInstrucao(filePath: string): InstrucaoRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  const rows: InstrucaoRow[] = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const cols = parseCsvLine(raw);
    if (cols.length < 4) continue;
    const category = cols[0];
    if (!category || !["Property", "Sub", "Function", "Type", "Const"].includes(category)) continue;
    const name = cols[1];
    if (!name) continue;
    // Coluna "Suportado" é sempre a última (pode ser índice 3 ou 4 quando há
    // a coluna `Valor` extra para Const).
    const supportedCol = (cols[cols.length - 1] ?? "").toLowerCase();
    const supported = supportedCol === "sim";
    rows.push({ category, name, supported, raw });
  }
  return rows;
}

function resolveInChain(startContainer: string, memberName: string): readonly SymbolInfo[] {
  const visited = new Set<string>();
  let currentContainer: string | undefined = startContainer;
  const matches: SymbolInfo[] = [];

  while (currentContainer && !visited.has(currentContainer.toLowerCase())) {
    visited.add(currentContainer.toLowerCase());

    for (const s of SYSTEM_SYMBOLS) {
      if (s.containerName?.toLowerCase() !== currentContainer.toLowerCase()) continue;
      if (s.name.toLowerCase() === memberName.toLowerCase()) matches.push(s);
    }

    const parent = SYSTEM_SYMBOLS.find(
      (s) => s.kind === "class" && s.name.toLowerCase() === currentContainer?.toLowerCase(),
    );
    currentContainer = parent?.inheritsFrom;
  }

  return matches;
}

/**
 * Nomes que apareceram como "(vazio)" ou que são wrappers de baixo nível
 * legados pelos quais não vamos exigir presença explícita.
 *
 * O motivo de pular cada um deve ser claro para evitar drift; por isso
 * organizamos os opt-outs aqui em vez de espalhar nos targets.
 */
const SKIPLIST: ReadonlySet<string> = new Set<string>([
  // Aliases puros do RTL (System) que só servem como type annotation —
  // verificamos pela existência via `kind === "class"`, mas eles entram
  // como "Type" e não precisam de cobertura individual aqui.
  "PInteger",
  "PSmallInt",
  "PShortInt",
  "PCardinal",
  "PWord",
  "PByte",
  "PInt64",
  "PSingle",
  "PDouble",
  "PExtended",
  "PCurrency",
  "PVariant",
  "PPointer",
  "PBoolean",
  "PLongint",
  "PLongword",
  "PDate",
  "PAnsiChar",
  "PPInteger",
  "PPSmallInt",
  "PPShortInt",
  "PPCardinal",
  "PPWord",
  "PPByte",
  "PPInt64",
  "PPSingle",
  "PPDouble",
  "PPExtended",
  "PPCurrency",
  "PPVariant",
  "PPPointer",
  "PPBoolean",
  "PPWideChar",
  "PPAnsiChar",
  "PWideString",
  "PAnsiString",
  "PUTF8String",
  "PUCS2Char",
  "PUCS4Char",
  "PUCS4CharArray",
  "PDispatch",
  "PPDispatch",
  "PError",
  "PWordBool",
  "PUnknown",
  "PPUnknown",
  "POleVariant",
  "PDateTime",
  "PVarData",
  "PCallDesc",
  "PDispDesc",
  "PVarRec",
  "PResStringRec",
  "UCS2Char",
  "UCS4Char",
  "TUCS4CharArray",
  "IntegerArray",
  "PIntegerArray",
  "PointerArray",
  "PPointerArray",
  "TBoundArray",
  "TPCharArray",
  "PPCharArray",
  "TVarArrayBound",
  "TVarArrayBoundArray",
  "PVarArrayBoundArray",
  "TVarArrayCoorArray",
  "PVarArrayCoorArray",
  "TVarArray",
  "TVarOp",
  "TCallDesc",
  "TDispDesc",
  "TInterfaceEntry",
  "PInterfaceEntry",
  "TInterfaceTable",
  "TDispatchMessage",
  "IInvokable",
  "TResStringRec",
  "HRSRC",
  "TResourceHandle",
  "HINST",
  "HGLOBAL",
  // Métodos de baixo nível do TObject expostos pelo autocomplete original
  // mas que o linter resolve via TObject. Cobertos pelos testes de
  // inheritance-chain em system-library.test.ts.
]);

/**
 * Quando o mesmo membro aparece em mais de uma seção da planilha (porque
 * a coluna gerada agregava várias classes da hierarquia), tratamos a
 * presença de qualquer `Sim` como suporte habilitado — a versão `Não`
 * geralmente representa um overload interno/privado já coberto pela
 * versão `Sim`. Para o teste de `isUnsupported` exigimos que **todas** as
 * ocorrências do nome sejam `Não`.
 */
function aggregateRows(rows: readonly InstrucaoRow[]) {
  const byName = new Map<string, { category: string; rows: InstrucaoRow[] }>();
  for (const row of rows) {
    const key = `${row.category}::${row.name.toLowerCase()}`;
    const entry = byName.get(key);
    if (entry) {
      entry.rows.push(row);
    } else {
      byName.set(key, { category: row.category, rows: [row] });
    }
  }
  return [...byName.values()].map((entry) => {
    // `entry.rows` is always non-empty (added via `byName.set/push`).
    const first = entry.rows[0]!;
    return {
      category: entry.category,
      name: first.name,
      supportedAggregate: entry.rows.some((r) => r.supported),
      allUnsupported: entry.rows.every((r) => !r.supported),
      rawSample: first.raw,
    };
  });
}

describe("System Library — cobertura das planilhas de instrução", () => {
  for (const target of TARGETS) {
    const filePath = resolveRepoFile(target.file);
    const rows = parseInstrucao(filePath);
    const aggregated = aggregateRows(rows);

    describe(`${target.container} (${path.basename(target.file)})`, () => {
      for (const agg of aggregated) {
        if (SKIPLIST.has(agg.name)) continue;

        const label = `${agg.category} ${agg.name} ${agg.supportedAggregate ? "(Sim)" : "(Não)"}`;
        test(label, () => {
          const matches = resolveInChain(target.container, agg.name);

          assert.ok(
            matches.length > 0,
            `${agg.category} ${agg.name} não encontrado em ${target.container} nem em sua cadeia de herança.\nLinha-amostra: ${agg.rawSample}`,
          );

          if (agg.allUnsupported) {
            const hasUnsupported = matches.some((m) => m.isUnsupported === true);
            assert.ok(
              hasUnsupported,
              `${agg.category} ${agg.name} aparece exclusivamente como "Não" na planilha mas nenhuma definição em ${target.container} (ou ancestrais) tem isUnsupported=true.\nLinha-amostra: ${agg.rawSample}`,
            );
          }
        });
      }
    });
  }
});

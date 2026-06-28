import "./_setup/global-hooks";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { TypeResolver } from "../analysis/type-resolver";
import { DiagnosticsLinter, DiagnosticsASTWalker } from "../diagnostics/diagnostics";
import { buildMockDocument } from "../utils/text-edit-utils";
import { perfStats, clearPerfStats } from "../utils/performance";

// Interceptadores dinâmicos para coletar estatísticas detalhadas de cada função estática de TypeResolver
function interceptStaticMethod(cls: any, name: string) {
  const original = cls[name];
  if (typeof original !== "function") return;
  cls[name] = function (this: any, ...args: any[]) {
    const t0 = performance.now();
    try {
      return original.apply(this, args);
    } finally {
      const elapsed = performance.now() - t0;
      let stats = perfStats.get(name);
      if (!stats) {
        stats = { name, calls: 0, totalTime: 0 };
        perfStats.set(name, stats);
      }
      stats.calls++;
      stats.totalTime += elapsed;
    }
  };
}

// Intercepta métodos do prototype de DiagnosticsASTWalker
function interceptPrototypeMethod(cls: any, name: string) {
  const original = cls.prototype[name];
  if (typeof original !== "function") return;
  cls.prototype[name] = function (this: any, ...args: any[]) {
    const t0 = performance.now();
    try {
      return original.apply(this, args);
    } finally {
      const elapsed = performance.now() - t0;
      const key = `Walker.${name}`;
      let stats = perfStats.get(key);
      if (!stats) {
        stats = { name: key, calls: 0, totalTime: 0 };
        perfStats.set(key, stats);
      }
      stats.calls++;
      stats.totalTime += elapsed;
    }
  };
}

// Habilita as interceptações antes da execução
const typeResolverMethods = [
  "getVariableType",
  "findVariableSymbol",
  "getRawVariableType",
  "resolveExpressionType",
  "resolveExpressionTypeRaw",
  "findUnqualifiedCallable",
  "resolveIdentifierType",
  "findMember",
  "findMemberInternal",
  "findClassSymbol",
  "getGenericParametersInScope",
  "getInheritedMembers",
];

for (const m of typeResolverMethods) {
  interceptStaticMethod(TypeResolver, m);
}

const walkerMethods = ["walk", "checkMemberAccess", "checkAssignment", "checkVariableDeclaration"];

for (const wm of walkerMethods) {
  interceptPrototypeMethod(DiagnosticsASTWalker, wm);
}

// Sobrescreve walk para coletar tempo por tipo de nó
const originalWalk = DiagnosticsASTWalker.prototype.walk;
DiagnosticsASTWalker.prototype.walk = function (this: any, node: any) {
  const t0 = performance.now();
  try {
    originalWalk.call(this, node);
    return;
  } finally {
    const elapsed = performance.now() - t0;
    const key = `Walker.walk[${node.kind}]`;
    let stats = perfStats.get(key);
    if (!stats) {
      stats = { name: key, calls: 0, totalTime: 0 };
      perfStats.set(key, stats);
    }
    stats.calls++;
    stats.totalTime += elapsed;
  }
};

async function runProfile() {
  const targetDir = "C:\\Users\\Matheus\\Downloads\\teste\\Conciliacao de Cartoes V4.8";
  if (!fs.existsSync(targetDir)) {
    console.log(`Pasta alvo não encontrada: ${targetDir}. profiling local src/.`);
    return;
  }
  console.log(`Profilando diretório do projeto real: ${targetDir}`);
  await profileDir(targetDir);
}

function findBasFiles(dir: string, results: string[] = []) {
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file.toLowerCase() !== "node_modules" && file.toLowerCase() !== ".git") {
        findBasFiles(filePath, results);
      }
    } else {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".bas" || ext === ".d7b") {
        results.push(filePath);
      }
    }
  }
  return results;
}

async function profileDir(dir: string) {
  const files = findBasFiles(dir);
  console.log(`Total de arquivos .bas/.d7b encontrados: ${files.length}`);
  if (files.length === 0) return;

  const filesData = files.map((f) => ({
    path: f,
    content: fs.readFileSync(f, "utf8"),
  }));

  console.log("\n1. Indexando workspace...");
  const indexer = WorkspaceSymbolIndexer.getInstance();
  const t0Index = performance.now();
  for (const file of filesData) {
    const fileUri = `file:///${file.path.replace(/\\/g, "/")}`;
    indexer.updateFileContent(fileUri, file.content);
  }
  const t1Index = performance.now();
  console.log(`Tempo de indexação: ${(t1Index - t0Index).toFixed(2)} ms`);

  console.log("\n2. Executando Linter em TODOS os arquivos para coletar estatísticas agregadas...");
  clearPerfStats();
  const t0LintAll = performance.now();

  for (const file of filesData) {
    const fileUri = `file:///${file.path.replace(/\\/g, "/")}`;
    const mockDoc = buildMockDocument({ toString: () => fileUri } as any, file.content);
    try {
      DiagnosticsLinter.runAdvancedDiagnostics(mockDoc, indexer);
    } catch {}
  }
  const t1LintAll = performance.now();
  console.log(`Tempo total para lintar 119 arquivos: ${(t1LintAll - t0LintAll).toFixed(2)} ms`);

  console.log(
    "\n3. Relatório de Métricas Agregadas do Linter e TypeResolver (Ordenado por Custo):",
  );
  const statsArray = Array.from(perfStats.values());
  statsArray.sort((a, b) => b.totalTime - a.totalTime);

  console.log("--------------------------------------------------------------------------------");
  console.log(
    `${"Nome da Função / Operação".padEnd(45)} | ${"Chamadas".padStart(10)} | ${"Tempo Total".padStart(12)} | ${"Tempo Médio".padStart(10)}`,
  );
  console.log("--------------------------------------------------------------------------------");
  for (const s of statsArray) {
    const avg = s.calls > 0 ? s.totalTime / s.calls : 0;
    console.log(
      `${s.name.padEnd(45)} | ${s.calls.toString().padStart(10)} | ${s.totalTime.toFixed(2).padStart(9)} ms | ${avg.toFixed(4).padStart(7)} ms`,
    );
  }
  console.log("--------------------------------------------------------------------------------");
}

runProfile().catch(console.error);

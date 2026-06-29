#!/usr/bin/env node
import "@data7/core/dist/mcp/runtime/install-shim";
import { loadDotEnv, ModuleOrchestrator, Builder, DiagnosticsLinter, WorkspaceSymbolIndexer } from "@data7/core";

// Load .env configuration in the current working directory
loadDotEnv(process.cwd());
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  printHelp();
  process.exit(1);
}

const workspaceDir = process.cwd();

async function run() {
  switch (command) {
    case "sync":
      console.log(`[data7-cli] Sincronizando dependências no workspace: ${workspaceDir}...`);
      try {
        const synced = await ModuleOrchestrator.syncDependencies(workspaceDir);
        if (synced.length > 0) {
          console.log(`[data7-cli] Sincronização concluída com sucesso:`);
          synced.forEach(s => console.log(`  - ${s}`));
        } else {
          console.log(`[data7-cli] Todas as dependências já estão sincronizadas.`);
        }
      } catch (err: any) {
        console.error(`[data7-cli] Erro ao sincronizar dependências: ${err.message}`);
        process.exit(1);
      }
      break;

    case "publish-local":
      console.log(`[data7-cli] Publicando módulo localmente a partir de: ${workspaceDir}...`);
      try {
        await ModuleOrchestrator.publishModuleLocally(workspaceDir);
        console.log(`[data7-cli] Módulo publicado localmente com sucesso!`);
      } catch (err: any) {
        console.error(`[data7-cli] Erro ao publicar módulo localmente: ${err.message}`);
        process.exit(1);
      }
      break;

    case "publish-online":
      console.log(`[data7-cli] Iniciando publicação online a partir de: ${workspaceDir}...`);
      try {
        const prUrl = await ModuleOrchestrator.publishModuleOnline(workspaceDir, (userCode, verificationUri) => {
          console.log(`\n=============================================================`);
          console.log(`AUTENTICAÇÃO NECESSÁRIA COM O GITHUB`);
          console.log(`Por favor, acesse o link no seu navegador:`);
          console.log(`  ${verificationUri}`);
          console.log(`E insira o seguinte código de ativação:`);
          console.log(`  ${userCode}`);
          console.log(`=============================================================\n`);
        });
        console.log(`\n[data7-cli] Módulo publicado e Pull Request criado com sucesso!`);
        console.log(`[data7-cli] Link do PR: ${prUrl}`);
      } catch (err: any) {
        console.error(`[data7-cli] Erro ao publicar módulo online: ${err.message}`);
        process.exit(1);
      }
      break;

    case "build":
      console.log(`[data7-cli] Compilando projeto no workspace: ${workspaceDir}...`);
      try {
        const projectFilePath = findProjectFile(workspaceDir);
        if (!projectFilePath) {
          console.error(`[data7-cli] Erro: Arquivo de projeto .7proj não encontrado no workspace.`);
          process.exit(1);
        }
        
        Builder.buildProject(workspaceDir, projectFilePath);
        console.log(`[data7-cli] Compilação concluída com sucesso!`);
      } catch (err: any) {
        console.error(`[data7-cli] Erro durante a compilação: ${err.message}`);
        process.exit(1);
      }
      break;

    case "lint":
      console.log(`[data7-cli] Executando análise estática (linter)...`);
      try {
        const srcFiles = getBasFilesRecursive(path.join(workspaceDir, "src"));
        const moduleFiles = getBasFilesRecursive(path.join(workspaceDir, "data7_modules"));
        const allFiles = [...srcFiles, ...moduleFiles];

        if (srcFiles.length === 0) {
          console.log("[data7-cli] Nenhum arquivo .bas encontrado para análise no diretório src/.");
          break;
        }

        console.log(`[data7-cli] Indexando ${allFiles.length} arquivos...`);
        const indexer = WorkspaceSymbolIndexer.getInstance();
        
        // 1. Index all files first to resolve cross-references correctly
        const fileContents: Record<string, string> = {};
        for (const file of allFiles) {
          const content = fs.readFileSync(file, "utf-8");
          const fileUri = vscode.Uri.file(file);
          fileContents[file] = content;
          indexer.updateFileContent(fileUri.toString(), content);
        }

        // 2. Run diagnostics on each file in src/
        let totalErrors = 0;
        let totalWarnings = 0;
        const linter = new DiagnosticsLinter();

        for (const file of srcFiles) {
          const content = fileContents[file]!;
          const fileUri = vscode.Uri.file(file);
          
          // Create a mock document suitable for DiagnosticsLinter
          const mockDoc: any = {
            uri: fileUri,
            fileName: file,
            languageId: "d7basic",
            lineCount: content.split(/\r?\n/).length,
            getText: () => content
          };

          const diagnostics = linter.runDiagnostics(mockDoc, indexer);

          if (diagnostics.length > 0) {
            console.log(`\nArquivo: ${path.relative(workspaceDir, file)}`);
            for (const diag of diagnostics) {
              const severityText = diag.severity === vscode.DiagnosticSeverity.Error ? "ERRO" : "AVISO";
              console.log(`  [${severityText}] Linha ${diag.range.start.line + 1}: ${diag.message}`);
              if (diag.severity === vscode.DiagnosticSeverity.Error) totalErrors++;
              else totalWarnings++;
            }
          }
        }

        console.log(`\n[data7-cli] Linter finalizado: ${totalErrors} erros, ${totalWarnings} avisos.`);
        if (totalErrors > 0) {
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`[data7-cli] Erro ao executar linter: ${err.message}`);
        process.exit(1);
      }
      break;

    case "help":
    default:
      printHelp();
      break;
  }
}

function printHelp() {
  console.log(`
Uso: data7 <comando> [opções]

Comandos disponíveis:
  sync            Sincroniza e instala as dependências declaradas no data7.json.
  build           Compila o projeto Data7 (.7proj) ativo no workspace.
  lint            Executa o linter estático em todos os arquivos .bas no diretório src/.
  publish-local   Publica o módulo atual localmente de forma privada.
  publish-online  Publica o módulo online criando Fork e Pull Request no GitHub.
  help            Exibe este menu de ajuda.
`);
}

function findProjectFile(dir: string): string | null {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.toLowerCase().endsWith(".7proj")) {
      return path.join(dir, file);
    }
  }
  return null;
}

function getBasFilesRecursive(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getBasFilesRecursive(filePath));
    } else if (filePath.toLowerCase().endsWith(".bas")) {
      results.push(filePath);
    }
  }
  return results;
}

run();

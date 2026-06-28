const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

try {
  console.log("Iniciando validação de Pull Request para módulos...");

  // Get list of changed files compared to origin/main
  const diffOutput = execSync("git diff --name-only origin/main...HEAD", { encoding: "utf-8" });
  const changedFiles = diffOutput.split("\n").map(f => f.trim()).filter(f => f.length > 0);

  if (changedFiles.length === 0) {
    console.log("Nenhum arquivo alterado detectado.");
    process.exit(0);
  }

  console.log(`Arquivos alterados:\n${changedFiles.map(f => `  - ${f}`).join("\n")}`);

  // Rule 1: Barrier of scope - check if any file is modified outside 'modules/'
  const filesOutsideModules = changedFiles.filter(f => !f.startsWith("modules/"));
  if (filesOutsideModules.length > 0) {
    console.error("ERRO: Modificações de arquivos fora do diretório 'modules/' não são permitidas neste PR.");
    console.error(`Arquivos fora do escopo:\n${filesOutsideModules.map(f => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }

  // Rule 2: Atomicity - only one module folder can be changed
  const moduleFolders = new Set();
  for (const file of changedFiles) {
    const parts = file.split("/");
    if (parts.length > 1 && parts[0] === "modules") {
      moduleFolders.add(parts[1]);
    }
  }

  if (moduleFolders.size > 1) {
    console.error(`ERRO: Apenas um único módulo pode ser adicionado ou alterado por Pull Request. Módulos detectados: ${Array.from(moduleFolders).join(", ")}`);
    process.exit(1);
  }

  if (moduleFolders.size === 0) {
    console.log("Nenhuma alteração em pastas de módulos. Validação concluída.");
    process.exit(0);
  }

  const moduleName = Array.from(moduleFolders)[0];
  const moduleDir = path.join("modules", moduleName);
  const manifestPath = path.join(moduleDir, "data7.json");

  // Rule 3: Conformity of Name - check if name in data7.json matches folder name
  if (!fs.existsSync(manifestPath)) {
    console.error(`ERRO: O arquivo 'data7.json' não foi encontrado na pasta do módulo: ${moduleDir}`);
    process.exit(1);
  }

  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  let manifest;
  try {
    manifest = JSON.parse(manifestContent);
  } catch (err) {
    console.error(`ERRO: Falha ao fazer parse do arquivo 'data7.json': ${err.message}`);
    process.exit(1);
  }

  if (!manifest.nome || typeof manifest.nome !== "string") {
    console.error("ERRO: O campo 'nome' no arquivo 'data7.json' é obrigatório.");
    process.exit(1);
  }

  if (manifest.nome.toLowerCase() !== moduleName.toLowerCase()) {
    console.error(`ERRO: O nome do diretório físico ('${moduleName}') deve ser idêntico ao campo 'nome' no 'data7.json' ('${manifest.nome}').`);
    process.exit(1);
  }

  console.log(`Validação bem-sucedida para o módulo: ${manifest.nome} v${manifest.version || "1.0.0.0"}`);
  process.exit(0);

} catch (err) {
  console.error("Falha inesperada durante a validação:", err);
  process.exit(1);
}

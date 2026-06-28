const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

try {
  console.log("Iniciando processamento de release para módulos...");

  // Get the last commit's modified files to identify the module changed
  const diffOutput = execSync("git diff --name-only HEAD~1 HEAD", { encoding: "utf-8" });
  const changedFiles = diffOutput.split("\n").map(f => f.trim()).filter(f => f.length > 0);

  const moduleFolders = new Set();
  for (const file of changedFiles) {
    const parts = file.split("/");
    if (parts.length > 1 && parts[0] === "modules") {
      moduleFolders.add(parts[1]);
    }
  }

  if (moduleFolders.size === 0) {
    console.log("Nenhuma alteração em módulos detectada no último commit.");
    process.exit(0);
  }

  if (moduleFolders.size > 1) {
    console.error("Aviso: Múltiplos módulos modificados em um único commit. Processando apenas o primeiro.");
  }

  const moduleName = Array.from(moduleFolders)[0];
  const moduleDir = path.join("modules", moduleName);
  const manifestPath = path.join(moduleDir, "data7.json");

  if (!fs.existsSync(manifestPath)) {
    console.error(`Erro: manifesto data7.json não encontrado para ${moduleName}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const version = manifest.version || "1.0.0.0";
  const normalizedModuleName = manifest.nome || moduleName;

  // Pattern: nome-do-modulo-vX.Y.Z
  const tagName = `${normalizedModuleName.toLowerCase()}-v${version}`;
  console.log(`Módulo identificado: ${normalizedModuleName}`);
  console.log(`Versão identificada: ${version}`);
  console.log(`Tag Git gerada: ${tagName}`);

  // Configure git user for tagging
  execSync("git config user.name 'github-actions[bot]'");
  execSync("git config user.email 'github-actions[bot]@users.noreply.github.com'");

  // Check if tag already exists
  try {
    const existingTags = execSync(`git tag -l "${tagName}"`, { encoding: "utf-8" }).trim();
    if (existingTags === tagName) {
      console.log(`Tag ${tagName} já existe. Ignorando criação.`);
      process.exit(0);
    }
  } catch (err) {
    // Tag list search failed, assume it doesn't exist
  }

  // Create and push tag
  console.log(`Criando tag ${tagName}...`);
  execSync(`git tag ${tagName}`);
  execSync(`git push origin ${tagName}`);

  // Create GitHub Release using Github CLI 'gh'
  console.log(`Criando GitHub Release para a tag ${tagName}...`);
  execSync(`gh release create ${tagName} --title "${tagName}" --notes "Release automática do módulo ${normalizedModuleName} na versão v${version}."`);

  console.log("Processo de release concluído com sucesso!");
  process.exit(0);

} catch (err) {
  console.error("Falha ao processar release:", err);
  process.exit(1);
}

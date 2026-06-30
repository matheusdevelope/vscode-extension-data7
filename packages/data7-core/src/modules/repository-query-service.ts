import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import { logger } from "../infra/logger";

export interface ModuleManifest {
  nome: string;
  version: string;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface RepositoryModuleEntry {
  readonly name: string;
  readonly source: "local" | "online";
  readonly version: string;
  readonly manifest?: ModuleManifest;
  readonly releaseTag?: string;
}

export class RepositoryQueryService {
  private static get GITHUB_REPO(): string {
    return process.env.DATA7_GITHUB_REPO || "matheusdevelope/data7-modules";
  }
  private static readonly USER_AGENT = "data7-ecosystem-agent";
  private static rateLimitResetTime = 0;
  private static readonly ONLINE_CATALOG_TTL_MS = 30 * 60 * 1000;
  private static onlineCatalogCache:
    | {
        readonly fetchedAt: number;
        readonly entries: readonly RepositoryModuleEntry[];
      }
    | undefined;

  /**
   * Returns the directory path for local private modules.
   */
  public static getLocalPrivateModulesPath(): string {
    const dir = path.join(os.homedir(), ".data7", "local_modules");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Checks if a module exists in the local private repository and returns its files if found.
   */
  public static findLocalPrivateModule(
    moduleName: string,
  ): { dirPath: string; manifest: ModuleManifest } | undefined {
    const localDir = this.getLocalPrivateModulesPath();
    const moduleDir = this.findLocalPrivateModuleDir(localDir, moduleName);
    if (!moduleDir) return undefined;
    const manifestPath = path.join(moduleDir, "data7.json");

    if (fs.existsSync(manifestPath)) {
      try {
        const content = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(content) as ModuleManifest;
        return { dirPath: moduleDir, manifest };
      } catch (err) {
        logger.error(`Erro ao ler manifesto do módulo local privado: ${moduleName}`, err);
      }
    }
    return undefined;
  }

  public static listLocalPrivateModules(): RepositoryModuleEntry[] {
    const localDir = this.getLocalPrivateModulesPath();
    const entries = fs.readdirSync(localDir, { withFileTypes: true });
    const modules: RepositoryModuleEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(localDir, entry.name, "data7.json");
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ModuleManifest;
        modules.push({
          name: typeof manifest.nome === "string" && manifest.nome ? manifest.nome : entry.name,
          source: "local",
          version: typeof manifest.version === "string" ? manifest.version : "latest",
          manifest,
        });
      } catch (err) {
        logger.error(`Erro ao ler manifesto do módulo local privado: ${entry.name}`, err);
      }
    }
    return modules.sort((a, b) => a.name.localeCompare(b.name));
  }

  private static findLocalPrivateModuleDir(
    localDir: string,
    moduleName: string,
  ): string | undefined {
    const direct = path.join(localDir, moduleName);
    if (fs.existsSync(path.join(direct, "data7.json"))) return direct;
    const expected = moduleName.toLowerCase();
    for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.toLowerCase() === expected) {
        const candidate = path.join(localDir, entry.name);
        if (fs.existsSync(path.join(candidate, "data7.json"))) return candidate;
      }
    }
    return undefined;
  }

  /**
   * Performs an HTTPS GET request to GitHub API.
   */
  private static githubApiGet(apiPath: string): Promise<string> {
    if (Date.now() < this.rateLimitResetTime) {
      const err = new Error("GitHub API rate limit exceeded (cached).");
      (err as any).statusCode = 403;
      return Promise.reject(err);
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        path: apiPath,
        method: "GET",
        headers: {
          "User-Agent": this.USER_AGENT,
          Accept: "application/vnd.github.v3+json",
        },
      };

      https
        .get(options, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              if (res.statusCode === 403 && data.includes("rate limit exceeded")) {
                // 5-minute cooldown
                RepositoryQueryService.rateLimitResetTime = Date.now() + 5 * 60 * 1000;
              }
              const err = new Error(`GitHub API retornou status ${res.statusCode}: ${data}`);
              (err as any).statusCode = res.statusCode;
              reject(err);
            }
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  /**
   * Fetches the manifest file of an online module from GitHub.
   */
  public static async fetchOnlineModuleManifest(
    moduleName: string,
  ): Promise<ModuleManifest | undefined> {
    const release = await this.findReleasedModule(moduleName);
    if (!release?.releaseTag) return undefined;
    const apiPath = `/repos/${this.GITHUB_REPO}/contents/modules/${release.name}/data7.json?ref=${encodeURIComponent(release.releaseTag)}`;
    try {
      const response = await this.githubApiGet(apiPath);
      const json = JSON.parse(response) as { content: string; encoding: string };
      if (json.encoding === "base64" && json.content) {
        const decoded = Buffer.from(json.content, "base64").toString("utf-8");
        return JSON.parse(decoded) as ModuleManifest;
      }
    } catch (err: any) {
      if (err.statusCode === 404) {
        logger.info(`Módulo online '${moduleName}' não encontrado (404).`);
      } else if (err.statusCode === 403) {
        logger.warn(
          `GitHub API limite de requisições excedido. Busca do módulo '${moduleName}' ignorada (403).`,
        );
      } else {
        logger.error(`Erro ao buscar manifesto online do módulo: ${moduleName}`, err);
      }
    }
    return undefined;
  }

  /**
   * Lists public modules with a valid release tag (`<module>-v<version>`).
   */
  public static async listOnlineModules(forceRefresh = false): Promise<string[]> {
    const entries = await this.listOnlineModuleEntries(forceRefresh);
    return entries.map((entry) => entry.name);
  }

  public static async listOnlineModuleEntries(
    forceRefresh = false,
  ): Promise<RepositoryModuleEntry[]> {
    if (
      !forceRefresh &&
      this.onlineCatalogCache &&
      Date.now() - this.onlineCatalogCache.fetchedAt < this.ONLINE_CATALOG_TTL_MS
    ) {
      return [...this.onlineCatalogCache.entries];
    }

    const apiPath = `/repos/${this.GITHUB_REPO}/releases?per_page=100`;
    try {
      const response = await this.githubApiGet(apiPath);
      const releases = JSON.parse(response) as Array<{ tag_name?: string; draft?: boolean }>;
      const latestByModule = new Map<string, RepositoryModuleEntry>();
      for (const release of releases) {
        if (release.draft || typeof release.tag_name !== "string") continue;
        const parsed = this.parseModuleReleaseTag(release.tag_name);
        if (!parsed) continue;
        const existing = latestByModule.get(parsed.name.toLowerCase());
        if (!existing || this.isNewerVersion(parsed.version, existing.version)) {
          latestByModule.set(parsed.name.toLowerCase(), {
            name: parsed.name,
            source: "online",
            version: parsed.version,
            releaseTag: release.tag_name,
          });
        }
      }
      const entries = Array.from(latestByModule.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      this.onlineCatalogCache = { fetchedAt: Date.now(), entries };
      return entries;
    } catch (err: any) {
      if (err.statusCode === 404) {
        logger.info("Nenhuma release pública de módulo encontrada no repositório remoto (404).");
      } else if (err.statusCode === 403) {
        logger.warn(
          "GitHub API limite de requisições excedido. Usando catálogo online em cache quando disponível.",
        );
        if (this.onlineCatalogCache) return [...this.onlineCatalogCache.entries];
      } else {
        logger.error("Erro ao listar releases públicas de módulos.", err);
      }
      return [];
    }
  }

  public static clearOnlineCatalogCache(): void {
    this.onlineCatalogCache = undefined;
  }

  /**
   * Fetches all files for an online module.
   */
  public static async fetchOnlineModuleFiles(
    moduleName: string,
  ): Promise<Array<{ path: string; content: string }> | undefined> {
    const release = await this.findReleasedModule(moduleName);
    if (!release?.releaseTag) {
      logger.info(`Módulo online '${moduleName}' não possui release válida.`);
      return undefined;
    }
    const apiPath = `/repos/${this.GITHUB_REPO}/contents/modules/${release.name}?ref=${encodeURIComponent(release.releaseTag)}`;
    try {
      return await this.fetchOnlineDirectoryFiles(apiPath, "", release.releaseTag);
    } catch (err: any) {
      if (err.statusCode === 404) {
        logger.info(`Arquivos do módulo online '${moduleName}' não encontrados (404).`);
      } else if (err.statusCode === 403) {
        logger.warn(
          `GitHub API limite de requisições excedido. Busca de arquivos do módulo '${moduleName}' ignorada (403).`,
        );
      } else {
        logger.error(`Erro ao buscar arquivos do módulo online: ${moduleName}`, err);
      }
    }
    return undefined;
  }

  private static async fetchOnlineDirectoryFiles(
    apiPath: string,
    relativeBase: string,
    ref: string,
  ): Promise<Array<{ path: string; content: string }>> {
    const response = await this.githubApiGet(apiPath);
    const items = JSON.parse(response) as Array<{
      name: string;
      path: string;
      type: string;
      download_url?: string;
      url?: string;
    }>;

    const files: Array<{ path: string; content: string }> = [];
    for (const item of items) {
      const relativePath = relativeBase ? `${relativeBase}/${item.name}` : item.name;
      if (item.type === "file" && item.download_url) {
        const content = await this.downloadRawFile(item.download_url);
        files.push({ path: relativePath, content });
        continue;
      }
      if (item.type === "dir" && item.url) {
        files.push(
          ...(await this.fetchOnlineDirectoryFiles(
            `/repos/${this.GITHUB_REPO}/contents/${item.path}?ref=${encodeURIComponent(ref)}`,
            relativePath,
            ref,
          )),
        );
      }
    }
    return files;
  }

  private static async findReleasedModule(
    moduleName: string,
  ): Promise<RepositoryModuleEntry | undefined> {
    const expected = moduleName.toLowerCase();
    return (await this.listOnlineModuleEntries()).find(
      (entry) => entry.name.toLowerCase() === expected,
    );
  }

  private static parseModuleReleaseTag(
    tagName: string,
  ): { name: string; version: string } | undefined {
    const match = /^(?<name>[a-z0-9_.-]+)-v(?<version>\d+(?:\.\d+){1,3})$/i.exec(tagName);
    if (!match?.groups) return undefined;
    const name = match.groups.name ?? "";
    const version = match.groups.version;
    if (!name || !version) return undefined;
    return { name, version };
  }

  private static isNewerVersion(available: string, current: string): boolean {
    const p1 = available.split(".").map((part) => Number(part));
    const p2 = current.split(".").map((part) => Number(part));
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const v1 = Number.isFinite(p1[i]) ? (p1[i] as number) : 0;
      const v2 = Number.isFinite(p2[i]) ? (p2[i] as number) : 0;
      if (v1 > v2) return true;
      if (v1 < v2) return false;
    }
    return false;
  }

  private static downloadRawFile(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https
        .get(url, { headers: { "User-Agent": this.USER_AGENT } }, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`Erro ao baixar arquivo: status ${res.statusCode}`));
            }
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }
}

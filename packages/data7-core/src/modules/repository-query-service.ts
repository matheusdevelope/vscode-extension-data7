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

export class RepositoryQueryService {
  private static get GITHUB_REPO(): string {
    return process.env.DATA7_GITHUB_REPO || "matheusdevelope/data7-modules";
  }
  private static readonly USER_AGENT = "data7-ecosystem-agent";
  private static rateLimitResetTime = 0;

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
  public static findLocalPrivateModule(moduleName: string): { dirPath: string; manifest: ModuleManifest } | undefined {
    const localDir = this.getLocalPrivateModulesPath();
    const moduleDir = path.join(localDir, moduleName);
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
          "Accept": "application/vnd.github.v3+json"
        }
      };

      https.get(options, (res) => {
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
      }).on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Fetches the manifest file of an online module from GitHub.
   */
  public static async fetchOnlineModuleManifest(moduleName: string): Promise<ModuleManifest | undefined> {
    const apiPath = `/repos/${this.GITHUB_REPO}/contents/modules/${moduleName}/data7.json`;
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
        logger.warn(`GitHub API limite de requisições excedido. Busca do módulo '${moduleName}' ignorada (403).`);
      } else {
        logger.error(`Erro ao buscar manifesto online do módulo: ${moduleName}`, err);
      }
    }
    return undefined;
  }

  /**
   * Lists all public modules available online on GitHub.
   */
  public static async listOnlineModules(): Promise<string[]> {
    const apiPath = `/repos/${this.GITHUB_REPO}/contents/modules`;
    try {
      const response = await this.githubApiGet(apiPath);
      const items = JSON.parse(response) as Array<{ name: string; type: string }>;
      return items.filter(item => item.type === "dir").map(item => item.name);
    } catch (err: any) {
      if (err.statusCode === 404) {
        logger.info("Nenhum módulo público online encontrado no repositório remoto (404).");
      } else if (err.statusCode === 403) {
        logger.warn("GitHub API limite de requisições excedido. Listagem de módulos online ignorada (403).");
      } else {
        logger.error("Erro ao listar módulos públicos online.", err);
      }
      return [];
    }
  }

  /**
   * Fetches all files for an online module.
   */
  public static async fetchOnlineModuleFiles(moduleName: string): Promise<Array<{ path: string; content: string }> | undefined> {
    const apiPath = `/repos/${this.GITHUB_REPO}/contents/modules/${moduleName}`;
    try {
      const response = await this.githubApiGet(apiPath);
      const items = JSON.parse(response) as Array<{ name: string; type: string; download_url: string }>;
      
      const files: Array<{ path: string; content: string }> = [];
      for (const item of items) {
        if (item.type === "file" && item.download_url) {
          const content = await this.downloadRawFile(item.download_url);
          files.push({ path: item.name, content });
        }
      }
      return files;
    } catch (err: any) {
      if (err.statusCode === 404) {
        logger.info(`Arquivos do módulo online '${moduleName}' não encontrados (404).`);
      } else if (err.statusCode === 403) {
        logger.warn(`GitHub API limite de requisições excedido. Busca de arquivos do módulo '${moduleName}' ignorada (403).`);
      } else {
        logger.error(`Erro ao buscar arquivos do módulo online: ${moduleName}`, err);
      }
    }
    return undefined;
  }

  private static downloadRawFile(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { "User-Agent": this.USER_AGENT } }, (res) => {
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
      }).on("error", (err) => {
        reject(err);
      });
    });
  }
}

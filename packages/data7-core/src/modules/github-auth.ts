import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import { logger } from "../infra/logger";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface AccessTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export class GitHubAuth {
  private static readonly CLIENT_ID = process.env.DATA7_GITHUB_CLIENT_ID || "Ov23li30wvtmyPexnUAY"; // Official Client ID
  private static readonly CONFIG_PATH = path.join(os.homedir(), ".data7", "config.json");

  /**
   * Retrieves the stored access token from ~/.data7/config.json if it exists.
   */
  public static getStoredToken(): string | undefined {
    if (process.env.DATA7_GITHUB_TOKEN) {
      return process.env.DATA7_GITHUB_TOKEN;
    }
    if (process.env.GITHUB_TOKEN) {
      return process.env.GITHUB_TOKEN;
    }
    if (!fs.existsSync(this.CONFIG_PATH)) {
      return undefined;
    }
    try {
      const content = fs.readFileSync(this.CONFIG_PATH, "utf-8");
      const config = JSON.parse(content);
      return config.github_token;
    } catch (err) {
      logger.error("Erro ao ler token do GitHub em ~/.data7/config.json", err);
      return undefined;
    }
  }

  /**
   * Stores the access token in ~/.data7/config.json.
   */
  public static storeToken(token: string): void {
    try {
      const dir = path.dirname(this.CONFIG_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let config: Record<string, any> = {};
      if (fs.existsSync(this.CONFIG_PATH)) {
        try {
          config = JSON.parse(fs.readFileSync(this.CONFIG_PATH, "utf-8"));
        } catch {
          // ignore malformed config
        }
      }

      config.github_token = token;
      fs.writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
      logger.info("Token de acesso do GitHub salvo com sucesso.");
    } catch (err) {
      logger.error("Erro ao salvar token do GitHub", err);
      throw new Error(`Falha ao salvar token localmente: ${(err as Error).message}`);
    }
  }

  /**
   * Clears the stored token.
   */
  public static clearToken(): void {
    if (fs.existsSync(this.CONFIG_PATH)) {
      try {
        const config = JSON.parse(fs.readFileSync(this.CONFIG_PATH, "utf-8"));
        delete config.github_token;
        fs.writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
      } catch {
        // ignore
      }
    }
  }

  /**
   * Starts the GitHub Device Authorization Flow.
   * Calls the authorization endpoint and returns code details.
   */
  public static async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const postData = JSON.stringify({
      client_id: this.CLIENT_ID,
      scope: "public_repo write:repo_hook workflow",
    });

    const response = await this.postJson("github.com", "/login/device/code", postData);
    return JSON.parse(response) as DeviceCodeResponse;
  }

  /**
   * Polls the token endpoint until the user completes verification or the code expires.
   */
  public static async pollForToken(deviceCode: string, intervalSeconds: number): Promise<string> {
    const postData = JSON.stringify({
      client_id: this.CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    const intervalMs = intervalSeconds * 1000;

    return new Promise((resolve, reject) => {
      const checkToken = async () => {
        try {
          const response = await this.postJson("github.com", "/login/oauth/access_token", postData);
          const data = JSON.parse(response) as AccessTokenResponse;

          if (data.access_token) {
            resolve(data.access_token);
            return;
          }

          if (data.error) {
            if (data.error === "authorization_pending") {
              // Wait and check again
              setTimeout(checkToken, intervalMs);
            } else if (data.error === "slow_down") {
              // Back off: wait double the interval
              setTimeout(checkToken, intervalMs * 2);
            } else {
              reject(new Error(`Erro na autenticação: ${data.error_description || data.error}`));
            }
          } else {
            reject(new Error("Resposta de autenticação malformada."));
          }
        } catch (err) {
          reject(err);
        }
      };

      setTimeout(checkToken, intervalMs);
    });
  }

  private static postJson(hostname: string, pathUrl: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        path: pathUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "data7-auth-agent",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP POST falhou com status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }
}

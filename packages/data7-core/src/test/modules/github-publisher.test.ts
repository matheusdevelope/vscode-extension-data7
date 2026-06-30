import "../_setup/global-hooks";
import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { mock } from "node:test";
import { GitHubPublisher } from "../../modules/github-publisher";
import { GitHubAuth } from "../../modules/github-auth";
import { RepositoryQueryService } from "../../modules/repository-query-service";

describe("GitHubPublisher - publish", () => {
  let tempWorkspace: string;
  let tempCloneDir: string;
  let restoreMocks: () => void;
  const executedCommands: string[] = [];
  const apiRequests: Array<{ method: string; path: string; body?: string }> = [];
  let onlineManifestResult: Awaited<
    ReturnType<typeof RepositoryQueryService.fetchOnlineModuleManifest>
  >;
  let onlineFilesResult: Awaited<ReturnType<typeof RepositoryQueryService.fetchOnlineModuleFiles>>;

  beforeEach(() => {
    const baseDir = path.resolve(__dirname, "..", "..", "..", "..", "..", "scratch");
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    tempWorkspace = fs.mkdtempSync(path.join(baseDir, "test-publisher-ws-"));
    tempCloneDir = path.join(os.homedir(), ".data7", "temp_clone");
    if (fs.existsSync(tempCloneDir)) {
      fs.rmSync(tempCloneDir, { recursive: true, force: true });
    }
    executedCommands.length = 0;
    apiRequests.length = 0;
    onlineManifestResult = undefined;
    onlineFilesResult = undefined;

    // 1. Mock GitHubAuth getStoredToken
    const tokenMock = mock.method(GitHubAuth, "getStoredToken", () => "mock-oauth-token");
    const onlineManifestMock = mock.method(
      RepositoryQueryService,
      "fetchOnlineModuleManifest",
      async () => onlineManifestResult,
    );
    const onlineFilesMock = mock.method(
      RepositoryQueryService,
      "fetchOnlineModuleFiles",
      async () => onlineFilesResult,
    );

    // 2. Mock https.request for github API calls
    const https = require("https");
    const httpsMock = mock.method(https, "request", (options: any, callback: any) => {
      apiRequests.push({
        method: options.method,
        path: options.path,
      });

      const mockRes: any = {
        statusCode: 200,
        on: (event: string, handler: any) => {
          if (event === "data") {
            let responseData = "";
            if (options.path === "/user") {
              responseData = JSON.stringify({ login: "mockuser" });
            } else if (options.path === "/repos/matheusdevelope/data7-modules/forks") {
              responseData = JSON.stringify({ name: "data7-modules" });
            } else if (options.path === "/repos/mockuser/data7-modules") {
              responseData = JSON.stringify({ name: "data7-modules", default_branch: "main" });
            } else if (options.path === "/repos/matheusdevelope/data7-modules/pulls") {
              responseData = JSON.stringify({ html_url: "https://github.com/pull/123" });
            } else if (options.path === "/login/device/code") {
              responseData = JSON.stringify({
                device_code: "devcode",
                user_code: "1234",
                verification_uri: "https://github.com",
                expires_in: 900,
                interval: 5,
              });
            } else if (options.path === "/login/oauth/access_token") {
              responseData = JSON.stringify({ access_token: "new-mock-token" });
            }
            handler(Buffer.from(responseData));
          }
          if (event === "end") {
            handler();
          }
        },
      };

      callback(mockRes);

      return {
        on: () => {},
        write: (data: string) => {
          const idx = apiRequests.length - 1;
          if (idx >= 0 && apiRequests[idx]) {
            apiRequests[idx].body = data;
          }
        },
        end: () => {},
      };
    });

    // 3. Mock execSync to avoid real git operations
    const childProcess = require("child_process");
    const execMock = mock.method(childProcess, "execSync", (cmd: string) => {
      executedCommands.push(cmd);
      if (cmd.includes("git clone")) {
        fs.mkdirSync(path.join(tempCloneDir, "modules", "forms"), { recursive: true });
        fs.writeFileSync(path.join(tempCloneDir, "modules", "forms", "data7.json"), "{}");
      }
      return Buffer.from("mocked-exec-output");
    });

    restoreMocks = () => {
      tokenMock.mock.restore();
      onlineManifestMock.mock.restore();
      onlineFilesMock.mock.restore();
      httpsMock.mock.restore();
      execMock.mock.restore();
    };
  });

  afterEach(() => {
    restoreMocks();
    if (fs.existsSync(tempWorkspace)) {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
    if (fs.existsSync(tempCloneDir)) {
      fs.rmSync(tempCloneDir, { recursive: true, force: true });
    }
  });

  test("throws error when data7.json does not exist", async () => {
    await assert.rejects(
      GitHubPublisher.publish(tempWorkspace, () => {}),
      /data7.json' não encontrado/,
    );
  });

  test("successfully requests forks, clones, commits and opens PR", async () => {
    // Setup valid workspace
    fs.writeFileSync(
      path.join(tempWorkspace, "data7.json"),
      JSON.stringify({
        nome: "helpers",
        opcoes: { versao: "1.0.0.0" },
      }),
    );
    const srcDir = path.join(tempWorkspace, "src");
    fs.mkdirSync(srcDir);
    fs.writeFileSync(
      path.join(srcDir, "Helper.bas"),
      "Namespace helpers\n  Class THelper\n  End Class\nEnd Namespace\n",
    );

    let authPromptCalled = false;
    const prUrl = await GitHubPublisher.publish(tempWorkspace, () => {
      authPromptCalled = true;
    });

    // PR url should be returned
    assert.equal(prUrl, "https://github.com/pull/123");
    assert.equal(
      authPromptCalled,
      false,
      "Auth prompt should not be called if token already exists",
    );

    // Check that github API requests were triggered
    const paths = apiRequests.map((r) => r.path);
    assert.ok(paths.includes("/user"), "Should request user info");
    assert.ok(paths.includes("/repos/matheusdevelope/data7-modules/forks"), "Should trigger fork");
    assert.ok(paths.includes("/repos/mockuser/data7-modules"), "Should check fork state");
    assert.ok(paths.includes("/repos/matheusdevelope/data7-modules/pulls"), "Should open PR");

    // Verify git commands executed locally
    assert.ok(
      executedCommands.some((cmd) => cmd.includes("git clone")),
      "Should clone fork",
    );
    assert.ok(
      executedCommands.some((cmd) => cmd.includes("git add")),
      "Should add changes",
    );
    assert.ok(
      executedCommands.some((cmd) => cmd.includes("git commit")),
      "Should commit changes",
    );
    assert.ok(
      executedCommands.some((cmd) => cmd.includes("git push")),
      "Should push to origin",
    );
  });

  test("blocks republishing the same online module before GitHub auth and fork", async () => {
    fs.writeFileSync(
      path.join(tempWorkspace, "data7.json"),
      JSON.stringify({
        nome: "forms",
        version: "1.0.0.0",
        opcoes: { versao: "1.0.0.0" },
      }),
    );
    const srcDir = path.join(tempWorkspace, "src");
    fs.mkdirSync(srcDir);
    fs.writeFileSync(
      path.join(srcDir, "Form.bas"),
      "Namespace forms\n  Class TForm\n  End Class\nEnd Namespace\n",
    );

    onlineManifestResult = {
      nome: "forms",
      version: "1.0.0.0",
    };
    onlineFilesResult = [
      {
        path: "data7.json",
        content: JSON.stringify({
          nome: "forms",
          version: "1.0.0.0",
          opcoes: { versao: "1.0.0.0" },
        }),
      },
      {
        path: "src/Form.bas",
        content: "Namespace forms\n  Class TForm\n  End Class\nEnd Namespace\n",
      },
    ];

    await assert.rejects(
      GitHubPublisher.publish(tempWorkspace, () => {
        throw new Error("Auth prompt should not be called");
      }),
      /já está publicado na versão 1\.0\.0\.0/,
    );
    assert.deepEqual(apiRequests, [], "Authenticated GitHub API should not be called");
    assert.deepEqual(executedCommands, [], "Git commands should not run");
  });

  test("blocks unpublish when authenticated user is not the module publisher", async () => {
    onlineManifestResult = {
      nome: "forms",
      version: "1.0.0.0",
      module: { publisher: "another-user" },
    };

    await assert.rejects(
      GitHubPublisher.unpublish("forms", () => {
        throw new Error("Auth prompt should not be called");
      }),
      /Somente o publisher "another-user"/,
    );

    const paths = apiRequests.map((r) => r.path);
    assert.ok(paths.includes("/user"), "Should authenticate to identify the current user");
    assert.ok(
      !paths.includes("/repos/matheusdevelope/data7-modules/forks"),
      "Should not fork before permission is confirmed",
    );
    assert.deepEqual(executedCommands, [], "Git commands should not run");
  });

  test("unpublish removes the module from fork and opens a PR for the publisher", async () => {
    onlineManifestResult = {
      nome: "forms",
      version: "1.0.0.0",
      module: { publisher: "mockuser" },
    };

    const prUrl = await GitHubPublisher.unpublish("forms", () => {
      throw new Error("Auth prompt should not be called");
    });

    assert.equal(prUrl, "https://github.com/pull/123");
    const paths = apiRequests.map((r) => r.path);
    assert.ok(paths.includes("/user"), "Should request user info");
    assert.ok(paths.includes("/repos/matheusdevelope/data7-modules/forks"), "Should trigger fork");
    assert.ok(paths.includes("/repos/mockuser/data7-modules"), "Should check fork state");
    assert.ok(paths.includes("/repos/matheusdevelope/data7-modules/pulls"), "Should open PR");
    assert.ok(
      executedCommands.some((cmd) => cmd.includes("git add -A modules/forms")),
      "Should stage module deletion",
    );
    assert.ok(
      executedCommands.some((cmd) => cmd.includes('git commit -m "Unpublish module forms"')),
      "Should commit module deletion",
    );
    assert.ok(
      executedCommands.some((cmd) => cmd.includes("git push origin main")),
      "Should push unpublish branch",
    );
  });
});

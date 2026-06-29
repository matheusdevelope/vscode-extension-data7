import "../_setup/global-hooks";
import { afterEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { Builder } from "../../project/builder";
import { Decompiler } from "../../project/decompiler";
import { DependencyScanner } from "../../analysis/dependency-scanner";
import { getRepoBasPath, getCoreModulesPath } from "../../infra/extension-paths";
import { withTempDir } from "../_helpers/temp-dir";

/** Fabricates a minimal valid Data7 project on disk inside `dir`. */
function seedProject(dir: string): { destXml: string } {
  const config = {
    Id: "{TEST-GUID-1234}",
    Nome: "TestProject",
    Descricao: "Test description",
    version: "1.0.0",
    language: "d7basic",
    targetPlatform: "Win32",
    opcoes: {
      autor: "TestAuthor",
      versao: "1.0.0",
      informacoes: "Test info",
      codEmpresa: 1,
      codFilial: 1,
      nomeUsuario: "TestUser",
      preScript: "",
      identificacaoBancoDados: "",
      minify: false,
      stripComments: false,
    },
    virtualFolders: [] as unknown[],
    Modulos: [{ Nome: "Principal", Descricao: "Modulo principal", Tipo: 0, PastaVirtual: "Root" }],
  };
  fs.writeFileSync(path.join(dir, "data7.json"), JSON.stringify(config, null, 2), "utf-8");

  fs.mkdirSync(path.join(dir, "src"));
  const principal = `
Namespace mod_principal
   Class TPrincipalClass
      Public Sub Main()
         ' hello world
      End Sub
   End Class
End Namespace
    `;
  fs.writeFileSync(path.join(dir, "src", "Principal.bas"), principal, "utf-8");
  return { destXml: path.join(dir, "TestProject.7Proj") };
}

describe("Builder", () => {
  afterEach(() => {
    Builder.__resetBuildCacheForTests();
  });

  describe("buildProject", () => {
    test("packages data7.json + src/Principal.bas into a .7Proj XML", async () => {
      await withTempDir(async (tmp) => {
        const { destXml } = seedProject(tmp);
        const result = Builder.buildProject(tmp, destXml);
        assert.ok(fs.existsSync(destXml), "output .7Proj must exist on disk");
        assert.equal(result, destXml, "must return the output path");
      });
    });

    test("does not crash if virtualFolders is missing from data7.json", async () => {
      await withTempDir(async (tmp) => {
        const { destXml } = seedProject(tmp);
        const configPath = path.join(tmp, "data7.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        delete config.virtualFolders;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

        const result = Builder.buildProject(tmp, destXml);
        assert.ok(fs.existsSync(destXml), "output .7Proj must exist on disk");
        assert.equal(result, destXml, "must return the output path");

        // Verify that virtualFolders has been written back/initialized as an array
        const updatedConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert.ok(
          Array.isArray(updatedConfig.virtualFolders),
          "virtualFolders must be initialized to an array",
        );
      });
    });

    test("transpiles `For Each` sugar over StringList into the classic For form", async () => {
      await withTempDir(async (tmp) => {
        seedProject(tmp);
        // Overwrite Principal.bas with a body that uses the sugar over a
        // System Library type (Collections.StringList exposes `Count` and
        // `Strings(i)` so the transpiler can resolve it without any
        // workspace-defined class).
        const principal = `Imports Collections

Namespace mod_principal
   Class TPrincipalClass
      Public Sub Main()
         Dim list As StringList
         For Each item As String In list
            ' iterate strings
         Next
      End Sub
   End Class
End Namespace
`;
        fs.writeFileSync(path.join(tmp, "src", "Principal.bas"), principal, "utf-8");
        const destXml = path.join(tmp, "TestProject.7Proj");
        Builder.buildProject(tmp, destXml);

        const xml = fs.readFileSync(destXml, "utf-8");
        assert.match(xml, /For __idx0 = 0 To list\.Count - 1/);
        assert.match(xml, /Dim item As String = list\.Strings\(__idx0\)/);
        assert.doesNotMatch(xml, /For\s+Each/i);
      });
    });

    test("injects VS Code logger transport when requested", async () => {
      await withTempDir(async (tmp) => {
        seedProject(tmp);
        fs.writeFileSync(path.join(tmp, "src", "Principal.bas"), `Print("hello")`, "utf-8");

        const destXml = path.join(tmp, "TestProject.7Proj");
        const logFilePath = path.join(tmp, ".data7", "logs", "vscode-executor.log");
        Builder.buildProject(tmp, destXml, undefined, { vscodeLoggerFilePath: logFilePath });

        const xml = fs.readFileSync(destXml, "utf-8");
        assert.doesNotMatch(xml, /Imports mod_logger/);
        assert.match(xml, /mod_logger\.ConfigureVSCode/);
        assert.match(xml, /mod_logger\.Printe\(&quot;hello&quot;\)/);
      });
    });

    test("monomorphizes generic modules copied into data7_modules", async () => {
      await withTempDir(async (tmp) => {
        seedProject(tmp);
        fs.writeFileSync(
          path.join(tmp, "src", "Principal.bas"),
          `Imports mod_box

Namespace mod_principal
   Class TPrincipalClass
      Public Sub Main()
         Dim box As Box<Integer> = New Box<Integer>()
      End Sub
   End Class
End Namespace
`,
          "utf-8",
        );

        const modulesDir = path.join(tmp, "data7_modules");
        fs.mkdirSync(modulesDir);
        fs.writeFileSync(
          path.join(modulesDir, "mod_box.bas"),
          `'@Module
Namespace mod_box
   Class Box<T>
      Value As T
   End Class
End Namespace
`,
          "utf-8",
        );

        const destXml = path.join(tmp, "TestProject.7Proj");
        Builder.buildProject(tmp, destXml);

        const xml = fs.readFileSync(destXml, "utf-8");
        assert.match(xml, /Class Box_Integer/);
        assert.match(xml, /Dim box As Box_Integer = New Box_Integer\(\)/);
        assert.doesNotMatch(xml, /Class Box&lt;T&gt;/);
      });
    });

    test("recursively scans data7_modules, removes src path segment, and structures nested virtual folders", async () => {
      await withTempDir(async (tmp) => {
        seedProject(tmp);
        fs.writeFileSync(
          path.join(tmp, "src", "Principal.bas"),
          `Imports mod_nested
Namespace mod_principal
   Class TPrincipalClass
      Public Sub Main()
      End Sub
   End Class
End Namespace
`,
          "utf-8",
        );

        const modulesDir = path.join(tmp, "data7_modules");
        const subfolderDir = path.join(modulesDir, "helpers", "src", "helpers");
        fs.mkdirSync(subfolderDir, { recursive: true });
        fs.writeFileSync(
          path.join(subfolderDir, "mod_nested.bas"),
          `'@Module
Namespace mod_nested
   Public Sub Test()
   End Sub
End Namespace
`,
          "utf-8",
        );

        fs.writeFileSync(
          path.join(subfolderDir, "Principal.bas"),
          `' This is a dependency Principal.bas without namespace
Print("Hello global dependency")
`,
          "utf-8",
        );

        const destXml = path.join(tmp, "TestProject.7Proj");
        Builder.buildProject(tmp, destXml);

        const xml = fs.readFileSync(destXml, "utf-8");

        // Verify the module mod_nested was added
        assert.match(xml, /<mod_nested>/);
        assert.match(xml, /Namespace mod_nested/);

        // Verify that Principal.bas (without namespace) was NOT added
        assert.doesNotMatch(xml, /<Principal>/);
        assert.doesNotMatch(xml, /Hello global dependency/);

        // Verify that virtualFolders has data7_modules, helpers, and nested helpers folders (no 'src' folder)
        const configPath = path.join(tmp, "data7.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const folders: { nome: string; id: string; pastaId: string }[] = config.virtualFolders;

        const d7ModulesFolder = folders.find((f) => f.nome === "data7_modules");
        assert.ok(d7ModulesFolder, "data7_modules virtual folder must exist");

        const helpersModuleFolder = folders.find(
          (f) => f.nome === "helpers" && f.pastaId === d7ModulesFolder.id,
        );
        assert.ok(helpersModuleFolder, "helpers module virtual folder must exist");

        // 'src' folder must not exist
        const srcFolder = folders.find((f) => f.nome === "src");
        assert.ok(!srcFolder, "src virtual folder must NOT exist");

        const nestedHelpersFolder = folders.find(
          (f) => f.nome === "helpers" && f.pastaId === helpersModuleFolder.id,
        );
        assert.ok(
          nestedHelpersFolder,
          "nested helpers folder (promoted) must exist under helpersModuleFolder",
        );
      });
    });

    test("imports mod_tlist when enum array sugar materializes TTList_Color", async () => {
      await withTempDir(async (tmp) => {
        seedProject(tmp);
        fs.writeFileSync(
          path.join(tmp, "src", "Principal.bas"),
          `Enun Color
   Red
End Enun

Dim colors[] As Color = [Color.Red]
`,
          "utf-8",
        );

        const modulesDir = path.join(tmp, "data7_modules");
        fs.mkdirSync(modulesDir);
        fs.writeFileSync(
          path.join(modulesDir, "mod_tlist.bas"),
          `'@Module
Namespace mod_tlist
   Class TTList<T>
      Sub Push(pValue As T)
      End Sub
   End Class
End Namespace
`,
          "utf-8",
        );

        const destXml = path.join(tmp, "TestProject.7Proj");
        Builder.buildProject(tmp, destXml);

        const xml = fs.readFileSync(destXml, "utf-8");
        assert.match(xml, /Imports mod_tlist/);
        assert.match(xml, /Dim colors As TTList_Color = New TTList_Color\(\)/);
        assert.match(xml, /colors\.Push\(Color\.Red\)/);
      });
    });

    test("reuses cached transpilation for unchanged files", async () => {
      await withTempDir(async (tmp) => {
        seedProject(tmp);
        fs.writeFileSync(
          path.join(tmp, "src", "helper.bas"),
          `Namespace mod_helper
   Class THelper
      Public Sub Touch()
         Print("one")
      End Sub
   End Class
End Namespace
`,
          "utf-8",
        );

        const destXml = path.join(tmp, "TestProject.7Proj");
        Builder.buildProject(tmp, destXml);

        const { SugarTranspiler } = await import("../../project/transpiler");
        const originalTranspile = SugarTranspiler.transpile;
        let transpileCalls = 0;
        SugarTranspiler.transpile = (...args: Parameters<typeof originalTranspile>) => {
          transpileCalls++;
          return originalTranspile(...args);
        };
        try {
          fs.writeFileSync(
            path.join(tmp, "src", "helper.bas"),
            `Namespace mod_helper
   Class THelper
      Public Sub Touch()
         Print("two")
      End Sub
   End Class
End Namespace
`,
            "utf-8",
          );

          Builder.buildProject(tmp, destXml);

          assert.equal(transpileCalls, 1);
        } finally {
          SugarTranspiler.transpile = originalTranspile;
        }
      });
    });

    test("does not strip comments or string content when minify is not enabled", async () => {
      await withTempDir(async (tmp) => {
        seedProject(tmp);
        fs.writeFileSync(
          path.join(tmp, "src", "Principal.bas"),
          `Namespace mod_principal
   Class TPrincipalClass
      Public Sub Main()
         Dim sql As String = "SELECT * FROM T WHERE Name = '' AND Kind = 'A'" ' keep regular comment
         Dim command As String = "$l.Prefixes.Add(""http://+:8080/"")"
      End Sub
   End Class
End Namespace
`,
          "utf-8",
        );

        const destXml = path.join(tmp, "TestProject.7Proj");
        Builder.buildProject(tmp, destXml);

        const xml = fs.readFileSync(destXml, "utf-8");
        assert.match(xml, /Name = &apos;&apos; AND Kind = &apos;A&apos;/);
        assert.match(xml, /\$l\.Prefixes\.Add\(&quot;&quot;http:\/\/\+:8080\/&quot;&quot;\)/);
        assert.match(xml, /keep regular comment/);
      });
    });

    test("applies minify.removeUnused from build optimization options", async () => {
      await withTempDir(async (tmp) => {
        seedProject(tmp);
        const configPath = path.join(tmp, "data7.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
          build?: unknown;
        };
        config.build = {
          optimization: {
            sourceMap: true,
            minify: {
              enabled: false,
              stripComments: false,
              removeUnused: true,
            },
            uglify: {
              enabled: false,
            },
          },
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

        fs.writeFileSync(
          path.join(tmp, "src", "Principal.bas"),
          `Namespace mod_principal
   Class TPrincipalClass
      Public Sub Main()
         Dim helper As THelper = New THelper()
         helper.Touch()
      End Sub

      Public Sub DeadPrincipal()
      End Sub
   End Class
End Namespace
`,
          "utf-8",
        );
        fs.writeFileSync(
          path.join(tmp, "src", "helper.bas"),
          `Namespace mod_helper
   Class THelper
      Public Sub New()
      End Sub

      Public Sub Touch()
      End Sub

      Public Sub DeadMethod()
      End Sub
   End Class

   Class DeadClass
   End Class
End Namespace
`,
          "utf-8",
        );

        const destXml = path.join(tmp, "TestProject.7Proj");
        Builder.buildProject(tmp, destXml);

        const xml = fs.readFileSync(destXml, "utf-8");
        assert.match(xml, /Sub Main/);
        assert.match(xml, /Class THelper/);
        assert.match(xml, /Sub Touch/);
        assert.doesNotMatch(xml, /DeadPrincipal/);
        assert.doesNotMatch(xml, /DeadMethod/);
        assert.doesNotMatch(xml, /DeadClass/);
      });
    });
  });
});

describe("Decompiler", () => {
  describe("decompileProject", () => {
    test("re-emits src/Principal.bas and data7.json from a built .7Proj", async () => {
      await withTempDir(async (tmp) => {
        const { destXml } = seedProject(tmp);
        Builder.buildProject(tmp, destXml);

        const dest = path.join(tmp, "decompiled");
        fs.mkdirSync(dest);
        Decompiler.decompileProject(destXml, dest);

        assert.ok(
          fs.existsSync(path.join(dest, "src", "Principal.bas")),
          "decompiled tree must contain src/Principal.bas",
        );
        assert.ok(
          fs.existsSync(path.join(dest, "data7.json")),
          "decompiled tree must contain data7.json",
        );
      });
    });

    test("extracts only namespaces marked with @Module-Imported as dependencies", async () => {
      await withTempDir(async (tmp) => {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<Projeto_Data7 _Language="Basic" _Version="1.0">
  <Opcoes>
    <Versao>1.0.0.0</Versao>
  </Opcoes>
  <Codigo>' Principal code</Codigo>
  <Pastas/>
  <Modulos>
    <mod_strings_helper>
      <Codigo>Namespace mod_strings_helper
    ' some custom logic
End Namespace</Codigo>
      <PastaID></PastaID>
      <Aberto>True</Aberto>
      <OrdemAbertura>0</OrdemAbertura>
    </mod_strings_helper>
    <mod_logger>
      <Codigo>'@Module-Imported
Namespace mod_logger
    ' some logger logic
End Namespace</Codigo>
      <PastaID></PastaID>
      <Aberto>True</Aberto>
      <OrdemAbertura>1</OrdemAbertura>
    </mod_logger>
  </Modulos>
</Projeto_Data7>`;

        const projPath = path.join(tmp, "TestProj.7Proj");
        fs.writeFileSync(projPath, xml, "utf-8");

        const dest = path.join(tmp, "decompiled");
        fs.mkdirSync(dest);

        const meta = Decompiler.decompileProject(projPath, dest);

        assert.ok(
          fs.existsSync(path.join(dest, "src", "mod_strings_helper.bas")),
          "mod_strings_helper must be decompiled to src/ because it has no @Module-Imported marker",
        );
        assert.ok(
          !fs.existsSync(path.join(dest, "src", "mod_logger.bas")),
          "mod_logger must NOT be decompiled to src/ because it has @Module-Imported marker",
        );
        assert.ok(
          fs.existsSync(path.join(dest, "data7_modules", "mod_logger.bas")),
          "mod_logger must be preserved in data7_modules/ when it is not known in the repository",
        );

        assert.ok(
          meta.dependencies?.mod_logger !== undefined,
          "mod_logger must be detected as a dependency",
        );
        assert.ok(
          meta.dependencies?.mod_strings_helper === undefined,
          "mod_strings_helper must NOT be detected as a dependency",
        );
      });
    });

    test("does not materialize known shared XML modules into data7_modules", async () => {
      await withTempDir(async (tmp) => {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<Projeto_Data7 _Language="Basic" _Version="1.0">
  <Opcoes>
    <Versao>1.0.0.0</Versao>
  </Opcoes>
  <Codigo>' Principal code</Codigo>
  <Pastas/>
  <Modulos>
    <mod_logger>
      <Codigo>'@Module
Namespace mod_logger
End Namespace</Codigo>
      <PastaID></PastaID>
      <Aberto>True</Aberto>
      <OrdemAbertura>0</OrdemAbertura>
    </mod_logger>
  </Modulos>
</Projeto_Data7>`;

        const projPath = path.join(tmp, "TestProj.7Proj");
        fs.writeFileSync(projPath, xml, "utf-8");

        const dest = path.join(tmp, "decompiled");
        fs.mkdirSync(dest);

        Decompiler.decompileProject(projPath, dest, new Set(["mod_logger"]));

        assert.equal(fs.existsSync(path.join(dest, "data7_modules", "mod_logger.bas")), false);
      });
    });
  });
});

describe("Builder + Decompiler round-trip", () => {
  test("build → decompile → build preserves the Principal.bas content (idempotency)", async () => {
    await withTempDir(async (tmp) => {
      const { destXml } = seedProject(tmp);
      Builder.buildProject(tmp, destXml);

      const dest = path.join(tmp, "decompiled");
      fs.mkdirSync(dest);
      Decompiler.decompileProject(destXml, dest);

      // Re-build the decompiled tree and compare the file lists; we are not
      // diffing the XML byte-for-byte (GUIDs / timestamps vary), only proving
      // that the round-trip yields a buildable project.
      const destXml2 = path.join(tmp, "Decompiled.7Proj");
      Builder.buildProject(dest, destXml2);
      assert.ok(fs.existsSync(destXml2), "rebuilt .7Proj must exist");

      const originalSrc = fs.readFileSync(path.join(tmp, "src", "Principal.bas"), "utf-8");
      const roundTrippedSrc = fs.readFileSync(path.join(dest, "src", "Principal.bas"), "utf-8");
      assert.equal(
        roundTrippedSrc.trim(),
        originalSrc.trim(),
        "Principal.bas content must round-trip unchanged",
      );
    });
  });
});

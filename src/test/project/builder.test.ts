import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { Builder } from "../../project/builder";
import { Decompiler } from "../../project/decompiler";
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
  describe("buildProject", () => {
    test("packages data7.json + src/Principal.bas into a .7Proj XML", async () => {
      await withTempDir(async (tmp) => {
        const { destXml } = seedProject(tmp);
        const result = Builder.buildProject(tmp, destXml);
        assert.ok(fs.existsSync(destXml), "output .7Proj must exist on disk");
        assert.equal(result, destXml, "must return the output path");
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

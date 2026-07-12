import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { SugarTranspiler } from "../../project/transpiler";
import { GenericsMonomorphizer } from "../../project/generics/monomorphizer";
import { registerOpenDocument } from "../_helpers/mock-doc";
import { expectNoBlockingTranspileDiagnostics } from "../_helpers/transpile-assertions";
import { loadExample, loadFixture } from "../_helpers/fixtures";
import {
  createArrayListWorkspace,
  createArrayListWorkspaceForExample,
} from "../_helpers/array-list-workspace";

function exampleUri(examplePath: string): string {
  return `file:///example_${examplePath.replace(/[/\\.]/g, "_")}.bas`;
}

function transpileExample(
  examplePath: string,
  requestedInstantiations: readonly {
    readonly templateName: string;
    readonly typeArgs: readonly string[];
  }[],
  namespace: string,
  localTypes: readonly string[],
): ReturnType<typeof SugarTranspiler.transpile> {
  const code = loadExample(examplePath);
  const workspace = createArrayListWorkspaceForExample(
    code,
    namespace,
    localTypes,
    requestedInstantiations,
  );
  return SugarTranspiler.transpile(code, workspace.transpileCtx);
}

describe("array-list + generics integration", () => {
  describe("canonical examples — transpiler", () => {
    test("01-primitive: materializes Integer[] and preserves Unshift with concrete lambda types", () => {
      const { code: out, diagnostics } = transpileExample(
        "sugar/array-list/01-primitive-filter-map-reduce.bas",
        [
          { templateName: "TTList", typeArgs: ["Integer"] },
          { templateName: "TTList", typeArgs: ["String"] },
        ],
        "mod_testes_array_primitivo",
        [],
      );
      expectNoBlockingTranspileDiagnostics(diagnostics);
      assert.match(out, /Dim numeros As TTList_Integer = New TTList_Integer\(\)/);
      assert.match(out, /numeros\.Unshift\(0\)/);
      assert.match(out, /Dim pares As TTList_Integer = New TTList_Integer\(\)/);
      assert.match(out, /Dim textos As TTList_String = New TTList_String\(\)/);
      assert.doesNotMatch(out, /\bpItem As T\b/);
      assert.match(out, /textos\.Push\("Item " & CStr\(__src2\) & " = " & CStr\(__src1\)\)/);
      assert.match(
        out,
        /numeros\.Reduce<Integer>\(__Data7LambdaHost_mod_testes_array_primitivo\.__data7_lambda_1, 0\)/,
      );
      assert.match(out, /numeros\.Find\(HelperNumero\.FindMaiorQue4\)/);
    });

    test("02-object: preserves First/Last/Slice and materializes homomorphic Map<Produto>", () => {
      const { code: out, diagnostics } = transpileExample(
        "sugar/array-list/02-object-windowing-chains.bas",
        [
          { templateName: "TTList", typeArgs: ["Produto"] },
          { templateName: "TTList", typeArgs: ["String"] },
          { templateName: "TTList", typeArgs: ["Double"] },
        ],
        "mod_testes_array_objetos",
        ["Produto"],
      );
      expectNoBlockingTranspileDiagnostics(diagnostics);
      assert.match(out, /Dim produtos As TTList_Produto = New TTList_Produto\(\)/);
      assert.match(out, /Dim produtosRenomeados As TTList_Produto = New TTList_Produto\(\)/);
      assert.match(out, /produtos\.First\(2\)/);
      assert.match(out, /produtos\.Last\(2\)/);
      assert.match(out, /produtos\.Slice\(1, 3\)/);
      assert.match(out, /produtos\.Includes\(refProduto\)/);
      assert.match(out, /copiaProdutos\.Last\(\)\.SetNome\(/);
      assert.doesNotMatch(out, /\bpItem As T\b/);
    });

    test("03-four-stage: materializes chained Map/Reduce with concrete types across stages", () => {
      const { code: out, diagnostics } = transpileExample(
        "sugar/array-list/03-four-stage-chain.bas",
        [
          { templateName: "TTList", typeArgs: ["PecaMoto"] },
          { templateName: "TTList", typeArgs: ["OrdemServico"] },
          { templateName: "TTList", typeArgs: ["String"] },
        ],
        "mod_exemplo_encadeamento",
        ["PecaMoto", "OrdemServico"],
      );
      expectNoBlockingTranspileDiagnostics(diagnostics);
      assert.match(out, /Dim carrinhoPecas As TTList_PecaMoto = New TTList_PecaMoto\(\)/);
      assert.match(out, /Dim relatorioFinal As String/);
      assert.doesNotMatch(out, /\bpItem As T\b/);
      assert.match(out, /pItem As PecaMoto, pIdx As Integer, extra As Variant\) As OrdemServico/);
      assert.match(out, /sItem As OrdemServico, pIdx As Integer, extra As Variant\) As String/);
    });

    test("04-subclass: inlines lowercase filter into New Pessoas() loop", () => {
      const code = loadExample("sugar/array-list/04-subclass-filter.bas");
      const workspace = createArrayListWorkspace({
        usageSources: [code],
        requestedInstantiations: [{ templateName: "TTList", typeArgs: ["Pessoa"] }],
      });
      const uri = exampleUri("sugar/array-list/04-subclass-filter.bas");
      const indexer = WorkspaceSymbolIndexer.createDetached();
      indexer.updateFileContent("file:///mod_tlist.bas", loadFixture("array-list/ttlist-stub.bas"));
      indexer.updateFileContent(uri, code);
      registerOpenDocument(uri);
      registerOpenDocument("file:///mod_tlist.bas", "mod_tlist.bas");
      const transpileCtx = {
        ...workspace.transpileCtx,
        isTypeDescendantOf: (typeName: string, baseTypeName: string) =>
          workspace.transpileCtx.isTypeDescendantOf?.(typeName, baseTypeName) ??
          typeName === baseTypeName,
        resolveListElementType: (typeName: string) => {
          if (typeName === "Pessoas" || typeName === "TTList_Pessoa") return "Pessoa";
          return workspace.transpileCtx.resolveListElementType?.(typeName);
        },
      };
      const { code: out, diagnostics } = SugarTranspiler.transpile(code, transpileCtx);
      assert.equal(diagnostics.length, 0, JSON.stringify(diagnostics));
      assert.match(out, /Dim newList As Pessoas = New Pessoas\(\)/);
      assert.match(out, /For __idx\d+ = 0 To list\.Length - 1/);
      assert.match(out, /newList\.Push\(/);
      assert.doesNotMatch(out, /Dim newList As Pessoas = list\.filter/i);
    });
  });

  describe("generics monomorphizer — workspace collection", () => {
    test("collects four-stage chain requests from real encadeamento source", () => {
      const code = loadExample("sugar/array-list/03-four-stage-chain.bas");
      const stub = loadFixture("array-list/ttlist-stub.bas");
      const requests = GenericsMonomorphizer.collectWorkspaceClassGenericMethodRequests({
        genericTemplateSources: [stub],
        usageSources: [code],
        requestedInstantiations: [
          { templateName: "TTList", typeArgs: ["PecaMoto"] },
          { templateName: "TTList", typeArgs: ["OrdemServico"] },
          { templateName: "TTList", typeArgs: ["String"] },
        ],
      });

      const mapOrdem = requests.find(
        (r) => r.ownerFlatName === "TTList_PecaMoto" && r.methodFlatName === "Map_OrdemServico",
      );
      const mapString = requests.find(
        (r) => r.ownerFlatName === "TTList_OrdemServico" && r.methodFlatName === "Map_String",
      );
      const reduceString = requests.find(
        (r) => r.ownerFlatName === "TTList_String" && r.methodFlatName === "Reduce_String",
      );
      assert.ok(mapOrdem, "expected Map_OrdemServico on TTList_PecaMoto");
      assert.ok(mapString, "expected Map_String on TTList_OrdemServico");
      assert.ok(reduceString, "expected Reduce_String on TTList_String");
    });

    test("does not require monomorphizing TTList subclass when only custom type is used", () => {
      const code = loadExample("sugar/array-list/04-subclass-filter.bas");
      const stub = loadFixture("array-list/ttlist-stub.bas");
      const requests = GenericsMonomorphizer.collectWorkspaceClassGenericMethodRequests({
        genericTemplateSources: [stub],
        usageSources: [code],
        requestedInstantiations: [{ templateName: "TTList", typeArgs: ["Pessoa"] }],
      });
      const filterOnSubclass = requests.find((r) => r.ownerFlatName === "Pessoas");
      assert.equal(
        filterOnSubclass,
        undefined,
        "subclass filter is inlined; no Pessoas.Filter monomorph",
      );
    });
  });
});

import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemByName,
  lookupSystemClassByName,
} from "../../system-library";
import type { SymbolInfo } from "../../analysis/symbol-indexer";

/**
 * Testes pontuais dos containers adicionados durante a expansão do
 * system-library a partir das planilhas `docs/Documentação Data7/`:
 *
 *  - `Data7.Report`
 *  - `XML.IXMLNodeList`
 *  - membros de transação em `SQL.Connection`
 *  - itens marcados `isUnsupported` em `TJSONObject.PutDate`/`PutTime`
 *  - sobrescritas (override) em `Data7.Report` que viram `isUnsupported`
 *
 * Complementa `system-library/instrucao-coverage.test.ts`, que valida toda
 * a planilha de uma vez.
 */

function findMember(container: string, name: string): SymbolInfo | undefined {
  return lookupSystemByContainer(container).find(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  );
}

describe("Data7.Report", () => {
  test("declarada com inheritsFrom=Form e contida em Data7", () => {
    const cls = lookupSystemClassByName("Report").find((s) => s.containerName === "Data7");
    assert.ok(cls, "Data7.Report deve existir como classe");
    assert.equal(cls.inheritsFrom, "Form");
  });

  test("expõe AddParam(pName: String, pValue: Variant)", () => {
    const addParam = findMember("Report", "AddParam");
    assert.ok(addParam);
    assert.equal(addParam.kind, "method");
    assert.deepEqual(
      addParam.parameters?.map((p) => p.name),
      ["pName", "pValue"],
    );
    assert.deepEqual(
      addParam.parameters?.map((p) => p.type),
      ["String", "Variant"],
    );
  });

  test("expõe ExportToPdf(pLayoutIndex: Integer, pFilePath: String)", () => {
    const exportPdf = findMember("Report", "ExportToPdf");
    assert.ok(exportPdf);
    assert.deepEqual(
      exportPdf.parameters?.map((p) => p.name),
      ["pLayoutIndex", "pFilePath"],
    );
  });

  test("Show retorna Boolean (override do TForm.Show: Void)", () => {
    const show = findMember("Report", "Show");
    assert.ok(show);
    assert.equal(show.type, "Boolean");
  });

  test("Caption é override marcado como isUnsupported", () => {
    const caption = findMember("Report", "Caption");
    assert.ok(caption);
    assert.equal(caption.isUnsupported, true);
  });

  test("New(AOwner: TComponent) é exposto", () => {
    const ctor = findMember("Report", "New");
    assert.ok(ctor);
    assert.equal(ctor.kind, "method");
    assert.equal(ctor.parameters?.[0]?.type, "TComponent");
  });
});

describe("XML.IXMLNodeList", () => {
  test("declarada com inheritsFrom=TObject e contida em XML", () => {
    const cls = lookupSystemClassByName("IXMLNodeList").find((s) => s.containerName === "XML");
    assert.ok(cls);
    assert.equal(cls.inheritsFrom, "TObject");
  });

  test("expõe FindNode(NodeName: String): IXMLNode", () => {
    const findNode = findMember("IXMLNodeList", "FindNode");
    assert.ok(findNode);
    assert.equal(findNode.type, "XML.IXMLNode");
  });

  test("Nodes é indexed-property por Integer", () => {
    const nodes = findMember("IXMLNodeList", "Nodes");
    assert.ok(nodes);
    assert.equal(nodes.kind, "indexed-property");
    assert.equal(nodes.parameters?.[0]?.type, "Integer");
  });
});

describe("SQL.Connection — métodos de transação", () => {
  for (const name of [
    "StartTransaction",
    "Commit",
    "Rollback",
    "InTransaction",
    "DefaultSchema",
    "RDBMS",
  ]) {
    test(`${name} existe`, () => {
      const m = findMember("Connection", name);
      assert.ok(m, `Connection.${name} deve existir`);
      assert.equal(m.kind, "method");
    });
  }

  test("StartTransaction aceita pDescricao opcional", () => {
    const m = findMember("Connection", "StartTransaction");
    assert.equal(m?.parameters?.[0]?.isOptional, true);
  });
});

describe("TJSONObject — overloads e isUnsupported", () => {
  test("Create tem overload sem argumentos", () => {
    const create = findMember("TJSONObject", "Create");
    assert.ok(create);
    assert.ok(create.overloads, "Create deve ter overloads");
    assert.equal(create.overloads.length, 1);
    assert.equal(create.overloads[0]!.length, 0);
  });

  test("PutDate é marcado como isUnsupported", () => {
    const putDate = findMember("TJSONObject", "PutDate");
    assert.ok(putDate);
    assert.equal(putDate.isUnsupported, true);
  });

  test("PutTime é marcado como isUnsupported", () => {
    const putTime = findMember("TJSONObject", "PutTime");
    assert.ok(putTime);
    assert.equal(putTime.isUnsupported, true);
  });

  test("GetDate retorna TDateTime e NÃO é unsupported", () => {
    const getDate = findMember("TJSONObject", "GetDate");
    assert.ok(getDate);
    assert.equal(getDate.type, "TDateTime");
    assert.notEqual(getDate.isUnsupported, true);
  });
});

describe("System namespace — funções e constantes globais", () => {
  test("Pi é uma constante exportada do namespace System", () => {
    const pi = findMember("System", "Pi");
    assert.ok(pi);
    assert.equal(pi.kind, "property");
    assert.equal(pi.isShared, true);
  });

  test("Length é exposto como função do namespace", () => {
    const len = findMember("System", "Length");
    assert.ok(len);
    assert.equal(len.kind, "method");
    assert.equal(len.type, "Integer");
  });

  test("varEmpty é uma constante Variant disponível", () => {
    const v = findMember("System", "varEmpty");
    assert.ok(v);
    assert.equal(v.kind, "property");
  });
});

describe("SQL aliases (FireDAC delegates)", () => {
  test("TFDDataSetEvent existe como classe", () => {
    const matches = lookupSystemByName("TFDDataSetEvent");
    assert.ok(matches.length > 0);
    assert.equal(matches[0]!.kind, "class");
  });

  test("TDataSetNotifyEvent existe como classe", () => {
    const matches = lookupSystemByName("TDataSetNotifyEvent");
    assert.ok(matches.length > 0);
  });
});

describe("TObject — membros adicionais do RTL Delphi", () => {
  test("BeforeDestruction está visível no TObject global", () => {
    const m = SYSTEM_SYMBOLS.find(
      (s) => s.name === "BeforeDestruction" && s.containerName === "TObject",
    );
    assert.ok(m);
  });

  test("GetInterface aceita (IID: TGUID, Obj: PVOID ByRef)", () => {
    const gi = SYSTEM_SYMBOLS.find(
      (s) => s.name === "GetInterface" && s.containerName === "TObject",
    );
    assert.ok(gi);
    assert.equal(gi.parameters?.[0]?.type, "TGUID");
    assert.equal(gi.parameters?.[1]?.isByRef, true);
  });
});

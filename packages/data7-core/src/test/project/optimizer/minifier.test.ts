import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { minifyData7Text } from "../../../project/optimizer";

describe("minifyData7Text", () => {
  test("strips comments without truncating SQL strings", () => {
    const source = `Dim sql As String = "SELECT * FROM T WHERE Name = '' AND Kind = 'A'" ' comment`;

    assert.equal(
      minifyData7Text(source, { enabled: false, stripComments: true }),
      `Dim sql As String = "SELECT * FROM T WHERE Name = '' AND Kind = 'A'" `,
    );
  });

  test("compresses whitespace without breaking escaped double quotes", () => {
    const source = `Dim command As String = "$l.Prefixes.Add(""http://+:8080/"")"`;

    assert.equal(
      minifyData7Text(source, { enabled: true, stripComments: true }),
      `Dim command As String = "$l.Prefixes.Add(""http://+:8080/"")"`,
    );
  });
});

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

  test("does not collapse whitespace unless collapseWhitespace is true", () => {
    const source = `Namespace mod_app
   Class Program
      Public Sub Main()
      End Sub
   End Class
End Namespace`;

    assert.equal(
      minifyData7Text(source, {
        enabled: true,
        stripComments: false,
        collapseWhitespace: false,
      }),
      source,
    );
    assert.match(source, /Class Program/);
  });

  test("compresses whitespace only when collapseWhitespace is enabled", () => {
    const source = `Dim command As String = "$l.Prefixes.Add(""http://+:8080/"")"`;

    assert.equal(
      minifyData7Text(source, {
        enabled: true,
        stripComments: true,
        collapseWhitespace: true,
      }),
      `Dim command As String = "$l.Prefixes.Add(""http://+:8080/"")"`,
    );
  });

  test("preserves line-continuation underscore lines when not collapsing", () => {
    const source = `Dim x As String = "hello" _
   & "world"`;

    const result = minifyData7Text(source, {
      enabled: true,
      stripComments: true,
      collapseWhitespace: false,
    });
    assert.match(result, /_\r?\n/);
    assert.match(result, /& "world"/);
  });
});

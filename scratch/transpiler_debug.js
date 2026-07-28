const corePath = "d:/DEV/Projects/data7/vscode-extension-data7/packages/data7-core/dist";
require(`${corePath}/test/_setup/global-hooks`);

const { SugarTranspiler } = require(`${corePath}/project/transpiler`);
const { lookupSystemByName } = require(`${corePath}/system-library`);

function makeContext(map = {}, descendants = {}, overrides = {}) {
  return {
    detectEnumerable(typeName, _preferredElementType) {
      return map[typeName];
    },
    isTypeDescendantOf(typeName, baseTypeName) {
      if (typeName.toLowerCase() === baseTypeName.toLowerCase()) return true;
      return descendants[typeName]?.some(
        (base) => base.toLowerCase() === baseTypeName.toLowerCase(),
      );
    },
    resolveGlobalSymbolType(name, argumentCount) {
      return lookupSystemByName(name).find(
        (symbol) =>
          !symbol.containerName &&
          (!symbol.parameters || symbol.parameters.length === argumentCount),
      )?.type;
    },
    ...overrides,
  };
}

const ctx = makeContext({});
const code = [
  "Sub Run(pMessage As Variant, pMessage1 As Variant, pMessage2 As Variant)",
  '   console.Printe("[LOG] " & CStr(pMessage))',
  '   console.Printe("[LOG] " & CStr(pMessage1) & Char(13) & CStr(pMessage2))',
  "End Sub",
].join("\n");

const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
console.log("Transpiled Code:\n", JSON.stringify(out));
console.log("Diagnostics:\n", diagnostics);

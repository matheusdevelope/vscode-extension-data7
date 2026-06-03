require('./out/test/_setup/global-hooks');
const { SugarTranspiler } = require('./out/project/transpiler');
const { parseBasic } = require('./out/project/parser');
const { serializeUnitWithMap } = require('./out/project/parser');

const processedCode = [
  'Dim first = lista.Item(0)',
  'Dim rest As StringList = New StringList()',
  'For __src0 = 1 To lista.Count - 1',
  '   rest.Add(lista.Item(__src0))',
  'Next'
].join('\n');

console.log('--- Processed Code ---');
console.log(processedCode);

const wrappedCode = `Sub __syntheticMethod()\n${processedCode}\nEnd Sub`;
console.log('--- Wrapped Code ---');
console.log(wrappedCode);

const parsed = parseBasic(wrappedCode);
console.log('--- Parser Errors ---', parsed.errors);
console.log('--- AST Members ---', JSON.stringify(parsed.unit.members[0].body, null, 2));

const serializeResult = serializeUnitWithMap(parsed.unit, { eol: '\n' });
console.log('--- Serialized Code ---');
console.log(serializeResult.code);

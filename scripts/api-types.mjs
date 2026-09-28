import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS from 'openapi-typescript';
import prettier from 'prettier';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const contractUrl = new URL('../web/openapi.yaml', import.meta.url);
const outputPath = fileURLToPath(new URL('../web/src/lib/api/types.ts', import.meta.url));
const check = process.argv.includes('--check');

const ast = await openapiTS(contractUrl, {
  alphabetize: true,
  defaultNonNullable: true,
  rootTypes: true,
  rootTypesNoSchemaPrefix: true,
  makePathsEnum: false,
  silent: true
});

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
const sourceFile = ts.createSourceFile(
  'types.ts',
  '',
  ts.ScriptTarget.ESNext,
  false,
  ts.ScriptKind.TS
);
const printed = ast
  .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile))
  .join('\n');
const prettierConfig = (await prettier.resolveConfig(outputPath)) ?? {};
const generated = await prettier.format(printed.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', {
  ...prettierConfig,
  parser: 'typescript',
  filepath: outputPath
});

if (check) {
  let current = '';
  try {
    current = readFileSync(outputPath, 'utf8');
  } catch {
    current = '';
  }
  if (current !== generated) {
    console.error('api:types: web/src/lib/api/types.ts is stale; run npm run api:types');
    process.exit(1);
  }
  console.log('api:types: types.ts is up to date');
} else {
  writeFileSync(outputPath, generated);
  console.log(
    `api:types: wrote ${outputPath.slice(root.length)} (${generated.split('\n').length} lines)`
  );
}

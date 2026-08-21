// Runs the project typecheck through the TypeScript compiler API, so it works
// without invoking npx/npm. Equivalent to `tsc --noEmit` against tsconfig.json.
//
//   node tmp-diagnostics/typecheck.mjs
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const configPath = path.join(root, "tsconfig.json");

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error("Unable to read tsconfig.json");
  process.exit(2);
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);

const host = {
  getCanonicalFileName: (file) => file,
  getCurrentDirectory: () => root,
  getNewLine: () => "\n",
};

if (!diagnostics.length) {
  console.log("TYPECHECK CLEAN - 0 errors");
  process.exit(0);
}

console.log(ts.formatDiagnostics(diagnostics, host));
console.log(`TYPECHECK FAILED - ${diagnostics.length} error(s)`);
process.exit(1);

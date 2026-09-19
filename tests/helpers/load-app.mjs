import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, "../..");
const requireModule = createRequire(import.meta.url);

// Execute actual TS/TSX source with framework/database I/O supplied by each test.
export function appLoader(mocks = {}, environment = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const loadedModule = { exports: {} };
    cache.set(absolute, loadedModule);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    function localRequire(specifier) {
      if (specifier === "server-only") return {};
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2))
          : path.resolve(path.dirname(absolute), specifier);
        const resolved = [base, base + ".ts", base + ".tsx"].find((name) => fs.existsSync(name) && fs.statSync(name).isFile());
        if (!resolved) throw new Error(`Unresolved module: ${specifier}`);
        return load(resolved);
      }
      return requireModule(specifier);
    }
    vm.runInNewContext(compiled, { exports: loadedModule.exports, module: loadedModule, require: localRequire,
      process: { env: environment }, console, FormData, Date }, { filename: absolute });
    return loadedModule.exports;
  }
  return load;
}

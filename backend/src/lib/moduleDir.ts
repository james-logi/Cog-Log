import path from "node:path";
import { fileURLToPath } from "node:url";

declare const __dirname: string | undefined;

// esbuild가 CJS로 번들링하면(패키징된 exe) 진짜 __dirname이 존재하고
// import.meta.url은 비어서 fileURLToPath가 터진다. 순수 ESM(tsx/node로
// 직접 실행)에서는 반대로 __dirname이 없어 import.meta.url을 써야 한다.
export function moduleDirname(importMetaUrl: string): string {
  if (typeof __dirname !== "undefined") return __dirname;
  return path.dirname(fileURLToPath(importMetaUrl));
}

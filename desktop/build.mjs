// main/preload 를 electron 이 바로 실행할 수 있는 형태로 묶습니다.
// 웹앱과 공유하는 src/lib 코드가 TypeScript 라 번들이 필요합니다.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("desktop/dist", { recursive: true });

for (const entry of ["main", "preload"]) {
  await build({
    entryPoints: [`desktop/${entry}.ts`],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: `desktop/dist/${entry}.js`,
    // electron 과 node 내장 모듈은 실행 시점에 있으므로 묶지 않습니다.
    external: ["electron"],
    logLevel: "info",
  });
}

copyFileSync("desktop/index.html", "desktop/dist/index.html");
console.log("빌드 완료: desktop/dist");

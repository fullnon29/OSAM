// 이미 생성된 결과물(src/assets/fonts/*-subset.ttf)이 저장소에 커밋되어 있습니다.
// 재생성이 필요할 때만 실행하세요: 원본 Noto Sans KR TTF(Regular/Bold)를
// fonts.google.com에서 받아 src/assets/fonts/NotoSansKR-Regular.ttf,
// NotoSansKR-Bold.ttf로 저장한 뒤 `node scripts/subset-fonts.mjs` 실행.
import { readFileSync, writeFileSync } from "node:fs";
import subsetFont from "subset-font";

// 완성형 한글 전체(U+AC00~D7A3) + ASCII(공백~물결) + 자주 쓰는 문장부호
let chars = "";
for (let cp = 0xac00; cp <= 0xd7a3; cp++) chars += String.fromCodePoint(cp);
for (let cp = 0x20; cp <= 0x7e; cp++) chars += String.fromCodePoint(cp);

async function run(name) {
  const input = readFileSync(
    new URL(`../src/assets/fonts/${name}.ttf`, import.meta.url)
  );
  const output = await subsetFont(input, chars, { targetFormat: "sfnt" });
  writeFileSync(new URL(`../src/assets/fonts/${name}-subset.ttf`, import.meta.url), output);
  console.log(`${name}: ${input.length} -> ${output.length} bytes`);
}

await run("NotoSansKR-Regular");
await run("NotoSansKR-Bold");

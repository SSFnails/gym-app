/**
 * Забирает шрифты с Google Fonts к себе: приложение обязано работать офлайн,
 * а ссылка на fonts.googleapis.com в офлайне отвалится и текст свалится
 * в системный шрифт. Берём только кириллицу и латиницу — остальные
 * подмножества нам не нужны и весят зря.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FAMILIES = [
  { css: 'Golos+Text:wght@400;600;700', slug: 'golos' },
  { css: 'JetBrains+Mono:wght@400;500;700', slug: 'jbmono' },
];

const KEEP = new Set(['cyrillic', 'latin']);

const outDir = new URL('../src/fonts/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const faces = [];
// Golos и JetBrains — вариативные: Google отдаёт один и тот же файл на все
// начертания, а вес выставляется осью в @font-face. Качаем каждый файл один раз.
const seen = new Map();

for (const family of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${family.css}&display=swap`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();

  // Каждому блоку @font-face предшествует комментарий с именем подмножества.
  const blocks = css.split('/*').slice(1);
  for (const block of blocks) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    if (!KEEP.has(subset)) continue;

    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? 'normal';
    const src = /src:\s*url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    const name = /font-family:\s*'([^']+)'/.exec(block)?.[1];
    if (!weight || !src || !range || !name) continue;

    let file = seen.get(src);
    if (!file) {
      file = `${family.slug}-${subset}.woff2`;
      const bytes = Buffer.from(await (await fetch(src, { headers: { 'User-Agent': UA } })).arrayBuffer());
      writeFileSync(new URL(file, outDir), bytes);
      seen.set(src, file);
      console.log(file, (bytes.length / 1024).toFixed(1) + ' КБ');
    }

    faces.push(
      `@font-face {\n` +
      `  font-family: '${name}';\n` +
      `  font-style: ${style};\n` +
      `  font-weight: ${weight};\n` +
      `  font-display: swap;\n` +
      `  src: url('../fonts/${file}') format('woff2');\n` +
      `  unicode-range: ${range};\n` +
      `}`
    );
  }
}

writeFileSync(
  new URL('../src/styles/fonts.css', import.meta.url),
  '/* Сгенерировано scripts/fetch-fonts.mjs. Руками не править. */\n\n' + faces.join('\n\n') + '\n'
);
console.log(`\nвсего начертаний: ${faces.length} → src/styles/fonts.css`);

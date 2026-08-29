/**
 * Каким движениям не хватает картинки.
 *
 *   node scripts/audit-images.mjs [--strict]
 *
 * Считает не по памяти, а по данным: программа владельца, связки, пул сборки
 * программы и все замены. Раньше список недостающих картинок жил в документе
 * и успел устареть — движение из пула сборки в него не попало. Поэтому это
 * скрипт, а не заметка.
 *
 * С --strict выходит с ошибкой, если чего-то не хватает. Пока картинки
 * не дорисованы, в проверку публикации это вешать нельзя.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildExercises } from '../src/db/seed.ts';
import { VARIANTS } from '../src/db/catalog.ts';
import { MOVEMENTS } from '../src/db/movements.ts';
import { IMAGE_ALIAS } from '../src/lib/image-alias.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'src', 'assets', 'exercises');

const files = new Set(
  readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map((f) => f.replace(/\.[^.]+$/, '')),
);

/** Картинка есть, если файл лежит под этим именем или под псевдонимом. */
const covered = (id) => files.has(id) || files.has(IMAGE_ALIAS[id] ?? '');

const need = new Map();
const add = (id, name, from) => {
  const row = need.get(id);
  if (row) { if (!row.from.includes(from)) row.from.push(from); return; }
  need.set(id, { name, from: [from] });
};

for (const ex of buildExercises()) {
  add(ex.catalogId, ex.name, 'программа владельца');
  if (ex.superset) add(ex.superset.catalogId, ex.superset.name, 'связка');
}
for (const m of MOVEMENTS) add(m.id, m.name, 'пул сборки');
for (const list of Object.values(VARIANTS)) {
  for (const v of list) add(v.id, v.name, 'замена');
}

const missing = [...need].filter(([id]) => !covered(id));
const orphans = [...files].filter((id) => !need.has(id) && !Object.values(IMAGE_ALIAS).includes(id));
const aliased = Object.entries(IMAGE_ALIAS).filter(([id]) => need.has(id) && !files.has(id));

const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));

console.log(`движений с картинкой: ${need.size - missing.length} из ${need.size}`);
console.log(`файлов в папке: ${files.size}`);

if (aliased.length) {
  console.log('\nвзято по псевдониму (одно движение под двумя ключами):');
  for (const [id, to] of aliased) console.log(`   ${pad(id, 22)} → ${to}`);
}

if (missing.length) {
  console.log(`\nНЕ ХВАТАЕТ КАРТИНОК: ${missing.length}`);
  for (const [id, v] of missing.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`   ${pad(id, 22)} ${pad(v.name, 40)} где нужно: ${v.from.join(', ')}`);
  }
  console.log('\nЧто с этим делать: промты лежат в docs/промты-картинок.md,');
  console.log('готовые файлы заводить через node scripts/import-images.mjs <папка>.');
  console.log('Пока картинки нет, экран упражнения просто не показывает блок с ней —');
  console.log('название, подпись зоны и техника на месте, ничего не ломается.');
} else {
  console.log('\nкартинки есть у всех движений.');
}

if (orphans.length) console.log('\nфайлы, которым нет движения:', orphans.join(', '));

if (process.argv.includes('--strict') && missing.length) process.exitCode = 1;

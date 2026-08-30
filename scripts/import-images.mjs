/**
 * Приёмка картинок упражнений.
 *
 *   node scripts/import-images.mjs <папка с исходниками>
 *
 * Проверяет, что имя файла совпадает с реальным упражнением, ужимает
 * до 640px и кладёт в src/assets/exercises. Пережимаем системным sips —
 * сторонних библиотек в проекте нет.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { buildExercises } from '../src/db/seed.ts';
import { VARIANTS } from '../src/db/catalog.ts';
import { MOVEMENTS } from '../src/db/movements.ts';

const src = process.argv[2];
if (!src) {
  console.error('укажи папку: node scripts/import-images.mjs ~/Downloads/картинки');
  process.exit(2);
}

const known = new Set();
for (const ex of buildExercises()) {
  known.add(ex.catalogId);
  if (ex.superset) known.add(ex.superset.catalogId);
}
for (const list of Object.values(VARIANTS)) for (const v of list) known.add(v.id);
// Пул сборки программы: движения оттуда есть только у собранных программ,
// и раньше приёмка отвергала их картинки как «неизвестные».
for (const m of MOVEMENTS) known.add(m.id);

const outDir = new URL('../src/assets/exercises/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const files = readdirSync(src).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) {
  console.error('в папке нет картинок');
  process.exit(1);
}

let ok = 0;
const unknown = [];

for (const file of files) {
  const id = basename(file, extname(file));
  if (!known.has(id)) { unknown.push(file); continue; }

  const from = resolve(src, file);
  const to = new URL(`${id}.webp`, outDir).pathname;

  try {
    execFileSync('sips', ['-Z', '640', '-s', 'format', 'webp', from, '--out', to], { stdio: 'ignore' });
  } catch {
    // Старые системы не умеют webp — кладём JPEG, приложению всё равно.
    const jpg = new URL(`${id}.jpg`, outDir).pathname;
    execFileSync('sips', ['-Z', '640', '-s', 'format', 'jpeg', '-s', 'formatOptions', '78', from, '--out', jpg], { stdio: 'ignore' });
  }

  const made = existsSync(to) ? to : new URL(`${id}.jpg`, outDir).pathname;
  const kb = statSync(made).size / 1024;
  if (kb > 90) {
    console.log(`  ${id}: ${kb.toFixed(0)} КБ — тяжеловато, ужимаю сильнее`);
    execFileSync('sips', ['-Z', '480', made, '--out', made], { stdio: 'ignore' });
  }
  console.log(`${id} ← ${file}  ${(statSync(made).size / 1024).toFixed(0)} КБ`);
  ok++;
}

console.log(`\nпринято: ${ok} из ${files.length}`);
if (unknown.length) {
  console.log('\nимена не совпали ни с одним упражнением — пропущены:');
  for (const f of unknown) console.log('  ', f);
  console.log('\nсписок правильных имён: node scripts/list-exercises.mjs');
}

const total = readdirSync(new URL('.', outDir).pathname)
  .filter((f) => /\.(webp|jpg|png)$/i.test(f));
console.log(`\nвсего картинок в проекте: ${total.length} из ${known.size}`);

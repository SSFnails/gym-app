/**
 * Сводка по заменам: во что превращается каждое упражнение и с каким весом.
 * Данные берём прямо из модулей — разбор исходников регулярками врал.
 */
import { buildExercises, initialWeight } from '../src/db/seed.ts';
import { VARIANTS } from '../src/db/catalog.ts';

const round = (w, step) => (step > 0 ? Math.max(step, Math.round(w / step) * step) : Math.round(w));
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));

const seen = new Set();
let total = 0;
let noVariants = [];

for (const ex of buildExercises()) {
  if (seen.has(ex.catalogId)) continue;
  seen.add(ex.catalogId);

  const list = VARIANTS[ex.catalogId] ?? [];
  const base = initialWeight(ex);
  const reps = ex.repRange ? ex.repRange[0] : '—';

  if (!list.length) { noVariants.push(ex.name); continue; }

  console.log(`\n${ex.name}   ${base} кг × ${reps}   [${ex.sets} подхода, шаг ${ex.step ?? '—'}]`);
  for (const v of list) {
    const w = v.fixedWeight ?? round(base * v.ratio, v.step);
    const mark = v.barbellPress ? 'штанга' : '';
    console.log(`   ${pad(v.name, 42)} ${pad(w + ' кг', 9)} ×${pad(v.ratio, 6)} ${mark}`);
    total++;
  }
}

console.log(`\nвсего замен: ${total}`);
if (noVariants.length) console.log('без замен:', noVariants.join(', '));

/* ------------------------------------------------------------------
   Сверка с реальностью. Часть замен — это упражнения, которые уже есть
   в программе со своим стартовым весом. Значит коэффициент можно
   проверить объективно: предсказание против того, что задано в сиде.
   ------------------------------------------------------------------ */

const actual = new Map();
for (const ex of buildExercises()) {
  // Для новых движений берём третью неделю — она сопоставима с остальными.
  const w = ex.isNewPattern && ex.schedule ? ex.schedule[3] : initialWeight(ex);
  if (w) actual.set(ex.catalogId, { weight: w, name: ex.name });
}

console.log('\n=== СВЕРКА С ЗАДАННЫМИ ВЕСАМИ ===');
let checked = 0;
let close = 0;
for (const ex of buildExercises()) {
  const base = ex.isNewPattern && ex.schedule ? ex.schedule[3] : initialWeight(ex);
  for (const v of VARIANTS[ex.catalogId] ?? []) {
    const real = actual.get(v.id);
    if (!real || !base) continue;
    const predicted = v.fixedWeight ?? round(base * v.ratio, v.step);
    const off = Math.round((predicted / real.weight - 1) * 100);
    const ok = Math.abs(off) <= 20;
    if (ok) close++;
    checked++;
    console.log(`   ${ok ? 'ok  ' : 'МИМО'} ${pad(ex.name + ' → ' + v.name, 58)} ${pad(predicted, 6)} против ${pad(real.weight, 6)} (${off > 0 ? '+' : ''}${off}%)`);
  }
}
console.log(`\nсовпало в пределах 20%: ${close} из ${checked}`);

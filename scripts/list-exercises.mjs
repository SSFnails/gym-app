/** Полный список движений: из программы и из замен. Для брифа на иллюстрации. */
import { buildExercises } from '../src/db/seed.ts';
import { VARIANTS } from '../src/db/catalog.ts';

const all = new Map();

for (const ex of buildExercises()) {
  all.set(ex.catalogId, { name: ex.name, from: 'программа' });
  if (ex.superset) all.set(ex.superset.catalogId, { name: ex.superset.name, from: 'связка' });
}
for (const [, list] of Object.entries(VARIANTS)) {
  for (const v of list) if (!all.has(v.id)) all.set(v.id, { name: v.name, from: 'замена' });
}

const rows = [...all.entries()].sort((a, b) => a[1].from.localeCompare(b[1].from) || a[0].localeCompare(b[0]));
for (const [id, v] of rows) console.log(`${id}\t${v.name}\t${v.from}`);
console.log(`\nвсего: ${rows.length}`);

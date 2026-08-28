import { db } from '../db/db.ts';

/**
 * Выгрузка и загрузка всех данных одним файлом. Никакого облака:
 * файл лежит у тебя, переносится куда хочешь.
 */

const TABLES = [
  'meta', 'settings', 'days', 'exercises', 'exerciseState',
  'sessions', 'setLogs', 'exerciseResults', 'bodyWeight',
  'measurements', 'catalog',
] as const;

export interface Backup {
  format: 'gym-app';
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportAll(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) {
    const table = db.tables.find((t) => t.name === name);
    if (table) tables[name] = await table.toArray();
  }
  return { format: 'gym-app', version: 1, exportedAt: new Date().toISOString(), tables };
}

export function backupFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `тренировки-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Полная замена данных. Всё, что было, стирается — это осознанное действие. */
export async function importAll(raw: string): Promise<{ restored: number }> {
  let parsed: Backup;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Это не JSON — файл повреждён или выбран не тот.');
  }
  if (parsed?.format !== 'gym-app' || !parsed.tables) {
    throw new Error('Файл не от этого приложения.');
  }

  let restored = 0;
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLES) {
      const rows = parsed.tables[name];
      const table = db.tables.find((t) => t.name === name);
      if (!table || !Array.isArray(rows)) continue;
      await table.clear();
      if (rows.length) {
        await table.bulkPut(rows as never[]);
        restored += rows.length;
      }
    }
  });
  return { restored };
}

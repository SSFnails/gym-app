import { db, getSettings, updateSettings } from '../db/db.ts';
import {
  carryMeasurements, carryWeights, carryProgress, ownerProfile,
  stamp, stampDay, STAMPED_TABLES,
} from '../db/migrate.ts';
import type { LegacyDated, Settings } from '../db/types.ts';

/**
 * Выгрузка и загрузка всех данных одним файлом. Никакого облака:
 * файл лежит у тебя, переносится куда хочешь.
 */

const TABLES = [
  'meta', 'settings', 'profiles', 'progress', 'days', 'exercises', 'exerciseState',
  'sessions', 'setLogs', 'exerciseResults', 'weightLog', 'girthLog',
  // Таблицы схемы 4. Читаются и пишутся ради старых файлов — данные из них
  // подхватываются при загрузке, если профилей в файле нет.
  'bodyWeight', 'measurements', 'catalog',
] as const;

/** Версия 1 — файлы до профилей, версия 2 — с профилями. */
export const BACKUP_VERSION = 2;

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
  return {
    format: 'gym-app',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
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

  if (!parsed.tables.profiles?.length) await adoptLegacyBackup();
  return { restored };
}

/**
 * Файл от версии без профилей. Данные в нём принадлежат одному человеку —
 * тому, чей это дневник, — поэтому поступаем с ними ровно как миграция базы:
 * заводим владельца и приписываем ему всё, ничего не выбрасывая.
 */
async function adoptLegacyBackup(): Promise<void> {
  const owner = (await db.profiles.get('owner'))
    ?? ownerProfile(new Date().toISOString());
  await db.profiles.put(owner);

  for (const name of STAMPED_TABLES) {
    const table = db.tables.find((t) => t.name === name);
    if (!table) continue;
    await table.toCollection().modify((row: object, ref) => {
      ref.value = name === 'days' ? stampDay(row, owner.id) : stamp(row, owner.id);
    });
  }

  const weights = (await db.bodyWeight.toArray()) as LegacyDated[];
  if (weights.length) await db.weightLog.bulkPut(carryWeights(weights, owner.id));

  const girth = (await db.measurements.toArray()) as LegacyDated[];
  if (girth.length) await db.girthLog.bulkPut(carryMeasurements(girth, owner.id));

  const settings: Settings = await getSettings();
  await db.progress.put(carryProgress(settings, owner.id));
  await updateSettings({ activeProfileId: owner.id });
}

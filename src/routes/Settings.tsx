import { useEffect, useRef, useState } from 'react';
import Toggle from '../components/Toggle.tsx';
import { db, getSettings, updateSettings } from '../db/db.ts';
import { wipeDb } from '../db/init.ts';
import { backupFileName, exportAll, importAll } from '../lib/backup.ts';
import { plannedWeight, weekNumber } from '../lib/program.ts';
import { effective } from '../lib/variants.ts';
import type { Exercise, ExerciseState, Settings as S } from '../db/types.ts';

interface Row { ex: Exercise; state: ExerciseState; weight: number }

export default function Settings() {
  const [settings, setSettings] = useState<S | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const s = await getSettings();
    const exercises = await db.exercises.orderBy('id').toArray();
    const states = await db.exerciseState.bulkGet(exercises.map((e) => e.id));
    const week = weekNumber(s);
    setSettings(s);
    setRows(exercises
      .map((ex, i) => ({ ex, state: states[i]!, weight: plannedWeight(ex, states[i], week) }))
      .filter((r) => r.state)
      .sort((a, b) => a.ex.dayId.localeCompare(b.ex.dayId) || a.ex.order - b.ex.order));
  };

  useEffect(() => { void load(); }, []);

  const patch = async (p: Partial<S>) => setSettings(await updateSettings(p));

  const bump = async (row: Row, delta: number) => {
    const step = effective(row.ex, row.state).step ?? 2.5;
    const next = Math.max(0, Math.round((row.state.currentWeight + delta * step) * 100) / 100);
    await db.exerciseState.put({ ...row.state, currentWeight: next, updatedAt: new Date().toISOString() });
    await load();
  };

  const doExport = async () => {
    const data = await exportAll();
    const text = JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    try {
      await navigator.clipboard.writeText(text);
      setNote('Файл сохранён, и копия легла в буфер обмена.');
    } catch {
      setNote('Файл сохранён.');
    }
  };

  const doImport = async (file: File) => {
    try {
      const { restored } = await importAll(await file.text());
      setNote(`Загружено записей: ${restored}.`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не получилось прочитать файл.');
    }
  };

  if (!settings) {
    return <main className="screen"><div style={{ padding: '0 var(--pad)' }} className="label">ЗАГРУЗКА</div></main>;
  }

  return (
    <main className="screen">
      <div style={{ padding: '0 var(--pad)' }}><span className="label">НАСТРОЙКИ</span></div>

      <div style={{ marginTop: 18 }}>
        <div className="label" style={{ padding: '0 var(--pad) 8px' }}>ЧТО РАЗРЕШЕНО</div>
        <Toggle
          on={settings.allowBarbellPress}
          label="Штанга в жимах"
          hint="Включать только после четырёх недель без боли в запястье. Пока выключено, штанговые жимы в заменах заперты."
          onChange={(v) => void patch({ allowBarbellPress: v })}
        />
        <Toggle
          on={settings.dayDEnabled}
          label="День D включён"
          hint="Необязательный день на визуал. Встаёт в очередь после C."
          onChange={(v) => void patch({ dayDEnabled: v })}
        />
        <Toggle
          on={settings.supersetsEnabled}
          label="Связки в паузах"
          hint="Выключишь — суперсеты исчезнут из всех дней, данные останутся."
          onChange={(v) => void patch({ supersetsEnabled: v })}
        />
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="label" style={{ padding: '0 var(--pad) 8px' }}>ТАЙМЕР ОТДЫХА</div>
        <Toggle on={settings.restSound} label="Звук на нуле"
          onChange={(v) => void patch({ restSound: v })} />
        <Toggle on={settings.restVibrate} label="Вибрация на нуле"
          onChange={(v) => void patch({ restVibrate: v })} />
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="row" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="label" style={{ flex: 1 }}>НЕДЕЛЯ ПРОГРАММЫ</span>
          <button className="round round--sm"
            onClick={() => void patch({ weekOverride: Math.max(1, weekNumber(settings) - 1) })}>−</button>
          <span className="num" style={{ minWidth: 34, textAlign: 'center', fontSize: 20, fontWeight: 700 }}>
            {weekNumber(settings)}
          </span>
          <button className="round round--sm"
            onClick={() => void patch({ weekOverride: weekNumber(settings) + 1 })}>+</button>
        </div>
        <div style={{ padding: '8px var(--pad) 0', fontSize: 12, color: 'var(--mut2)', lineHeight: 1.35 }}>
          От недели зависит расписание новых движений и разгрузка на восьмой.
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <button className="row" style={{ width: '100%', borderBottom: '1px solid var(--line)' }}
          onClick={() => setEditing((v) => !v)}>
          <span className="label" style={{ flex: 1, textAlign: 'left' }}>РАБОЧИЕ ВЕСА</span>
          <span className="label acc">{editing ? 'СВЕРНУТЬ' : `${rows.length} УПРАЖНЕНИЙ`}</span>
        </button>
        {editing && rows.map((row) => (
          <div key={row.ex.id} className="row" style={{ minHeight: 60 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="ellipsis" style={{ display: 'block', fontSize: 14, color: 'var(--fg2)' }}>
                {effective(row.ex, row.state).shortName ?? row.ex.name}
              </span>
              <span className="label">ДЕНЬ {row.ex.dayId}</span>
            </span>
            <button className="round round--sm" onClick={() => void bump(row, -1)}>−</button>
            <span className="num" style={{ minWidth: 46, textAlign: 'right', fontSize: 17, fontWeight: 700 }}>
              {String(row.state.currentWeight).replace('.', ',')}
            </span>
            <button className="round round--sm" onClick={() => void bump(row, 1)}>+</button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="label" style={{ padding: '0 var(--pad) 8px' }}>ДАННЫЕ</div>
        <div style={{ padding: '0 var(--pad)', display: 'grid', gap: 10 }}>
          <button className="btn" onClick={() => void doExport()}>ВЫГРУЗИТЬ В ФАЙЛ</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>ЗАГРУЗИТЬ ИЗ ФАЙЛА</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
          {armed ? (
            <>
              <button className="btn" style={{ background: 'var(--down)', borderColor: 'var(--down)', color: '#170406' }}
                onClick={() => void wipeDb().then(() => { setArmed(false); setNote('Всё стёрто. Перезагрузи страницу.'); })}>
                ДА, СТЕРЕТЬ НАВСЕГДА
              </button>
              <button className="btn btn--ghost" onClick={() => setArmed(false)}>отмена</button>
            </>
          ) : (
            <button className="btn btn--danger"
              onClick={() => setArmed(true)}>
              СТЕРЕТЬ ВСЁ
            </button>
          )}
        </div>
        {armed && (
          <div style={{ padding: '12px var(--pad) 0', fontSize: 13, color: 'var(--down)', lineHeight: 1.4 }}>
            Сотрутся все тренировки, веса и замеры. Это не отменить — сначала выгрузи файл.
          </div>
        )}
        {note && (
          <div style={{ padding: '12px var(--pad) 0', fontSize: 13, color: 'var(--acc)', lineHeight: 1.4 }}>{note}</div>
        )}
        <div style={{ padding: '12px var(--pad) 0', fontSize: 12, color: 'var(--mut2)', lineHeight: 1.4 }}>
          Загрузка из файла полностью заменяет то, что есть сейчас.
        </div>
      </div>

      <div style={{ height: 32 }} />
    </main>
  );
}

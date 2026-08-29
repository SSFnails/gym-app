import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Toggle from '../components/Toggle.tsx';
import { db, getProgress, getSettings, updateProgress, updateSettings } from '../db/db.ts';
import { wipeDb } from '../db/init.ts';
import { backupFileName, exportAll, importAll } from '../lib/backup.ts';
import {
  activeProfile, applyRecalc, deleteProfile, listProfiles, programGaps,
  recalcPreview, switchProfile, type RecalcRow,
} from '../lib/profiles.ts';
import { dayLetter, plannedWeight, plural, weekNumber } from '../lib/program.ts';
import { effective } from '../lib/variants.ts';
import type { Exercise, ExerciseState, Profile, Settings as S } from '../db/types.ts';

interface Row { ex: Exercise; state: ExerciseState; weight: number; letter: string }

const kg = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<S | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [week, setWeek] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  /** Профиль, который человек собирается удалить. Подтверждение — экраном. */
  const [dropping, setDropping] = useState<Profile | null>(null);
  const [preview, setPreview] = useState<RecalcRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const s = await getSettings();
    const me = await activeProfile();
    setSettings(s);
    setProfile(me);
    setProfiles(await listProfiles());
    setPreview(null);

    if (!me) { setRows([]); return; }

    const progress = await getProgress(me.id);
    const w = weekNumber(progress);
    setWeek(w);

    const days = await db.days.where('profileId').equals(me.id).toArray();
    const letters: Record<string, string> = {};
    for (const d of days) letters[d.id] = dayLetter(d);

    const exercises = await db.exercises.where('profileId').equals(me.id).toArray();
    const states = await db.exerciseState.bulkGet(exercises.map((e) => e.id));
    setRows(exercises
      .map((ex, i) => ({
        ex, state: states[i]!, weight: plannedWeight(ex, states[i], w),
        letter: letters[ex.dayId] ?? ex.dayId,
      }))
      .filter((r) => r.state)
      .sort((a, b) => a.letter.localeCompare(b.letter) || a.ex.order - b.ex.order));
  };

  useEffect(() => { void load(); }, []);

  const patch = async (p: Partial<S>) => setSettings(await updateSettings(p));

  const bumpWeek = async (delta: number) => {
    if (!profile) return;
    await updateProgress(profile.id, { weekOverride: Math.max(1, week + delta) });
    await load();
  };

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

  /* ---------- удаление профиля: отдельный экран, а не системное окно ---------- */

  if (dropping) {
    const alone = profiles.length <= 1;
    return (
      <main className="screen">
        <div style={{ padding: '0 var(--pad)' }}>
          <button className="btn btn--ghost" style={{ width: 'auto', padding: 0 }} onClick={() => setDropping(null)}>
            ← назад
          </button>
        </div>
        <div style={{ padding: '14px var(--pad) 0' }} className="title">Удалить профиль «{dropping.name}»?</div>
        <div style={{ padding: '10px var(--pad) 0' }} className="hint">
          Вместе с профилем уйдут его тренировки, рабочие веса, вес тела и замеры.
          Это не отменить и не восстановить — резервной копии в облаке нет.
          Если данные могут пригодиться, сначала выгрузи их в файл.
        </div>
        {alone && (
          <div style={{ padding: '14px var(--pad) 0', fontSize: 13, color: 'var(--acc)', lineHeight: 1.4 }}>
            Это последний профиль. После удаления приложение начнёт с нуля и попросит
            создать новый.
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'grid', gap: 10, padding: '14px var(--pad)' }}>
          <button className="btn" style={{ background: 'var(--down)', borderColor: 'var(--down)', color: '#170406' }}
            onClick={() => void deleteProfile(dropping.id).then(async () => {
              setDropping(null);
              const rest = await listProfiles();
              if (!rest.length) navigate('/profile/new', { replace: true });
              else await load();
            })}>
            ДА, УДАЛИТЬ ВМЕСТЕ С ТРЕНИРОВКАМИ
          </button>
          <button className="btn btn--ghost" onClick={() => setDropping(null)}>отмена</button>
        </div>
      </main>
    );
  }

  /* ---------- предпросмотр пересчёта ---------- */

  if (preview) {
    return (
      <main className="screen">
        <div style={{ padding: '0 var(--pad)' }}>
          <button className="btn btn--ghost" style={{ width: 'auto', padding: 0 }} onClick={() => setPreview(null)}>
            ← назад
          </button>
        </div>
        <div style={{ padding: '14px var(--pad) 0' }} className="title">Пересчёт весов</div>
        <div style={{ padding: '10px var(--pad) 0' }} className="hint">
          {preview.length
            ? 'Так изменятся рабочие веса, если посчитать их заново по твоим данным. История тренировок не тронется — меняется только вес на следующую сессию.'
            : 'Считать нечего: расчёт даёт то же, что стоит сейчас.'}
        </div>

        {preview.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr) 56px 20px 56px', gap: 8, padding: '18px var(--pad) 7px', borderBottom: '1px solid var(--line)' }}>
              <span className="label">Д</span>
              <span className="label">УПРАЖНЕНИЕ</span>
              <span className="label" style={{ textAlign: 'right' }}>БЫЛО</span>
              <span />
              <span className="label" style={{ textAlign: 'right' }}>СТАНЕТ</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {preview.map((r) => (
                <div key={r.exerciseId} style={{
                  display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr) 56px 20px 56px', gap: 8,
                  alignItems: 'center', padding: '0 var(--pad)', height: 46,
                  borderBottom: '1px solid var(--line-soft)',
                }}>
                  <span className="label">{r.dayLetter}</span>
                  <span className="ellipsis" style={{ fontSize: 13, color: 'var(--fg2)' }}>{r.name}</span>
                  <span className="num" style={{ fontSize: 13, color: 'var(--mut)', textAlign: 'right' }}>{kg(r.from)}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--mut2)', textAlign: 'center' }}>→</span>
                  <span className="num" style={{
                    fontSize: 14, fontWeight: 700, textAlign: 'right',
                    color: r.to > r.from ? 'var(--up)' : 'var(--down)',
                  }}>{kg(r.to)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'grid', gap: 10, padding: '14px var(--pad)' }}>
          {preview.length > 0 && (
            <button className="btn btn--primary"
              onClick={() => void applyRecalc(profile!.id, preview).then(async (n) => {
                setNote(`Веса пересчитаны: изменено упражнений ${n}.`);
                await load();
              })}>
              ПРИМЕНИТЬ
            </button>
          )}
          <button className="btn btn--ghost" onClick={() => setPreview(null)}>
            {preview.length ? 'не менять' : 'вернуться'}
          </button>
        </div>
      </main>
    );
  }

  const gaps = profile ? programGaps(profile) : [];

  return (
    <main className="screen">
      <div style={{ padding: '0 var(--pad)' }}><span className="label">НАСТРОЙКИ</span></div>

      {/* ---------- Профиль ---------- */}
      <div style={{ marginTop: 18 }}>
        <div className="label" style={{ padding: '0 var(--pad) 8px' }}>ПРОФИЛЬ</div>
        {profiles.map((p) => (
          <button key={p.id} className="row" style={{ width: '100%', minHeight: 64, textAlign: 'left' }}
            onClick={() => void (p.id === profile?.id
              ? Promise.resolve()
              : switchProfile(p.id).then(load))}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="ellipsis" style={{ display: 'block', fontSize: 15, color: p.id === profile?.id ? 'var(--fg)' : 'var(--fg2)' }}>
                {p.name}
              </span>
              <span className="label">
                {p.source === 'seed' ? 'ГОТОВАЯ ПРОГРАММА' : 'ПРОГРАММА СОБРАНА'} · {p.daysPerWeek} В НЕДЕЛЮ
              </span>
            </span>
            {p.id === profile?.id
              ? <span className="chip chip--acc">СЕЙЧАС</span>
              : <span className="label acc">ПЕРЕКЛЮЧИТЬ</span>}
          </button>
        ))}

        <div style={{ padding: '12px var(--pad) 0', display: 'grid', gap: 10 }}>
          <button className="btn" onClick={() => navigate('/profile/new')}>ДОБАВИТЬ ПРОФИЛЬ</button>
          {profile && (
            <>
              <button className="btn" onClick={() => void recalcPreview(profile).then(setPreview)}>
                ПЕРЕСЧИТАТЬ ВЕСА ПОД МОИ ДАННЫЕ
              </button>
              <button className="btn btn--danger" onClick={() => setDropping(profile)}>
                УДАЛИТЬ ПРОФИЛЬ «{profile.name.toUpperCase()}»
              </button>
            </>
          )}
        </div>

        {profile && (
          <div style={{ padding: '12px var(--pad) 0', fontSize: 12, color: 'var(--mut2)', lineHeight: 1.4 }}>
            {profile.sex === 'm' ? 'Мужской' : 'Женский'},
            {' '}{new Date().getFullYear() - profile.birthYear} {plural(new Date().getFullYear() - profile.birthYear, 'год')},
            {' '}{profile.heightCm} см, {kg(profile.weightKg)} кг,
            {' '}стаж {kg(profile.experienceYears)} {plural(profile.experienceYears, 'год')}.
            {profile.limits.length > 0 && ` Ограничения: ${profile.limits.length}.`}
          </div>
        )}

        {gaps.length > 0 && (
          <div style={{ margin: '12px var(--pad) 0', border: '1px solid var(--down)', borderRadius: 'var(--r-box)', padding: '12px 14px' }}>
            <div className="label" style={{ color: 'var(--down)' }}>В ПРОГРАММЕ НЕЗАКРЫТЫХ МЕСТ: {gaps.length}</div>
            <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 4, lineHeight: 1.4 }}>
              Не хватило снаряда или всё запрещено здоровьем. Добавь оборудование
              в новом профиле, если оно появилось.
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
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
          hint="Необязательный день на визуал. Встаёт в очередь после C. Есть только в готовой программе."
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
          <button className="round round--sm" disabled={!profile} onClick={() => void bumpWeek(-1)}>−</button>
          <span className="num" style={{ minWidth: 34, textAlign: 'center', fontSize: 20, fontWeight: 700 }}>
            {week}
          </span>
          <button className="round round--sm" disabled={!profile} onClick={() => void bumpWeek(1)}>+</button>
        </div>
        <div style={{ padding: '8px var(--pad) 0', fontSize: 12, color: 'var(--mut2)', lineHeight: 1.35 }}>
          От недели зависит расписание новых движений и разгрузка на восьмой.
          Номер свой у каждого профиля.
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
              <span className="label">ДЕНЬ {row.letter}</span>
            </span>
            <button className="round round--sm" onClick={() => void bump(row, -1)}>−</button>
            <span className="num" style={{ minWidth: 46, textAlign: 'right', fontSize: 17, fontWeight: 700 }}>
              {kg(row.state.currentWeight)}
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
            Сотрутся все профили, тренировки, веса и замеры. Это не отменить — сначала выгрузи файл.
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

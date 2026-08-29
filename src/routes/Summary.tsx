import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db.ts';
import { dayLetter } from '../lib/program.ts';
import { resetTenPercent, floorWeight } from '../lib/progression.ts';
import type { Exercise, ExerciseResult, Session } from '../db/types.ts';

interface Row {
  result: ExerciseResult;
  exercise: Exercise;
  stalled: boolean;
}

const TONE: Record<string, { color: string; label: string }> = {
  up:      { color: 'var(--up)',   label: 'ПРИБАВКА' },
  down:    { color: 'var(--down)', label: 'ВЕС ВЗЯТ РАНО' },
  hold:    { color: 'var(--mut2)', label: 'БЕЗ ИЗМЕНЕНИЙ' },
  fixed:   { color: 'var(--acc)',  label: 'ПО РАСПИСАНИЮ' },
  manual:  { color: 'var(--mut2)', label: 'ВНЕ АЛГОРИТМА' },
  skipped: { color: 'var(--mut2)', label: 'ПРОПУЩЕНО' },
};

export default function Summary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [stalledIds, setStalledIds] = useState<string[]>([]);
  const [setsDone, setSetsDone] = useState(0);
  /** Буква дня: ключ строки у новых профилей идёт с приставкой. */
  const [letter, setLetter] = useState('—');

  const load = async () => {
    if (!id) return;
    const s = await db.sessions.get(id);
    const day = s ? await db.days.get(s.dayId) : undefined;
    setLetter(day ? dayLetter(day) : (s?.dayId ?? '—'));
    const results = await db.exerciseResults.where('sessionId').equals(id).toArray();
    const exercises = await db.exercises.bulkGet(results.map((r) => r.exerciseId));
    const states = await db.exerciseState.bulkGet(results.map((r) => r.exerciseId));

    const built: Row[] = [];
    results.forEach((result, i) => {
      const exercise = exercises[i];
      if (!exercise) return;
      built.push({ result, exercise, stalled: (states[i]?.stallCount ?? 0) >= 2 });
    });
    built.sort((a, b) => a.exercise.order - b.exercise.order);

    // Считаем реально записанные подходы, а не запланированные:
    // с пропусками и «мало времени» это разные числа.
    const logs = await db.setLogs.where('sessionId').equals(id).toArray();
    setSetsDone(logs.filter((l) => l.kind === 'work' && l.done).length);

    setSession(s ?? null);
    setRows(built);
    setStalledIds(built.filter((r) => r.stalled).map((r) => r.exercise.id));
  };

  useEffect(() => { void load(); }, [id]);

  const dropTenPercent = async () => {
    for (const exId of stalledIds) {
      const ex = await db.exercises.get(exId);
      const state = await db.exerciseState.get(exId);
      if (!ex || !state || ex.step === null) continue;
      await db.exerciseState.put({
        ...state,
        currentWeight: resetTenPercent(state.currentWeight, ex.step, floorWeight(ex)),
        nextTargetReps: state.nextTargetReps.map(() => ex.repRange?.[0] ?? 0),
        stallCount: 0,
        lastVolume: null,
        updatedAt: new Date().toISOString(),
      });
    }
    await load();
  };

  if (!session) {
    return <main className="screen"><div style={{ padding: '0 var(--pad)' }} className="label">ЗАГРУЗКА</div></main>;
  }

  const minutes = Math.max(1, Math.round(session.durationSec / 60));
  const stalledNames = rows.filter((r) => r.stalled).map((r) => r.exercise.shortName ?? r.exercise.name);

  return (
    <main className="screen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 var(--pad)' }}>
        <span className="label">ИТОГ</span>
        <span className="label">ДЕНЬ {letter} · НЕД {String(session.weekNumber).padStart(2, '0')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', padding: '24px var(--pad) 20px' }}>
        <Stat label="ТОННАЖ" value={session.tonnage} unit="КГ" />
        <Stat label="ВРЕМЯ" value={minutes} unit="МИН" />
        <Stat label="ПОДХОДОВ" value={setsDone} unit="ВСЕГО" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px var(--pad) 8px', borderTop: '1px solid var(--line)' }}>
        <span className="label">УПРАЖНЕНИЕ</span>
        <span className="label">СЛЕДУЮЩАЯ СЕССИЯ</span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {rows.map(({ result, exercise }) => {
          const tone = TONE[result.outcome] ?? TONE.hold;
          const label = result.skipReason === 'no-time' ? 'НЕ УСПЕЛ' : tone.label;
          const next = result.outcome === 'skipped'
            ? '—'
            : `${String(result.nextWeight).replace('.', ',')} × ${result.nextTargetReps[0] ?? '—'}`;
          return (
            <div key={exercise.id} style={{ display: 'flex', minHeight: 58, borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ width: 3, flex: 'none', background: tone.color }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 var(--pad) 0 17px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontSize: 13, color: 'var(--fg2)' }}>
                    {exercise.shortName ?? exercise.name}
                  </div>
                  <div className="num" style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', marginTop: 2, color: tone.color }}>
                    {label}
                  </div>
                </div>
                <div className="num" style={{ fontSize: 13, fontWeight: 600, flex: 'none' }}>{next}</div>
              </div>
            </div>
          );
        })}
      </div>

      {stalledNames.length > 0 && (
        <div style={{ borderTop: '1px solid var(--acc)', background: '#0C1418', padding: '14px var(--pad)' }}>
          <div className="label label--acc">
            ЗАСТОЙ · {stalledNames.join(', ').toUpperCase()}
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 4, lineHeight: 1.35 }}>
            Сумма повторов не растёт две сессии подряд. Сними 10% и зайди заново.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: stalledNames.length ? '1fr 1fr' : '1fr', gap: 10, padding: '14px var(--pad)' }}>
        {stalledNames.length > 0 && (
          <button className="btn" style={{ minHeight: 68 }} onClick={() => void dropTenPercent()}>
            СБРОСИТЬ −10%
          </button>
        )}
        <button className="btn btn--primary" style={{ minHeight: 68, fontSize: 15 }} onClick={() => navigate('/', { replace: true })}>
          ГОТОВО
        </button>
      </div>
    </main>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.1, marginTop: 4 }}>
        {value}
      </div>
      <div className="num" style={{ fontSize: 10, color: 'var(--mut2)' }}>{unit}</div>
    </div>
  );
}

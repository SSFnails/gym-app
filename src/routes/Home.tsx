import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, getProgress, getSettings, updateProgress } from '../db/db.ts';
import { rollbackTwoWeeks } from '../lib/history.ts';
import { activeProfile, myExercises, stateMap } from '../lib/profiles.ts';
import type {
  Exercise, ExerciseState, ProgramDay, ProgramProgress, Profile,
} from '../db/types.ts';
import {
  activeDays, dayLetter, daysSince, deloadSets, estimateMinutes, isDeloadWeek,
  nextDay, plannedReps, plannedWeight, plural, weekNumber,
} from '../lib/program.ts';

interface HomeData {
  profile: Profile;
  progress: ProgramProgress;
  day: ProgramDay | null;
  exercises: Exercise[];
  states: Record<string, ExerciseState | undefined>;
  week: number;
  /** Длина очереди дней — сколько тренировок в одном круге. */
  queueLength: number;
  lastWeight: number | null;
  avgWeight: number | null;
}

/** Данные только активного профиля: чужой дневник сюда не попадает. */
async function load(): Promise<HomeData | null> {
  const profile = await activeProfile();
  if (!profile) return null;

  const settings = await getSettings();
  const progress = await getProgress(profile.id);
  const days = (await db.days.where('profileId').equals(profile.id).toArray())
    .sort((a, b) => a.order - b.order);
  const day = nextDay(days, progress, settings.dayDEnabled);
  const queueLength = Math.max(1, activeDays(days, settings.dayDEnabled).length);

  const exercises = day ? await myExercises(profile.id, day.id) : [];
  const states = await stateMap(profile.id);

  const recent = (await db.weightLog.where('profileId').equals(profile.id).toArray())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);
  const lastWeight = recent[0]?.kg ?? null;
  const avgWeight = recent.length
    ? Math.round((recent.reduce((s, r) => s + r.kg, 0) / recent.length) * 10) / 10
    : null;

  return {
    profile, progress, day, exercises, states, queueLength,
    week: weekNumber(progress), lastWeight, avgWeight,
  };
}

const fmt = (n: number | null, dash = '—') =>
  n === null ? dash : String(n).replace('.', ',');

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState<HomeData | null>(null);
  const [rolled, setRolled] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    load().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);

  if (!data) {
    return (
      <main className="screen">
        <div style={{ padding: '0 var(--pad)' }} className="label">ЗАГРУЗКА</div>
      </main>
    );
  }

  const { profile, progress, day, exercises, states, week, queueLength, lastWeight, avgWeight } = data;
  const deload = isDeloadWeek(week);
  const gap = daysSince(progress.lastSessionAt);
  // Круг — это полный проход по очереди дней: A → B → C → (D) и заново.
  const cycle = Math.floor(progress.dayQueueIndex / queueLength) + 1;

  return (
    <main className="screen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 var(--pad)' }}>
        <span className="label ellipsis" style={{ maxWidth: '55%' }}>{profile.name.toUpperCase()}</span>
        <span className="label">НЕД {String(week).padStart(2, '0')} · ЦИКЛ {String(cycle).padStart(2, '0')}</span>
      </div>

      {gap !== null && gap > 10 && progress.breakAckAt !== progress.lastSessionAt && (
        <div style={{ margin: '18px var(--pad) 0', border: '1px solid var(--acc)', background: '#0C1418', padding: '14px' }}>
          <div className="label label--acc">ПЕРЕРЫВ {gap} {plural(gap, 'день').toUpperCase()}</div>
          <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 5, lineHeight: 1.4 }}>
            {rolled === null
              ? 'После такого простоя брать прежние веса рано. Можно откатиться на две недели назад — вернуть их будет быстро.'
              : `Веса откатились: изменено упражнений ${rolled}.`}
          </div>
          {rolled === null && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <button className="btn" style={{ minHeight: 52 }}
                onClick={() => void rollbackTwoWeeks(profile.id).then(async (n) => {
                  await updateProgress(profile.id, { breakAckAt: progress.lastSessionAt });
                  setRolled(n);
                  setData(await load());
                })}>
                ОТКАТИТЬ НА ДВЕ НЕДЕЛИ
              </button>
              <button className="btn btn--ghost"
                onClick={() => void updateProgress(profile.id, { breakAckAt: progress.lastSessionAt })
                  .then(async () => setData(await load()))}>
                оставить как есть
              </button>
            </div>
          )}
        </div>
      )}

      {deload && (
        <div style={{ margin: '18px var(--pad) 0', border: '1px solid var(--acc)', background: '#0C1418', padding: '12px 14px' }}>
          <div className="label label--acc">НЕДЕЛЯ РАЗГРУЗКИ</div>
          <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 4 }}>
            Подходов вдвое меньше, вес тот же.
          </div>
        </div>
      )}

      {day ? (
        <>
          <div style={{ padding: '24px var(--pad) 0' }}>
            <div className="label label--acc" style={{ marginBottom: 12 }}>СЛЕДУЮЩАЯ</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
              <div className="num" style={{ fontSize: 86, fontWeight: 700, lineHeight: 0.78, letterSpacing: '-0.07em' }}>
                {dayLetter(day)}
              </div>
              <div style={{ paddingBottom: 6, fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: 'var(--fg2)' }}>
                {day.name}
              </div>
            </div>
            <div className="num" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--mut)', marginTop: 16 }}>
              {exercises.length} {plural(exercises.length, 'упражнение').toUpperCase()} · ОКОЛО {estimateMinutes(exercises)} МИН
            </div>
          </div>

          <div
            style={{
              display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) 64px 56px', gap: 10,
              padding: '18px var(--pad) 7px', borderBottom: '1px solid var(--line)',
            }}
          >
            <span />
            <span className="label">УПРАЖНЕНИЕ</span>
            <span className="label" style={{ textAlign: 'right' }}>ПОДХ×ПОВТ</span>
            <span className="label" style={{ textAlign: 'right' }}>ВЕС</span>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            {exercises.map((ex, i) => {
              const state = states[ex.id];
              const sets = deload ? deloadSets(ex.sets) : ex.sets;
              const reps = plannedReps(ex, state);
              const kg = plannedWeight(ex, state, week);
              return (
                <div
                  key={ex.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) 64px 56px', gap: 10,
                    alignItems: 'center', padding: '0 var(--pad)', height: 46,
                    borderBottom: '1px solid var(--line-soft)',
                  }}
                >
                  <span className="num" style={{ fontSize: 10, color: '#45454B' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="ellipsis" style={{ fontSize: 14, color: 'var(--fg2)' }}>{ex.shortName ?? ex.name}</span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 500, color: 'var(--mut)', textAlign: 'right' }}>
                    {ex.type === 'distance' ? `${sets} × ${ex.distance} м` : `${sets} × ${reps}`}
                  </span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                    {ex.conditional && !state?.resolvedConditional ? 'тест' : fmt(kg)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, padding: '24px var(--pad)' }} className="muted">Программа не загружена.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderTop: '1px solid var(--line)' }}>
        <div style={{ padding: '13px var(--pad)', borderRight: '1px solid var(--line-soft)' }}>
          <div className="label">ВЕС ТЕЛА</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-0.03em' }}>{fmt(lastWeight)}</div>
        </div>
        <div style={{ padding: '13px 16px', borderRight: '1px solid var(--line-soft)' }}>
          <div className="label">СРЕДН 7Д</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-0.03em', color: 'var(--fg2)' }}>{fmt(avgWeight)}</div>
        </div>
        <div style={{ padding: '13px 16px' }}>
          <div className="label">ПЕРЕРЫВ</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-0.03em', color: 'var(--fg2)' }}>
            {gap === null ? '—' : `${gap} ${plural(gap, 'день')}`}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px var(--pad) 14px' }}>
        <button className="btn btn--primary" disabled={!day} onClick={() => navigate('/workout')}>
          НАЧАТЬ ТРЕНИРОВКУ
        </button>
      </div>
    </main>
  );
}

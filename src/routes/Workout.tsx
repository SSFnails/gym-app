import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, getSettings } from '../db/db.ts';
import type { VariantDef } from '../db/catalog.ts';
import type { SkipReason } from '../db/types.ts';
import { beep, primeAudio, vibrate } from '../lib/feedback.ts';
import { plural } from '../lib/program.ts';
import type { SetResult } from '../lib/progression.ts';
import {
  finishSession, logWorkSet, restoreProgress, startOrResumeSession,
  type PlanItem, type SessionPlan,
} from '../lib/session.ts';
import { trimmable } from '../lib/history.ts';
import { activeVariant, convertWeight, effective, variantsFor } from '../lib/variants.ts';

type Phase = 'general' | 'warmup' | 'test' | 'work' | 'superset' | 'rest' | 'saving';

const SKIP_REASONS: Array<{ id: SkipReason; label: string }> = [
  { id: 'no-energy', label: 'НЕТ СИЛ' },
  { id: 'busy', label: 'ЗАНЯТ ТРЕНАЖЁР' },
  { id: 'pain', label: 'БОЛЬ' },
];

/** Обязательный пункт разминки в днях B и C — лёгкое сгибание ног. */
const MANDATORY_WARMUP = 3;

const clock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const kg = (n: number) => String(n).replace('.', ',');

export default function Workout() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [missing, setMissing] = useState(false);
  const [allowBarbell, setAllowBarbell] = useState(false);
  const [supersetsOn, setSupersetsOn] = useState(true);
  const [askTime, setAskTime] = useState(false);

  const [exIdx, setExIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('general');
  const [doneReps, setDoneReps] = useState(0);
  const [rir, setRir] = useState<number | null>(null);
  const [rest, setRest] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [askSkip, setAskSkip] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [testReps, setTestReps] = useState(5);
  const [askWarmup, setAskWarmup] = useState(false);

  const [generalChecked, setGeneralChecked] = useState<boolean[]>([]);
  const [warmChecked, setWarmChecked] = useState<boolean[]>([]);

  const results = useRef<Record<string, SetResult[]>>({});
  const skipped = useRef<Record<string, SkipReason>>({});
  /** Снятые из-за нехватки времени — их пропускаем при переходе дальше. */
  const dropped = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void (async () => {
      const settings = await getSettings();
      setAllowBarbell(settings.allowBarbellPress);
      setSupersetsOn(settings.supersetsEnabled);

      const p = await startOrResumeSession();
      if (!p) { setMissing(true); return; }

      // Подходы лежат в базе, поэтому выход из приложения посреди
      // тренировки ничего не теряет — возвращаемся туда, где были.
      const progress = await restoreProgress(p.session.id, p.items);
      results.current = progress.results;
      const resumed = Object.keys(progress.results).length > 0;

      setPlan(p);
      setExIdx(progress.exIdx);
      setSetIdx(progress.setIdx);
      setGeneralChecked(p.generalWarmup.map(() => false));
      setPhase(resumed
        ? (p.items[progress.exIdx].warmup.length && progress.setIdx === 0 ? 'warmup' : 'work')
        : 'general');
    })();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const item: PlanItem | undefined = plan?.items[exIdx];
  const ex = item ? effective(item.exercise, item.state) : undefined;
  const sets = item?.targets.length ?? 0;
  const target = item?.targets[setIdx] ?? 0;
  const isDistance = ex?.type === 'distance';
  const needsRir = Boolean(ex?.autoProgress && ex?.repRange);

  useEffect(() => {
    if (!item || !ex) return;
    setDoneReps(isDistance ? 1 : (item.targets[setIdx] ?? 0));
    setWarmChecked(item.warmup.map(() => false));
  }, [item, ex, setIdx, isDistance]);

  const stopTimer = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  const startRest = useCallback((seconds: number) => {
    stopTimer();
    setRest(seconds);
    setRestTotal(seconds);
    timer.current = setInterval(() => {
      setRest((left) => {
        if (left <= 1) { stopTimer(); beep(); vibrate(); return 0; }
        return left - 1;
      });
    }, 1000);
  }, [stopTimer]);

  if (missing) {
    return <main className="screen"><div style={{ padding: '0 var(--pad)' }} className="muted">Программа не загружена.</div></main>;
  }
  if (!plan || !item || !ex) {
    return <main className="screen"><div style={{ padding: '0 var(--pad)' }} className="label">ЗАГРУЗКА</div></main>;
  }

  /** Следующее невыброшенное упражнение. */
  const nextIndex = (from: number) => {
    let i = from + 1;
    while (i < plan.items.length && dropped.current.has(plan.items[i].exercise.id)) i++;
    return i;
  };

  const isLastExercise = nextIndex(exIdx) >= plan.items.length;

  const goNextExercise = async () => {
    stopTimer();
    if (isLastExercise) {
      setPhase('saving');
      await finishSession(plan.session.id, plan.items.map((it) => ({
        exerciseId: it.exercise.id,
        results: (results.current[it.exercise.id] ?? []).filter(Boolean),
        skipped: skipped.current[it.exercise.id],
      })));
      navigate(`/summary/${plan.session.id}`, { replace: true });
      return;
    }
    const at = nextIndex(exIdx);
    const next = plan.items[at];
    setExIdx(at);
    setSetIdx(0);
    setRir(null);
    setPhase(next.warmup.length ? 'warmup' : firstPhase(next));
  };

  /** Записываем подход и уходим на отдых. Отдых нужен всегда, запас — не всегда. */
  const recordAndRest = async () => {
    primeAudio();
    await logWorkSet(plan.session.id, ex.id, setIdx, item.weight, target, doneReps, null);
    setPhase('rest');
    startRest(ex.rest);
  };

  const pushResult = (value: number | null) => {
    (results.current[ex.id] ??= [])[setIdx] = { reps: doneReps, rir: value };
    void logWorkSet(plan.session.id, ex.id, setIdx, item.weight, target, doneReps, value);
    stopTimer();
    setRir(null);
    if (setIdx + 1 >= sets) void goNextExercise();
    else { setSetIdx((i) => i + 1); setPhase('work'); }
  };

  const doSkip = (reason: SkipReason) => {
    skipped.current[ex.id] = reason;
    setAskSkip(false);
    void goNextExercise();
  };

  const applySwap = async (v: VariantDef | null) => {
    const state = item.state;
    const now = new Date().toISOString();
    const base = state.preVariantWeight ?? item.weight;

    await db.exerciseState.put(v
      ? { ...state, variantId: v.id, preVariantWeight: base,
          currentWeight: convertWeight(base, v), updatedAt: now }
      : { ...state, variantId: null, preVariantWeight: undefined,
          currentWeight: base, updatedAt: now });

    const fresh = await startOrResumeSession();
    if (fresh) setPlan(fresh);
    setSwapOpen(false);
  };

  /* ---------------- Общая разминка ---------------- */

  if (phase === 'general') {
    const mandatoryDay = plan.day.id === 'B' || plan.day.id === 'C';
    const go = () => setPhase(plan.items[0].warmup.length ? 'warmup' : firstPhase(plan.items[0]));
    const proceed = () => {
      // Обязательный пункт нельзя проскочить молча — но и системным окном
      // спрашивать нельзя: оно вешает страницу и лезет поверх всего.
      if (mandatoryDay && !generalChecked[MANDATORY_WARMUP]) { setAskWarmup(true); return; }
      go();
    };

    if (askWarmup) {
      return (
        <main className="screen">
          <Head left={`ДЕНЬ ${plan.day.id}`} right="" />
          <div style={{ padding: '14px var(--pad) 0' }} className="title">Не отмечено сгибание ног</div>
          <Hint>
            В днях B и C лёгкое сгибание ног обязательно — это колено, а не формальность.
            Один подход на двадцать раз, вес почти никакой.
          </Hint>
          <div style={{ flex: 1 }} />
          <div style={{ padding: '16px var(--pad) 14px' }}>
            <button className="btn btn--primary" onClick={() => setAskWarmup(false)}>ВЕРНУТЬСЯ И СДЕЛАТЬ</button>
            <button className="btn btn--ghost" onClick={() => { setAskWarmup(false); go(); }}>
              всё равно пропустить
            </button>
          </div>
        </main>
      );
    }

    return (
      <main className="screen">
        <Head left={`ДЕНЬ ${plan.day.id} · НЕД ${String(plan.week).padStart(2, '0')}`} right="ПЕРЕД ТРЕНИРОВКОЙ" />
        <div style={{ padding: '14px var(--pad) 0' }} className="title">Общая разминка</div>
        <Hint>Один раз за тренировку. Отмечай, что прошёл.</Hint>
        <div style={{ flex: 1, minHeight: 0, marginTop: 14 }}>
          {plan.generalWarmup.map((line, i) => (
            <CheckRow key={i} on={generalChecked[i]} onClick={() => setGeneralChecked((c) => c.map((v, k) => (k === i ? !v : v)))}>
              <span style={{ flex: 1, fontSize: 14, color: generalChecked[i] ? 'var(--mut2)' : 'var(--fg2)', lineHeight: 1.3 }}>
                {line}
                {mandatoryDay && i === MANDATORY_WARMUP && (
                  <span className="label label--acc" style={{ display: 'block', marginTop: 3 }}>ОБЯЗАТЕЛЬНО В ЭТОТ ДЕНЬ</span>
                )}
              </span>
            </CheckRow>
          ))}
        </div>
        <div style={{ padding: '16px var(--pad) 14px' }}>
          <button className="btn btn--primary" onClick={proceed}>К УПРАЖНЕНИЯМ</button>
        </div>
      </main>
    );
  }

  /* ---------------- Разминочные подходы ---------------- */

  if (phase === 'warmup') {
    return (
      <main className="screen">
        <Head left={`УПРАЖНЕНИЕ ${exIdx + 1} ИЗ ${plan.items.length}`} right="" />
        <div style={{ padding: '14px var(--pad) 0' }} className="title">Разминочные подходы</div>
        <div style={{ padding: '6px var(--pad) 0', fontSize: 15, color: 'var(--fg2)' }}>{ex.name}</div>
        <Hint>
          Это не выбор веса. Сделай все подходы подряд, снизу вверх — разогреться, а не устать.
          Рабочий вес будет {kg(item.weight)} кг.
        </Hint>
        <div style={{ marginTop: 14 }}>
          {item.warmup.map((w, i) => (
            <CheckRow key={i} on={warmChecked[i]} onClick={() => setWarmChecked((c) => c.map((v, k) => (k === i ? !v : v)))}>
              <span className="label" style={{ width: 24, flex: 'none' }}>{i + 1}</span>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: warmChecked[i] ? 'var(--mut2)' : 'var(--fg)' }}>
                {kg(w.weight)} кг × {w.reps}
              </span>
            </CheckRow>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '16px var(--pad) 14px' }}>
          <button className="btn btn--primary" onClick={() => setPhase(firstPhase(item))}>К РАБОЧИМ ПОДХОДАМ</button>
        </div>
      </main>
    );
  }

  /* ---------------- Тест максимума: подтягивания ---------------- */

  if (phase === 'test') {
    const submit = async () => {
      const state = item.state;
      const now = new Date().toISOString();
      const sets = item.exercise.sets;
      const min = item.exercise.repRange?.[0] ?? 8;

      // Пять и больше — работаем подтягиваниями по (максимум−1).
      // Меньше — уходим на тягу верхнего блока, как в спецификации.
      await db.exerciseState.put(testReps >= 5
        ? { ...state, resolvedConditional: 'pullups', pullupMax: testReps, currentWeight: 0,
            nextTargetReps: Array.from({ length: sets }, () => Math.max(1, testReps - 1)), updatedAt: now }
        : { ...state, resolvedConditional: 'lat-pulldown', pullupMax: testReps,
            variantId: 'lat-pulldown', preVariantWeight: 0, currentWeight: 55,
            nextTargetReps: Array.from({ length: sets }, () => min), updatedAt: now });

      // Тест засчитываем как первый подход — это настоящая работа, а не прикидка.
      (results.current[item.exercise.id] ??= [])[0] = { reps: testReps, rir: 0 };
      await logWorkSet(plan.session.id, item.exercise.id, 0, 0, testReps, testReps, 0);

      const fresh = await startOrResumeSession();
      if (fresh) setPlan(fresh);
      setSetIdx(1);
      setPhase('rest');
      startRest(item.exercise.rest);
    };

    return (
      <main className="screen">
        <Head left={`УПРАЖНЕНИЕ ${exIdx + 1} ИЗ ${plan.items.length}`} right="ПЕРВАЯ СЕССИЯ" />
        <div style={{ padding: '14px var(--pad) 0' }} className="title">Подтягивания</div>
        <Hint>
          Один раз меряем максимум — от него зависит, работаем подтягиваниями
          или уходим на тягу верхнего блока. Дальше этот экран не появится.
        </Hint>

        <div className="panel" style={{ flex: 1, minHeight: 0, margin: '18px var(--pad) 0' }}>
          <div className="panel__head">
            <span className="label label--acc">ТЕСТ МАКСИМУМА</span>
            <span className="label">ЧИСТО, БЕЗ РАСКАЧКИ</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px' }}>
            <button className="btn" style={{ width: 70, minHeight: 60, fontSize: 26 }}
              onClick={() => setTestReps((n) => Math.max(0, n - 1))}>−</button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className="big">{testReps}</div>
              <div className="unit" style={{ marginTop: 12 }}>РАЗ ЗА ПОДХОД</div>
            </div>
            <button className="btn" style={{ width: 70, minHeight: 60, fontSize: 26 }}
              onClick={() => setTestReps((n) => Math.min(30, n + 1))}>+</button>
          </div>
          <div className="panel__foot">
            <span className="mono" style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--mut)' }}>
              {testReps >= 5 ? `РАБОТАЕМ ПО ${testReps - 1} ПОВТОРОВ` : 'УХОДИМ НА ТЯГУ ВЕРХНЕГО БЛОКА, 55 КГ'}
            </span>
          </div>
        </div>

        <div style={{ padding: '16px var(--pad) 14px' }}>
          <button className="btn btn--primary" onClick={() => void submit()}>ЗАПИСАТЬ РЕЗУЛЬТАТ</button>
        </div>
      </main>
    );
  }

  /* ---------------- Отдых ---------------- */

  if (phase === 'rest') {
    const over = rest === 0;
    const ticks = 18;
    const filled = restTotal > 0 ? Math.round((rest / restTotal) * ticks) : 0;
    const ready = !needsRir || rir !== null;

    return (
      <main className="screen">
        <Head left={`УПРАЖНЕНИЕ ${exIdx + 1} ИЗ ${plan.items.length}`} right={`ПОДХОД ${setIdx + 1} ЗАПИСАН`} />
        <div style={{ padding: '14px var(--pad) 0' }} className="title">{ex.name}</div>

        <div className="panel" style={{ flex: 1, minHeight: 0, margin: '18px var(--pad) 0' }}>
          <div className="panel__head">
            <span className="label label--acc">{over ? 'ОТДЫХ ОКОНЧЕН' : 'ОТДЫХ'}</span>
            <span className="label">{kg(item.weight)} КГ × {doneReps}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 16px' }}>
            <div className="mono acc" style={{ fontSize: 84, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.05em', textAlign: 'center' }}>
              {clock(rest)}
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 22 }}>
              {Array.from({ length: ticks }, (_, i) => (
                <div key={i} style={{ flex: 1, height: 10, background: i < filled ? 'var(--acc)' : '#202024' }} />
              ))}
            </div>
          </div>
          {needsRir && (
            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                <span className="label" style={{ color: 'var(--mut)' }}>МОГ БЫ СДЕЛАТЬ ЕЩЁ</span>
                <span className="label">ПОВТОРОВ</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
                {[0, 1, 2, 3].map((v) => (
                  <button key={v} onClick={() => setRir(v)} className="mono"
                    style={{
                      height: 58, fontSize: 18, fontWeight: rir === v ? 700 : 500,
                      border: `1px solid ${rir === v ? 'var(--acc)' : 'var(--line)'}`,
                      background: rir === v ? 'var(--acc)' : 'transparent',
                      color: rir === v ? 'var(--acc-ink)' : 'var(--fg2)',
                    }}>
                    {v === 3 ? '3+' : v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '132px minmax(0, 1fr)', gap: 10, padding: '16px var(--pad) 14px' }}>
          <button className="btn" style={{ minHeight: 76 }}
            onClick={() => { setRest((r) => r + 30); setRestTotal((t) => Math.max(t, rest + 30)); }}>
            +30 СЕК
          </button>
          <button className="btn btn--primary" style={{ fontSize: 15, letterSpacing: '0.12em' }}
            disabled={!ready} onClick={() => pushResult(rir)}>
            {!ready ? 'ВЫБЕРИ ЧИСЛО' : (setIdx + 1 >= sets ? 'ЗАКОНЧИТЬ' : `ПОДХОД ${setIdx + 2}`)}
          </button>
        </div>
      </main>
    );
  }

  if (phase === 'saving') {
    return <main className="screen"><div style={{ padding: '0 var(--pad)' }} className="label">СЧИТАЮ ИТОГ</div></main>;
  }

  /* ---------------- Замена упражнения ---------------- */

  if (swapOpen) {
    const current = activeVariant(item.exercise, item.state);
    const base = item.state.preVariantWeight ?? item.weight;

    return (
      <main className="screen">
        <Head left="ЗАМЕНА УПРАЖНЕНИЯ" right="" />
        <div style={{ padding: '14px var(--pad) 0' }} className="title">{item.exercise.name}</div>
        <Hint>
          Вес пересчитан под другой снаряд — это первая прикидка, дальше алгоритм
          доведёт его за пару сессий. Подходы и повторы не меняются.
        </Hint>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 14 }}>
          {current && (
            <SwapRow name={item.exercise.name} weight={base} reps={target} isDistance={isDistance}
              note="Исходное движение из программы." onPick={() => void applySwap(null)} />
          )}
          {variantsFor(item.exercise).map((v) => {
            const locked = Boolean(v.barbellPress && !allowBarbell);
            if (current?.id === v.id) return null;
            return (
              <SwapRow key={v.id} name={v.name} weight={convertWeight(base, v)}
                reps={target} isDistance={isDistance} note={v.note} locked={locked}
                onPick={() => void applySwap(v)} />
            );
          })}
        </div>

        <div style={{ padding: '14px var(--pad)' }}>
          <button className="btn" onClick={() => setSwapOpen(false)}>ОТМЕНА</button>
        </div>
      </main>
    );
  }

  /* ---------------- Рабочий подход и связка ---------------- */

  const pair = phase === 'superset';
  const cut = trimmable(plan.items.map((i) => i.exercise), exIdx)
    .filter((e) => !dropped.current.has(e.id));
  const ss = item.exercise.superset;
  const left = sets - setIdx - 1;
  const swapped = Boolean(item.state.variantId);

  return (
    <main className="screen">
      <Head left={`УПРАЖНЕНИЕ ${exIdx + 1} ИЗ ${plan.items.length}`}
        right={askSkip ? '' : 'ПРОПУСТИТЬ'} onRight={askSkip ? undefined : () => setAskSkip(true)} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px var(--pad) 0' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title">{pair && ss ? ss.name : ex.name}</div>
          {swapped && !pair && <div className="label label--acc" style={{ marginTop: 4 }}>ЗАМЕНА · ВМЕСТО «{item.exercise.shortName ?? item.exercise.name}»</div>}
        </div>
        {!pair && !askSkip && (
          <button className="label" onClick={() => setSwapOpen(true)}
            style={{ flex: 'none', border: '1px solid var(--line)', padding: '11px 10px', color: 'var(--fg2)' }}>
            ЗАМЕНИТЬ
          </button>
        )}
      </div>

      {askSkip ? (
        <div style={{ flex: 1, minHeight: 0, marginTop: 18 }}>
          {askTime ? (
            <>
              <div style={{ padding: '0 var(--pad) 10px' }} className="label">СНИМЕМ С КОНЦА</div>
              <div style={{ padding: '0 var(--pad) 12px', fontSize: 13, color: 'var(--mut)', lineHeight: 1.4 }}>
                Первые три упражнения не трогаем никогда — в них вся тренировка.
                Уйдут только эти:
              </div>
              {cut.length === 0 ? (
                <div style={{ padding: '0 var(--pad)', fontSize: 14, color: 'var(--fg2)' }}>
                  Снимать нечего — дальше только основное.
                </div>
              ) : cut.map((e) => (
                <div key={e.id} className="row" style={{ minHeight: 52 }}>
                  <span className="ellipsis" style={{ flex: 1, fontSize: 14, color: 'var(--mut)' }}>
                    {e.shortName ?? e.name}
                  </span>
                </div>
              ))}
              <div style={{ padding: '16px var(--pad) 0', display: 'grid', gap: 10 }}>
                <button className="btn btn--primary" style={{ minHeight: 60, fontSize: 15 }} disabled={!cut.length}
                  onClick={() => {
                    cut.forEach((e) => { dropped.current.add(e.id); skipped.current[e.id] = 'no-time'; });
                    setAskTime(false);
                    setAskSkip(false);
                  }}>
                  СНЯТЬ {cut.length}
                </button>
                <button className="btn btn--ghost" onClick={() => setAskTime(false)}>назад</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '0 var(--pad) 12px' }} className="label">ПОЧЕМУ ПРОПУСКАЕМ</div>
              {SKIP_REASONS.map((r) => (
                <button key={r.id} className="mono" onClick={() => doSkip(r.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0 var(--pad)', minHeight: 64, fontSize: 15, letterSpacing: '0.08em', borderBottom: '1px solid var(--line-soft)' }}>
                  {r.label}
                </button>
              ))}
              <button className="mono" onClick={() => setAskTime(true)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0 var(--pad)', minHeight: 64, fontSize: 15, letterSpacing: '0.08em', borderBottom: '1px solid var(--line-soft)', color: 'var(--acc)' }}>
                МАЛО ВРЕМЕНИ — УРЕЗАТЬ
              </button>
              <button className="btn btn--ghost" style={{ marginTop: 14 }} onClick={() => setAskSkip(false)}>отмена</button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="panel" style={{ flex: 1, minHeight: 0, margin: '18px var(--pad) 0' }}>
            <div className="panel__head">
              <span className="label label--acc">{pair ? 'СВЯЗКА · БЕЗ ОТДЫХА' : `ПОДХОД ${setIdx + 1} ИЗ ${sets}`}</span>
              <span className="label">{pair ? `ПОСЛЕ ПОДХОДА ${setIdx + 1}` : ''}</span>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
                <div className="big">{kg(pair && ss ? ss.weight : item.weight)}</div>
                <div className="unit" style={{ marginTop: 12 }}>КИЛОГРАММОВ</div>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-soft)' }} />
              <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
                <div className="big">{isDistance && !pair ? ex.distance : (pair && ss ? ss.repRange[0] : doneReps)}</div>
                <div className="unit" style={{ marginTop: 12 }}>{isDistance && !pair ? 'МЕТРОВ' : 'ПОВТОРОВ'}</div>
              </div>
            </div>
            <div className="panel__foot">
              <span className="mono" style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--mut)' }}>
                {pair ? 'СРАЗУ, НЕ ОТДЫХАЯ'
                  : left > 0 ? `ОСТАЛОСЬ ЕЩЁ ${left} ${plural(left, 'подход').toUpperCase()}`
                  : 'ЭТОТ ПОДХОД ПОСЛЕДНИЙ'}
              </span>
            </div>
          </div>

          {ex.note && !pair && (
            <div style={{ display: 'flex', gap: 12, padding: '14px var(--pad) 0' }}>
              <div style={{ width: 2, background: 'var(--line)', flex: 'none' }} />
              <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--mut)' }}>{ex.note}</div>
            </div>
          )}

          <div style={{ padding: '16px var(--pad) 0' }}>
            <button className="btn btn--primary" onClick={() => {
              primeAudio();
              if (pair) { void recordAndRest(); return; }
              if (ss && supersetsOn && setIdx < ss.sets) { setPhase('superset'); return; }
              void recordAndRest();
            }}>
              ВЫПОЛНИЛ
            </button>
            {!pair && !isDistance && ex.repRange && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button className="btn" style={{ width: 60, minHeight: 52, fontSize: 22 }}
                  onClick={() => setDoneReps((r) => Math.max(1, r - 1))}>−</button>
                <span className="mono" style={{ flex: 1, textAlign: 'center', fontSize: 13, letterSpacing: '0.1em', color: doneReps === target ? 'var(--mut2)' : 'var(--acc)' }}>
                  {doneReps === target ? 'ВЫШЛО РОВНО В ЦЕЛЬ' : `СДЕЛАЛ ${doneReps}`}
                </span>
                <button className="btn" style={{ width: 60, minHeight: 52, fontSize: 22 }}
                  onClick={() => setDoneReps((r) => Math.min(50, r + 1))}>+</button>
              </div>
            )}
            {pair && <button className="btn btn--ghost" onClick={() => void recordAndRest()}>ПРОПУСТИТЬ СВЯЗКУ</button>}
          </div>

          {item.previous && !pair && (
            <div className="row" style={{ marginTop: 14, borderTop: '1px solid var(--line)', borderBottom: 0, height: 52 }}>
              <span className="label" style={{ width: 92, flex: 'none' }}>ПРОШЛЫЙ РАЗ</span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--fg2)' }}>
                {kg(item.previous.weight)} кг · {item.previous.reps.join(' ')}
              </span>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/* ---------------- Мелкие куски ---------------- */

/** Условное упражнение начинается с теста максимума, остальные — сразу с работы. */
function firstPhase(item: PlanItem): Phase {
  return item.exercise.conditional && !item.state.resolvedConditional ? 'test' : 'work';
}

function Head({ left, right, onRight }: { left: string; right: string; onRight?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 var(--pad)' }}>
      <span className="label">{left}</span>
      {onRight
        ? <button className="label" style={{ color: 'var(--mut)' }} onClick={onRight}>{right}</button>
        : <span className="label">{right}</span>}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px var(--pad) 0', fontSize: 13, lineHeight: 1.4, color: 'var(--mut)' }}>
      {children}
    </div>
  );
}

function CheckRow({ on, onClick, children }: { on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
        padding: '0 var(--pad)', minHeight: 64, borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ width: 26, height: 26, flex: 'none', border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`, background: on ? 'var(--acc)' : 'transparent' }} />
      {children}
    </button>
  );
}

function SwapRow({ name, weight, reps, note, locked, isDistance, onPick }: {
  name: string; weight: number; reps: number; note: string;
  locked?: boolean; isDistance?: boolean; onPick: () => void;
}) {
  return (
    <button onClick={locked ? undefined : onPick} disabled={locked}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '13px var(--pad)',
        borderBottom: '1px solid var(--line-soft)', opacity: locked ? 0.4 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: 'var(--fg)' }}>{name}</span>
        <span className="mono" style={{ flex: 'none', fontSize: 15, fontWeight: 700 }}>
          {weight > 0 ? `${kg(weight)} кг` : 'свой вес'}{isDistance ? '' : ` × ${reps}`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: locked ? 'var(--acc)' : 'var(--mut2)', marginTop: 4, lineHeight: 1.35 }}>
        {locked ? 'Заперто: разреши штангу в жимах в настройках — это запястье.' : note}
      </div>
    </button>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIMITS } from '../db/movements.ts';
import { PROFILE_LIMITS, type Equipment, type Goal, type Profile, type Sex } from '../db/types.ts';
import { confidence } from '../lib/anthro.ts';
import { generateProgram } from '../lib/generator.ts';
import { createProfile, listProfiles, type ProfileDraft } from '../lib/profiles.ts';

/**
 * Создание профиля. По одному вопросу на экран: длинная анкета пугает,
 * а между подходами её и не заполнить. Значения выставлены заранее —
 * можно просто нажимать «дальше» и поправить только своё.
 *
 * Ввод шаговыми кнопками, а не клавиатурой: на экран смотрят потной рукой.
 * Подтверждений системными окнами здесь нет и быть не может — они вешают
 * страницу; всё решается экраном.
 */

const EQUIPMENT: Array<{ id: Equipment; label: string }> = [
  { id: 'dumbbell', label: 'Гантели' },
  { id: 'barbell', label: 'Штанга' },
  { id: 'ez', label: 'EZ-гриф' },
  { id: 'trapbar', label: 'Трэп-бар' },
  { id: 'machine', label: 'Тренажёры' },
  { id: 'cable', label: 'Блоки' },
  { id: 'bodyweight', label: 'Турник и брусья' },
];

const GOALS: Array<{ id: Goal; label: string; hint: string }> = [
  { id: 'mass', label: 'Набрать массу', hint: 'Средние повторы, объём выше.' },
  { id: 'strength', label: 'Стать сильнее', hint: 'Меньше повторов, отдых дольше.' },
  { id: 'lean', label: 'Сохранить мышцы', hint: 'Держим мышцы на дефиците.' },
];

/** Человеческие названия групп движений — для списка незакрытых мест. */
const PATTERN_RU: Record<string, string> = {
  hinge: 'наклон', squat: 'присед', quad: 'квадрицепс', ham: 'бицепс бедра',
  calf: 'икры', carry: 'переноска', 'push-h': 'жим лёжа', 'push-v': 'жим над головой',
  'pull-h': 'тяга к себе', 'pull-v': 'тяга сверху', 'lat-delt': 'средняя дельта',
  'rear-delt': 'задняя дельта', trap: 'трапеция', biceps: 'бицепс', triceps: 'трицепс',
  forearm: 'предплечья', lowback: 'поясница',
};

const THIS_YEAR = new Date().getFullYear();

const STEPS = [
  'ПРОГРАММА', 'ИМЯ', 'ПОЛ И ГОД', 'РОСТ И ВЕС', 'СТАЖ',
  'НЕДЕЛЯ И ЦЕЛЬ', 'ОБОРУДОВАНИЕ', 'ЗДОРОВЬЕ', 'ИТОГ',
];

const LAST = STEPS.length - 1;

const kg = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

const clamp = (value: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, value));

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export default function ProfileNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  /** Есть ли куда возвращаться: на первом запуске профилей ещё нет. */
  const [first, setFirst] = useState(false);

  const [source, setSource] = useState<'generated' | 'seed'>('generated');
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex>('m');
  const [birthYear, setBirthYear] = useState(THIS_YEAR - 25);
  const [heightCm, setHeight] = useState(175);
  const [weightKg, setWeight] = useState(75);
  /**
   * Полгода по умолчанию, а не год: кто не тронул этот шаг, получит заниженные
   * веса. Ошибиться вниз дёшево, вверх — травма. Ровно с года расчёт переходит
   * на полный коэффициент, поэтому значение по умолчанию держим ниже.
   */
  const [experienceYears, setExperience] = useState(0.5);
  const [goal, setGoal] = useState<Goal>('mass');
  const [daysPerWeek, setDays] = useState(3);
  const [equipment, setEquipment] = useState<Equipment[]>(EQUIPMENT.map((e) => e.id));
  const [limits, setLimits] = useState<string[]>([]);

  useEffect(() => {
    void listProfiles().then((list) => setFirst(list.length === 0));
  }, []);

  const draft: ProfileDraft = {
    name: name.trim() || 'Без имени',
    sex, birthYear, heightCm, weightKg, experienceYears, goal, daysPerWeek,
    equipment, limits, source,
  };

  // Готовая программа не спрашивает ни оборудование, ни здоровье:
  // она уже собрана и выверена, подгонять там нечего.
  const jumpsToSummary = source === 'seed' && step === 5;
  const blocked = step === 6 && equipment.length === 0;

  const back = () => {
    if (step > 0) { setStep((s) => (s === LAST && source === 'seed' ? 5 : s - 1)); return; }
    navigate('/settings');
  };

  const finish = async () => {
    setBusy(true);
    await createProfile(draft);
    navigate('/', { replace: true });
  };

  return (
    <main className="screen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 var(--pad)', minHeight: 30 }}>
        {step > 0 || !first
          ? <button className="btn btn--ghost" style={{ width: 'auto', padding: 0 }} onClick={back}>← назад</button>
          : <span className="label">НОВЫЙ ПРОФИЛЬ</span>}
        <span className="label">{STEPS[step]}</span>
      </div>

      <div className="segs" style={{ margin: '14px var(--pad) 0' }}>
        {STEPS.map((s, i) => (
          <i key={s} data-on={i < step ? 'done' : i === step ? 'now' : undefined} />
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {step === 0 && (
          <Ask
            title="Откуда взять программу"
            hint="Можно собрать программу под твои данные, а можно взять готовую — ту, по которой занимается владелец приложения."
          >
            <div style={{ display: 'grid', gap: 10, padding: '0 var(--pad)' }}>
              <Pick
                on={source === 'generated'}
                label="Собрать под меня"
                hint="Дни и упражнения соберутся по твоему оборудованию и здоровью, веса посчитаются от твоих данных."
                onClick={() => setSource('generated')}
              />
              <Pick
                on={source === 'seed'}
                label="Взять готовую программу"
                hint="Три дня в неделю, выверена вживую. В ней учтены чужие ограничения: колено, запястье, поясница — приседы только до ящика, становая с трэп-бара."
                onClick={() => setSource('seed')}
              />
            </div>
          </Ask>
        )}

        {step === 1 && (
          <Ask title="Как тебя зовут" hint="Имя нужно только чтобы отличать профили на этом телефоне.">
            <div style={{ padding: '0 var(--pad)' }}>
              <input
                autoFocus
                type="text"
                value={name}
                placeholder="Имя"
                onChange={(e) => setName(e.target.value.slice(0, 24))}
                style={{
                  width: '100%', height: 62, padding: '0 16px', fontFamily: 'var(--font)',
                  fontSize: 20, fontWeight: 700, color: 'var(--fg)', background: 'var(--panel-2)',
                  border: '1px solid var(--line)', borderRadius: 'var(--r-btn)',
                }}
              />
            </div>
          </Ask>
        )}

        {step === 2 && (
          <Ask title="Пол и год рождения" hint="Пол заметно меняет расчёт в верхе тела, возраст — после тридцати пяти.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 var(--pad)' }}>
              <Pick on={sex === 'm'} label="Мужской" onClick={() => setSex('m')} />
              <Pick on={sex === 'f'} label="Женский" onClick={() => setSex('f')} />
            </div>
            <Stepper
              label="ГОД РОЖДЕНИЯ"
              value={String(birthYear)}
              onMinus={() => setBirthYear((v) => Math.max(1930, v - 1))}
              onPlus={() => setBirthYear((v) => Math.min(THIS_YEAR - 12, v + 1))}
            />
            <Note>{THIS_YEAR - birthYear} лет</Note>
          </Ask>
        )}

        {step === 3 && (
          <Ask title="Рост и вес" hint="Рост меняет рычаги: у высоких жимы идут тяжелее, тяги легче. Вес — основа расчёта.">
            <Stepper
              label="РОСТ, СМ"
              value={String(heightCm)}
              onMinus={() => setHeight((v) => clamp(v - 1, PROFILE_LIMITS.heightCm))}
              onPlus={() => setHeight((v) => clamp(v + 1, PROFILE_LIMITS.heightCm))}
            />
            <Stepper
              label="ВЕС, КГ"
              value={kg(weightKg)}
              onMinus={() => setWeight((v) => clamp(Math.round((v - 0.5) * 10) / 10, PROFILE_LIMITS.weightKg))}
              onPlus={() => setWeight((v) => clamp(Math.round((v + 0.5) * 10) / 10, PROFILE_LIMITS.weightKg))}
            />
            <Note>
              Допустимо: рост {PROFILE_LIMITS.heightCm[0]}–{PROFILE_LIMITS.heightCm[1]} см,
              вес {PROFILE_LIMITS.weightKg[0]}–{PROFILE_LIMITS.weightKg[1]} кг.
            </Note>
          </Ask>
        )}

        {step === 4 && (
          <Ask
            title="Стаж непрерывных тренировок"
            hint="Именно непрерывных. После долгого перерыва ставь меньше: сила уходит быстрее, чем возвращается, и завышенный стаж выдаст веса, которые сейчас не поднять."
          >
            <Stepper
              label="ЛЕТ"
              value={kg(experienceYears)}
              onMinus={() => setExperience((v) => clamp(Math.round((v - (v <= 1 ? 0.5 : 1)) * 10) / 10, PROFILE_LIMITS.experienceYears))}
              onPlus={() => setExperience((v) => clamp(Math.round((v + (v < 1 ? 0.5 : 1)) * 10) / 10, PROFILE_LIMITS.experienceYears))}
            />
            <Note>
              {experienceYears < 1
                ? 'Меньше года — веса будут заметно занижены, и это правильно.'
                : experienceYears < 3
                  ? 'От года до трёх — обычный расчёт.'
                  : 'Больше трёх лет — расчёт поднимет веса, но всё равно с запасом.'}
            </Note>
          </Ask>
        )}

        {step === 5 && (
          <Ask title="Сколько тренировок в неделю" hint="От этого зависит, как разложатся дни. Дни идут очередью и к календарю не привязаны: пропустил — следующая та же по счёту.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '0 var(--pad)' }}>
              {[2, 3, 4].map((n) => (
                <Pick key={n} on={daysPerWeek === n} label={String(n)} onClick={() => setDays(n)} />
              ))}
            </div>
            <div style={{ marginTop: 22 }}>
              <div className="label" style={{ padding: '0 var(--pad) 8px' }}>ЦЕЛЬ</div>
              {GOALS.map((g) => (
                <Pick key={g.id} on={goal === g.id} label={g.label} hint={g.hint} row
                  onClick={() => setGoal(g.id)} />
              ))}
            </div>
          </Ask>
        )}

        {step === 6 && (
          <Ask title="Что есть в зале" hint="Отметь то, до чего реально дотянуться. Чего нет — того в программе не будет.">
            {EQUIPMENT.map((e) => (
              <Pick key={e.id} on={equipment.includes(e.id)} label={e.label} row
                onClick={() => setEquipment((list) => toggle(list, e.id))} />
            ))}
            {equipment.length === 0 && (
              <Note tone="down">Без снарядов программу собрать не из чего — отметь хотя бы одно.</Note>
            )}
          </Ask>
        )}

        {step === 7 && (
          <Ask
            title="Ограничения по здоровью"
            hint="Отмеченное закроет часть движений — они не появятся ни в программе, ни в заменах. Если ничего не беспокоит, просто иди дальше."
          >
            {LIMITS.map((l) => (
              <Pick key={l.id} on={limits.includes(l.id)} label={l.label} hint={l.hint} row
                onClick={() => setLimits((list) => toggle(list, l.id))} />
            ))}
          </Ask>
        )}

        {step === LAST && <Result draft={draft} />}
      </div>

      <div style={{ padding: '14px var(--pad)' }}>
        {step === LAST ? (
          <button className="btn btn--primary" disabled={busy} onClick={() => void finish()}>
            {busy ? 'СОБИРАЮ ПРОГРАММУ' : 'НАЧАТЬ'}
          </button>
        ) : (
          <button className="btn btn--primary" disabled={blocked}
            onClick={() => setStep(jumpsToSummary ? LAST : step + 1)}>
            ДАЛЬШЕ
          </button>
        )}
      </div>
    </main>
  );
}

/**
 * Итог: что получилось и насколько этому можно верить.
 * Программа считается тут же — генератор детерминирован, в базу ляжет ровно
 * то же самое.
 */
function Result({ draft }: { draft: ProfileDraft }) {
  const asProfile: Profile = { ...draft, id: 'preview', createdAt: '' };
  const built = draft.source === 'seed' ? null : generateProgram(asProfile);
  const trust = confidence(asProfile);
  const gaps = built?.gaps ?? [];

  return (
    <>
      <div style={{ padding: '18px var(--pad) 0' }}>
        <div className="title">{draft.source === 'seed' ? 'Готовая программа' : 'Программа собрана'}</div>
      </div>

      <div style={{ padding: '12px var(--pad) 0' }}>
        <div className="info">
          <span className="info__icon" style={{ fontWeight: 700 }}>!</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, color: 'var(--fg)', fontWeight: 700 }}>
              Это первая прикидка
            </span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--fg2)', marginTop: 4, lineHeight: 1.4 }}>
              Рост и вес предсказывают силу слабо, решает стаж. Числа занижены намеренно:
              ошибиться вниз дёшево, вверх — травма. Дальше вес доводит сам алгоритм,
              за одну-две сессии.
            </span>
            {trust === 'low' && (
              <span style={{ display: 'block', fontSize: 13, color: 'var(--down)', marginTop: 8, lineHeight: 1.4 }}>
                Стаж меньше года — тут расчёту верить почти нельзя. Считай эти числа
                точкой старта, а не рабочим весом: первые тренировки проведи сознательно
                легко, алгоритм сам поднимет вес по твоим ответам.
              </span>
            )}
          </span>
        </div>
      </div>

      {built && (
        <div style={{ marginTop: 18 }}>
          {built.days.map((day) => {
            const list = built.exercises.filter((ex) => ex.dayId === day.id);
            return (
              <div key={day.id} style={{ marginBottom: 14 }}>
                <div className="row" style={{ borderBottom: '1px solid var(--line)' }}>
                  <span className="label label--acc" style={{ width: 22, flex: 'none' }}>{day.id}</span>
                  <span className="ellipsis" style={{ flex: 1, fontSize: 14, color: 'var(--fg2)' }}>{day.name}</span>
                  <span className="label">{list.length}</span>
                </div>
                {list.map((ex) => (
                  <div key={ex.id} style={{
                    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 68px 56px', gap: 10,
                    alignItems: 'center', padding: '0 var(--pad)', height: 42,
                    borderBottom: '1px solid var(--line-soft)',
                  }}>
                    <span className="ellipsis" style={{ fontSize: 13, color: 'var(--fg2)' }}>
                      {ex.shortName ?? ex.name}
                    </span>
                    <span className="num" style={{ fontSize: 12, color: 'var(--mut)', textAlign: 'right' }}>
                      {ex.type === 'distance' ? `${ex.sets} × ${ex.distance} м` : `${ex.sets} × ${ex.repRange?.[0]}`}
                    </span>
                    <span className="num" style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                      {ex.catalogId === 'pullup' ? 'тест' : kg(ex.startWeight ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {draft.source === 'seed' && (
        <div style={{ padding: '18px var(--pad) 0', fontSize: 14, color: 'var(--fg2)', lineHeight: 1.45 }}>
          Три дня в неделю, дни идут очередью A → B → C. Веса первых недель заданы
          расписанием, дальше их ведёт алгоритм по твоим ответам после подходов.
        </div>
      )}

      {gaps.length > 0 && (
        <div style={{ margin: '18px var(--pad) 0', border: '1px solid var(--down)', borderRadius: 'var(--r-box)', padding: '14px' }}>
          <div className="label" style={{ color: 'var(--down)' }}>НЕЧЕМ ЗАКРЫТЬ: {gaps.length}</div>
          <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 5, lineHeight: 1.4 }}>
            На эти места не нашлось ни снаряда, ни разрешённого движения. Программа
            соберётся без них — это не ошибка, но знать надо.
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {gaps.map((g, i) => (
              <span key={`${g.dayId}-${g.pattern}-${i}`} className="chip">
                {g.dayId} · {PATTERN_RU[g.pattern] ?? g.pattern}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 12 }} />
    </>
  );
}

/* ---------- мелкие части экрана ---------- */

function Ask({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '18px var(--pad) 0' }} className="title">{title}</div>
      <div style={{ padding: '8px var(--pad) 18px' }} className="hint">{hint}</div>
      {children}
    </>
  );
}

function Pick({ on, label, hint, row, onClick }: {
  on: boolean; label: string; hint?: string; row?: boolean; onClick: () => void;
}) {
  if (row) {
    return (
      <button className="row" style={{ width: '100%', minHeight: 62, textAlign: 'left' }} onClick={onClick}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, color: on ? 'var(--fg)' : 'var(--fg2)' }}>{label}</span>
          {hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--mut2)', marginTop: 3, lineHeight: 1.35 }}>{hint}</span>}
        </span>
        <span style={{
          flex: 'none', width: 26, height: 26, borderRadius: 8,
          border: `1px solid ${on ? 'var(--acc)' : 'var(--line-2)'}`,
          background: on ? 'var(--acc)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--acc-ink)', fontSize: 15, fontWeight: 700,
        }}>{on ? '✓' : ''}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, width: '100%', minHeight: 62, padding: '12px 14px', textAlign: 'center',
        borderRadius: 'var(--r-btn)',
        border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
        background: on ? 'var(--acc-soft)' : 'var(--panel-2)',
        color: on ? 'var(--fg)' : 'var(--fg2)',
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 700 }}>{label}</span>
      {hint && (
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--mut)', lineHeight: 1.3 }}>{hint}</span>
      )}
    </button>
  );
}

function Stepper({ label, value, onMinus, onPlus }: {
  label: string; value: string; onMinus: () => void; onPlus: () => void;
}) {
  return (
    <div className="row" style={{ minHeight: 78 }}>
      <span className="label" style={{ flex: 1 }}>{label}</span>
      <button className="round" onClick={onMinus}>−</button>
      <span className="num" style={{ minWidth: 74, textAlign: 'center', fontSize: 26, fontWeight: 700 }}>{value}</span>
      <button className="round" onClick={onPlus}>+</button>
    </div>
  );
}

function Note({ children, tone }: { children: ReactNode; tone?: 'down' }) {
  return (
    <div style={{
      padding: '12px var(--pad) 0', fontSize: 13, lineHeight: 1.4,
      color: tone === 'down' ? 'var(--down)' : 'var(--mut)',
    }}>
      {children}
    </div>
  );
}

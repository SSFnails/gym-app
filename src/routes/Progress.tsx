import { useEffect, useState } from 'react';
import Chart from '../components/Chart.tsx';
import { db } from '../db/db.ts';
import { weeklyAverage, weightSeries, type Point } from '../lib/history.ts';
import { effective } from '../lib/variants.ts';
import type { Exercise, Measurement } from '../db/types.ts';

const FIELDS: Array<{ key: keyof Omit<Measurement, 'date'>; label: string }> = [
  { key: 'chest', label: 'ГРУДЬ' },
  { key: 'waist', label: 'ТАЛИЯ' },
  { key: 'thigh', label: 'БЕДРО' },
  { key: 'arm',   label: 'РУКА' },
  { key: 'neck',  label: 'ШЕЯ' },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function Progress() {
  const [tab, setTab] = useState<'body' | 'lifts' | 'girth'>('body');
  const [weights, setWeights] = useState<Point[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [series, setSeries] = useState<Point[]>([]);
  const [measure, setMeasure] = useState<Measurement | null>(null);
  const [draft, setDraft] = useState(70);

  const load = async () => {
    const rows = await db.bodyWeight.orderBy('date').toArray();
    setWeights(rows.map((r) => ({ date: r.date, value: r.kg })));
    if (rows.length) setDraft(rows[rows.length - 1].kg);

    const list = await db.exercises.toArray();
    const states = await db.exerciseState.bulkGet(list.map((e) => e.id));
    setExercises(list
      .map((ex, i) => effective(ex, states[i]))
      .sort((a, b) => a.dayId.localeCompare(b.dayId) || a.order - b.order));

    const last = await db.measurements.orderBy('date').last();
    setMeasure(last ?? null);
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (picked) void weightSeries(picked).then(setSeries); }, [picked]);

  const saveWeight = async () => {
    await db.bodyWeight.put({ date: today(), kg: Math.round(draft * 10) / 10 });
    await load();
  };

  const saveMeasure = async (key: keyof Omit<Measurement, 'date'>, value: number) => {
    const base: Measurement = measure?.date === today()
      ? measure
      : { date: today(), chest: null, waist: null, thigh: null, arm: null, neck: null, ...(measure ?? {}) };
    const next = { ...base, date: today(), [key]: value };
    await db.measurements.put(next);
    setMeasure(next);
  };

  const avg = weeklyAverage(weights);
  const last = weights[weights.length - 1];
  const first = weights[0];
  const delta = last && first ? Math.round((last.value - first.value) * 10) / 10 : null;

  return (
    <main className="screen">
      <div style={{ padding: '0 var(--pad)' }}><span className="label">ПРОГРЕСС</span></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 16, borderBottom: '1px solid var(--line)' }}>
        {([['body', 'ВЕС ТЕЛА'], ['lifts', 'ШТАНГА'], ['girth', 'ОБХВАТЫ']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              height: 48, fontFamily: 'var(--font)', fontSize: 10, letterSpacing: '0.14em',
              fontWeight: tab === id ? 700 : 500,
              color: tab === id ? 'var(--acc)' : 'var(--mut2)',
              borderBottom: `2px solid ${tab === id ? 'var(--acc)' : 'transparent'}`,
              marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'body' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderBottom: '1px solid var(--line-soft)' }}>
            <Stat label="СЕЙЧАС" value={last ? String(last.value).replace('.', ',') : '—'} />
            <Stat label="СРЕДН 7Д" value={avg.length ? String(avg[avg.length - 1].value).replace('.', ',') : '—'} />
            <Stat label="ВСЕГО" value={delta === null ? '—' : `${delta > 0 ? '+' : ''}${String(delta).replace('.', ',')}`} />
          </div>

          <div style={{ padding: '14px var(--pad) 0' }}>
            <Chart points={weights} line={avg} />
          </div>
          <div style={{ padding: '2px var(--pad) 0', fontSize: 12, color: 'var(--mut2)' }}>
            Квадраты — взвешивания, линия — среднее за неделю. Смотреть надо на линию.
          </div>

          <div style={{ flex: 1 }} />
          <div className="row" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, minHeight: 76 }}>
            <span className="label" style={{ flex: 1 }}>ЗАПИСАТЬ СЕГОДНЯ</span>
            <button className="round" onClick={() => setDraft((v) => Math.round((v - 0.1) * 10) / 10)}>−</button>
            <span className="num" style={{ minWidth: 62, textAlign: 'center', fontSize: 24, fontWeight: 700 }}>
              {String(draft.toFixed(1)).replace('.', ',')}
            </span>
            <button className="round" onClick={() => setDraft((v) => Math.round((v + 0.1) * 10) / 10)}>+</button>
          </div>
          <div style={{ padding: '12px var(--pad) 14px' }}>
            <button className="btn btn--primary" style={{ minHeight: 60, fontSize: 15 }} onClick={() => void saveWeight()}>
              ЗАПИСАТЬ ВЕС
            </button>
          </div>
        </>
      )}

      {tab === 'lifts' && (
        <>
          {picked ? (
            <>
              <div style={{ padding: '14px var(--pad) 0' }}>
                <div className="title" style={{ fontSize: 19 }}>
                  {exercises.find((e) => e.id === picked)?.shortName
                    ?? exercises.find((e) => e.id === picked)?.name}
                </div>
              </div>
              <div style={{ padding: '14px var(--pad) 0' }}>
                <Chart points={series} />
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ padding: '14px var(--pad)' }}>
                <button className="btn" onClick={() => setPicked(null)}>К СПИСКУ</button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {exercises.map((ex) => (
                <button key={ex.id} className="row" style={{ width: '100%', minHeight: 56 }}
                  onClick={() => setPicked(ex.id)}>
                  <span className="label" style={{ width: 22, flex: 'none', textAlign: 'left' }}>{ex.dayId}</span>
                  <span className="ellipsis" style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--fg2)' }}>
                    {ex.shortName ?? ex.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'girth' && (
        <>
          <div style={{ padding: '14px var(--pad) 0', fontSize: 13, color: 'var(--mut)', lineHeight: 1.4 }}>
            Мерить раз в четыре недели, утром, до еды. Чаще смысла нет — шум.
            {measure && <> Последний замер: {fmtDate(measure.date)}.</>}
          </div>
          <div style={{ marginTop: 14 }}>
            {FIELDS.map(({ key, label }) => {
              const value = (measure?.[key] as number | null) ?? null;
              return (
                <div key={key} className="row" style={{ minHeight: 64 }}>
                  <span className="label" style={{ flex: 1 }}>{label}</span>
                  {/* Обхваты вводятся раз в месяц — тут уместна клавиатура,
                      а не двести нажатий на плюс. */}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value === null ? '' : String(value).replace('.', ',')}
                    placeholder="—"
                    onChange={(e) => {
                      const raw = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                      if (raw === '') return;
                      const n = Number(raw);
                      if (Number.isFinite(n) && n >= 0 && n < 300) void saveMeasure(key, n);
                    }}
                    style={{
                      width: 96, height: 48, textAlign: 'right', padding: '0 12px',
                      fontFamily: 'var(--font)', fontSize: 20, fontWeight: 700,
                      color: 'var(--fg)', background: 'transparent',
                      border: '1px solid var(--line)', borderRadius: 'var(--r-btn)',
                    }}
                  />
                  <span className="label" style={{ width: 20, flex: 'none' }}>СМ</span>
                </div>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
        </>
      )}

      <div style={{ height: 16 }} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '13px var(--pad)' }}>
      <div className="label">{label}</div>
      <div className="num" style={{ fontSize: 24, fontWeight: 700, marginTop: 4, letterSpacing: '-0.03em' }}>{value}</div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

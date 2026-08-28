import type { Point } from '../lib/history.ts';

/**
 * График точками и линией. Рисуем сами: сторонних библиотек в приложении нет,
 * а тут нужен один тип графика и полный контроль над сеткой.
 */
export default function Chart({ points, line, height = 170, unit = 'кг' }: {
  points: Point[];
  /** Вторая серия поверх точек — например среднее за неделю. */
  line?: Point[];
  height?: number;
  unit?: string;
}) {
  if (points.length < 2) {
    return (
      <div style={{ padding: '22px var(--pad)', color: 'var(--mut2)', fontSize: 13 }}>
        Мало данных — нужно хотя бы два значения.
      </div>
    );
  }

  const W = 350;
  const H = height;
  const padL = 34;
  const padB = 18;

  const values = [...points, ...(line ?? [])].map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * 0.12;
  const hi = max + span * 0.12;

  const times = points.map((p) => Date.parse(p.date));
  const t0 = times[0];
  const t1 = times[times.length - 1] || t0 + 1;

  const x = (date: string) => padL + ((Date.parse(date) - t0) / (t1 - t0 || 1)) * (W - padL - 6);
  const y = (v: number) => (H - padB) - ((v - lo) / (hi - lo)) * (H - padB - 8);

  const path = (list: Point[]) =>
    list.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  const ticks = [max, (max + min) / 2, min].map((v) => Math.round(v * 10) / 10);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={y(v)} x2={W - 6} y2={y(v)} stroke="var(--line-soft)" strokeWidth="1" />
          <text x={0} y={y(v) + 4} fill="var(--mut2)" fontSize="9"
            fontFamily="var(--font-mono)" letterSpacing="0.06em">
            {String(v).replace('.', ',')}
          </text>
        </g>
      ))}

      {line && line.length > 1 && (
        <path d={path(line)} fill="none" stroke="var(--acc)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
      )}

      <path d={path(points)} fill="none" stroke="var(--mut)" strokeWidth="1" strokeDasharray="3 3" />
      {points.map((p, i) => (
        <rect key={i} x={x(p.date) - 2.5} y={y(p.value) - 2.5} width="5" height="5" fill="var(--fg)" />
      ))}

      <text x={padL} y={H - 4} fill="var(--mut2)" fontSize="9" fontFamily="var(--font-mono)">
        {fmtDate(points[0].date)}
      </text>
      <text x={W - 6} y={H - 4} textAnchor="end" fill="var(--mut2)" fontSize="9" fontFamily="var(--font-mono)">
        {fmtDate(points[points.length - 1].date)} · {unit}
      </text>
    </svg>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

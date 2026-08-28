/** Простые пиктограммы в кружке. Рисуем сами — иконочных шрифтов в проекте нет. */

const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export const IconUpper = () => (
  <svg {...base}><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" /></svg>
);

export const IconLower = () => (
  <svg {...base}><path d="M8 3v6l-2 6 3 6M16 3v6l2 6-3 6M8 9h8" /></svg>
);

export const IconTarget = () => (
  <svg {...base}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /></svg>
);

export const IconShield = () => (
  <svg {...base}><path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6l7-2.5Z" /><path d="m9 12 2 2 4-4" /></svg>
);


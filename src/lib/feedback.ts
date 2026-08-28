/** Звук и вибрация на нуле таймера. Без файлов — тон генерируем на месте. */

let ctx: AudioContext | null = null;

/** Разбудить звук нужно из обработчика нажатия, иначе iOS его не пустит. */
export function primeAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  if (ctx?.state === 'suspended') void ctx.resume();
}

export function beep(times = 2): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = now + i * 0.28;
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.2);
  }
}

export function vibrate(pattern: number | number[] = [120, 80, 120]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

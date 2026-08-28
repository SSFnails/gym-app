export default function Toggle({ on, label, hint, onChange }: {
  on: boolean; label: string; hint?: string; onChange: (next: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
        padding: '14px var(--pad)', minHeight: 64, borderBottom: '1px solid var(--line-soft)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, color: 'var(--fg)' }}>{label}</span>
        {hint && (
          <span style={{ display: 'block', fontSize: 12, color: 'var(--mut2)', marginTop: 3, lineHeight: 1.35 }}>
            {hint}
          </span>
        )}
      </span>
      <span
        style={{
          flex: 'none', width: 52, height: 30, position: 'relative',
          border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
          background: on ? 'var(--acc)' : 'transparent',
        }}
      >
        <span
          style={{
            position: 'absolute', top: 3, left: on ? 25 : 3, width: 22, height: 22,
            background: on ? 'var(--acc-ink)' : 'var(--mut)', transition: 'left 0.12s',
          }}
        />
      </span>
    </button>
  );
}

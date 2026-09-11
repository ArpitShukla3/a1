import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from './api/client.js';
import { listSkills } from './api/skills.js';
import type { AttemptStatus } from './types.js';
import { skillName as fallbackName } from './types.js';

// Shared UI states: every API-driven screen uses these. No fetch calls in components.

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <div className="spinner" />
      <div>{label}</div>
    </div>
  );
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {hint && <div>{hint}</div>}
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const msg = error instanceof ApiError ? error.message : 'Something went wrong.';
  const offline = error instanceof ApiError && error.status === 0;
  return (
    <div className="state error" role="alert">
      <h3>{offline ? 'Backend unavailable' : 'Couldn’t load this screen'}</h3>
      <div>{msg}</div>
      <div className="actions">
        <button className="btn" onClick={onRetry}>Retry</button>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: AttemptStatus | 'PENDING' | 'COMPLETED' }) {
  return <span className={`badge st-${status.toLowerCase()}`}>{status}</span>;
}

export function Stepper({ status }: { status: AttemptStatus }) {
  const steps: AttemptStatus[] = ['SUBMITTED', 'EVALUATING', 'COMPLETED'];
  if (status === 'DRAFT') return null;
  if (status === 'FAILED') {
    return (
      <div className="stepper" aria-label="Evaluation progress">
        <span className="step done"><span className="dot">✓</span>Submitted</span>
        <span className="step-link" />
        <span className="step failed"><span className="dot">!</span>Evaluating — failed</span>
      </div>
    );
  }
  const idx = steps.indexOf(status);
  return (
    <div className="stepper" aria-label="Evaluation progress">
      {steps.map((s, i) => (
        <span key={s}>
          {i > 0 && <span className="step-link" />}
          <span className={`step ${i < idx ? 'done' : i === idx ? 'now' : ''}`}>
            <span className="dot">{i < idx ? '✓' : i + 1}</span>
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </span>
        </span>
      ))}
    </div>
  );
}

// Skill display names come from GET /api/skills (backend-owned). Falls back to a
// prettified id while the catalog loads — never to hardcoded evaluation config.
export function useSkillNames(): (id: string) => string {
  const [names, setNames] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    listSkills().then(
      ss => setNames(Object.fromEntries(ss.map(s => [s.id, s.name]))),
      () => setNames({}),
    );
  }, []);
  return (id: string) => names?.[id] ?? fallbackName(id);
}

export function Trend({ trend }: { trend: string }) {  if (trend === 'improving') return <span className="trend-up">↑ Improving</span>;
  if (trend === 'declining') return <span className="trend-down">↓ Needs attention</span>;
  if (trend === 'stable') return <span className="trend-flat">→ Steady</span>;
  return <span className="trend-flat">· First attempt</span>;
}

export function ScoreBar({ score, max }: { score: number; max: number }) {
  return (
    <div className="scorebar" aria-label={`${score} of ${max}`}>
      <div style={{ width: `${Math.round((score / Math.max(1, max)) * 100)}%` }} />
    </div>
  );
}

// Lightweight SVG score-over-time. No chart dependency.
export function Sparkline({ points }: { points: { x: string; y: number }[] }) {
  if (points.length < 2) return null;
  const w = 260;
  const h = 64;
  const pad = 8;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => `${pad + i * step},${h - pad - p.y * (h - pad * 2)}`);
  return (
    <svg className="spark" width={w} height={h} role="img" aria-label="Score over time">
      <polyline points={coords.join(' ')} fill="none" stroke="#2456e6" strokeWidth="2" />
      {coords.map((c, i) => {
        const [cx, cy] = c.split(',').map(Number);
        return <circle key={i} cx={cx} cy={cy} r="3" fill="#2456e6" />;
      })}
    </svg>
  );
}

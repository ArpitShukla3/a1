import { useCallback, useEffect, useState } from 'react';
import { getProblem, listProblems } from '../api/problems.js';
import { createAttempt } from '../api/attempts.js';
import { Empty, ErrorState, Loading, useSkillNames } from '../components.js';
import { type Problem } from '../types.js';
import { navigate } from '../router.js';

async function startAndGo(problemId: string, setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    const a = await createAttempt(problemId);
    navigate(`/a/${a.id}/edit`);
  } catch (e) {
    setBusy(false);
    throw e;
  }
}

export function ProblemsScreen() {
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setError(null);
    listProblems().then(setProblems, setError);
  }, []);
  useEffect(load, [load]);
  const lookupName = useSkillNames();
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!problems) return <Loading label="Loading problems…" />;
  if (!problems.length) return <Empty title="No problems yet" hint="Check back soon." />;
  return (
    <>
      <h1>Practice low-level design</h1>
      <p className="sub">Pick a problem, write your complete design, get skill-by-skill coaching — not a single opaque score.</p>
      <div className="grid">
        {problems.map(p => (
          <div className="card" key={p.id}>
            <h3>{p.title}</h3>
            <p>{p.requirements.slice(0, 2).join(' · ')}</p>
            <div className="badge-row">
              {p.skillIds.slice(0, 4).map(s => <span className="badge skill" key={s}>{lookupName(s)}</span>)}
              {p.skillIds.length > 4 && <span className="badge">+{p.skillIds.length - 4} more</span>}
            </div>
            <div className="actions">
              <a className="btn" href={`#/p/${p.id}`}>Details</a>
              <button className="btn btn-primary" disabled={busy} onClick={() => startAndGo(p.id, setBusy).catch(setError)}>
                {busy ? 'Starting…' : 'Start Practice'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {error != null && <p>{/* unreachable: error handled above */}</p>}
    </>
  );
}

export function ProblemDetailScreen({ id }: { id: string }) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setError(null);
    getProblem(id).then(setProblem, setError);
  }, [id]);
  useEffect(load, [load]);
  const lookupName = useSkillNames();
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!problem) return <Loading label="Loading problem…" />;
  return (
    <>
      <p><a href="#/">← All problems</a></p>
      <h1>{problem.title}</h1>
      <p className="sub">Design this system. You’ll be evaluated per skill, with evidence quoted from your submission.</p>
      <h2>Requirements</h2>
      <div className="card"><ul className="req-list">{problem.requirements.map(r => <li key={r}>{r}</li>)}</ul></div>
      <h2>Constraints</h2>
      <div className="card"><ul className="req-list">{problem.constraints.map(c => <li key={c}>{c}</li>)}</ul></div>
      <h2>Assumptions to consider</h2>
      <div className="card"><ul className="req-list">{problem.assumptions.map(a => <li key={a}>{a}</li>)}</ul></div>
      <h2>What you’ll be evaluated on</h2>
      <div className="badge-row">{problem.skillIds.map(s => <span className="badge skill" key={s}>{lookupName(s)}</span>)}</div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => startAndGo(problem.id, setBusy).catch(setError)}>
          {busy ? 'Starting…' : 'Start Attempt'}
        </button>
      </div>
    </>
  );
}

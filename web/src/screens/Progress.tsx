import { useCallback, useEffect, useState } from 'react';
import { getSkillDetail, listSkillProfiles } from '../api/skills.js';
import { createAttempt, listLearnerAttempts } from '../api/attempts.js';
import { getEvaluation } from '../api/evaluations.js';
import { listProblems } from '../api/problems.js';
import { Empty, ErrorState, Loading, ScoreBar, Sparkline, StatusBadge, Trend, useSkillNames } from '../components.js';
import { LEARNER_ID, type Evaluation, type LearnerSkillProfile, type Problem, type SkillObservation } from '../types.js';
import { navigate } from '../router.js';

// ---------- Skill progress ----------

export function SkillsScreen() {
  const [profiles, setProfiles] = useState<LearnerSkillProfile[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    listSkillProfiles().then(setProfiles, setError);
  }, []);
  useEffect(load, [load]);
  const lookupName = useSkillNames();
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!profiles) return <Loading label="Loading skill progress…" />;
  const withData = profiles.filter(p => p.count > 0);
  if (!withData.length) {
    return <Empty title="No skill data yet" hint="Complete an evaluation and your per-skill progress will appear here."><a className="btn btn-primary" href="#/">Pick a problem</a></Empty>;
  }
  return (
    <>
      <h1>Skill progress</h1>
      <p className="sub">One card per skill. Current score, trend, and the weaknesses that keep repeating.</p>
      <div className="grid">
        {withData.map(p => (
          <div className="card" key={p.skillId}>
            <h3>{lookupName(p.skillId)}</h3>
            <div className="score"><span className="n">{(p.recentAverage * 5).toFixed(1)}</span><span className="d">/ 5 · previous avg {(p.average * 5).toFixed(1)} · {p.count} attempts</span></div>
            <ScoreBar score={p.recentAverage} max={1} />
            <div style={{ marginTop: 8 }}><Trend trend={p.trend} /></div>
            {!!p.recurringWeaknesses.length && (
              <div className="badge-row">{p.recurringWeaknesses.map(t => <span className="badge tag" key={t}>{t}</span>)}</div>
            )}
            {!!p.recurringStrengths.length && (
              <div className="badge-row">{p.recurringStrengths.map(t => <span className="badge skill" key={t}>{t}</span>)}</div>
            )}
            <div className="actions">
              <button className="btn" onClick={() => setOpen(open === p.skillId ? null : p.skillId)}>
                {open === p.skillId ? 'Hide history' : 'Score over time'}
              </button>
            </div>
            {open === p.skillId && <SkillHistory skillId={p.skillId} />}
          </div>
        ))}
      </div>
    </>
  );
}

function SkillHistory({ skillId }: { skillId: string }) {
  const [obs, setObs] = useState<SkillObservation[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    getSkillDetail(skillId).then(d => setObs(d.observations), setError);
  }, [skillId]);
  if (error) return <p className="conf">Couldn’t load history.</p>;
  if (!obs) return <p className="conf">Loading…</p>;
  return (
    <div>
      <Sparkline points={obs.map(o => ({ x: o.timestamp, y: o.score / o.maxScore }))} />
      <ul className="req-list">
        {obs.slice(-5).reverse().map(o => (
          <li key={o.attemptId + o.timestamp}>
            {new Date(o.timestamp).toLocaleDateString()} — {o.problemId}: <strong>{o.score}/{o.maxScore}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Attempt history ----------

interface Row { problem: string; problemId: string; attemptId: string; date: string; status: string; score: string; weakest: string; }

export function HistoryScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    Promise.all([listLearnerAttempts(), listProblems()]).then(async ([attempts, problems]) => {
      const titles = new Map<string, string>(problems.map((p: Problem) => [p.id, p.title]));
      const evals = await Promise.allSettled(attempts.map(a =>
        a.status === 'COMPLETED' ? getEvaluation(a.id) : Promise.resolve(null)));
      setRows(attempts
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a, i) => {
          const e = evals[i].status === 'fulfilled' ? (evals[i] as PromiseFulfilledResult<Evaluation | null>).value : null;
          const weakest = e && e.results.length
            ? e.results.slice().sort((x, y) => x.score / x.maxScore - y.score / y.maxScore)[0] : null;
          return {
            problem: titles.get(a.problemId) ?? a.problemId,
            problemId: a.problemId,
            attemptId: a.id,
            date: new Date(a.createdAt).toLocaleString(),
            status: a.status,
            score: e ? `${e.aggregate.totalScore}/${e.aggregate.maxTotal}` : '—',
            weakest: weakest ? `${weakest.skillName} ${weakest.score}/${weakest.maxScore}` : '—',
          };
        }));
    }, setError);
  }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!rows) return <Loading label="Loading history…" />;
  if (!rows.length) {
    return <Empty title="No attempts yet" hint="History exists so you can see yourself improve over time. Make your first attempt."><a className="btn btn-primary" href="#/">Pick a problem</a></Empty>;
  }
  async function tryAgain(problemId: string) {
    const a = await createAttempt(problemId, LEARNER_ID);
    navigate(`/a/${a.id}/edit`);
  }
  return (
    <>
      <h1>Attempt history</h1>
      <p className="sub">Every attempt is preserved. Re-attempt the same problem to watch weak skills climb.</p>
      <div className="row-list">
        {rows.map(r => (
          <div className="card row-card" key={r.attemptId}>
            <div className="grow">
              <h3>{r.problem}</h3>
              <div>{r.date} · <StatusBadge status={r.status as never} /> · <strong>{r.score}</strong></div>
              <div className="conf">Focus next: {r.weakest}</div>
            </div>
            <div className="row-actions">
              {(r.status === 'COMPLETED' || r.status === 'FAILED' || r.status === 'EVALUATING' || r.status === 'SUBMITTED') && (
                <a className="btn" href={`#/a/${r.attemptId}`}>View Feedback</a>
              )}
              {r.status === 'DRAFT' && <a className="btn" href={`#/a/${r.attemptId}/edit`}>Continue</a>}
              <button className="btn" onClick={() => tryAgain(r.problemId)}>Try Again</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

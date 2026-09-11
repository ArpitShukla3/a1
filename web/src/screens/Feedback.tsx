import { useCallback, useEffect, useRef, useState } from 'react';
import { createAttempt, getAttempt, retryEvaluation } from '../api/attempts.js';
import { getEvaluation, subscribeToEvaluation } from '../api/evaluations.js';
import { getProblem } from '../api/problems.js';
import { listSkillProfiles } from '../api/skills.js';
import { ApiError } from '../api/client.js';
import { Empty, ErrorState, Loading, ScoreBar, StatusBadge, Stepper, Trend, useSkillNames } from '../components.js';
import { SKILL_WHY, type Attempt, type Evaluation, type LearnerSkillProfile, type SkillEvaluationResult } from '../types.js';
import { navigate } from '../router.js';

function usePolling(active: boolean, fn: () => void) {
  useEffect(() => {
    if (!active) return;
    fn();
    const t = window.setInterval(fn, 2000);
    return () => window.clearInterval(t);
  }, [active, fn]);
}

// The learner's message: one complete solution, expandable in place.
function UserBubble({ attempt, problemTitle }: { attempt: Attempt; problemTitle: string }) {
  const sub = attempt.submission?.kind === 'solution' ? attempt.submission : null;
  return (
    <div className="msg msg-user">
      <div className="msg-meta">You · {new Date(attempt.updatedAt).toLocaleString()} · version {attempt.submissionVersion}</div>
      <div>Here’s my <strong>{problemTitle}</strong> design — please tear it apart skill by skill.</div>
      {sub?.solution && (
        <details className="solution-toggle">
          <summary>View your submitted solution ({Math.round(sub.solution.length / 100) / 10}k chars)</summary>
          <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{sub.solution}</p>
        </details>
      )}
    </div>
  );
}

// One coach reply per skill, streamed in as it completes.
function SkillBubble({ r, trend }: { r: SkillEvaluationResult; trend?: string }) {
  const why = SKILL_WHY[r.skillId];
  const bad = r.grounding.filter(g => g.label === 'bad');
  const good = r.grounding.filter(g => g.label === 'good');
  return (
    <details className="skill-detail msg-coach" open={r.score < r.maxScore}>
      <summary>
        <span>{r.skillName}</span>
        <span className="badge">{r.score}/{r.maxScore}</span>
        {trend && trend !== 'insufficient-data' && <Trend trend={trend} />}
        <span className="chev">▾</span>
      </summary>
      <div className="body">
        <div className="scenario-box"><strong>Scenario:</strong> {r.scenarioQuestion}</div>
        <h4>Strengths — what you did well</h4>
        {r.strengths.length ? <ul>{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="conf">None noted this time.</p>}
        <h4>Concerns — where exactly it fails</h4>
        {r.concerns.length ? <ul>{r.concerns.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="conf">None.</p>}
        {!!bad.length && (
          <div className="evidence">
            <strong>Where designs like this fail:</strong>
            {bad.map((g, i) => (
              <div key={i} style={{ marginTop: 6 }}>
                <blockquote>“{g.pattern}”</blockquote>
                <div className="why">{g.explanation}</div>
              </div>
            ))}
          </div>
        )}
        <h4>Evidence — quoted from your submission</h4>
        {r.evidence.length ? r.evidence.map((e, i) => (
          <div className="evidence" key={i}>
            <blockquote>“{e.candidateExcerpt}”</blockquote>
            <div className="why">{e.observation}</div>
          </div>
        )) : <p className="conf">Insufficient evidence — the evaluator found too little to judge this skill.</p>}
        {why && (
          <>
            <h4>Why it matters</h4>
            <p>{why}</p>
          </>
        )}
        <h4>Suggestions — what to improve</h4>
        {r.suggestions.length ? <ul>{r.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="conf">—</p>}
        {!!good.length && (
          <div className="scenario-box">
            <strong>A better shape:</strong>
            {good.map((g, i) => <div key={i} style={{ marginTop: 4 }}>“{g.pattern}” — {g.explanation}</div>)}
          </div>
        )}
        {!!r.weaknessTags.length && (
          <div className="badge-row">{r.weaknessTags.map(t => <span className="badge tag" key={t}>{t}</span>)}</div>
        )}
        <div className="conf">Confidence: {Math.round(r.confidence * 100)}%</div>
      </div>
    </details>
  );
}

function TypingBubble({ name, text }: { name: string; text?: string }) {
  return (
    <div className="msg msg-coach" role="status">
      <div className="msg-meta">Coach</div>
      <span>Analyzing {name} </span>
      <span className="typing" aria-hidden="true"><span /><span /><span /></span>
      {text && <pre className="raw">{text}</pre>}
    </div>
  );
}

export function AttemptScreen({ id }: { id: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null | undefined>(undefined);
  const [profiles, setProfiles] = useState<LearnerSkillProfile[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retrying, setRetrying] = useState(false);
  const [problemTitle, setProblemTitle] = useState('');
  const [liveOrder, setLiveOrder] = useState<{ skillId: string; skillName: string }[]>([]);
  const [liveResults, setLiveResults] = useState<Record<string, SkillEvaluationResult>>({});
  const [liveFailed, setLiveFailed] = useState<Record<string, boolean>>({});
  const [liveText, setLiveText] = useState<Record<string, string>>({});
  const threadRef = useRef<HTMLDivElement | null>(null);
  const lookupName = useSkillNames();

  const load = useCallback(() => {
    setError(null);
    setLiveOrder([]);
    setLiveResults({});
    setLiveFailed({});
    setLiveText({});
    getAttempt(id).then(
      a => {
        setAttempt(a);
        getProblem(a.problemId).then(p => setProblemTitle(p.title), () => setProblemTitle(a.problemId));
        if (a.status === 'COMPLETED' || a.status === 'FAILED' || a.status === 'EVALUATING' || a.status === 'SUBMITTED') {
          getEvaluation(id).then(setEvaluation, e => {
            if (e instanceof ApiError && e.status === 404) setEvaluation(null);
            else setError(e);
          });
        } else {
          setEvaluation(null);
        }
        if (a.status === 'COMPLETED') listSkillProfiles(a.learnerId).then(setProfiles, () => {});
      },
      setError,
    );
  }, [id]);
  useEffect(load, [load]);
  const polling = attempt != null && (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATING');
  usePolling(polling, load);
  // Live skill checklist from the SSE stream. Polling above stays as fallback if the stream drops.
  useEffect(() => {
    if (!polling) return;
    return subscribeToEvaluation(id, e => {
      if (e.type === 'evaluation.started') {
        setLiveOrder(e.skills);
      } else if (e.type === 'skill.started') {
        setLiveOrder(prev => (prev.some(s => s.skillId === e.skillId) ? prev : [...prev, { skillId: e.skillId, skillName: e.skillName }]));
      } else if (e.type === 'skill.token') {
        setLiveText(prev => ({ ...prev, [e.skillId]: (prev[e.skillId] ?? '') + e.token }));
      } else if (e.type === 'skill.completed') {
        setLiveResults(prev => ({ ...prev, [e.skillId]: e.result }));
        setLiveText(prev => { const c = { ...prev }; delete c[e.skillId]; return c; });
      } else if (e.type === 'skill.failed') {
        setLiveFailed(prev => ({ ...prev, [e.skillId]: true }));
      } else if (e.type === 'evaluation.completed' || e.type === 'evaluation.failed') {
        load();
      }
    });
  }, [id, polling, load]);
  // Keep the newest bubble in view as skills stream in.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  });

  async function retry() {
    setRetrying(true);
    try {
      await retryEvaluation(id);
      load();
    } catch (e) {
      setError(e);
    } finally {
      setRetrying(false);
    }
  }

  async function tryAgain() {
    if (!attempt) return;
    const a = await createAttempt(attempt.problemId, attempt.learnerId);
    navigate(`/a/${a.id}/edit`);
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!attempt) return <Loading label="Loading attempt…" />;

  if (attempt.status === 'DRAFT') {
    return (
      <Empty title="Draft not submitted yet" hint="Finish writing your design, then submit it for evaluation.">
        <a className="btn btn-primary" href={`#/a/${id}/edit`}>Continue writing</a>
      </Empty>
    );
  }

  const profileBySkill = new Map((profiles ?? []).map(p => [p.skillId, p]));

  return (
    <>
      <p><a href="#/history">← Attempt history</a></p>
      <div className="meta-row">
        <h1 style={{ margin: 0 }}>Evaluation</h1>
        <StatusBadge status={attempt.status} />
      </div>
      <Stepper status={attempt.status} />

      {(attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATING') && (
        <div className="thread" ref={threadRef} role="log" aria-live="polite">
          <UserBubble attempt={attempt} problemTitle={problemTitle || attempt.problemId} />
          {liveOrder.length === 0 && (
            <div className="state" role="status">
              <div>Submission saved ✓</div>
              <div className="spinner pulse" style={{ marginTop: 12 }} />
              <div>Waking up the evaluators…</div>
            </div>
          )}
          {liveOrder.map(s => {
            const r = liveResults[s.skillId];
            if (r) return <SkillBubble key={s.skillId} r={r} />;
            if (liveFailed[s.skillId]) {
              return (
                <div className="msg msg-coach" key={s.skillId} role="alert">
                  <div className="msg-meta">Coach</div>
                  <div>✗ {s.skillName} hit an error — retryable, nothing was lost.</div>
                </div>
              );
            }
            return <TypingBubble key={s.skillId} name={s.skillName} text={liveText[s.skillId]} />;
          })}
        </div>
      )}

      {attempt.status === 'FAILED' && (
        <div className="state error" role="alert">
          <h3>Evaluation failed — your submission is safe</h3>
          <div>{evaluation?.error ?? 'The evaluator hit an error. Nothing was lost; retry when ready.'}</div>
          <div className="actions">
            <button className="btn btn-primary" disabled={retrying} onClick={retry}>{retrying ? 'Retrying…' : 'Retry Evaluation'}</button>
            <a className="btn" href={`#/a/${id}/edit`}>Edit submission</a>
          </div>
        </div>
      )}

      {attempt.status === 'COMPLETED' && evaluation && (
        <>
          <div className="thread" ref={threadRef} role="log" aria-live="polite">
            <UserBubble attempt={attempt} problemTitle={problemTitle || attempt.problemId} />
            {evaluation.results.map(r => {
              const prof = profileBySkill.get(r.skillId);
              return <SkillBubble key={r.skillId} r={r} trend={prof && prof.count > 1 ? prof.trend : undefined} />;
            })}
            <div className="msg msg-coach">
              <div className="msg-meta">Coach · overall evaluation</div>
              <div className="score"><span className="n">{evaluation.aggregate.totalScore}</span><span className="d">/ {evaluation.aggregate.maxTotal}</span></div>
              <ScoreBar score={evaluation.aggregate.totalScore} max={evaluation.aggregate.maxTotal} />
              <p style={{ marginTop: 10 }}>{evaluation.feedback.summary}</p>
              {!!evaluation.feedback.priorityImprovements.length && (
                <>
                  <h4 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Fix these first</h4>
                  <ul className="req-list">{evaluation.feedback.priorityImprovements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
            </div>
            {!!evaluation.feedback.celebrations.length && (
              <div className="msg msg-coach celebrate">
                <div className="msg-meta">Coach · you’re moving forward</div>
                <ul className="req-list" style={{ marginBottom: 0 }}>
                  {evaluation.feedback.celebrations.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </div>

          <h2>Progress compared with previous attempts</h2>
          <div className="grid">
            {(profiles ?? []).filter(p => p.count > 0).map(p => (
              <div className="card" key={p.skillId}>
                <h3>{lookupName(p.skillId)}</h3>
                <div className="score"><span className="n">{(p.recentAverage * 5).toFixed(1)}</span><span className="d">/ 5 · {p.count} attempt{p.count === 1 ? '' : 's'}</span></div>
                <div style={{ marginTop: 6 }}><Trend trend={p.trend} /></div>
              </div>
            ))}
            {(profiles ?? []).length === 0 && <p className="sub">Complete more attempts to see trends.</p>}
          </div>

          <h2>Recurring weaknesses</h2>
          <div className="card">
            {(() => {
              const rec = (profiles ?? []).flatMap(p => p.recurringWeaknesses.map(t => `${lookupName(p.skillId)}: ${t}`));
              return rec.length ? <ul className="req-list">{rec.map(r => <li key={r}>{r}</li>)}</ul>
                : <p className="sub" style={{ margin: 0 }}>No repeating weakness yet — keep practicing to build a signal.</p>;
            })()}
          </div>

          <div className="actions" style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={tryAgain}>Try Again (new attempt, history preserved)</button>
            <a className="btn" href="#/skills">Skill progress</a>
          </div>
        </>
      )}

      {attempt.status === 'COMPLETED' && evaluation === null && (
        <Loading label="Fetching evaluation…" />
      )}
    </>
  );
}

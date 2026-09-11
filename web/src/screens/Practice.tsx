import { useCallback, useEffect, useRef, useState } from 'react';
import { getAttempt, saveSubmission, submitAttempt } from '../api/attempts.js';
import { getProblem } from '../api/problems.js';
import { ApiError } from '../api/client.js';
import { Empty, ErrorState, Loading, StatusBadge } from '../components.js';
import type { Attempt, Problem, SolutionSubmissionContent } from '../types.js';
import { navigate } from '../router.js';

const SOLUTION_PLACEHOLDER = `Write your complete design here. Cover:

- Requirements understanding & scope
- Key classes/interfaces and their responsibilities
- Relationships between them
- Main flow end to end
- Design decisions & trade-offs
- Edge cases (failures, boundaries, concurrency)

e.g.
class ParkingLot {
  floors: Floor[]; gate: Gate;
}
...`;

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

function emptyDraft(): SolutionSubmissionContent {
  return { kind: 'solution', solution: '' };
}

export function PracticeScreen({ id }: { id: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [draft, setDraft] = useState<SolutionSubmissionContent | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<unknown>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    setError(null);
    getAttempt(id).then(
      a => {
        setAttempt(a);
        getProblem(a.problemId).then(setProblem, () => {});
        const server = a.submission;
        const local = localStorage.getItem(`lld-draft-${id}`);
        if (a.status === 'DRAFT' || a.status === 'FAILED') {
          setDraft(server?.kind === 'solution' ? server : (local ? { kind: 'solution', solution: String(JSON.parse(local).solution ?? '') } : emptyDraft()));
        } else {
          setDraft(server?.kind === 'solution' ? server : emptyDraft());
        }
      },
      setError,
    );
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function edit(value: string) {
    if (!draft || attempt?.status !== 'DRAFT' && attempt?.status !== 'FAILED') return;
    const next = { kind: 'solution' as const, solution: value };
    setDraft(next);
    setSaveState('unsaved');
    localStorage.setItem(`lld-draft-${id}`, JSON.stringify(next));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveSubmission(id, next);
        setSaveState('saved');
      } catch {
        setSaveState('error'); // localStorage copy keeps the draft safe
      }
    }, 1200);
  }

  async function submit() {
    if (!draft) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      window.clearTimeout(timer.current);
      // Single entry point: the complete solution travels in the POST body.
      // (Debounced PUTs above are autosave only.) Backend validates + persists first.
      await submitAttempt(id, draft);
      localStorage.removeItem(`lld-draft-${id}`);
      setSaveState('saved');
      navigate(`/a/${id}`);
    } catch (e) {
      setSubmitError(e);
      setSubmitting(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!attempt || !draft) return <Loading label="Loading attempt…" />;
  if (attempt.status !== 'DRAFT' && attempt.status !== 'FAILED') {
    return (
      <Empty title={`Attempt is ${attempt.status.toLowerCase()}`} hint="This attempt is already submitted.">
        <a className="btn btn-primary" href={`#/a/${id}`}>View evaluation</a>
      </Empty>
    );
  }
  const saveLabel = { saved: 'All changes saved', saving: 'Saving…', unsaved: 'Unsaved changes…', error: 'Save failed — draft kept locally, will retry on next edit' }[saveState];

  return (
    <>
      <p><a href={`#/p/${attempt.problemId}`}>← Problem</a></p>
      <h1>{problem?.title ?? 'Practice'}</h1>
      <div className="meta-row">
        <StatusBadge status={attempt.status} />
        <span className="save-state" role="status">{saveLabel}</span>
      </div>
      <div className="field">
        <label htmlFor="f-solution">Your solution</label>
        <p className="hint">One complete design. It will be evaluated against every skill; results stream back one skill per message.</p>
        <textarea
          id="f-solution"
          value={draft.solution}
          onChange={e => edit(e.target.value)}
          placeholder={SOLUTION_PLACEHOLDER}
          spellCheck={false}
        />
      </div>
      {submitError && (
        <div className="state error" role="alert">
          <div>{submitError instanceof ApiError ? submitError.message : 'Submit failed.'}</div>
          <div className="actions"><button className="btn" onClick={submit}>Try again</button></div>
        </div>
      )}
      <div className="sticky-bar">
        <span className="save-state">{saveLabel}</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled={submitting || saveState === 'saving'} onClick={submit}>
          {submitting ? 'Submitting…' : 'Submit for evaluation'}
        </button>
      </div>
    </>
  );
}
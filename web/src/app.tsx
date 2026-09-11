import { useEffect, useState } from 'react';
import { parseHash, type Route } from './router.js';
import { ProblemsScreen, ProblemDetailScreen } from './screens/Problems.js';
import { PracticeScreen } from './screens/Practice.js';
import { AttemptScreen } from './screens/Feedback.js';
import { HistoryScreen, SkillsScreen } from './screens/Progress.js';
import { LEARNER_ID } from './types.js';

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  const tab = route.name === 'home' || route.name === 'problem' ? 'practice'
    : route.name === 'skills' ? 'skills'
    : route.name === 'history' ? 'history'
    : route.name === 'edit' || route.name === 'attempt' ? 'history' : 'practice';
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">LLD<span>·Practice</span></a>
          <nav className="nav" aria-label="Primary">
            <a href="#/" className={tab === 'practice' ? 'active' : ''}>Problems</a>
            <a href="#/skills" className={tab === 'skills' ? 'active' : ''}>Skills</a>
            <a href="#/history" className={tab === 'history' ? 'active' : ''}>History</a>
          </nav>
          <span className="learner-badge">{LEARNER_ID}</span>
        </div>
      </header>
      <main className="page page-narrow">
        {route.name === 'home' && <ProblemsScreen />}
        {route.name === 'problem' && <ProblemDetailScreen id={route.id} />}
        {route.name === 'edit' && <PracticeScreen id={route.id} />}
        {route.name === 'attempt' && <AttemptScreen id={route.id} />}
        {route.name === 'skills' && <SkillsScreen />}
        {route.name === 'history' && <HistoryScreen />}
      </main>
    </>
  );
}

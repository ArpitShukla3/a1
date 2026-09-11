// Tiny hash router. No dependency — 4 static routes + 2 params is all this MVP needs.
export type Route =
  | { name: 'home' }
  | { name: 'problem'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'attempt'; id: string }
  | { name: 'skills' }
  | { name: 'history' };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/';
  let m = h.match(/^\/p\/([^/]+)$/);
  if (m) return { name: 'problem', id: decodeURIComponent(m[1]) };
  m = h.match(/^\/a\/([^/]+)\/edit$/);
  if (m) return { name: 'edit', id: decodeURIComponent(m[1]) };
  m = h.match(/^\/a\/([^/]+)$/);
  if (m) return { name: 'attempt', id: decodeURIComponent(m[1]) };
  if (h === '/skills') return { name: 'skills' };
  if (h === '/history') return { name: 'history' };
  return { name: 'home' };
}

export function navigate(path: string) {
  window.location.hash = `#${path}`;
}

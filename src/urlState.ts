// The site uses HashRouter, so filter state lives after "?" in location.hash.
//
// react-router's setSearchParams (also its function form) starts from the params of the
// last render. Two quick changes — clicking a tab and then typing — would both start from
// the same old params and the second would undo the first. Navigation updates
// location.hash synchronously, so reading it at call time always gives the latest state.

export function currentHashParams(hash = window.location.hash): URLSearchParams {
  const start = hash.indexOf('?')
  return new URLSearchParams(start >= 0 ? hash.slice(start + 1) : '')
}

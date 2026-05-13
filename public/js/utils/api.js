function readCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function apiFetch(url, init) {
  const next = Object.assign({}, init || {});
  if (!next.credentials) next.credentials = 'include';
  const method = String(next.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const xsrf = readCookie('XSRF-TOKEN');
    next.headers = Object.assign({}, next.headers || {});
    if (xsrf && !next.headers['X-XSRF-TOKEN']) next.headers['X-XSRF-TOKEN'] = xsrf;
  }
  return window.fetch(url, next);
}

window.KpvsApi = { apiFetch, readCookie };

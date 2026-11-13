import handler from '../server/vercelHandler.js';

export default function vercelApiEntry(req, res) {
  const requestUrl = new URL(req.url || '/', 'http://vercel.local');
  const apiPath = requestUrl.searchParams.get('__vercelApiPath');
  if (apiPath !== null) {
    const segments = apiPath.replace(/^\/+|\/+$/g, '').split('/');
    if (!segments[0] || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ message: 'Ruta de API inválida.' }));
    }
    requestUrl.searchParams.delete('__vercelApiPath');
    req.url = `/api/${segments.join('/')}${requestUrl.search}`;
  }
  return handler(req, res);
}

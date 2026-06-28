// OAuth 2.1 authorization-code + PKCE with an RFC 8252 loopback redirect, plus
// refresh and revoke. Talks to the biblioplex worker's /authorize, /token and
// /revoke endpoints. fetchImpl + openBrowser are injectable for tests.
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createPkce, randomState } from './pkce.mjs';
import { CLI_CLIENT_ID } from './constants.mjs';
import { CliError } from './errors.mjs';

const SUCCESS_HTML = `<!doctype html><meta charset="utf-8"><title>biblioplex</title>
<body style="font-family:system-ui;max-width:30rem;margin:4rem auto;text-align:center;color:#222">
<h1 style="font-weight:500">you're signed in</h1>
<p>biblioplex cli has your authorization. you can close this tab and return to the terminal.</p>
</body>`;

export function defaultOpenBrowser(url) {
  const cmds = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  return new Promise((resolve) => {
    execFile(cmds[0], cmds[1], (err) => resolve(!err));
  });
}

function postForm(base, path, body, fetchImpl) {
  return fetchImpl(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function exchangeCode({ base, code, verifier, redirectUri, fetchImpl = fetch }) {
  const res = await postForm(base, '/token', {
    grant_type: 'authorization_code',
    code,
    client_id: CLI_CLIENT_ID,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }, fetchImpl);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CliError('token exchange failed: ' + (data.error_description || data.error || res.status));
  return data;
}

export async function refreshTokens({ base, refreshToken, fetchImpl = fetch }) {
  const res = await postForm(base, '/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLI_CLIENT_ID,
  }, fetchImpl);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CliError('session expired — run `bp login` again', 3);
  return data;
}

export async function revokeToken({ base, token, fetchImpl = fetch }) {
  try {
    await postForm(base, '/revoke', { token }, fetchImpl);
  } catch { /* logout is best-effort; local creds are cleared regardless */ }
}

// Runs the interactive browser login. Returns the raw /token response.
export async function login({
  base, scope, out, noBrowser = false,
  openBrowser = defaultOpenBrowser, fetchImpl = fetch, timeoutMs = 300000,
}) {
  const { verifier, challenge, method } = createPkce();
  const state = randomState();

  const { code, redirectUri } = await new Promise((resolve, reject) => {
    let redirect = '';
    let timer;
    function cleanup() { clearTimeout(timer); try { server.close(); } catch {} }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (url.pathname !== '/callback') { res.writeHead(404); res.end('not found'); return; }

      const params = url.searchParams;
      // Validate CSRF state first — including on error responses — so a stray
      // local request can't abort or influence the in-flight login.
      if (params.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('state mismatch');
        cleanup(); reject(new CliError('login aborted: OAuth state mismatch (possible CSRF)', 3));
        return;
      }
      if (params.get('error')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('authorization failed: ' + params.get('error'));
        cleanup(); reject(new CliError('authorization denied: ' + params.get('error'), 3));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);
      const code = params.get('code');
      cleanup();
      resolve({ code, redirectUri: redirect });
    });

    server.on('error', (e) => { cleanup(); reject(new CliError('could not start local login listener: ' + e.message)); });
    server.listen(0, '127.0.0.1', async () => {
      redirect = `http://127.0.0.1:${server.address().port}/callback`;
      const authUrl = new URL(base + '/authorize');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', CLI_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirect);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', method);
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('state', state);

      out.info('opening your browser to sign in…');
      out.info('if it does not open, visit:\n  ' + authUrl.href + '\n');
      timer = setTimeout(() => { cleanup(); reject(new CliError('login timed out after ' + Math.round(timeoutMs / 1000) + 's', 3)); }, timeoutMs);
      if (!noBrowser) {
        const opened = await openBrowser(authUrl.href);
        if (!opened) out.info('(could not launch a browser automatically — open the link above)');
      }
    });
  });

  if (!code) throw new CliError('no authorization code received', 3);
  return exchangeCode({ base, code, verifier, redirectUri, fetchImpl });
}

const crypto = require('crypto');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';
const REPOSITORY = process.env.SPOTIFY_REPOSITORY || 'benson/benson.github.io';
const SCOPES = 'user-read-recently-played user-top-read';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before running this command.');
  process.exit(1);
}

const redirect = new URL(REDIRECT_URI);
if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1') {
  console.error('SPOTIFY_REDIRECT_URI must use http://127.0.0.1 for the local callback.');
  process.exit(1);
}

const state = crypto.randomBytes(24).toString('hex');
const authUrl = new URL('https://accounts.spotify.com/authorize');
authUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  scope: SCOPES,
  redirect_uri: REDIRECT_URI,
  state,
  show_dialog: 'true',
}).toString();

function openBrowser(url) {
  const commands = process.platform === 'win32'
    ? [['rundll32.exe', ['url.dll,FileProtocolHandler', url]]]
    : process.platform === 'darwin'
      ? [['open', [url]]]
      : [['xdg-open', [url]]];

  const [command, args] = commands[0];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function finish(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

const server = http.createServer(async (req, res) => {
  const callback = new URL(req.url, `${redirect.protocol}//${redirect.host}`);
  if (callback.pathname !== redirect.pathname) {
    finish(res, 404, 'Not found.');
    return;
  }

  if (callback.searchParams.get('state') !== state) {
    finish(res, 400, 'Spotify authorization state mismatch. Please restart the command.');
    server.close();
    return;
  }

  const authorizationError = callback.searchParams.get('error');
  const code = callback.searchParams.get('code');
  if (authorizationError || !code) {
    finish(res, 400, `Spotify authorization failed: ${authorizationError || 'no code received'}`);
    server.close();
    return;
  }

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const data = await tokenResponse.json();
    if (!tokenResponse.ok || !data.refresh_token) {
      throw new Error(data.error_description || data.error || `token endpoint returned ${tokenResponse.status}`);
    }

    const secretResult = spawnSync(
      'gh',
      ['secret', 'set', 'SPOTIFY_REFRESH_TOKEN', '--repo', REPOSITORY],
      { input: data.refresh_token, encoding: 'utf8' }
    );
    if (secretResult.status !== 0) {
      throw new Error(secretResult.stderr.trim() || 'gh could not update the repository secret');
    }

    finish(res, 200, 'Spotify is reauthorized and the GitHub secret was updated. You can close this tab.');
    console.log(`Updated SPOTIFY_REFRESH_TOKEN for ${REPOSITORY}.`);
  } catch (err) {
    finish(res, 500, `Spotify reauthorization failed: ${err.message}`);
    console.error(`Spotify reauthorization failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port || 80), redirect.hostname, () => {
  console.log(`Waiting for Spotify authorization at ${REDIRECT_URI}`);
  console.log(`If the browser does not open, visit:\n${authUrl}`);
  if (process.env.SPOTIFY_NO_OPEN !== '1') openBrowser(authUrl.toString());
});

server.setTimeout(10 * 60 * 1000, () => {
  console.error('Spotify authorization timed out. Run the command again.');
  process.exitCode = 1;
  server.close();
});

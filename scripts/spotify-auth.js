const http = require('http');
const { execSync } = require('child_process');

const CLIENT_ID = '2aa0050d9d0a45519af3426f3dca0b69';
const CLIENT_SECRET = '4de7171c474a45198ba5fcf3dc6c2cec';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = 'user-read-recently-played';

const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) return;

  const code = new URL(req.url, 'http://127.0.0.1:8888').searchParams.get('code');
  if (!code) {
    res.end('no code received');
    server.close();
    return;
  }

  const token = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await resp.json();

  if (data.refresh_token) {
    console.log('\nrefresh token:\n');
    console.log(data.refresh_token);
    console.log('\nadd this as SPOTIFY_REFRESH_TOKEN in your github repo secrets.');
    res.end('done! you can close this tab.');
  } else {
    console.error('error:', data);
    res.end('something went wrong, check the terminal.');
  }

  server.close();
});

server.listen(8888, () => {
  console.log('opening browser for spotify login...');
  try {
    execSync(`start "" "${authUrl}"`);
  } catch {
    console.log('open this url in your browser:\n' + authUrl);
  }
});

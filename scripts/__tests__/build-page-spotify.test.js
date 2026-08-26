const assert = require('node:assert/strict');
const test = require('node:test');

const { getSpotifyToken } = require('../build-page.js');

const credentialNames = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REFRESH_TOKEN',
];

function withSpotifyEnvironment(values, fn) {
  const original = Object.fromEntries(credentialNames.map(name => [name, process.env[name]]));
  for (const name of credentialNames) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const name of credentialNames) {
        if (original[name] === undefined) delete process.env[name];
        else process.env[name] = original[name];
      }
    });
}

test('getSpotifyToken skips Spotify when no credentials are configured', async () => {
  await withSpotifyEnvironment({}, async () => {
    assert.equal(await getSpotifyToken(), null);
  });
});

test('getSpotifyToken rejects partial Spotify configuration', async () => {
  await withSpotifyEnvironment({ SPOTIFY_CLIENT_ID: 'client' }, async () => {
    await assert.rejects(
      getSpotifyToken(),
      /SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN/
    );
  });
});

test('getSpotifyToken reports expired refresh tokens with recovery instructions', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: 'invalid_grant',
      error_description: 'Refresh token expired',
    }),
  });

  try {
    await withSpotifyEnvironment({
      SPOTIFY_CLIENT_ID: 'client',
      SPOTIFY_CLIENT_SECRET: 'secret',
      SPOTIFY_REFRESH_TOKEN: 'expired',
    }, async () => {
      await assert.rejects(
        getSpotifyToken(),
        /invalid_grant.*Reauthorize Spotify.*SPOTIFY_REFRESH_TOKEN/
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});

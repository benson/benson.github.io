import { login as oauthLogin } from '../oauth.mjs';
import { saveCredentials } from '../store.mjs';
import { Session } from '../api.mjs';
import { READ_SCOPE, WRITE_SCOPE } from '../constants.mjs';
import { boolFlag } from '../args.mjs';
import { loadSnapshot } from '../mutate.mjs';
import { summarize, collectionOf } from '../snapshot.mjs';

export default {
  summary: 'sign in to your collection',
  help: [
    'usage: bp login [--write] [--no-browser]',
    '',
    'opens your browser once to authorize the cli, then stores a refresh token',
    'locally so future commands stay signed in (~30 days).',
    '',
    '  --write       also request permission to make changes (add/edit/import)',
    '  --no-browser  print the url to open manually instead of launching a browser',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, apiBase } = ctx;
    const scope = boolFlag(flags, 'write') ? `${READ_SCOPE} ${WRITE_SCOPE}` : READ_SCOPE;
    const tokens = await oauthLogin({ base: apiBase, scope, out, noBrowser: boolFlag(flags, 'no-browser') });

    const creds = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessExpiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
      scope: tokens.scope || scope,
      apiBase,
      loggedInAt: new Date().toISOString(),
    };
    saveCredentials(creds);

    let stats = null;
    try {
      const session = new Session({ base: apiBase, credentials: creds, persist: saveCredentials });
      const { snapshot } = await loadSnapshot(session);
      stats = summarize(collectionOf(snapshot));
    } catch { /* confirmation is best-effort */ }

    out.emit({ loggedIn: true, scope: creds.scope, collection: stats }, () => {
      out.info(out.c.green('✓ signed in') + ' — scope: ' + creds.scope);
      if (stats) out.info(`cloud collection: ${stats.unique} unique · ${stats.total} cards · $${stats.value}`);
    });
    return 0;
  },
};

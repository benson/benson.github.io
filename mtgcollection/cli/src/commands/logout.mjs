import { loadCredentials, clearCredentials } from '../store.mjs';
import { revokeToken } from '../oauth.mjs';

export default {
  summary: 'sign out and revoke the session',
  help: 'usage: bp logout\n\nrevokes the stored tokens server-side and deletes the local credentials file.',
  async run(ctx) {
    const { out, apiBase } = ctx;
    const creds = loadCredentials();
    if (creds?.refreshToken) await revokeToken({ base: apiBase, token: creds.refreshToken });
    if (creds?.accessToken) await revokeToken({ base: apiBase, token: creds.accessToken });
    clearCredentials();
    out.emit({ loggedOut: true }, () => out.info(out.c.green('✓ signed out')));
    return 0;
  },
};

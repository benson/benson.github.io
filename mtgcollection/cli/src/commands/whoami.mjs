import { loadCredentials } from '../store.mjs';
import { authError } from '../errors.mjs';

export default {
  summary: 'show the current session',
  help: 'usage: bp whoami\n\nshows the api endpoint, granted scopes, and when you signed in.',
  async run(ctx) {
    const { out, apiBase } = ctx;
    const creds = loadCredentials();
    if (!creds?.accessToken) throw authError();
    const data = {
      apiBase,
      scope: creds.scope,
      canWrite: (creds.scope || '').includes('collection.write'),
      loggedInAt: creds.loggedInAt || null,
      accessExpiresAt: creds.accessExpiresAt ? new Date(creds.accessExpiresAt).toISOString() : null,
    };
    out.emit(data, () => {
      out.line('api:    ' + apiBase);
      out.line('scope:  ' + creds.scope);
      out.line('access: ' + (data.canWrite ? 'read + write' : 'read only'));
      if (creds.loggedInAt) out.line('since:  ' + creds.loggedInAt);
    });
    return 0;
  },
};

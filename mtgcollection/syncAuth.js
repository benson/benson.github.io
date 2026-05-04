function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const existing = attrs.marker
      ? document.querySelector('script[data-mtgcollection-clerk="' + attrs.marker + '"]')
      : null;
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (existing.dataset.loaded === 'true') resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (attrs.marker) script.dataset.mtgcollectionClerk = attrs.marker;
    if (attrs.publishableKey) script.dataset.clerkPublishableKey = attrs.publishableKey;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(script);
  });
}

function configuredPublishableKey() {
  if (typeof window === 'undefined') return '';
  const explicit = window.MTGCOLLECTION_CLERK_PUBLISHABLE_KEY || '';
  if (explicit) return explicit;
  const meta = document.querySelector('meta[name="mtgcollection-clerk-publishable-key"]')?.content || '';
  const host = window.location?.hostname || '';
  if ((host === 'localhost' || host === '127.0.0.1') && meta.startsWith('pk_live_')) return '';
  return meta;
}

function devUserId() {
  if (typeof window === 'undefined') return '';
  const explicit = window.MTGCOLLECTION_SYNC_DEV_USER || '';
  if (explicit) return String(explicit);
  const host = window.location?.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1') return 'dev_user';
  return '';
}

function clerkDomainFromPublishableKey(publishableKey) {
  try {
    return atob(String(publishableKey).split('_')[2]).slice(0, -1);
  } catch (e) {
    return '';
  }
}

function userModel(clerk) {
  const user = clerk?.user || null;
  return user ? {
    id: user.id,
    label: user.primaryEmailAddress?.emailAddress || user.fullName || user.username || 'signed in',
  } : null;
}

function currentReturnUrl() {
  if (typeof window === 'undefined') return '/mtgcollection/';
  return window.location.href;
}

function signInRedirectOptions() {
  const url = currentReturnUrl();
  return {
    fallbackRedirectUrl: url,
    forceRedirectUrl: url,
    signInFallbackRedirectUrl: url,
    signInForceRedirectUrl: url,
    signUpFallbackRedirectUrl: url,
    signUpForceRedirectUrl: url,
  };
}

export async function initSyncAuth({ onChange = () => {} } = {}) {
  const publishableKey = configuredPublishableKey();
  const debugUser = devUserId();
  if (!publishableKey || typeof window === 'undefined') {
    if (debugUser) {
      let signedIn = true;
      const api = {
        configured: true,
        get user() {
          return signedIn ? { id: debugUser, label: 'dev sync' } : null;
        },
        async getToken() { return null; },
        async signIn() {
          signedIn = true;
          onChange(api.user);
        },
        async signOut() {
          signedIn = false;
          onChange(null);
        },
        async openAccount() {},
      };
      queueMicrotask(() => onChange(api.user));
      return api;
    }
    return {
      configured: false,
      user: null,
      async getToken() { return null; },
      async signIn() {
        throw new Error('Clerk publishable key is not configured');
      },
      async signOut() {},
      async openAccount() {},
    };
  }

  if (!globalThis.Clerk) {
    const clerkDomain = clerkDomainFromPublishableKey(publishableKey);
    if (!clerkDomain) throw new Error('invalid Clerk publishable key');
    await loadScript(
      window.MTGCOLLECTION_CLERK_UI_URL || `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`,
      { marker: 'ui' }
    );
    await loadScript(
      window.MTGCOLLECTION_CLERK_JS_URL || `https://${clerkDomain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
      { marker: 'js', publishableKey }
    );
  }

  let clerk = globalThis.Clerk;
  if (typeof clerk === 'function') clerk = new clerk(publishableKey);
  if (clerk && !clerk.loaded && typeof clerk.load === 'function') {
    await clerk.load({ publishableKey, ui: { ClerkUI: window.__internal_ClerkUICtor } });
  } else if (clerk && typeof clerk.load === 'function') {
    await clerk.load({ publishableKey, ui: { ClerkUI: window.__internal_ClerkUICtor } });
  }

  if (typeof clerk?.addListener === 'function') {
    clerk.addListener(() => onChange(userModel(clerk)));
  }

  return {
    configured: true,
    get user() { return userModel(clerk); },
    async getToken() {
      return clerk?.session?.getToken ? clerk.session.getToken() : null;
    },
    async signIn() {
      const redirectOptions = signInRedirectOptions();
      if (clerk?.openSignIn) return clerk.openSignIn(redirectOptions);
      if (clerk?.redirectToSignIn) return clerk.redirectToSignIn(redirectOptions);
      throw new Error('Clerk sign-in is unavailable');
    },
    async signOut() {
      if (clerk?.signOut) return clerk.signOut();
    },
    async openAccount() {
      if (clerk?.openUserProfile) return clerk.openUserProfile();
    },
  };
}

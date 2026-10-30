// Better Auth configuration (v1.7) with native D1 support.
// Uses Better Auth's default table/column naming (user, session, account,
// verification) so the library's schema validation matches our migrations.
import { betterAuth } from 'better-auth';
import type { Env } from '@env';

export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB as any,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],

    emailAndPassword: { enabled: false },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        accessType: 'online',
        prompt: 'select_account'
      }
    },

    user: {
      deleteUser: { enabled: true }
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 7
      }
    },

    account: {
      // We never call Google APIs, so tokens are never refreshed or needed.
      updateAccountOnSignIn: false,
      accountLinking: { enabled: false }
    },

    // Strip OAuth tokens before they reach the database.
    databaseHooks: {
      account: {
        create: {
          before: async (account: any) => {
            if (account.providerId === 'google') {
              return {
                data: {
                  ...account,
                  accessToken: null,
                  refreshToken: null,
                  idToken: null,
                  accessTokenExpiresAt: null,
                  refreshTokenExpiresAt: null,
                  scope: null
                }
              };
            }
          }
        },
        update: {
          before: async (account: any) => {
            if (account.providerId === 'google') {
              return {
                data: {
                  ...account,
                  accessToken: null,
                  refreshToken: null,
                  idToken: null,
                  accessTokenExpiresAt: null,
                  refreshTokenExpiresAt: null,
                  scope: null
                }
              };
            }
          }
        }
      }
    },

    rateLimit: {
      window: 60,
      max: 100
    },

    advanced: {
      useSecureCookies: true,
      crossSubDomainCookies: { enabled: false },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }
    }
  } as any);
}

let cachedAuth: ReturnType<typeof createAuth> | null = null;

export function getAuth(env: Env) {
  if (!cachedAuth) cachedAuth = createAuth(env);
  return cachedAuth;
}

export const auth = { create: createAuth, get: getAuth };
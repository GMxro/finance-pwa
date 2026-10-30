/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DELETION_JOURNAL: R2Bucket;
  SYNC_EPOCH: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MIN_APP_VERSION?: string;
}

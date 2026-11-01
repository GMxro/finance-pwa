import type { Env } from '@env';
import { CURRENT_LEGAL_VERSIONS, type LegalAcceptance } from '@contracts/legal';

export async function getLegalAcceptance(env: Env, userId: string): Promise<LegalAcceptance> {
  const acceptance = await env.DB.prepare(`
    SELECT accepted_at FROM legal_acceptances
    WHERE user_id = ? AND terms_version = ? AND privacy_version = ?
  `).bind(userId, CURRENT_LEGAL_VERSIONS.terms, CURRENT_LEGAL_VERSIONS.privacy)
    .first<{ accepted_at: number }>();

  return {
    accepted: acceptance !== null,
    termsVersion: CURRENT_LEGAL_VERSIONS.terms,
    privacyVersion: CURRENT_LEGAL_VERSIONS.privacy,
    acceptedAt: acceptance?.accepted_at ?? null
  };
}

export async function acceptCurrentLegalDocuments(env: Env, userId: string): Promise<LegalAcceptance> {
  await env.DB.prepare(`
    INSERT INTO legal_acceptances (user_id, terms_version, privacy_version, accepted_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, terms_version, privacy_version) DO NOTHING
  `).bind(userId, CURRENT_LEGAL_VERSIONS.terms, CURRENT_LEGAL_VERSIONS.privacy, Date.now()).run();

  return getLegalAcceptance(env, userId);
}

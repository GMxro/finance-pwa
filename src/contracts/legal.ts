export const CURRENT_LEGAL_VERSIONS = {
  terms: '2026-10-31',
  privacy: '2026-10-31'
} as const;

export interface LegalAcceptance {
  accepted: boolean;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: number | null;
}

export interface LegalAcceptanceInput {
  termsAccepted: true;
  privacyAcknowledged: true;
  adultConfirmed: true;
}

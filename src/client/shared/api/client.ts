// Shared: API client with error handling
import type { TransactionCreate, TransactionUpdate, TransactionResponse, TransactionListQuery } from '@contracts/transaction';
import type { BudgetCreate, BudgetUpdate, BudgetResponse, BudgetWithSpent } from '@contracts/budget';
import type { CategoryCreate, CategoryUpdate, CategoryResponse } from '@contracts/category';
import type { AccountCreate, AccountUpdate, AccountResponse, AccountWithBalances } from '@contracts/account';
import type { TransferCreate, TransferResponse } from '@contracts/transfer';
import type { SyncPullResponse } from '@contracts/sync';
import type { UserPublic } from '@contracts/auth';
import type { CurrencyCode } from '@domain/money';
import { REQUIRED_APP_VERSION_KEY } from '@client/app/version-policy';

declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const APP_UPDATE_REQUIRED_EVENT = 'app:update-required';

export async function appFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-App-Version', APP_VERSION);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 426 && typeof window !== 'undefined') {
    const body = await response.clone().json().catch(() => null) as { minimumVersion?: string } | null;
    if (body?.minimumVersion) {
      try {
        window.localStorage.setItem(REQUIRED_APP_VERSION_KEY, body.minimumVersion);
      } catch {
        // The server still enforces the minimum; storage only preserves the local gate offline.
      }
    }
    window.dispatchEvent(new CustomEvent(APP_UPDATE_REQUIRED_EVENT, {
      detail: { minimumVersion: body?.minimumVersion }
    }));
  }
  return response;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export function canUseStaleData(error: unknown): boolean {
  const code = (error as ApiError | null)?.code;
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN_ORIGIN' || code === 'UPDATE_REQUIRED' || code === 'VERSION_POLICY_INVALID') {
    return false;
  }
  if (code === 'NETWORK_ERROR' || code === 'OFFLINE' || code === 'RATE_LIMITED') return true;
  if (code && /^HTTP_5\d\d$/.test(code)) return true;
  return !code && typeof navigator !== 'undefined' && !navigator.onLine;
}

export function formatApiError(error: unknown, fallback: string): string {
  const apiError = error as ApiError | null;
  switch (apiError?.code) {
    case 'UNAUTHORIZED':
    case 'HTTP_401':
      return 'La sesión venció. Iniciá sesión nuevamente para actualizar tus datos.';
    case 'UPDATE_REQUIRED':
      return 'Actualizá la aplicación para volver a consultar tus datos.';
    case 'VERSION_POLICY_INVALID':
      return 'La política de versión de la aplicación no está configurada correctamente.';
    case 'RATE_LIMITED':
      return apiError.message || 'El servidor limitó temporalmente las solicitudes. Esperá y volvé a intentar.';
    case 'NETWORK_ERROR':
    case 'OFFLINE':
      return 'No hay conexión con el servidor.';
  }
  if (apiError?.code && /^HTTP_5\d\d$/.test(apiError.code)) {
    return 'El servidor no pudo completar la solicitud.';
  }
  return apiError?.message || (error instanceof Error ? error.message : fallback);
}

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const res = await appFetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'same-origin'
    });

    if (res.status === 204) {
      return { data: null as T, error: null };
    }

    const body = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      return {
        data: null,
        error: {
          code: body.code || `HTTP_${res.status}`,
          message: body.message || 'Error en la solicitud',
          details: body.details
        }
      };
    }

    return { data: body as T, error: null };
  } catch {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Error de conexión. Verifique su internet e intente nuevamente.'
      }
    };
  }
}

// Auth
export async function getSession(): Promise<ApiResponse<UserPublic>> {
  const res = await request<{ user: UserPublic } | null>('/auth/get-session');
  if (res.error) return { data: null, error: res.error };
  return { data: res.data?.user ?? null, error: null };
}

// Bootstrap
export interface BootstrapData {
  userId: string;
  syncEpoch: string;
  defaultCurrency: CurrencyCode;
  timeZone: string;
  onboardingComplete: boolean;
}

export async function getBootstrap(): Promise<ApiResponse<BootstrapData>> {
  return request<BootstrapData>('/bootstrap');
}

export async function updatePreferences(defaultCurrency: CurrencyCode): Promise<ApiResponse<{ defaultCurrency: CurrencyCode }>> {
  return request<{ defaultCurrency: CurrencyCode }>('/account/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ default_currency: defaultCurrency })
  });
}

export interface MonthlySummary {
  periodMonth: string;
  currency: CurrencyCode;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  byCategory: Array<{ categoryId: string; kind: 'income' | 'expense'; amountMinor: number }>;
  transactionCount: number;
}

export async function getMonthlySummary(period: string, currency?: CurrencyCode): Promise<ApiResponse<MonthlySummary>> {
  const params = new URLSearchParams({ period });
  if (currency) params.set('currency', currency);
  return request<MonthlySummary>(`/transactions/summary?${params.toString()}`);
}

// Transactions
export async function listTransactions(params: Partial<TransactionListQuery> = {}): Promise<ApiResponse<TransactionResponse[]>> {
  const search = new URLSearchParams();
  const merged = { page: 1, limit: 50, ...params };
  Object.entries(merged).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  });
  return request<TransactionResponse[]>(`/transactions?${search.toString()}`);
}

export async function createTransaction(data: TransactionCreate): Promise<ApiResponse<TransactionResponse>> {
  return request<TransactionResponse>('/transactions', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateTransaction(id: string, data: TransactionUpdate): Promise<ApiResponse<TransactionResponse>> {
  return request<TransactionResponse>(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

export async function deleteTransaction(id: string, version: number): Promise<ApiResponse<null>> {
  return request<null>(`/transactions/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ version })
  });
}

export async function syncTransactions(params: { epoch: string; after: number; limit: number }): Promise<ApiResponse<SyncPullResponse>> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => search.set(k, String(v)));
  return request<SyncPullResponse>(`/sync/transactions?${search.toString()}`);
}

export interface SyncPushItem {
  id: string;
  operationId: string;
  userId: string;
  type: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  version?: number;
}

export interface SyncPushResult {
  applied: number;
  appliedOperationIds: string[];
  conflicts: Array<{ id: string; error: string }>;
  newCursor: number;
}

export async function pushSyncTransactions(params: { epoch: string; items: SyncPushItem[] }): Promise<ApiResponse<SyncPushResult>> {
  return request<SyncPushResult>('/sync/transactions', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// Categories
export async function listCategories(includeArchived = false): Promise<ApiResponse<CategoryResponse[]>> {
  return request<CategoryResponse[]>(`/categories${includeArchived ? '?includeArchived=1' : ''}`);
}

export async function createCategory(data: CategoryCreate): Promise<ApiResponse<CategoryResponse>> {
  return request<CategoryResponse>('/categories', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateCategory(id: string, data: CategoryUpdate): Promise<ApiResponse<CategoryResponse>> {
  return request<CategoryResponse>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

// Budgets
export async function listBudgets(periodMonth: string): Promise<ApiResponse<BudgetWithSpent[]>> {
  return request<BudgetWithSpent[]>(`/budgets?period=${encodeURIComponent(periodMonth)}`);
}

export async function upsertBudget(data: BudgetCreate): Promise<ApiResponse<BudgetResponse>> {
  return request<BudgetResponse>('/budgets', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function deleteBudget(id: string, version: number): Promise<ApiResponse<{ success: boolean }>> {
  return request<{ success: boolean }>(`/budgets/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ version })
  });
}

export async function updateBudget(id: string, data: BudgetUpdate): Promise<ApiResponse<BudgetResponse>> {
  return request<BudgetResponse>(`/budgets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

// Cuentas propias
export async function listAccounts(includeArchived = false): Promise<ApiResponse<AccountWithBalances[]>> {
  return request<AccountWithBalances[]>(`/accounts${includeArchived ? '?includeArchived=1' : ''}`);
}

export async function createAccount(data: AccountCreate): Promise<ApiResponse<AccountResponse>> {
  return request<AccountResponse>('/accounts', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateAccount(id: string, data: AccountUpdate): Promise<ApiResponse<AccountResponse>> {
  return request<AccountResponse>(`/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

// Transferencias entre cuentas propias
export async function listTransfers(params: { period?: string; accountId?: string; page?: number; limit?: number } = {}): Promise<ApiResponse<TransferResponse[]>> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return request<TransferResponse[]>(`/transfers${query ? `?${query}` : ''}`);
}

export async function createTransfer(data: TransferCreate): Promise<ApiResponse<TransferResponse>> {
  return request<TransferResponse>('/transfers', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function deleteTransfer(id: string): Promise<ApiResponse<null>> {
  return request<null>(`/transfers/${id}`, { method: 'DELETE' });
}

// Account
export async function exportCSV(): Promise<ApiResponse<Blob>> {
  const res = await appFetch(`${API_BASE}/account/export`, { credentials: 'same-origin' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as any;
    return { data: null, error: { code: body.code || `HTTP_${res.status}`, message: body.message || 'Error al exportar' } };
  }
  return { data: await res.blob(), error: null };
}

export interface AccountDeletionStatus {
  found: boolean;
  completed: boolean;
}

export type AccountDeletionLookup = { requestId: string } | { userId: string };

export async function deleteAccount(confirmation: string, requestId: string): Promise<ApiResponse<{ completed: boolean }>> {
  return request<{ completed: boolean }>('/account/delete', {
    method: 'POST',
    body: JSON.stringify({ confirmation, requestId })
  });
}

export async function getAccountDeletionStatus(lookup: AccountDeletionLookup): Promise<ApiResponse<AccountDeletionStatus>> {
  return request<AccountDeletionStatus>('/account/deletion-status', {
    method: 'POST',
    body: JSON.stringify(lookup)
  });
}

export async function waitForAccountDeletion(lookup: AccountDeletionLookup): Promise<ApiResponse<AccountDeletionStatus>> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const status = await getAccountDeletionStatus(lookup);
    if (status.error || !status.data || status.data.completed || !status.data.found) return status;
    if (attempt < 29) await new Promise((resolve) => setTimeout(resolve, 2100));
  }
  return {
    data: null,
    error: { code: 'ACCOUNT_DELETION_PENDING', message: 'La eliminación quedó registrada y se está completando. Volvé a intentar en un momento.' }
  };
}

// Export api object for convenience
export const api = {
  getSession,
  getBootstrap,
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  syncTransactions,
  pushSyncTransactions,
  listCategories,
  createCategory,
  updateCategory,
  listBudgets,
  upsertBudget,
  updateBudget,
  deleteBudget,
  listAccounts,
  createAccount,
  updateAccount,
  listTransfers,
  createTransfer,
  deleteTransfer,
  exportCSV,
  deleteAccount,
  getAccountDeletionStatus,
waitForAccountDeletion,
   updatePreferences,
   getMonthlySummary
 };

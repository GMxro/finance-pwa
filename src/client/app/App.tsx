// App root component
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './providers';
import { AppShell } from '@client/app/layouts/AppShell';
import { LoginPage } from '@client/features/auth/LoginPage';
import { OnboardingPage } from '@client/features/auth/OnboardingPage';
import { OverviewPage } from '@client/features/overview/OverviewPage';
import { TransactionsPage } from '@client/features/transactions/TransactionsPage';
import { BudgetsPage } from '@client/features/budgets/BudgetsPage';
import { StatisticsPage } from '@client/features/statistics/StatisticsPage';
import { CategoriesPage } from '@client/features/categories/CategoriesPage';
import { AccountsPage } from '@client/features/accounts/AccountsPage';
import { SettingsPage } from '@client/features/settings/SettingsPage';
import { LoadingScreen } from '@shared/ui/LoadingScreen';
import { TermsPage } from '@client/features/legal/TermsPage';
import { PrivacyPage } from '@client/features/legal/PrivacyPage';
import { LegalAcceptancePage } from '@client/features/legal/LegalAcceptancePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, legalAcceptance, onboardingComplete } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!legalAcceptance?.accepted) return <Navigate to="/aceptar-legal" replace />;
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}

function AppLayout() {
  const routes = (
    <Routes>
      <Route path="/" element={<OverviewPage />} />
      <Route path="/movimientos" element={<TransactionsPage />} />
      <Route path="/cuentas" element={<AccountsPage />} />
      <Route path="/presupuestos" element={<BudgetsPage />} />
      <Route path="/estadisticas" element={<StatisticsPage />} />
      <Route path="/ajustes/categorias" element={<CategoriesPage />} />
     <Route path="/categorias" element={<Navigate to="/ajustes/categorias" replace />} />
     <Route path="/ajustes" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  return (
    <ProtectedRoute>
      <AppShell>{routes}</AppShell>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/terminos" element={<TermsPage />} />
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/aceptar-legal" element={<LegalAcceptancePage />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />
      <Route path="/*" element={<AppLayout />} />
    </Routes>
  );
}

export function App() {
  return <AppRoutes />;
}

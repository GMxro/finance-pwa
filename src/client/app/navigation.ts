import { Home, List, Wallet, Target, ChartColumn, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: List },
  { to: '/cuentas', label: 'Cuentas', icon: Wallet },
  { to: '/presupuestos', label: 'Presupuestos', icon: Target },
  { to: '/estadisticas', label: 'Estadísticas', icon: ChartColumn },
  { to: '/ajustes', label: 'Ajustes', icon: Settings }
];

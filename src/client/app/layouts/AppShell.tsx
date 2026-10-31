import React from 'react';
import { NavLink } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../providers';
import { NAV_ITEMS } from '../navigation';
import { ButtonLink } from '@shared/ui/Button';
import { Status } from '@shared/ui/Status';
import './AppShell.css';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, syncState, syncNow } = useAuth();

  const syncLabel = syncState.error
    ? `${syncState.pendingCount} pendiente${syncState.pendingCount === 1 ? '' : 's'} · Error de sincronización`
    : syncState.status === 'syncing'
      ? 'Sincronizando'
      : syncState.pendingCount > 0
        ? `${syncState.pendingCount} pendiente${syncState.pendingCount === 1 ? '' : 's'}`
        : 'Al día';

  const syncTone = syncState.error ? 'danger' : 'neutral';

  return (
    <div className="ui-shell">
      <aside className="ui-sidebar" aria-label="Navegación principal">
        <div className="ui-sidebar__brand">
          <img src="/icons/icon-96.png" alt="" width="34" height="34" />
          <span>Finanzas</span>
        </div>

        <nav className="ui-sidebar__nav">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `ui-nav-item ${isActive ? 'is-active' : ''}`}
              >
                <span className="ui-nav-item__marker" aria-hidden="true" />
                <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="ui-sidebar__footer">
          <ButtonLink
            to="/movimientos?new=expense"
            variant="onInk"
            fullWidth
            leftIcon={<Plus size={18} />}
          >
            Nuevo movimiento
          </ButtonLink>

          <button
            type="button"
            className={`ui-sync ui-sync--${syncTone}`}
            onClick={() => { void syncNow().catch(() => undefined); }}
            aria-label={`${syncLabel}. Sincronizar ahora`}
          >
            <Status label={syncLabel} tone={syncState.error ? 'danger' : 'onInk'} />
          </button>

          <div className="ui-sidebar__account">
            <span className="ui-avatar ui-avatar--onInk" aria-hidden="true">
              {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
            </span>
            <div>
              <div className="ui-sidebar__account-name">{user?.name || 'Tu cuenta'}</div>
              <div className="ui-sidebar__account-email">{user?.email}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="ui-shell__main">
        <div className="ui-shell__content">{children}</div>

        <nav className="ui-bottom-nav" aria-label="Navegación principal">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `ui-bottom-nav__item ${isActive ? 'is-active' : ''}`}
              >
                <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

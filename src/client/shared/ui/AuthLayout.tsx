import React from 'react';
import './AuthLayout.css';

interface AuthLayoutProps {
  children: React.ReactNode;
  artTitle: string;
  artText: string;
}

export function AuthLayout({ children, artTitle, artText }: AuthLayoutProps) {
  return (
    <main className="ui-auth">
      <section className="ui-auth__form">
        <div className="ui-auth__brand">
          <img src="/icons/icon-96.png" alt="" width="34" height="34" />
          <span>Finanzas</span>
        </div>
        <div className="ui-auth__body">{children}</div>
      </section>

      <aside className="ui-auth__art" aria-hidden="true">
        <div className="ui-auth__art-top">
          <img src="/icons/icon-512.png" alt="" width="88" height="88" />
          <span className="ui-auth__art-kicker">Finanzas personales</span>
        </div>
        <div className="ui-auth__art-copy">
          <p className="ui-auth__art-title">{artTitle}</p>
          <p className="ui-auth__art-text">{artText}</p>
        </div>
        <div className="ui-auth__art-foot">
          <span className="ui-auth__art-dot" />
          <span>ARS · USD · Sin conexión</span>
        </div>
      </aside>
    </main>
  );
}

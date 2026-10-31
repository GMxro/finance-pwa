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
        <div className="ui-auth__mobile-brand">Finanzas</div>
        <div className="ui-auth__body">{children}</div>
      </section>

      <aside className="ui-auth__art">
        <div className="ui-auth__art-top">
          <img src="/icons/icon-512.png" alt="" width="64" height="64" />
        </div>
        <div className="ui-auth__art-copy">
          <h2 className="ui-auth__art-title">{artTitle}</h2>
          <p className="ui-auth__art-text">{artText}</p>
        </div>
      </aside>
    </main>
  );
}

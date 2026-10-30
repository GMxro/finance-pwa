import React from 'react';
import './Layout.css';

type Gap = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface PageProps {
  children: React.ReactNode;
  className?: string;
}

export function Page({ children, className = '' }: PageProps) {
  return <div className={`ui-page ${className}`}>{children}</div>;
}

interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header__text">
        {eyebrow && <div className="ui-page-header__eyebrow">{eyebrow}</div>}
        <h1 className="ui-page-header__title">{title}</h1>
        {description && <p className="ui-page-header__description">{description}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

interface SectionProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Section({ title, action, children, className = '' }: SectionProps) {
  return (
    <section className={`ui-section ${className}`}>
      {(title || action) && (
        <div className="ui-section__header">
          {title && <h2 className="ui-section__title">{title}</h2>}
          {action && <div className="ui-section__action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

interface StackProps {
  children: React.ReactNode;
  gap?: Gap;
  align?: 'start' | 'center' | 'end' | 'stretch';
  className?: string;
}

export function Stack({ children, gap = 'md', align = 'stretch', className = '' }: StackProps) {
  return (
    <div className={`ui-stack ui-stack--${gap} ui-stack--align-${align} ${className}`}>
      {children}
    </div>
  );
}

interface InlineProps {
  children: React.ReactNode;
  gap?: Gap;
  justify?: 'start' | 'center' | 'end' | 'between';
  align?: 'start' | 'center' | 'end' | 'baseline';
  wrap?: boolean;
  className?: string;
}

export function Inline({
  children,
  gap = 'sm',
  justify = 'start',
  align = 'center',
  wrap = true,
  className = ''
}: InlineProps) {
  return (
    <div
      className={`ui-inline ui-inline--${gap} ui-inline--justify-${justify} ui-inline--align-${align} ${
        wrap ? 'ui-inline--wrap' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface GridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  layout?: 'equal' | 'split' | 'wide';
  gap?: Gap;
  className?: string;
}

export function Grid({ children, columns = 3, layout = 'equal', gap = 'md', className = '' }: GridProps) {
  return (
    <div className={`ui-grid ui-grid--${layout} ui-grid--cols-${columns} ui-grid--gap-${gap} ${className}`}>
      {children}
    </div>
  );
}

export function Divider() {
  return <hr className="ui-divider" />;
}

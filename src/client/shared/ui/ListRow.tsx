import React from 'react';
import { Link } from 'react-router-dom';
import './ListRow.css';

interface ListRowProps {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  as?: 'div' | 'button' | 'a';
  href?: string;
  to?: string;
}

export function ListRow({ leading, title, subtitle, meta, trailing, onClick, as = 'div', href, to }: ListRowProps) {
  const body = (
    <>
      {leading && <div className="ui-row__leading">{leading}</div>}
      <div className="ui-row__main">
        <div className="ui-row__title">{title}</div>
        {subtitle && <div className="ui-row__subtitle">{subtitle}</div>}
      </div>
      {meta && <div className="ui-row__meta">{meta}</div>}
    </>
  );
  const trailingNode = trailing && <div className="ui-row__trailing">{trailing}</div>;
  const surfaceClassName = 'ui-row__surface';

  if (to) {
    if (trailing) {
      return (
        <div className="ui-row ui-row--interactive ui-row--split">
          <Link className={surfaceClassName} to={to}>{body}</Link>
          {trailingNode}
        </div>
      );
    }

    return (
      <Link className="ui-row ui-row--interactive" to={to}>
        {body}
      </Link>
    );
  }

  const Tag = (as === 'a' ? 'a' : as) as React.ElementType;
  const interactive = Boolean(onClick) || as === 'a' || as === 'button';

  if (trailing && interactive) {
    const Surface = as === 'a' ? 'a' : 'button';
    return (
      <div className="ui-row ui-row--interactive ui-row--split">
        <Surface
          className={surfaceClassName}
          onClick={onClick}
          {...(as === 'a' ? { href } : { type: 'button' })}
        >
          {body}
        </Surface>
        {trailingNode}
      </div>
    );
  }

  return (
    <Tag
      className={`ui-row ${interactive ? 'ui-row--interactive' : ''}`}
      onClick={onClick}
      href={href}
      {...(as === 'button' ? { type: 'button' } : {})}
    >
      {body}
      {trailingNode}
    </Tag>
  );
}

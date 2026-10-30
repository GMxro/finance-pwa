import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'onInk' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
}

function classes(variant: Variant, size: Size, fullWidth: boolean, className: string) {
  return `ui-btn ui-btn--${variant} ui-btn--${size} ${fullWidth ? 'ui-btn--full' : ''} ${className}`.trim();
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  loading = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes(variant, size, fullWidth, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="ui-btn__spinner" aria-hidden="true" />}
      {!loading && leftIcon && <span className="ui-btn__icon" aria-hidden="true">{leftIcon}</span>}
      <span className="ui-btn__text">{children}</span>
      {!loading && rightIcon && <span className="ui-btn__icon" aria-hidden="true">{rightIcon}</span>}
    </button>
  );
}

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={classes(variant, size, fullWidth, className)} {...props}>
      {leftIcon && <span className="ui-btn__icon" aria-hidden="true">{leftIcon}</span>}
      <span className="ui-btn__text">{children}</span>
      {rightIcon && <span className="ui-btn__icon" aria-hidden="true">{rightIcon}</span>}
    </Link>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'default' | 'danger' | 'onInk';
  size?: 'sm' | 'md';
}

export function IconButton({ label, tone = 'default', size = 'md', className = '', children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`ui-icon-btn ui-icon-btn--${tone} ui-icon-btn--${size} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

import React from 'react';
import './Text.css';

type Variant = 'display' | 'title' | 'subtitle' | 'body' | 'small' | 'caption' | 'micro' | 'money-xl' | 'money' | 'money-sm';
type Tone = 'ink' | 'stone' | 'on-ink' | 'on-ink-muted' | 'danger';

interface TextProps {
  as?: React.ElementType;
  variant?: Variant;
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  id?: string;
}

export function Text({ as: Tag = 'p', variant = 'body', tone = 'ink', className = '', children, id }: TextProps) {
  return (
    <Tag id={id} className={`ui-text ui-text--${variant} ui-text--${tone} ${className}`}>
      {children}
    </Tag>
  );
}

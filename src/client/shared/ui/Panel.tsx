import React from 'react';
import './Panel.css';

type Tone = 'paper' | 'inset' | 'ink' | 'outline';
type Radius = 'card' | 'panel' | 'none';
type Padding = 'none' | 'sm' | 'md' | 'lg';

interface PanelProps {
  children: React.ReactNode;
  tone?: Tone;
  radius?: Radius;
  padding?: Padding;
  className?: string;
  as?: React.ElementType;
  id?: string;
}

export function Panel({
  children,
  tone = 'paper',
  radius = 'card',
  padding = 'md',
  className = '',
  as: Tag = 'section',
  id
}: PanelProps) {
  return (
    <Tag id={id} className={`ui-panel ui-panel--${tone} ui-panel--radius-${radius} ui-panel--pad-${padding} ${className}`}>
      {children}
    </Tag>
  );
}

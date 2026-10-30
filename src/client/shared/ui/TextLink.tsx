import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './TextLink.css';

interface TextLinkProps extends LinkProps {
  children: React.ReactNode;
}

export function TextLink({ children, className = '', ...props }: TextLinkProps) {
  return <Link className={`ui-textlink ${className}`} {...props}>{children}</Link>;
}

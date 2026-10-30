import React from 'react';
import {
  Tag,
  Utensils,
  Bus,
  Home,
  Zap,
  HeartPulse,
  Gamepad2,
  ShoppingBag,
  GraduationCap,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  PlusCircle,
  type LucideIcon
} from 'lucide-react';
import './CategoryIcon.css';

const ICONS: Record<string, LucideIcon> = {
  tag: Tag,
  utensils: Utensils,
  bus: Bus,
  home: Home,
  zap: Zap,
  'heart-pulse': HeartPulse,
  'gamepad-2': Gamepad2,
  'shopping-bag': ShoppingBag,
  'graduation-cap': GraduationCap,
  'more-horizontal': MoreHorizontal,
  briefcase: Briefcase,
  laptop: Laptop,
  'trending-up': TrendingUp,
  'plus-circle': PlusCircle
};

export const CATEGORY_ICON_KEYS = Object.keys(ICONS);

interface CategoryIconProps {
  iconKey?: string | null;
  size?: 'sm' | 'md';
  tone?: 'default' | 'onInk';
}

export function CategoryIcon({ iconKey, size = 'md', tone = 'default' }: CategoryIconProps) {
  const Icon = ICONS[iconKey ?? 'tag'] ?? Tag;
  return (
    <span className={`ui-category-icon ui-category-icon--${size} ui-category-icon--${tone}`} aria-hidden="true">
      <Icon size={size === 'sm' ? 16 : 18} strokeWidth={1.6} />
    </span>
  );
}

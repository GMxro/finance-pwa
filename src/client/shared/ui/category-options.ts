import { CATEGORY_ICON_KEYS } from './CategoryIcon';

const ICON_LABELS: Record<string, string> = {
  tag: 'Etiqueta',
  utensils: 'Comida',
  bus: 'Transporte',
  home: 'Hogar',
  zap: 'Servicios',
  'heart-pulse': 'Salud',
  'gamepad-2': 'Ocio',
  'shopping-bag': 'Compras',
  'graduation-cap': 'Educación',
  'more-horizontal': 'Otros',
  briefcase: 'Trabajo',
  laptop: 'Freelance',
  'trending-up': 'Inversiones',
  'plus-circle': 'Extra'
};

export const CATEGORY_ICON_OPTIONS = CATEGORY_ICON_KEYS.map(key => ({
  value: key,
  label: ICON_LABELS[key] ?? key
}));

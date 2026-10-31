import { z } from 'zod';
import { isValidISODate, isValidMonth } from '@domain/date';

export const calendarDateSchema = z.string().refine(isValidISODate, 'Fecha calendario inválida.');
export const calendarMonthSchema = z.string().refine(isValidMonth, 'Período mensual inválido.');

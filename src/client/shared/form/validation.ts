export type FieldErrors = Record<string, string | undefined>;

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * Enfoca el primer control inválido de un formulario y lo trae al centro.
 * Se llama después de setear los errores; el rAF espera el commit de React.
 */
export function focusFirstInvalid(formId: string): void {
  window.requestAnimationFrame(() => {
    const form = document.getElementById(formId);
    const field = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!field) return;
    field.focus({ preventScroll: true });
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

export function requiredText(value: string, message: string): string | undefined {
  return value.trim() ? undefined : message;
}

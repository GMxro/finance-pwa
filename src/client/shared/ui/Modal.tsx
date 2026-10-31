import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Modal.css';

function blurActiveField() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

function isEditableField(element: Element | null) {
  return (
    element instanceof HTMLElement &&
    (element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable)
  );
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md';
  /** Si true, solo autofocus la primera vez que se abre el modal y el primer campo está vacío */
  autoFocusFirstEmpty?: boolean;
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', autoFocusFirstEmpty = true }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const hasAutoFocused = useRef(false);

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Solo autofocus la primera vez que se abre, y solo si el primer campo está vacío
    if (autoFocusFirstEmpty && !hasAutoFocused.current) {
      const content = contentRef.current?.querySelector<HTMLElement>('.ui-modal__content');
      const firstInput = content?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([type="radio"]), select, textarea'
      );
      
      const shouldFocus = firstInput && 
        (firstInput.tagName === 'INPUT' || firstInput.tagName === 'TEXTAREA') &&
        ('value' in firstInput && (!firstInput.value || firstInput.value === '0' || firstInput.value === '0,00'));
      
      if (shouldFocus) {
        window.setTimeout(() => (firstInput as HTMLElement).focus(), 0);
      }
      hasAutoFocused.current = true;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !contentRef.current) return;

      const focusable = Array.from(
        contentRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [open, onClose, autoFocusFirstEmpty]);

  // iOS no redimensiona el layout cuando aparece el teclado: la hoja queda
  // tapada y el botón de guardar no se puede tocar. Publicamos la altura del
  // teclado como variable CSS para que el modal se acomode por encima.
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    const sync = () => {
      const rawInset = Math.round(window.innerHeight - viewport.height);
      // Menos de 100px es la barra del navegador, no un teclado.
      const inset = rawInset >= 100 ? rawInset : 0;
      root.style.setProperty('--keyboard-inset', `${inset}px`);
    };

    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
      root.style.removeProperty('--keyboard-inset');
    };
  }, [open]);

  // Resetear el flag cuando se cierra el modal
  useEffect(() => {
    if (!open) {
      hasAutoFocused.current = false;
    }
  }, [open]);

  if (!open) return null;

  // Tocar fuera del modal en mobile: baja el teclado pero no cierra
  const handleOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && isEditableField(document.activeElement)) {
      blurActiveField();
      return;
    }
    onClose();
  };

  return createPortal(
    <div className="ui-modal-overlay" onPointerDown={handleOverlayPointerDown} role="presentation">
      <div
        ref={contentRef}
        className={`ui-modal ui-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="ui-modal__header">
          <div>
            {title && <h2 id={titleId} className="ui-modal__title">{title}</h2>}
            {description && <p id={descriptionId} className="ui-modal__description">{description}</p>}
          </div>
          <button type="button" className="ui-modal__close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="ui-modal__content">{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

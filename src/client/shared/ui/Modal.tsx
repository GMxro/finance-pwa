import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Modal.css';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]):not([type="date"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const EDITABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="radio"]):not([type="date"]):not([readonly]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

const SELECTABLE_INPUT_TYPES = new Set(['text', 'search', 'tel', 'url', 'password']);

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

function isVisible(element: HTMLElement) {
  return element.getClientRects().length > 0;
}

function visibleFocusables(root: HTMLElement | null) {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    element =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      isVisible(element)
  );
}

function focusElement(element: HTMLElement | null | undefined) {
  if (!element) return false;
  element.focus();
  return document.activeElement === element;
}

function focusEditableField(element: HTMLElement | null | undefined) {
  if (!focusElement(element)) return false;
  if (element instanceof HTMLInputElement && SELECTABLE_INPUT_TYPES.has(element.type) && element.value) {
    element.select();
  }
  return true;
}

function firstVisibleEditable(root: HTMLElement | null) {
  if (!root) return null;
  return Array.from(root.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR)).find(isVisible) ?? null;
}

function focusFirstInside(content: HTMLElement) {
  const body = content.querySelector<HTMLElement>('.ui-modal__body');
  const footer = content.querySelector<HTMLElement>('.ui-modal__footer');
  const close = content.querySelector<HTMLElement>('.ui-modal__close');

  return (
    focusElement(visibleFocusables(body)[0]) ||
    focusElement(visibleFocusables(footer)[0]) ||
    focusElement(close) ||
    focusElement(content)
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
  /** Si true, enfoca el primer campo editable (o una acción segura del diálogo) la primera vez que se abre */
  autoFocusFirstEmpty?: boolean;
  /** Si true, impide cerrar el modal (Escape, overlay, botón X) mientras hay una operación en curso */
  busy?: boolean;
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', autoFocusFirstEmpty = true, busy = false }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const hasAutoFocused = useRef(false);

  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  const autoFocusRef = useRef(autoFocusFirstEmpty);
  onCloseRef.current = onClose;
  busyRef.current = busy;
  autoFocusRef.current = autoFocusFirstEmpty;

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (autoFocusRef.current && !hasAutoFocused.current) {
      window.setTimeout(() => {
        const body = bodyRef.current;
        const content = contentRef.current;
        if (!body || !content || hasAutoFocused.current) return;

        const preferred = body.querySelector<HTMLElement>('[data-autofocus]');
        const focused =
          focusEditableField(preferred) ||
          focusEditableField(firstVisibleEditable(body)) ||
          focusFirstInside(content);

        if (focused) hasAutoFocused.current = true;
      }, 0);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (busyRef.current) return;
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !contentRef.current) return;

      const content = contentRef.current;
      const focusable = visibleFocusables(content);

      if (!content.contains(document.activeElement)) {
        event.preventDefault();
        (focusable[0] ?? content).focus();
        return;
      }

      if (focusable.length === 0) {
        event.preventDefault();
        content.focus();
        return;
      }

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
      hasAutoFocused.current = false;
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (!open) return;
      previousActiveElement.current?.focus();
    };
  }, [open]);

  // iOS keyboard handling with visualViewport - ensures focused field stays visible
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    const sync = () => {
      const rawInset = Math.round(window.innerHeight - viewport.height);
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

  useEffect(() => {
    if (!open) {
      hasAutoFocused.current = false;
    }
  }, [open]);

  if (!open) return null;

  const handleOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (busyRef.current) return;
    if (event.pointerType === 'touch' && isEditableField(document.activeElement)) {
      blurActiveField();
      return;
    }
    onCloseRef.current();
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
          <button type="button" className="ui-modal__close" onClick={() => onCloseRef.current()} disabled={busy} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="ui-modal__body" ref={bodyRef}>
          {children}
        </div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

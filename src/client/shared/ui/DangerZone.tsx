import { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import './DangerZone.css';

export interface DangerZoneProps {
  title: string;
  description: string;
  actionLabel: string;
  confirmText: string;
  onAction: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
}

export function DangerZone({ title, description, actionLabel, confirmText, onAction, disabled, loading }: DangerZoneProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isBusy = loading || busy;

  const handleAction = async () => {
    if (inputValue !== confirmText) {
      setError(`Escribí exactamente: ${confirmText}`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onAction();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-danger">
      <div className="ui-danger__head">
        <div>
          <h3 className="ui-danger__title">{title}</h3>
          <p className="ui-danger__description">{description}</p>
        </div>
        {!open && (
          <Button variant="ghost" onClick={() => setOpen(true)} disabled={disabled || isBusy} className="ui-danger__trigger">
            {actionLabel}
          </Button>
        )}
      </div>

      {open && (
        <div className="ui-danger__panel">
          <Input
            label={`Escribí "${confirmText}" para confirmar`}
            value={inputValue}
            onChange={value => {
              setInputValue(value);
              setError(null);
            }}
            error={error ?? undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="ui-danger__actions">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setInputValue('');
                setError(null);
              }}
              disabled={isBusy}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleAction} disabled={disabled || isBusy} loading={isBusy}>
              {actionLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Error handler middleware
import { HTTPException } from 'hono/http-exception';

export const errorHandler = async (c: any, next: any) => {
  try {
    await next();
  } catch (err) {
    const requestId = c.get('requestId') || 'unknown';
    console.error(`[${requestId}] Error:`, err instanceof Error ? err.message : 'Unknown error');
    
    if (err instanceof HTTPException) {
      return c.json(
        { 
          code: err.name, 
          message: err.message,
          details: err.cause 
        }, 
        err.status
      );
    }

    // Mapear errores de aplicación lanzados como Error plano a códigos HTTP
    // conocidos, para que el cliente reciba el motivo real en lugar de 500.
    if (err instanceof Error) {
      const code = err.message;
      const mapping: Record<string, { status: number; message: string }> = {
        NOT_FOUND: { status: 404, message: 'Recurso no encontrado' },
        BUDGET_NOT_FOUND: { status: 404, message: 'Presupuesto no encontrado' },
        CONFLICT: { status: 409, message: 'El recurso fue modificado por otro proceso' },
        DELETED: { status: 410, message: 'El recurso fue eliminado' },
        'Slug ya existe': { status: 409, message: 'Ya existe una categoría con ese slug' }
      };
      const mapped = mapping[code];
      if (mapped) {
        return c.json({ code, message: mapped.message }, mapped.status);
      }
    }
    
    return c.json(
      { 
        code: 'INTERNAL_ERROR', 
        message: 'Error interno del servidor' 
      }, 
      500
    );
  }
};

export class ConflictError extends HTTPException {
  constructor(message = 'Conflicto: el recurso fue modificado') {
    super(409, { message });
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends HTTPException {
  constructor(message = 'Recurso no encontrado') {
    super(404, { message });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends HTTPException {
  constructor(message: string, details?: any) {
    super(400, { message, cause: details });
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends HTTPException {
  constructor(message = 'No autorizado') {
    super(401, { message });
    this.name = 'UnauthorizedError';
  }
}
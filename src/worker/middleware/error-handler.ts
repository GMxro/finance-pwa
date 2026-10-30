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
  }
}

export class NotFoundError extends HTTPException {
  constructor(message = 'Recurso no encontrado') {
    super(404, { message });
  }
}

export class ValidationError extends HTTPException {
  constructor(message: string, details?: any) {
    super(400, { message, cause: details });
  }
}

export class UnauthorizedError extends HTTPException {
  constructor(message = 'No autorizado') {
    super(401, { message });
  }
}
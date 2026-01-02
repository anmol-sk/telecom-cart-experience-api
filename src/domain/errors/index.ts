// Base class for domain errors - includes HTTP status for easy mapping
export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 410 Gone - cart existed but expired
export class CartExpiredError extends DomainError {
  constructor(cartId: string) {
    super(
      `Cart session '${cartId}' has expired. Please create a new cart.`,
      'CART_EXPIRED',
      410
    );
  }
}

export class ResourceNotFoundError extends DomainError {
  constructor(resource: string, identifier: string) {
    super(
      `${resource} with identifier '${identifier}' not found.`,
      'RESOURCE_NOT_FOUND',
      404
    );
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT_ERROR', 409);
  }
}



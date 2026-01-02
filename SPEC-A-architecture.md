# Architecture Spec for Claude

## Goal
Build a thin cart API that sits on top of a mock Salesforce backend. Keep business logic separate from infra so we can test easily and swap out the backend later.

## Structure

Use hexagonal architecture - domain in the center, infrastructure at the edges.

### Domain Layer (src/domain/)

Core business logic - no HTTP, no database dependencies.

**CartService** - main service class
- Inject storage client and pricing strategy via constructor
- Methods: createCart, getCart, addItem, removeItem, updateItemQuantity, clearCart, deleteCart
- Business rules: UUID v4 for cart IDs, quantity between 1-99, merge quantities for duplicate products

**Models** - TypeScript interfaces
- Cart: cartId, items[], subtotal, tax, total, timestamps, metadata
- CartItem: itemId, product, quantity, unitPrice, totalPrice
- Product: productId, name, description, price, category

**Pricing Strategy** - interface + implementation
- IPricingStrategy interface with calculatePricing(cart) method
- StandardPricingStrategy: subtotal = sum of items, tax = 9%, total = subtotal + tax
- Round everything to 2 decimals

**Errors**
- CartExpiredError -> 410 (use 410 not 404 so frontend knows it expired)
- ResourceNotFoundError -> 404
- ValidationError -> 400
- ConflictError -> 409


### Infrastructure Layer (src/infrastructure/)

**ISalesforceCartClient** - interface for storage
- Methods: createCart, getCart, updateCart, deleteCart
- Returns Cart or throws errors

**SalesforceCartClientMock** - in-memory implementation
- Use Map to store carts with TTL (5 minutes)
- Check expiration on every operation - throw CartExpiredError if expired
- Background cleanup every 60 seconds to remove expired carts
- Singleton pattern (getInstance/resetInstance for testing)

### API Layer (src/index.ts)

Fastify server:
- Routes for all cart operations
- JSON schema validation on request bodies
- Global error handler that maps domain errors to HTTP status codes
- Swagger docs at /docs
- CORS enabled
- Graceful shutdown (SIGTERM/SIGINT)

Wire up dependencies:
```typescript
const client = new SalesforceCartClientMock(ttl)
const pricing = new StandardPricingStrategy()
const cartService = new CartService(client, pricing, config)
```

## Request Flow

Example: POST /v1/cart/:cartId/items

1. Fastify validates request body
2. Route handler calls cartService.addItem()
3. CartService validates cart ID and quantity
4. Gets cart from storage (throws if expired)
5. Merges quantity if product exists, or adds new item
6. Applies pricing strategy
7. Saves via storage client
8. Returns updated cart

## Design Patterns

**Hexagonal Architecture** - keep business logic independent of frameworks  
**Dependency Injection** - pass dependencies via constructor, makes testing easy  
**Strategy Pattern** - pricing logic can be swapped without changing CartService  
**Singleton** - mock client uses singleton to simulate session storage

## Testing

Unit tests for:
- CartService (business logic, validation, expiration)
- PricingStrategy (tax calculation, rounding)
- SalesforceCartClientMock (TTL behavior, cleanup)

Use dependency injection to mock everything. Tests should be fast.

## Tech Stack

- Node.js 20+
- TypeScript 5.x
- Fastify (lightweight HTTP framework)
- Vitest (testing)
- Swagger/OpenAPI (docs)

## Configuration

Everything via env vars (see .env.example):
- PORT, HOST
- CART_TTL_MINUTES (default 5)
- MAX_QUANTITY, MIN_QUANTITY (default 99, 1)
- API_TITLE, API_VERSION (for Swagger)
- CORS_ORIGIN

## What's NOT Included

This is a demo implementation:
- No real Salesforce API (mocked)
- No persistence (in-memory only)
- No auth
- No rate limiting
- No regional tax calculation
- No inventory checks

For production you'd need:
1. Real Salesforce REST API client
2. Redis for distributed sessions
3. OAuth/JWT auth
4. Rate limiting
5. Tax service integration
6. Inventory validation
7. Logging/metrics

## File Structure

```
src/
  domain/
    models.ts
    errors/
    services/
      CartService.ts
    strategies/
      IPricingStrategy.ts
  infrastructure/
    clients/
      ISalesforceCartClient.ts
      SalesforceCartClientMock.ts
  index.ts

tests/
  CartService.test.ts
  PricingStrategy.test.ts
  SalesforceCartClientMock.test.ts
```

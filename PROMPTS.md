# Development Prompts

## Overview

I broke this into two phases:
1. **Architecture Design** - I wrote SPEC-A and SPEC-B documenting the architecture and API contracts
2. **Implementation** - Used Claude to implement based on those specs, with iterative fixes

Total time: ~4 hours

---

## Phase 1: My Architecture Design (Manual)

Before coding, I spent time thinking through the architecture:

- **What pattern makes sense?** Hexagonal (keeps business logic testable and independent)
- **How to handle expiration?** 410 Gone instead of 404 so frontend knows to refresh session
- **How to test TTL without waiting?** Make it configurable in constructor
- **Storage pattern?** Interface + mock, easy to swap for Redis later

I documented everything in two specs:
- `SPEC-A-architecture.md` - architecture, patterns, design decisions
- `SPEC-B-api.md` - API contracts, request/response formats, error handling

---

## Phase 2: Implementation with Claude

### Prompt 1: Initial Implementation

```
Build a telecom cart API based on these specs.

[Pasted entire SPEC-A-architecture.md content]

[Pasted entire SPEC-B-api.md content]

Use TypeScript, Node 20+, Fastify for HTTP.

Requirements:
- Hexagonal architecture (domain/infrastructure/api layers)
- CartService with dependency injection
- Mock storage with 5-min TTL
- Pricing strategy (9% tax)
- Unit tests for core logic
- JSON schema validation
- Global error handler

Start with domain layer (models, errors, services), then infrastructure (mock client), 
then API layer (Fastify routes).
```

**Result:** Claude generated the full structure - domain models, CartService, mock client, pricing strategy, errors, and Fastify API.

**What I noticed:** The code looked good but quantity validation was happening AFTER merging duplicate products. That's wrong - need to check limits BEFORE merging.

---

### Follow-up 1a

```
The quantity validation in addItem needs to be fixed. Right now you're merging the quantities 
first, then checking if it exceeds max. This means the error message is confusing.

Move the validation check BEFORE the merge. When adding a duplicate product, calculate what 
the new total would be, validate that, then merge if it passes.
```

**Result:** Fixed validation logic.

---

### Follow-up 1b

```
Also the pricing calculation has floating point issues. Add proper rounding:
Math.round(value * 100) / 100

Apply this to subtotal, tax, and total in the pricing strategy.
```

**Result:** Rounding added to all calculations.

---

### Prompt 2: Add Tests

```
Write comprehensive unit tests:

tests/CartService.test.ts - test all business logic:
- Cart creation with UUID validation
- Add item with pricing calculation
- Merge quantities for duplicate products
- Quantity limits (test 0, 1, 99, 100)
- Expiration behavior on all operations
- Merge overflow (add 50, add 50 of same product should fail)

tests/PricingStrategy.test.ts - test calculations:
- Empty cart (all zeros)
- Single item
- Multiple items
- Decimal rounding

tests/SalesforceCartClientMock.test.ts - test storage:
- CRUD operations
- TTL expiration
- Background cleanup
- Singleton pattern

Use Vitest. For TTL tests, use very short TTL (0.001 minutes) and wait 100ms.
```

**Result:** All tests generated. Ran them, got 44/45 passing.

---

### Follow-up 2a

```
One test is failing: "addItem throws CartExpiredError when cart expired"

The problem is TTL=0 expires immediately, even before addItem can execute.

Change TTL to 0.001 minutes (60 milliseconds) instead. That gives enough time for the 
operation to execute, then wait 100ms before checking expiration.
```

**Result:** Test fixed, all 45 tests pass now.

---

### Prompt 3: Add Swagger & Production Features

```
Add Swagger/OpenAPI documentation and production readiness:

1. Swagger:
   - Install @fastify/swagger and @fastify/swagger-ui
   - Register before routes, serve at /docs
   - Add schemas to all routes with proper examples
   - Make API title/version/description configurable via env vars

2. Environment config:
   - Move all settings to .env (PORT, HOST, NODE_ENV)
   - Business rules: CART_TTL_MINUTES, MAX_QUANTITY, MIN_QUANTITY
   - API docs: API_TITLE, API_VERSION, API_DESCRIPTION
   - Create .env.example

3. Graceful shutdown:
   - Handle SIGTERM/SIGINT
   - Close server cleanly
```

**Result:** Swagger added but got version mismatch error: "fastify-plugin: @fastify/swagger - expected '5.x' fastify version, '4.29.1' is installed"

---

### Follow-up 3a

```
Upgrade fastify to ^5.0.0 and make sure all plugins are compatible with version 5
```

**Result:** Fixed but now getting CORS plugin version mismatch.

---

### Follow-up 3b

```
Upgrade @fastify/cors to a version compatible with fastify 5
```

**Result:** All versions aligned. Swagger UI working at http://localhost:3000/docs, graceful shutdown works.

---

### Prompt 4: Code & Documentation Cleanup

```
Clean up the code and docs:

1. In SalesforceCartClientMock.test.ts add a helper function makeCart() to reduce duplication

2. README.md:
   - Quick start, API summary with curl examples
   - Architecture overview (reference SPEC-A)
   - Testing guide (npm test, Postman, Swagger)
   - Configuration options and known limitations
   - Add Screenshots section for Swagger UI and Postman
```

**Result:** Code cleaned up, tests more natural, README complete.

---

### Follow-up 4a

```
Run type check - the error handler in src/index.ts might have issues with the error type since 
it's 'unknown'. Cast it to FastifyError explicitly so we can access error.statusCode, 
error.validation, etc.
```

**Result:** Fixed with explicit type casting. All type checks pass.


---

## Final Validation

Before submission, verified everything works:

```bash
# Type check
npm run type-check
# ✓ No TypeScript errors

# Unit tests
npm test
# ✓ 45/45 tests passing

# Build
npm run build
# ✓ Compiles to dist/

# Start server
npm start
# ✓ Listening on localhost:3000

# Quick API test
curl -X POST http://localhost:3000/v1/cart
# ✓ {"data":{"cartId":"...","items":[],...}}

# Add item
cartId="..." # from above
curl -X POST http://localhost:3000/v1/cart/$cartId/items \
  -H "Content-Type: application/json" \
  -d '{"product":{"productId":"test","name":"Test","price":10,"category":"plan"},"quantity":1}'
# ✓ Item added, pricing calculated (subtotal: 10, tax: 0.90, total: 10.90)

# Get cart
curl http://localhost:3000/v1/cart/$cartId
# ✓ Cart retrieved with item

# Swagger docs
open http://localhost:3000/docs
# ✓ All endpoints visible and testable
```

Everything works. Code is clean, tests pass, docs are complete.

---

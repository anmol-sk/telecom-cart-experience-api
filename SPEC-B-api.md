# API Spec for Claude

Base URL: `http://localhost:3000/v1`

## Response Format

Success:
```json
{
  "data": { ... },
  "timestamp": "2025-01-02T10:30:00.000Z"
}
```

Error:
```json
{
  "error": {
    "code": "CART_EXPIRED",
    "message": "Cart session has expired",
    "statusCode": 410
  },
  "timestamp": "2025-01-02T10:30:00.000Z"
}
```

## Endpoints

### POST /v1/cart
Create new cart. 5-minute TTL starts from creation time.

Request (optional):
```json
{
  "metadata": {
    "customerId": "cust-123",
    "channel": "web"
  }
}
```

Response (201):
```json
{
  "data": {
    "cartId": "550e8400-e29b-41d4-a716-446655440000",
    "items": [],
    "subtotal": 0,
    "tax": 0,
    "total": 0,
    "createdAt": "2025-01-02T10:30:00.000Z",
    "updatedAt": "2025-01-02T10:30:00.000Z",
    "expiresAt": "2025-01-02T10:35:00.000Z"
  }
}
```

Errors: 400 (bad request), 500

---

### GET /v1/cart/:cartId
Get cart by ID.

Response (200):
```json
{
  "data": {
    "cartId": "...",
    "items": [
      {
        "itemId": "item-001",
        "product": {
          "productId": "prod-001",
          "name": "5G Unlimited Plan",
          "price": 75.00,
          "category": "plan"
        },
        "quantity": 1,
        "unitPrice": 75.00,
        "totalPrice": 75.00
      }
    ],
    "subtotal": 75.00,
    "tax": 6.75,
    "total": 81.75,
    "createdAt": "...",
    "updatedAt": "...",
    "expiresAt": "..."
  }
}
```

Errors:
- 400 - invalid cart ID format (must be UUID v4)
- 404 - cart not found
- 410 - cart expired (important: use 410 not 404 so frontend knows to refresh session)

---

### POST /v1/cart/:cartId/items
Add item to cart. If product already exists, merge quantities.

Request:
```json
{
  "product": {
    "productId": "prod-iphone-15",
    "name": "iPhone 15 Pro",
    "description": "256GB",
    "price": 999.99,
    "category": "device"
  },
  "quantity": 1
}
```

Validation:
- quantity: 1-99
- productId: required, non-empty
- name: required
- price: >= 0
- category: one of [plan, device, addon, accessory]

Behavior:
- If product exists: add quantities, fail if total > 99
- Capture unitPrice at add time (price snapshot)


Response (200):
```json
{
  "data": {
    "cartId": "...",
    "items": [...],
    "subtotal": 1074.99,
    "tax": 96.75,
    "total": 1171.74
  }
}
```

Errors: 400, 404, 410

---

### DELETE /v1/cart/:cartId/items/:itemId
Remove item from cart.

Response (200): updated cart with recalculated totals

Errors: 404 (cart or item), 410 (expired)

---

### PATCH /v1/cart/:cartId/items/:itemId
Update item quantity.

Request:
```json
{
  "quantity": 2
}
```

Validation: quantity 1-99

Response (200): updated cart

Errors: 400, 404, 410

---

### DELETE /v1/cart/:cartId
Delete cart entirely.

Response: 204 No Content

Errors: 404, 410

## Cart Expiration

TTL: 5 minutes from creation (not last access).

When cart expires:
- Returns 410 Gone
- Cart deleted from storage
- Error code: CART_EXPIRED

Frontend should catch 410 and create new cart.

Why 410 vs 404?
- 404 = never existed
- 410 = existed but gone (session expired)

This helps frontend handle session refresh properly.

## Example Flow

```bash
# Create cart
curl -X POST http://localhost:3000/v1/cart

# Add item
curl -X POST http://localhost:3000/v1/cart/{cartId}/items \
  -H "Content-Type: application/json" \
  -d '{"product": {"productId":"prod-001","name":"5G Plan","price":75,"category":"plan"}, "quantity":1}'

# Update quantity
curl -X PATCH http://localhost:3000/v1/cart/{cartId}/items/{itemId} \
  -d '{"quantity": 2}'

# Get cart
curl http://localhost:3000/v1/cart/{cartId}

# Delete cart
curl -X DELETE http://localhost:3000/v1/cart/{cartId}
```

See Postman collection for more examples: `Telecom-Cart-API.postman_collection.json`

## Configuration

Env vars:
- CART_TTL_MINUTES (default: 5)
- MAX_QUANTITY (default: 99)
- MIN_QUANTITY (default: 1)

See `.env.example`

## Testing

- Swagger UI: http://localhost:3000/docs
- Postman: Import the collection
- cURL: See examples above

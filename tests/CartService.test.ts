import { describe, it, expect, beforeEach } from 'vitest';
import { CartService } from '../src/domain/services/CartService.js';
import { SalesforceCartClientMock } from '../src/infrastructure/clients/SalesforceCartClientMock.js';
import { StandardPricingStrategy } from '../src/domain/strategies/IPricingStrategy.js';
import {
  ValidationError,
  CartExpiredError,
  ResourceNotFoundError,
} from '../src/domain/errors/index.js';
import { AddItemRequest } from '../src/domain/models.js';

describe('CartService', () => {
  let cartService: CartService;
  let cartClient: SalesforceCartClientMock;

  beforeEach(() => {
    cartClient = new SalesforceCartClientMock(5, false);
    const pricingStrategy = new StandardPricingStrategy();
    cartService = new CartService(cartClient, pricingStrategy);
  });

  describe('createCart', () => {
    it('creates cart with valid UUID', async () => {
      const cart = await cartService.createCart();

      expect(cart).toBeDefined();
      expect(cart.cartId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(cart.items).toEqual([]);
      expect(cart.total).toBe(0);
    });

    it('creates cart with metadata', async () => {
      const metadata = { customerId: 'cust-123', channel: 'web' as const };
      const cart = await cartService.createCart(metadata);

      expect(cart.metadata).toEqual(metadata);
    });

    it('sets 5 min expiration', async () => {
      const cart = await cartService.createCart();
      const timeDiff = cart.expiresAt.getTime() - cart.createdAt.getTime();
      
      expect(timeDiff).toBe(5 * 60 * 1000);
    });
  });

  describe('getCart', () => {
    it('retrieves existing cart', async () => {
      const created = await cartService.createCart();
      const retrieved = await cartService.getCart(created.cartId);

      expect(retrieved.cartId).toBe(created.cartId);
    });

    it('throws 404 for non-existent cart', async () => {
      await expect(
        cartService.getCart('550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('throws error for invalid cart ID', async () => {
      await expect(cartService.getCart('invalid-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('addItem', () => {
    it('adds item to empty cart', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: '5G Unlimited Plan',
          price: 75.0,
          category: 'plan',
        },
        quantity: 1,
      };

      const updated = await cartService.addItem(cart.cartId, itemRequest);

      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].product.productId).toBe('prod-001');
      expect(updated.items[0].quantity).toBe(1);
      expect(updated.subtotal).toBe(75.0);
      expect(updated.tax).toBe(6.75); // 9% tax
      expect(updated.total).toBe(81.75);
    });

    it('merges quantities for same product', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: '5G Unlimited Plan',
          price: 75.0,
          category: 'plan',
        },
        quantity: 1,
      };

      await cartService.addItem(cart.cartId, itemRequest);
      const updated = await cartService.addItem(cart.cartId, itemRequest);

      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].quantity).toBe(2);
      expect(updated.items[0].totalPrice).toBe(150.0);
    });

    it('adds multiple different products', async () => {
      const cart = await cartService.createCart();

      const item1: AddItemRequest = {
        product: { productId: 'prod-001', name: '5G Plan', price: 75.0, category: 'plan' },
        quantity: 1,
      };

      const item2: AddItemRequest = {
        product: { productId: 'prod-002', name: 'iPhone 15', price: 999.99, category: 'device' },
        quantity: 1,
      };

      await cartService.addItem(cart.cartId, item1);
      const updated = await cartService.addItem(cart.cartId, item2);

      expect(updated.items).toHaveLength(2);
      expect(updated.subtotal).toBe(1074.99);
    });

    it('rejects quantity < 1', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: { productId: 'prod-001', name: 'Test', price: 10.0, category: 'plan' },
        quantity: 0,
      };

      await expect(cartService.addItem(cart.cartId, itemRequest)).rejects.toThrow(ValidationError);
    });

    it('rejects quantity > 99', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: { productId: 'prod-001', name: 'Test', price: 10.0, category: 'plan' },
        quantity: 100,
      };

      await expect(cartService.addItem(cart.cartId, itemRequest)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when merged quantity exceeds 99', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: 'Test Product',
          price: 10.0,
          category: 'plan',
        },
        quantity: 50,
      };

      await cartService.addItem(cart.cartId, itemRequest);

      // Try to add 50 more (total would be 100)
      await expect(
        cartService.addItem(cart.cartId, itemRequest)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid product data', async () => {
      const cart = await cartService.createCart();

      const invalidRequest: any = {
        product: {
          productId: '',
          name: 'Test',
          price: -10,
          category: 'invalid',
        },
        quantity: 1,
      };

      await expect(
        cartService.addItem(cart.cartId, invalidRequest)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('removeItem', () => {
    it('removes item from cart', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: { productId: 'prod-001', name: 'Test', price: 50.0, category: 'plan' },
        quantity: 1,
      };

      const withItem = await cartService.addItem(cart.cartId, itemRequest);
      const itemId = withItem.items[0].itemId;
      const updated = await cartService.removeItem(cart.cartId, itemId);

      expect(updated.items).toHaveLength(0);
      expect(updated.total).toBe(0);
    });

    it('throws error for non-existent item', async () => {
      const cart = await cartService.createCart();
      await expect(cartService.removeItem(cart.cartId, 'fake-item-id')).rejects.toThrow(ResourceNotFoundError);
    });

    it('should recalculate totals after removing item', async () => {
      const cart = await cartService.createCart();

      const item1: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: 'Product 1',
          price: 50.0,
          category: 'plan',
        },
        quantity: 1,
      };

      const item2: AddItemRequest = {
        product: {
          productId: 'prod-002',
          name: 'Product 2',
          price: 30.0,
          category: 'addon',
        },
        quantity: 1,
      };

      await cartService.addItem(cart.cartId, item1);
      const withBoth = await cartService.addItem(cart.cartId, item2);

      const firstItemId = withBoth.items[0].itemId;
      const updated = await cartService.removeItem(cart.cartId, firstItemId);

      expect(updated.items).toHaveLength(1);
      expect(updated.subtotal).toBe(30.0);
    });
  });

  describe('updateItemQuantity', () => {
    it('should update the quantity of an item', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: 'Test Product',
          price: 50.0,
          category: 'plan',
        },
        quantity: 1,
      };

      const withItem = await cartService.addItem(cart.cartId, itemRequest);
      const itemId = withItem.items[0].itemId;

      const updated = await cartService.updateItemQuantity(
        cart.cartId,
        itemId,
        5
      );

      expect(updated.items[0].quantity).toBe(5);
      expect(updated.items[0].totalPrice).toBe(250.0);
      expect(updated.subtotal).toBe(250.0);
    });

    it('should throw ValidationError for invalid quantity', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: 'Test Product',
          price: 50.0,
          category: 'plan',
        },
        quantity: 1,
      };

      const withItem = await cartService.addItem(cart.cartId, itemRequest);
      const itemId = withItem.items[0].itemId;

      await expect(
        cartService.updateItemQuantity(cart.cartId, itemId, 0)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ResourceNotFoundError for non-existent item', async () => {
      const cart = await cartService.createCart();

      await expect(
        cartService.updateItemQuantity(cart.cartId, 'fake-item-id', 5)
      ).rejects.toThrow(ResourceNotFoundError);
    });
  });

  describe('clearCart', () => {
    it('should remove all items but keep the cart session', async () => {
      const cart = await cartService.createCart();

      const itemRequest: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: 'Test Product',
          price: 50.0,
          category: 'plan',
        },
        quantity: 1,
      };

      await cartService.addItem(cart.cartId, itemRequest);
      const cleared = await cartService.clearCart(cart.cartId);

      expect(cleared.cartId).toBe(cart.cartId);
      expect(cleared.items).toHaveLength(0);
      expect(cleared.total).toBe(0);
    });
  });

  describe('deleteCart', () => {
    it('should delete a cart session', async () => {
      const cart = await cartService.createCart();

      await cartService.deleteCart(cart.cartId);

      await expect(cartService.getCart(cart.cartId)).rejects.toThrow(
        ResourceNotFoundError
      );
    });
  });

  describe('Cart Expiration Logic', () => {
    it('should throw CartExpiredError when accessing expired cart', async () => {
      // Create a client with 0-minute TTL for immediate expiration
      const expiredClient = new SalesforceCartClientMock(0, false);
      const expiredCartService = new CartService(
        expiredClient,
        new StandardPricingStrategy()
      );

      const cart = await expiredCartService.createCart();

      // Wait 100ms to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(expiredCartService.getCart(cart.cartId)).rejects.toThrow(
        CartExpiredError
      );
    });

    it('should throw CartExpiredError when adding item to expired cart', async () => {
      const expiredClient = new SalesforceCartClientMock(0, false);
      const expiredCartService = new CartService(
        expiredClient,
        new StandardPricingStrategy()
      );

      const cart = await expiredCartService.createCart();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const itemRequest: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: 'Test Product',
          price: 50.0,
          category: 'plan',
        },
        quantity: 1,
      };

      await expect(
        expiredCartService.addItem(cart.cartId, itemRequest)
      ).rejects.toThrow(CartExpiredError);
    });

    it('should throw CartExpiredError when updating expired cart', async () => {
      // Use 0.01 minute (~0.6 seconds) TTL to test expiration quickly
      const expiredClient = new SalesforceCartClientMock(0.01, false);
      const expiredCartService = new CartService(
        expiredClient,
        new StandardPricingStrategy()
      );

      const cart = await expiredCartService.createCart();

      const itemRequest: AddItemRequest = {
        product: {
          productId: 'prod-001',
          name: 'Test Product',
          price: 50.0,
          category: 'plan',
        },
        quantity: 1,
      };

      // Add item immediately (before expiration)
      const withItem = await expiredCartService.addItem(
        cart.cartId,
        itemRequest
      );
      const itemId = withItem.items[0].itemId;

      // Wait for expiration (700ms should be enough for 0.01 min = 600ms TTL)
      await new Promise((resolve) => setTimeout(resolve, 700));

      // Now try to update - should fail because cart expired
      await expect(
        expiredCartService.updateItemQuantity(cart.cartId, itemId, 2)
      ).rejects.toThrow(CartExpiredError);
    });

    it('should automatically remove expired cart from storage', async () => {
      const expiredClient = new SalesforceCartClientMock(0, false);
      const expiredCartService = new CartService(
        expiredClient,
        new StandardPricingStrategy()
      );

      const cart = await expiredCartService.createCart();

      expect(expiredClient.getCartCount()).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        await expiredCartService.getCart(cart.cartId);
      } catch (e) {
        // Expected to throw
      }

      // Cart should be removed from storage after expiration check
      expect(expiredClient.getCartCount()).toBe(0);
    });
  });
});


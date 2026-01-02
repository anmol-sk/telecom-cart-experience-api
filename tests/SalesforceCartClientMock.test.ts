import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SalesforceCartClientMock } from '../src/infrastructure/clients/SalesforceCartClientMock.js';
import { Cart } from '../src/domain/models.js';
import { CartExpiredError, ResourceNotFoundError } from '../src/domain/errors/index.js';

describe('SalesforceCartClientMock', () => {
  let client: SalesforceCartClientMock;

  beforeEach(() => {
    client = new SalesforceCartClientMock(5, false);
  });

  afterEach(() => {
    client.destroy();
  });

  const makeCart = (id: string): Cart => ({
    cartId: id,
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  describe('createCart', () => {
    it('stores cart in memory', async () => {
      const cart = makeCart('test-001');
      const created = await client.createCart(cart);

      expect(created.cartId).toBe('test-001');
      expect(client.getCartCount()).toBe(1);
    });
  });

  describe('getCart', () => {
    it('retrieves existing cart', async () => {
      const cart = makeCart('test-002');
      await client.createCart(cart);
      const retrieved = await client.getCart('test-002');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.cartId).toBe('test-002');
    });

    it('returns null for non-existent cart', async () => {
      const result = await client.getCart('non-existent');
      expect(result).toBeNull();
    });

    it('throws CartExpiredError for expired cart', async () => {
      const expiredClient = new SalesforceCartClientMock(0, false);
      const cart = makeCart('expired');

      await expiredClient.createCart(cart);
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(expiredClient.getCart('expired')).rejects.toThrow(CartExpiredError);
      expiredClient.destroy();
    });

    it('removes expired cart from storage', async () => {
      const expiredClient = new SalesforceCartClientMock(0, false);
      const cart = makeCart('expired-2');

      await expiredClient.createCart(cart);
      expect(expiredClient.getCartCount()).toBe(1);

      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        await expiredClient.getCart('expired-2');
      } catch (e) {
        // expected
      }

      expect(expiredClient.getCartCount()).toBe(0);
      expiredClient.destroy();
    });
  });

  describe('updateCart', () => {
    it('updates existing cart', async () => {
      const cart = makeCart('test-003');
      await client.createCart(cart);

      const updated = { ...cart, subtotal: 100, total: 109 };
      const result = await client.updateCart(updated);

      expect(result.subtotal).toBe(100);
      expect(result.total).toBe(109);
    });

    it('throws error for non-existent cart', async () => {
      const cart = makeCart('non-existent');
      await expect(client.updateCart(cart)).rejects.toThrow(ResourceNotFoundError);
    });

    it('throws CartExpiredError for expired cart', async () => {
      const expiredClient = new SalesforceCartClientMock(0, false);
      const cart = makeCart('expired-3');

      await expiredClient.createCart(cart);
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(expiredClient.updateCart(cart)).rejects.toThrow(CartExpiredError);
      expiredClient.destroy();
    });
  });

  describe('deleteCart', () => {
    it('deletes cart from storage', async () => {
      const cart = makeCart('test-004');
      await client.createCart(cart);
      expect(client.getCartCount()).toBe(1);

      await client.deleteCart('test-004');
      expect(client.getCartCount()).toBe(0);
    });

    it('handles deleting non-existent cart', async () => {
      await expect(client.deleteCart('non-existent')).resolves.not.toThrow();
    });
  });

  describe('TTL behavior', () => {
    it('respects custom TTL', async () => {
      const shortClient = new SalesforceCartClientMock(0.01, false); // ~0.6s
      const cart = makeCart('short-ttl');

      await shortClient.createCart(cart);
      const retrieved = await shortClient.getCart('short-ttl');
      expect(retrieved).not.toBeNull();

      await new Promise(resolve => setTimeout(resolve, 700));
      await expect(shortClient.getCart('short-ttl')).rejects.toThrow(CartExpiredError);
      shortClient.destroy();
    });
  });

  describe('singleton pattern', () => {
    it('returns same instance', () => {
      const i1 = SalesforceCartClientMock.getInstance();
      const i2 = SalesforceCartClientMock.getInstance();
      expect(i1).toBe(i2);
      SalesforceCartClientMock.resetInstance();
    });

    it('resets singleton', () => {
      const i1 = SalesforceCartClientMock.getInstance();
      SalesforceCartClientMock.resetInstance();
      const i2 = SalesforceCartClientMock.getInstance();
      expect(i1).not.toBe(i2);
      SalesforceCartClientMock.resetInstance();
    });
  });

  describe('utility methods', () => {
    it('tracks cart count', async () => {
      expect(client.getCartCount()).toBe(0);

      await client.createCart(makeCart('cart-1'));
      expect(client.getCartCount()).toBe(1);

      await client.createCart(makeCart('cart-2'));
      expect(client.getCartCount()).toBe(2);

      await client.deleteCart('cart-1');
      expect(client.getCartCount()).toBe(1);
    });

    it('clears all carts', async () => {
      await client.createCart(makeCart('cart-1'));
      await client.createCart(makeCart('cart-2'));
      expect(client.getCartCount()).toBe(2);

      client.clearAllCarts();
      expect(client.getCartCount()).toBe(0);
    });
  });
});


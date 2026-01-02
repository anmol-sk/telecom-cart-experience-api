import { describe, it, expect } from 'vitest';
import { StandardPricingStrategy } from '../src/domain/strategies/IPricingStrategy.js';
import { Cart, CartItem } from '../src/domain/models.js';

describe('StandardPricingStrategy', () => {
  const strategy = new StandardPricingStrategy();

  it('calculates zero for empty cart', () => {
    const cart: Cart = {
      cartId: 'test-cart',
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(),
    };

    const result = strategy.calculatePricing(cart);

    expect(result.subtotal).toBe(0);
    expect(result.tax).toBe(0);
    expect(result.total).toBe(0);
  });

  it('calculates 9% tax correctly', () => {
    const item: CartItem = {
      itemId: 'item-1',
      product: { productId: 'prod-1', name: 'Test', price: 100, category: 'plan' },
      quantity: 1,
      unitPrice: 100,
      totalPrice: 100,
      addedAt: new Date(),
    };

    const cart: Cart = {
      cartId: 'test-cart',
      items: [item],
      subtotal: 0,
      tax: 0,
      total: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(),
    };

    const result = strategy.calculatePricing(cart);

    expect(result.subtotal).toBe(100);
    expect(result.tax).toBe(9);
    expect(result.total).toBe(109);
  });

  it('handles multiple items', () => {
    const items: CartItem[] = [
      {
        itemId: 'item-1',
        product: { productId: 'prod-1', name: 'Plan', price: 75, category: 'plan' },
        quantity: 1,
        unitPrice: 75,
        totalPrice: 75,
        addedAt: new Date(),
      },
      {
        itemId: 'item-2',
        product: { productId: 'prod-2', name: 'Device', price: 999.99, category: 'device' },
        quantity: 1,
        unitPrice: 999.99,
        totalPrice: 999.99,
        addedAt: new Date(),
      },
    ];

    const cart: Cart = {
      cartId: 'test-cart',
      items,
      subtotal: 0,
      tax: 0,
      total: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(),
    };

    const result = strategy.calculatePricing(cart);

    expect(result.subtotal).toBe(1074.99);
    expect(result.tax).toBe(96.75);
    expect(result.total).toBe(1171.74);
  });

  it('rounds to 2 decimals', () => {
    const item: CartItem = {
      itemId: 'item-1',
      product: { productId: 'prod-1', name: 'Test', price: 33.33, category: 'plan' },
      quantity: 3,
      unitPrice: 33.33,
      totalPrice: 99.99,
      addedAt: new Date(),
    };

    const cart: Cart = {
      cartId: 'test-cart',
      items: [item],
      subtotal: 0,
      tax: 0,
      total: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(),
    };

    const result = strategy.calculatePricing(cart);

    expect(result.subtotal).toBe(99.99);
    expect(result.tax).toBe(9); // rounded from 8.9991
    expect(result.total).toBe(108.99);
  });

  it('updates timestamp', () => {
    const before = new Date();
    const cart: Cart = {
      cartId: 'test-cart',
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      expiresAt: new Date(),
    };

    const result = strategy.calculatePricing(cart);

    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});


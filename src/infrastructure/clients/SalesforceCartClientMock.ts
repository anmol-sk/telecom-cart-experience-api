import { Cart } from "../../domain/models.js";
import { ISalesforceCartClient } from "./ISalesforceCartClient.js";
import {
  CartExpiredError,
  ResourceNotFoundError,
} from "../../domain/errors/index.js";

// In-memory cart storage with TTL
interface CartEntry {
  cart: Cart;
  createdAt: Date;
}

// mock salesforce client with TTL + auto cleanup
export class SalesforceCartClientMock implements ISalesforceCartClient {
  private static instance: SalesforceCartClientMock | null = null;
  private carts: Map<string, CartEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly ttlMinutes: number;

  constructor(ttlMinutes: number = 5, enableAutoCleanup: boolean = true) {
    this.ttlMinutes = ttlMinutes;

    if (enableAutoCleanup) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpiredCarts();
      }, 60 * 1000);
    }
  }

  static getInstance(ttlMinutes: number = 5): SalesforceCartClientMock {
    if (!SalesforceCartClientMock.instance) {
      SalesforceCartClientMock.instance = new SalesforceCartClientMock(
        ttlMinutes
      );
    }
    return SalesforceCartClientMock.instance;
  }

  static resetInstance(): void {
    if (SalesforceCartClientMock.instance?.cleanupInterval) {
      clearInterval(SalesforceCartClientMock.instance.cleanupInterval);
    }
    SalesforceCartClientMock.instance = null;
  }

  async createCart(cart: Cart): Promise<Cart> {
    const entry: CartEntry = {
      cart: { ...cart },
      createdAt: cart.createdAt,
    };

    this.carts.set(cart.cartId, entry);
    return { ...cart };
  }

  async getCart(cartId: string): Promise<Cart | null> {
    const entry = this.carts.get(cartId);
    if (!entry) return null;

    // throw 410 Gone if expired (better than 404 for UX)
    if (this.isExpired(entry)) {
      this.carts.delete(cartId);
      throw new CartExpiredError(cartId);
    }

    return { ...entry.cart };
  }

  async updateCart(cart: Cart): Promise<Cart> {
    const entry = this.carts.get(cart.cartId);
    if (!entry) throw new ResourceNotFoundError("Cart", cart.cartId);

    // throw 410 Gone if expired (better than 404 for UX)
    if (this.isExpired(entry)) {
      this.carts.delete(cart.cartId);
      throw new CartExpiredError(cart.cartId);
    }

    entry.cart = { ...cart };
    return { ...cart };
  }

  async deleteCart(cartId: string): Promise<void> {
    this.carts.delete(cartId);
  }

  private isExpired(entry: CartEntry): boolean {
    const now = new Date();
    const expirationTime = new Date(
      entry.createdAt.getTime() + this.ttlMinutes * 60 * 1000
    );

    return now > expirationTime;
  }

  private cleanupExpiredCarts(): void {
    const expiredCartIds: string[] = [];

    // collect expired carts first to avoid modifying map during iteration
    for (const [cartId, entry] of this.carts.entries()) {
      if (this.isExpired(entry)) {
        expiredCartIds.push(cartId);
      }
    }

    for (const cartId of expiredCartIds) {
      this.carts.delete(cartId);
    }

    if (expiredCartIds.length > 0) {
      console.log(
        `[SalesforceCartClientMock] Cleaned up ${expiredCartIds.length} expired cart(s)`
      );
    }
  }

  // Utility methods for testing
  getCartCount(): number {
    return this.carts.size;
  }

  clearAllCarts(): void {
    this.carts.clear();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

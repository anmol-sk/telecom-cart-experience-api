import { v4 as uuidv4 } from 'uuid';
import { Cart, AddItemRequest, CartMetadata } from '../models.js';
import { ISalesforceCartClient } from '../../infrastructure/clients/ISalesforceCartClient.js';
import { IPricingStrategy } from '../strategies/IPricingStrategy.js';
import { ValidationError, ResourceNotFoundError } from '../errors/index.js';

// handles cart operations with dependency injection for flexibility
export class CartService {
  private ttlMinutes: number;
  private maxQty: number;
  private minQty: number;

  constructor(
    private readonly client: ISalesforceCartClient,
    private readonly pricing: IPricingStrategy,
    config?: {
      cartTtlMinutes?: number;
      maxQuantity?: number;
      minQuantity?: number;
    }
  ) {
    this.ttlMinutes = config?.cartTtlMinutes ?? 5;
    this.maxQty = config?.maxQuantity ?? 99;
    this.minQty = config?.minQuantity ?? 1;
  }

  async createCart(metadata?: CartMetadata): Promise<Cart> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMinutes * 60 * 1000);

    const cart: Cart = {
      cartId: uuidv4(),
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      metadata,
    };

    return this.client.createCart(cart);
  }

  async getCart(cartId: string): Promise<Cart> {
    this.validateCartId(cartId);
    const cart = await this.client.getCart(cartId);
    if (!cart) throw new ResourceNotFoundError('Cart', cartId);
    return cart;
  }

  // merges quantities if product already exists
  async addItem(cartId: string, request: AddItemRequest): Promise<Cart> {
    this.validateCartId(cartId);
    this.validateQuantity(request.quantity);
    this.validateProduct(request.product);

    const cart = await this.getCart(cartId);
    const existingIdx = cart.items.findIndex(
      item => item.product.productId === request.product.productId
    );

    if (existingIdx >= 0) {
      // merge with existing item
      const item = cart.items[existingIdx];
      const newQty = item.quantity + request.quantity;

      if (newQty > this.maxQty) {
        throw new ValidationError(
          `Total quantity for product '${request.product.name}' would exceed maximum of ${this.maxQty}`
        );
      }

      item.quantity = newQty;
      // round to avoid floating point issues
      item.totalPrice = Math.round(item.unitPrice * newQty * 100) / 100;
    } else {
      // add new item
      cart.items.push({
        itemId: uuidv4(),
        product: request.product,
        quantity: request.quantity,
        unitPrice: request.product.price,
        totalPrice: Math.round(request.product.price * request.quantity * 100) / 100,
        addedAt: new Date(),
      });
    }

    return this.client.updateCart(this.pricing.calculatePricing(cart));
  }

  async removeItem(cartId: string, itemId: string): Promise<Cart> {
    this.validateCartId(cartId);
    const cart = await this.getCart(cartId);
    
    const idx = cart.items.findIndex(item => item.itemId === itemId);
    if (idx === -1) throw new ResourceNotFoundError('Item', itemId);

    cart.items.splice(idx, 1);
    return this.client.updateCart(this.pricing.calculatePricing(cart));
  }

  async updateItemQuantity(cartId: string, itemId: string, quantity: number): Promise<Cart> {
    this.validateCartId(cartId);
    this.validateQuantity(quantity);

    const cart = await this.getCart(cartId);
    const item = cart.items.find(i => i.itemId === itemId);
    if (!item) throw new ResourceNotFoundError('Item', itemId);

    item.quantity = quantity;
    item.totalPrice = Math.round(item.unitPrice * quantity * 100) / 100;

    return this.client.updateCart(this.pricing.calculatePricing(cart));
  }

  async clearCart(cartId: string): Promise<Cart> {
    this.validateCartId(cartId);
    const cart = await this.getCart(cartId);
    cart.items = []; // keep session alive but empty
    return this.client.updateCart(this.pricing.calculatePricing(cart));
  }

  async deleteCart(cartId: string): Promise<void> {
    this.validateCartId(cartId);
    await this.client.deleteCart(cartId);
  }

  private validateCartId(cartId: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cartId)) {
      throw new ValidationError('Invalid cart ID format. Expected UUID v4.');
    }
  }

  private validateQuantity(quantity: number): void {
    if (!Number.isInteger(quantity)) {
      throw new ValidationError('Quantity must be an integer.');
    }
    if (quantity < this.minQty || quantity > this.maxQty) {
      throw new ValidationError(
        `Quantity must be between ${this.minQty} and ${this.maxQty}.`
      );
    }
  }

  private validateProduct(product: any): void {
    // using 'any' here since this might come from external API
    if (!product.productId || typeof product.productId !== 'string') {
      throw new ValidationError('Product ID is required.');
    }
    if (!product.name || typeof product.name !== 'string') {
      throw new ValidationError('Product name is required.');
    }
    if (typeof product.price !== 'number' || product.price < 0) {
      throw new ValidationError('Product price must be a positive number.');
    }
    const validCats = ['plan', 'device', 'addon', 'accessory'];
    if (!validCats.includes(product.category)) {
      throw new ValidationError(`Invalid product category: ${product.category}`);
    }
  }
}


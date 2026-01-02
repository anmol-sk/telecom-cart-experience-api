import { Cart } from '../../domain/models.js';

export interface ISalesforceCartClient {
  createCart(cart: Cart): Promise<Cart>;
  getCart(cartId: string): Promise<Cart | null>;
  updateCart(cart: Cart): Promise<Cart>;
  deleteCart(cartId: string): Promise<void>;
}


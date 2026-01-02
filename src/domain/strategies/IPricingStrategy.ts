import { Cart } from '../models.js';

export interface IPricingStrategy {
  calculatePricing(cart: Cart): Cart;
}

// standard pricing - sum items + 9% tax
export class StandardPricingStrategy implements IPricingStrategy {
  private TAX_RATE = 0.09;

  calculatePricing(cart: Cart): Cart {
    const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    
    // rounding to 2 decimals to avoid floating point weirdness
    const tax = Math.round(subtotal * this.TAX_RATE * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    return {
      ...cart,
      subtotal: Math.round(subtotal * 100) / 100,
      tax,
      total,
      updatedAt: new Date(),
    };
  }
}


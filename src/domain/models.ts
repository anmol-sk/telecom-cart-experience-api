export interface Product {
  productId: string;
  name: string;
  description?: string;
  price: number;
  category: 'plan' | 'device' | 'addon' | 'accessory';
}

export interface CartItem {
  itemId: string;
  product: Product;
  quantity: number;
  unitPrice: number; // price snapshot when added
  totalPrice: number;
  addedAt: Date;
}

export interface CartMetadata {
  customerId?: string;
  channel?: 'web' | 'mobile' | 'store';
  source?: string;
  [key: string]: unknown;
}

export interface Cart {
  cartId: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  metadata?: CartMetadata;
}

export interface AddItemRequest {
  product: Product;
  quantity: number;
}

export interface UpdateQuantityRequest {
  quantity: number;
}


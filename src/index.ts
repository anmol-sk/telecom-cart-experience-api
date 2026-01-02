import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { CartService } from './domain/services/CartService.js';
import { SalesforceCartClientMock } from './infrastructure/clients/SalesforceCartClientMock.js';
import { StandardPricingStrategy } from './domain/strategies/IPricingStrategy.js';
import { DomainError } from './domain/errors/index.js';
import { AddItemRequest, UpdateQuantityRequest, CartMetadata } from './domain/models.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const CART_TTL_MINUTES = parseInt(process.env.CART_TTL_MINUTES || '5', 10);
const MAX_QUANTITY = parseInt(process.env.MAX_QUANTITY || '99', 10);
const MIN_QUANTITY = parseInt(process.env.MIN_QUANTITY || '1', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_TITLE = process.env.API_TITLE || 'Telecom Cart Experience API';
const API_VERSION = process.env.API_VERSION || '1.0.0';
const API_DESCRIPTION = process.env.API_DESCRIPTION || 'A thin API layer for managing non-persistent Salesforce cart sessions';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: API_TITLE,
        description: API_DESCRIPTION,
        version: API_VERSION,
      },
      servers: [
        {
          url: process.env.API_BASE_URL || `http://${HOST}:${PORT}`,
          description: NODE_ENV === 'production' ? 'Production server' : 'Development server',
        },
      ],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'cart', description: 'Cart management operations' },
      ],
      components: {
        schemas: {
          Product: {
            type: 'object',
            required: ['productId', 'name', 'price', 'category'],
            properties: {
              productId: { type: 'string', example: '5g-unlimited' },
              name: { type: 'string', example: '5G Unlimited Plan' },
              description: { type: 'string', example: 'Unlimited 5G data plan' },
              price: { type: 'number', example: 89.99 },
              category: {
                type: 'string',
                enum: ['plan', 'device', 'addon', 'accessory'],
                example: 'plan',
              },
            },
          },
          CartItem: {
            type: 'object',
            properties: {
              itemId: { type: 'string', format: 'uuid' },
              product: { $ref: '#/components/schemas/Product' },
              quantity: { type: 'integer', minimum: 1, maximum: 99 },
              unitPrice: { type: 'number' },
              totalPrice: { type: 'number' },
              addedAt: { type: 'string', format: 'date-time' },
            },
          },
          Cart: {
            type: 'object',
            properties: {
              cartId: { type: 'string', format: 'uuid' },
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/CartItem' },
              },
              subtotal: { type: 'number' },
              tax: { type: 'number' },
              total: { type: 'number' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              expiresAt: { type: 'string', format: 'date-time' },
              metadata: { type: 'object' },
            },
          },
          Error: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  statusCode: { type: 'integer' },
                },
              },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  app.register(cors, {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  });

  // dependency injection
  const cartClient = new SalesforceCartClientMock(CART_TTL_MINUTES);
  const pricingStrategy = new StandardPricingStrategy();
  const cartService = new CartService(cartClient, pricingStrategy, {
    cartTtlMinutes: CART_TTL_MINUTES,
    maxQuantity: MAX_QUANTITY,
    minQuantity: MIN_QUANTITY,
  });

  app.get('/health', {
    schema: {
      tags: ['health'],
      description: 'Health check endpoint for load balancers and monitoring',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // === Cart Routes ===

  app.post<{
    Body: { metadata?: CartMetadata };
  }>('/v1/cart', {
    schema: {
      tags: ['cart'],
      description: 'Create a new cart session',
      body: {
        type: 'object',
        properties: {
          metadata: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
              channel: { type: 'string', enum: ['web', 'mobile', 'store'] },
              source: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { metadata } = request.body || {};
    const cart = await cartService.createCart(metadata);

    return reply.code(201).send({
      data: cart,
      timestamp: new Date().toISOString(),
    });
  });

  // Get cart
  app.get<{
    Params: { cartId: string };
  }>('/v1/cart/:cartId', {
    schema: {
      tags: ['cart'],
      description: 'Retrieve a cart by ID',
      params: {
        type: 'object',
        required: ['cartId'],
        properties: {
          cartId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { cartId } = request.params;
    const cart = await cartService.getCart(cartId);

    return reply.code(200).send({
      data: cart,
      timestamp: new Date().toISOString(),
    });
  });

  // Add item
  app.post<{
    Params: { cartId: string };
    Body: AddItemRequest;
  }>('/v1/cart/:cartId/items', {
    schema: {
      tags: ['cart'],
      description: 'Add an item to the cart (or merge quantity if product exists)',
      params: {
        type: 'object',
        required: ['cartId'],
        properties: {
          cartId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['product', 'quantity'],
        properties: {
          product: {
            type: 'object',
            required: ['productId', 'name', 'price', 'category'],
            properties: {
              productId: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              price: { type: 'number' },
              category: { type: 'string', enum: ['plan', 'device', 'addon', 'accessory'] },
            },
          },
          quantity: { type: 'integer', minimum: 1, maximum: 99 },
        },
      },
    },
  }, async (request, reply) => {
    const { cartId } = request.params;
    const itemRequest = request.body;

    const cart = await cartService.addItem(cartId, itemRequest);

    return reply.code(200).send({
      data: cart,
      timestamp: new Date().toISOString(),
    });
  });

  // Remove item
  app.delete<{
    Params: { cartId: string; itemId: string };
  }>('/v1/cart/:cartId/items/:itemId', {
    schema: {
      tags: ['cart'],
      description: 'Remove an item from the cart',
      params: {
        type: 'object',
        required: ['cartId', 'itemId'],
        properties: {
          cartId: { type: 'string', format: 'uuid' },
          itemId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { cartId, itemId } = request.params;
    const cart = await cartService.removeItem(cartId, itemId);

    return reply.code(200).send({
      data: cart,
      timestamp: new Date().toISOString(),
    });
  });

  // Update quantity
  app.patch<{
    Params: { cartId: string; itemId: string };
    Body: UpdateQuantityRequest;
  }>('/v1/cart/:cartId/items/:itemId', {
    schema: {
      tags: ['cart'],
      description: 'Update the quantity of a cart item',
      params: {
        type: 'object',
        required: ['cartId', 'itemId'],
        properties: {
          cartId: { type: 'string', format: 'uuid' },
          itemId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['quantity'],
        properties: {
          quantity: { type: 'integer', minimum: 1, maximum: 99 },
        },
      },
    },
  }, async (request, reply) => {
    const { cartId, itemId } = request.params;
    const { quantity } = request.body;

    const cart = await cartService.updateItemQuantity(cartId, itemId, quantity);

    return reply.code(200).send({
      data: cart,
      timestamp: new Date().toISOString(),
    });
  });

  // Delete cart
  app.delete<{
    Params: { cartId: string };
  }>('/v1/cart/:cartId', {
    schema: {
      tags: ['cart'],
      description: 'Delete a cart session',
      params: {
        type: 'object',
        required: ['cartId'],
        properties: {
          cartId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { cartId } = request.params;
    await cartService.deleteCart(cartId);

    return reply.code(204).send();
  });

  // ============================================================================
  // Error Handler
  // ============================================================================

  app.setErrorHandler((error, _request, reply) => {
    // Domain errors already have status codes
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Fastify validation errors
    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: (error as any).validation,
          statusCode: 400,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Log unexpected stuff
    app.log.error(error);

    // Catch-all for other errors
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        statusCode: 500,
      },
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening on http://${HOST}:${PORT}`);
    console.log(`Health check: http://${HOST}:${PORT}/health`);
    console.log(`API docs: http://${HOST}:${PORT}/docs`);

    // Handle shutdown gracefully
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`\n${signal} received, shutting down...`);
        try {
          await app.close();
          console.log('Server closed successfully');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}


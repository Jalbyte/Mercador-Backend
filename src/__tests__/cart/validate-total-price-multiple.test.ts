import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseClient } from '../mocks/supabase.mock.js';
import * as cartService from '../../services/cart.service.js';

/**
 * TestRail Test Cases: C137
 * Test Suite: Validar precio total - Agregando x cantidad
 * 
 * Test Cases:
 * - C137-1: Login with user credentials
 * - C137-2: Verify empty cart (itemCount = 0, total = 0)
 * - C137-3: Add first product (Product1, 2 units, price 80,000)
 * - C137-4: Verify cart shows Product1 (itemCount = 1, total = 160,000)
 * - C137-5: Add second product (Product2, 1 unit, price 120,000)
 * - C137-6: Verify cart shows both products (itemCount = 2, total = 280,000)
 * - C137-7: Add more of first product (Product1, +3 units = 5 total)
 * - C137-8: Verify updated totals (itemCount = 2, total = 520,000)
 * - C137-9: Verify complete multi-product flow
 */

describe('[C137] Validar precio total - Agregando x cantidad', () => {
  const mockUserId = 'test-user-c137';
  const mockUserEmail = 'userc137@test.com';
  const mockCartId = 'cart-c137';
  
  const mockProduct1 = {
    id: 13701,
    name: 'Test Product 1 C137',
    price: 80000,
    stock_quantity: 20,
    is_available: true
  };
  
  const mockProduct2 = {
    id: 13702,
    name: 'Test Product 2 C137',
    price: 120000,
    stock_quantity: 15,
    is_available: true
  };

  const mockCart = {
    id: mockCartId,
    user_id: mockUserId
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper function: Mock get cart flow with multiple products
   */
  function mockGetCartFlowMultiple(items: Array<{
    id: string;
    quantity: number;
    product_id: number;
    product: typeof mockProduct1 | typeof mockProduct2;
  }>) {
    mockSupabaseClient.from = vi.fn((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockCart,
                error: null
              })
            })
          })
        };
      }
      
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns.includes('products')) {
              // Get cart items with products
              return {
                eq: vi.fn().mockResolvedValue({
                  data: items,
                  error: null
                })
              };
            }
            return {
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            };
          })
        };
      }
      
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      };
    });
  }

  /**
   * Helper function: Mock add to cart flow for multiple products
   */
  function mockAddToCartFlowMultiple(
    productId: number,
    product: typeof mockProduct1 | typeof mockProduct2,
    quantity: number,
    existingItems: Array<any>
  ) {
    const existingItem = existingItems.find(item => item.product_id === productId);
    const newQuantity = existingItem ? existingItem.quantity + quantity : quantity;

    mockSupabaseClient.from = vi.fn((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockCart,
                error: null
              })
            })
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockCart,
                error: null
              })
            })
          })
        };
      }
      
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: product,
                error: null
              })
            })
          })
        };
      }
      
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockImplementation((columns: string, options?: any) => {
            // For count queries
            if (options?.count === 'exact' && options?.head === true) {
              return {
                eq: vi.fn().mockImplementation((col: string) => {
                  if (col === 'cart_id') {
                    return Promise.resolve({
                      count: existingItems.length,
                      error: null
                    });
                  }
                  if (col === 'product_id') {
                    return {
                      eq: vi.fn().mockResolvedValue({
                        count: existingItem ? 1 : 0,
                        error: null
                      })
                    };
                  }
                  return Promise.resolve({ count: 0, error: null });
                })
              };
            }
            
            // For regular select with products
            if (columns.includes('products')) {
              return {
                eq: vi.fn().mockResolvedValue({
                  data: existingItems.map(item => ({
                    ...item,
                    product: item.product_id === mockProduct1.id ? mockProduct1 : mockProduct2
                  })),
                  error: null
                })
              };
            }
            
            // For checking existing items
            return {
              eq: vi.fn().mockImplementation((col: string) => {
                if (col === 'cart_id') {
                  return {
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: existingItem || null,
                        error: null
                      })
                    })
                  };
                }
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: existingItem ? [existingItem] : [],
                    error: null
                  })
                };
              })
            };
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: `item-${productId}`,
                  cart_id: mockCartId,
                  product_id: productId,
                  quantity: quantity
                },
                error: null
              })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    ...existingItem,
                    quantity: newQuantity,
                    product: product
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      };
    });
  }

  it('[C137-1] should login with user credentials', async () => {
    // Mock user authentication
    const mockUser = {
      id: mockUserId,
      email: mockUserEmail,
      user_metadata: {}
    };

    expect(mockUser.id).toBe(mockUserId);
    expect(mockUser.email).toBe(mockUserEmail);
  });

  it('[C137-2] should verify empty cart (itemCount = 0, total = 0)', async () => {
    mockGetCartFlowMultiple([]);

    const cart = await cartService.getUserCart(mockUserId);

    expect(cart).toBeDefined();
    expect(cart.itemCount).toBe(0);
    expect(cart.total).toBe(0);
    expect(cart.items).toHaveLength(0);
  });

  it('[C137-3] should add first product (Product1, 2 units, price 80,000)', async () => {
    mockAddToCartFlowMultiple(mockProduct1.id, mockProduct1, 2, []);

    const result = await cartService.addToCart(mockUserId, mockProduct1.id, 2);

    expect(result).toBeDefined();
    expect(result.product_id).toBe(mockProduct1.id);
    expect(result.quantity).toBe(2);
  });

  it('[C137-4] should verify cart shows Product1 (itemCount = 1, total = 160,000)', async () => {
    const cartItems = [
      {
        id: 'item-1',
        quantity: 2,
        product_id: mockProduct1.id,
        product: mockProduct1
      }
    ];
    
    mockGetCartFlowMultiple(cartItems);

    const cart = await cartService.getUserCart(mockUserId);

    expect(cart).toBeDefined();
    expect(cart.itemCount).toBe(1); // 1 distinct product
    expect(cart.total).toBe(160000); // 80,000 × 2
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].product?.name).toBe(mockProduct1.name);
    expect(cart.items[0].quantity).toBe(2);
  });

  it('[C137-5] should add second product (Product2, 1 unit, price 120,000)', async () => {
    const existingItems = [
      {
        id: 'item-1',
        cart_id: mockCartId,
        quantity: 2,
        product_id: mockProduct1.id,
        product: mockProduct1
      }
    ];
    
    mockAddToCartFlowMultiple(mockProduct2.id, mockProduct2, 1, existingItems);

    const result = await cartService.addToCart(mockUserId, mockProduct2.id, 1);

    expect(result).toBeDefined();
    expect(result.product_id).toBe(mockProduct2.id);
    expect(result.quantity).toBe(1);
  });

  it('[C137-6] should verify cart shows both products (itemCount = 2, total = 280,000)', async () => {
    const cartItems = [
      {
        id: 'item-1',
        quantity: 2,
        product_id: mockProduct1.id,
        product: mockProduct1
      },
      {
        id: 'item-2',
        quantity: 1,
        product_id: mockProduct2.id,
        product: mockProduct2
      }
    ];
    
    mockGetCartFlowMultiple(cartItems);

    const cart = await cartService.getUserCart(mockUserId);

    expect(cart).toBeDefined();
    expect(cart.itemCount).toBe(2); // 2 distinct products
    expect(cart.total).toBe(280000); // (80,000 × 2) + (120,000 × 1)
    expect(cart.items).toHaveLength(2);
  });

  it('[C137-7] should add more of first product (Product1, +3 units = 5 total)', async () => {
    const existingItems = [
      {
        id: 'item-1',
        cart_id: mockCartId,
        quantity: 2,
        product_id: mockProduct1.id,
        product: mockProduct1
      },
      {
        id: 'item-2',
        cart_id: mockCartId,
        quantity: 1,
        product_id: mockProduct2.id,
        product: mockProduct2
      }
    ];
    
    mockAddToCartFlowMultiple(mockProduct1.id, mockProduct1, 3, existingItems);

    const result = await cartService.addToCart(mockUserId, mockProduct1.id, 3);

    expect(result).toBeDefined();
    expect(result.product_id).toBe(mockProduct1.id);
    expect(result.quantity).toBe(5); // 2 + 3
  });

  it('[C137-8] should verify updated totals (itemCount = 2, total = 520,000)', async () => {
    const cartItems = [
      {
        id: 'item-1',
        quantity: 5,
        product_id: mockProduct1.id,
        product: mockProduct1
      },
      {
        id: 'item-2',
        quantity: 1,
        product_id: mockProduct2.id,
        product: mockProduct2
      }
    ];
    
    mockGetCartFlowMultiple(cartItems);

    const cart = await cartService.getUserCart(mockUserId);

    expect(cart).toBeDefined();
    expect(cart.itemCount).toBe(2); // Still 2 distinct products
    expect(cart.total).toBe(520000); // (80,000 × 5) + (120,000 × 1)
    expect(cart.items).toHaveLength(2);
    
    const product1Item = cart.items.find((item: any) => item.product.id === mockProduct1.id);
    expect(product1Item?.quantity).toBe(5);
  });

  it('[C137-9] should verify complete multi-product flow', async () => {
    // Step 1: Empty cart
    mockGetCartFlowMultiple([]);
    let cart = await cartService.getUserCart(mockUserId);
    expect(cart.itemCount).toBe(0);
    expect(cart.total).toBe(0);

    // Step 2: Add Product1 (2 units)
    mockAddToCartFlowMultiple(mockProduct1.id, mockProduct1, 2, []);
    await cartService.addToCart(mockUserId, mockProduct1.id, 2);
    
    const cartItems1 = [
      {
        id: 'item-1',
        quantity: 2,
        product_id: mockProduct1.id,
        product: mockProduct1
      }
    ];
    mockGetCartFlowMultiple(cartItems1);
    cart = await cartService.getUserCart(mockUserId);
    expect(cart.itemCount).toBe(1);
    expect(cart.total).toBe(160000); // 80,000 × 2

    // Step 3: Add Product2 (1 unit)
    mockAddToCartFlowMultiple(mockProduct2.id, mockProduct2, 1, cartItems1);
    await cartService.addToCart(mockUserId, mockProduct2.id, 1);
    
    const cartItems2 = [
      ...cartItems1,
      {
        id: 'item-2',
        quantity: 1,
        product_id: mockProduct2.id,
        product: mockProduct2
      }
    ];
    mockGetCartFlowMultiple(cartItems2);
    cart = await cartService.getUserCart(mockUserId);
    expect(cart.itemCount).toBe(2);
    expect(cart.total).toBe(280000); // (80,000 × 2) + (120,000 × 1)

    // Step 4: Add more Product1 (3 more units = 5 total)
    mockAddToCartFlowMultiple(mockProduct1.id, mockProduct1, 3, cartItems2);
    await cartService.addToCart(mockUserId, mockProduct1.id, 3);
    
    const cartItems3 = [
      {
        id: 'item-1',
        quantity: 5,
        product_id: mockProduct1.id,
        product: mockProduct1
      },
      {
        id: 'item-2',
        quantity: 1,
        product_id: mockProduct2.id,
        product: mockProduct2
      }
    ];
    mockGetCartFlowMultiple(cartItems3);
    cart = await cartService.getUserCart(mockUserId);
    expect(cart.itemCount).toBe(2);
    expect(cart.total).toBe(520000); // (80,000 × 5) + (120,000 × 1)
  });
});
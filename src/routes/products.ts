/**
 * Rutas de gestión de productos y claves de licencia
 *
 * Este módulo define todas las rutas relacionadas con el catálogo de productos
 * y la gestión de claves de licencia en la aplicación Mercador. Incluye
 * operaciones CRUD para productos y gestión completa del ciclo de vida
 * de las claves de licencia.
 *
 * Funcionalidades implementadas:
 * - ✅ CRUD completo de productos
 * - ✅ Gestión de claves de licencia
 * - ✅ Búsqueda y filtrado de productos
 * - ✅ Paginación de resultados
 * - ✅ Validación de stock
 * - ✅ Gestión de imágenes de productos
 * - ✅ Activación y expiración de licencias
 *
 * @module routes/products
 *
 * @example
 * ```typescript
 * import productRoutes from './routes/products'
 *
 * // Registrar rutas de productos
 * app.route('/products', productRoutes)
 *
 * // Rutas disponibles:
 * // GET /products - Listar productos con filtros
 * // GET /products/:id - Obtener producto específico
 * // POST /products - Crear nuevo producto (admin)
 * // PUT /products/:id - Actualizar producto (admin)
 * // DELETE /products/:id - Eliminar producto (admin)
 * // GET /products/:id/keys - Listar claves de producto
 * // POST /products/:id/keys - Crear clave de producto
 * // PUT /products/keys/:keyId - Actualizar clave
 * // DELETE /products/keys/:keyId - Eliminar clave
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as productService from '../services/product.service.js'
import * as productKeyService from '../services/product_key.service.js'
import { logger } from '../utils/logger.js'

const productRoutes = new OpenAPIHono()

// Schemas
const LicenseType = z.object({
  id: z.string(),
  type: z.string()
})

const ProductKey = z.object({
  id: z.string(),
  product_id: z.string(),
  license_key: z.string(),
  user_id: z.string().uuid().optional(),
  status: z.string().optional(),
  expiration_date: z.string().optional(),
  activation_limit: z.number().int().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
})

const CreateProductKeyData = z.object({
  product_id: z.string(),
  license_key: z.string(),
  user_id: z.uuid().optional(),
  status: z.string().optional(),
  expiration_date: z.string().optional(),
  activation_limit: z.number().int().optional()
})

const CreateProductKeyInputData = CreateProductKeyData.omit({ product_id: true })
// Product Key Endpoints
const listProductKeysRoute = createRoute({
  method: 'get',
  path: '/:productId/keys',
  request: {
    params: z.object({ productId: z.string() })
  },
  responses: {
    200: {
      description: 'List of product keys',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean(), data: z.array(ProductKey) })
        }
      }
    },
    500: { description: 'Failed to fetch product keys' }
  }
})

productRoutes.openapi(listProductKeysRoute, async (c) => {
  try {
    const { productId } = c.req.valid('param')
    const keys = await productKeyService.listProductKeys(productId)
    return c.json({ success: true, data: keys })
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch product keys' }, 500)
  }
})

const createProductKeyRoute = createRoute({
  method: 'post',
  path: '/:productId/keys',
  request: {
    params: z.object({ productId: z.string() }),
    body: {
      content: {
        'application/json': { schema: CreateProductKeyInputData }
      },
      required: true
    }
  },
  responses: {
    201: {
      description: 'Product key created',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean(), data: ProductKey })
        }
      }
    },
    400: { description: 'Failed to create product key' }
  }
})

productRoutes.openapi(createProductKeyRoute, async (c) => {
  try {
    const { productId } = c.req.valid('param')
    const keyData = c.req.valid('json')
    const key = await productKeyService.createProductKey({ ...keyData, product_id: productId })
    return c.json({ success: true, data: key }, 201)
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create product key' }, 400)
  }
})

const deleteProductKeyRoute = createRoute({
  method: 'delete',
  path: '/:productId/keys/:keyId',
  request: {
    params: z.object({ productId: z.string(), keyId: z.string() })
  },
  responses: {
    200: {
      description: 'Product key deleted',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean(), message: z.string() })
        }
      }
    },
    500: { description: 'Failed to delete product key' }
  }
})

productRoutes.openapi(deleteProductKeyRoute, async (c) => {
  try {
    const { keyId } = c.req.valid('param')
    await productKeyService.deleteProductKey(keyId)
    return c.json({ success: true, message: 'Product key deleted successfully' })
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Failed to delete product key' }, 500)
  }
})
const Product = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number().positive(),
  category: z.string(),
  image_url: z.string().url().optional(),
  stock_quantity: z.number().int().positive(),
  license_type: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  product_keys: z.array(ProductKey).optional(),
  license_category: LicenseType.optional()
})

const CreateProductData = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().positive(),
  category: z.string().min(1),
  image_url: z.string().url().optional(),
  stock_quantity: z.number().int().positive(),
  license_type: z.string().min(1)
  // allow creating product with keys
}).extend({
  product_keys: z.array(CreateProductKeyInputData).optional()
})

const UpdateProductData = CreateProductData.partial()

const Pagination = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0)
})

const ListProductsResponse = z.object({
  success: z.boolean(),
  data: z.object({
    products: z.array(Product),
    pagination: Pagination
  })
})

const SingleProductResponse = z.object({
  success: z.boolean(),
  data: Product
})

const CreateProductResponse = z.object({
  success: z.boolean(),
  data: Product
})

const UpdateProductResponse = z.object({
  success: z.boolean(),
  data: Product
})

const DeleteProductResponse = z.object({
  success: z.boolean(),
  message: z.string()
})

// Routes
const listProductsRoute = createRoute({
  method: 'get',
  path: '/',
  request: {
    query: z.object({
      page: z.string().optional().transform(val => val ? Number(val) : 1),
      limit: z.string().optional().transform(val => val ? Number(val) : 10),
      category: z.string().optional(),
      search: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'List of products',
      content: {
        'application/json': {
          schema: ListProductsResponse
        }
      }
    },
    500: {
      description: 'Failed to fetch products'
    }
  }
})

productRoutes.openapi(listProductsRoute, async (c) => {
  try {
  const { page, limit, category, search } = c.req.valid('query')

    const result = await productService.listProducts({
      page,
      limit,
      category,
      search
    })

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    // Log full error for debugging
    // eslint-disable-next-line no-console
    logger.error({ err: error }, 'Error in GET /products:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch products'
    }, 500)
  }
})

// License Types Endpoint
const listLicenseTypesRoute = createRoute({
  method: 'get',
  path: '/license-types',
  responses: {
    200: {
      description: 'List of license types',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            data: z.array(LicenseType)
          })
        }
      }
    },
    500: {
      description: 'Failed to fetch license types'
    }
  }
})

productRoutes.openapi(listLicenseTypesRoute, async (c) => {
  try {
    const licenseTypes = await productService.listLicenseTypes()
    return c.json({ success: true, data: licenseTypes })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch license types'
    }, 500)
  }
})

const getProductRoute = createRoute({
  method: 'get',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: {
      description: 'Single product',
      content: {
        'application/json': {
          schema: SingleProductResponse
        }
      }
    },
    404: {
      description: 'Product not found'
    },
    500: {
      description: 'Failed to fetch product'
    }
  }
})

productRoutes.openapi(getProductRoute, async (c) => {
  try {
  const { id } = c.req.valid('param')

  const product = await productService.getProductWithKeys(id)

    if (!product) {
      return c.json({
        success: false,
        error: 'Product not found'
      }, 404)
    }

    return c.json({
      success: true,
      data: product
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    logger.error({ err: error }, `Error in GET /products/:id (${c.req.param('id')}):`, error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch product'
    }, 500)
  }
})

const createProductRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProductData
        }
      },
      required: true
    }
  },
  responses: {
    201: {
      description: 'Product created',
      content: {
        'application/json': {
          schema: CreateProductResponse
        }
      }
    },
    400: {
      description: 'Failed to create product'
    }
  }
})

productRoutes.openapi(createProductRoute, async (c) => {
  try {
  const productData = c.req.valid('json')

    const product = await productService.createProduct(productData)

    return c.json({
      success: true,
      data: product
    }, 201)
  } catch (error) {
    // eslint-disable-next-line no-console
    logger.error({ err: error }, 'Error in POST /products:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create product'
    }, 400)
  }
})

const updateProductRoute = createRoute({
  method: 'put',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string()
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateProductData
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'Product updated',
      content: {
        'application/json': {
          schema: UpdateProductResponse
        }
      }
    },
    400: {
      description: 'Failed to update product'
    }
  }
})

productRoutes.openapi(updateProductRoute, async (c) => {
  try {
  const { id } = c.req.valid('param')
  const updateData = c.req.valid('json')

    const product = await productService.updateProduct(id, updateData)

    return c.json({
      success: true,
      data: product
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    logger.error({ err: error }, `Error in PUT /products/${c.req.param('id')}:`, error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update product'
    }, 400)
  }
})

const deleteProductRoute = createRoute({
  method: 'delete',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: {
      description: 'Product deleted',
      content: {
        'application/json': {
          schema: DeleteProductResponse
        }
      }
    },
    500: {
      description: 'Failed to delete product'
    }
  }
})

productRoutes.openapi(deleteProductRoute, async (c) => {
  try {
  const { id } = c.req.valid('param')

    await productService.deleteProduct(id)

    return c.json({
      success: true,
      message: 'Product deleted successfully'
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    logger.error({ err: error }, `Error in DELETE /products/${c.req.param('id')}:`, error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete product'
    }, 500)
  }
})

export default productRoutes

/**
 * Servicio de gestión de productos y catálogo
 *
 * Este módulo proporciona todas las operaciones relacionadas con el catálogo
 * de productos de la aplicación Mercador, incluyendo CRUD completo, búsqueda,
 * filtrado, paginación y gestión de imágenes. Utiliza Supabase para persistir
 * los productos y un bucket de almacenamiento para las imágenes.
 *
 * Funcionalidades implementadas:
 * - ✅ CRUD completo de productos
 * - ✅ Búsqueda y filtrado por categoría/nombre
 * - ✅ Paginación de resultados
 * - ✅ Subida y gestión de imágenes
 * - ✅ Gestión de stock y inventario
 * - ✅ Creación automática de claves de producto
 * - ✅ Validación de datos de productos
 *
 * @module services/product.service
 *
 * @example
 * ```typescript
 * import {
 *   listProducts,
 *   createProduct,
 *   updateProduct,
 *   deleteProduct
 * } from './services/product.service'
 *
 * // Listar productos con filtros
 * const products = await listProducts({
 *   page: 1,
 *   limit: 20,
 *   category: 'software',
 *   search: 'antivirus'
 * })
 *
 * // Crear nuevo producto
 * const newProduct = await createProduct({
 *   name: 'Antivirus Pro',
 *   description: 'Protección completa',
 *   price: 49.99,
 *   category: 'security',
 *   stock_quantity: 100,
 *   image_file: imageBuffer
 * })
 *
 * // Actualizar producto
 * await updateProduct(productId, { price: 59.99 })
 * ```
 */

import { supabase, supabaseAdmin } from '../config/supabase.js'
import { SUPABASE_URL, BUCKET_ACCESS_ID, BUCKET_ACCESS_KEY } from '../config/env.js'
import { createProductKey, CreateProductKeyData } from './product_key.service.js'

export interface Product {
  id: string
  name: string
  description: string
  price: number
  category: string
  image_url?: string
  stock_quantity: number
  license_type?: string
  created_at: string
  updated_at: string
  license_category?: {
    id: string
    type: string
  }
}

export interface CreateProductData {
  name: string
  description: string
  price: number
  category: string
  image_url?: string
  // Nuevo: archivo de imagen (File | Buffer) cuando se usa form-data
  image_file?: File | Buffer
  stock_quantity: number
  license_type: string
  product_keys?: Omit<CreateProductKeyData, 'product_id'>[] // Opcional: claves a crear junto con el producto
}

export interface ProductFilters {
  page?: number
  limit?: number
  category?: string
  search?: string
}

export async function listProducts(filters: ProductFilters = {}) {
  const { page = 1, limit = 10, category, search } = filters

  // Use admin client to bypass RLS for license_category
  const db = supabaseAdmin ?? supabase
  let query = db
    .from('products')
    .select('*, license_category(id, type)', { count: 'exact' })

  // Apply filters
  if (category) {
    query = query.eq('category', category)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data: products, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`)
  }

  return {
    products: products || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  // Use admin client to bypass RLS for license_category
  const db = supabaseAdmin ?? supabase
  const { data: product, error } = await db
    .from('products')
    .select('*, license_category(id, type)')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Product not found
    }
    throw new Error(`Failed to fetch product: ${error.message}`)
  }

  return product
}

// New helper to get product with keys attached
export async function getProductWithKeys(id: string) {
  const product = await getProductById(id)
  if (!product) return null

  // fetch keys for product
  const { data: keys, error } = await (supabaseAdmin ?? supabase)
    .from('product_keys')
    .select('*')
    .eq('product_id', id)

  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch product keys for product', id, error)
    // still return product without keys on error
    return { ...product, product_keys: [] }
  }

  return { ...product, product_keys: keys || [] }
}


export async function createProduct(productData: CreateProductData): Promise<Product> {
  // Validar que el license_type existe
  const db = supabaseAdmin ?? supabase
  const { data: licenseType, error: licenseError } = await db
    .from('license_category')
    .select('id')
    .eq('id', productData.license_type)
    .single()

  if (licenseError || !licenseType) {
    throw new Error(`Invalid license_type: ${productData.license_type}`)
  }

  // Extraer product_keys si vienen
  const { product_keys, ...productFields } = productData as any;
  // Si frontend envía una imagen como data URL (data:<mime>;base64,...), la guardamos y la subimos
  const maybeImageDataUrl = typeof productFields.image_url === 'string' && productFields.image_url.startsWith('data:')
    ? productFields.image_url
    : null
  if (maybeImageDataUrl) {
    // no incluir image_url en el insert inicial; la subiremos después y haremos un update
    delete productFields.image_url
  }
  // Envolver la llamada a Supabase para capturar errores de fetch u otros problemas de red
  let product: any = null
  try {
    const resp = await db
      .from('products')
      .insert({
        ...productFields,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    // supabase-js puede devolver { data, error }
    // Normalizar
    if ('error' in resp && resp.error) {
      throw resp.error
    }
    product = (resp as any).data ?? null
  } catch (err: unknown) {
    // Log de diagnóstico (no imprimir claves)
    // eslint-disable-next-line no-console
    // Mejorar representación del error
    let details: string
    try {
      if (err instanceof Error) {
        details = err.message || String(err)
      } else if (typeof err === 'object' && err !== null) {
        details = JSON.stringify(err, Object.getOwnPropertyNames(err))
      } else {
        details = String(err)
      }
    } catch (stringifyErr) {
      details = String(err)
    }

    console.error('Failed to create product - supabase request error', {
      details,
      SUPABASE_URL: SUPABASE_URL,
      hasFetch: typeof globalThis.fetch !== 'undefined'
    })

    throw new Error(`Failed to create product: ${details}`)
  }

  // Si hay product_keys, crearlas asociadas al producto
  if (Array.isArray(product_keys) && product_keys.length > 0) {
    for (const keyData of product_keys) {
      await createProductKey({ ...keyData, product_id: product.id });
    }
  }
  // Si recibimos una data URL, subirla ahora que tenemos el product.id y actualizar la fila
  if (maybeImageDataUrl) {
    const primary = supabaseAdmin ?? supabase
    try {
      const m = maybeImageDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
      if (m) {
        const mime = m[1]
        const b64 = m[2]
        const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png'
        const buffer = Buffer.from(b64, 'base64')
        const fileName = `products/${product.id}/${Date.now()}.${ext}`

        const { data: uploadData, error: uploadError } = await primary.storage
          .from('images')
          .upload(fileName, buffer, { cacheControl: '3600', upsert: false })

        if (uploadError) throw uploadError

        const publicUrlResult: any = primary.storage.from('images').getPublicUrl(fileName)
        const publicUrl = (publicUrlResult && publicUrlResult.data && (publicUrlResult.data.publicUrl || publicUrlResult.data.public_url)) || publicUrlResult?.publicURL || publicUrlResult?.publicUrl

        await primary.from('products').update({ image_url: publicUrl }).eq('id', product.id)
        // keep local product object consistent
        try { product.image_url = publicUrl } catch (e) { /* ignore */ }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to upload image to storage (createProduct)', err)
      throw new Error(`Failed to upload image: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // Return product with keys attached to keep response consistent
  const productWithKeys = await getProductWithKeys(product.id)
  return productWithKeys ?? product
}

export async function updateProduct(id: string, updateData: Partial<CreateProductData>): Promise<Product> {
  const primary = supabaseAdmin ?? supabase
  const fallback = supabaseAdmin ? supabase : supabaseAdmin


  // Handle image upload if present in updateData
  const maybeFile = (updateData as any)?.image_file
  const maybeDataUrl = typeof (updateData as any)?.image_url === 'string' && (updateData as any).image_url.startsWith('data:')
    ? (updateData as any).image_url
    : null


  // Si frontend envía image as data URL, convertir y subirlo
  if (maybeDataUrl) {
    console.log('📤 Processing data URL upload...')
    try {
      const m = maybeDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
      if (m) {
        const mime = m[1]
        const b64 = m[2]
        const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png'
        const buffer = Buffer.from(b64, 'base64')
        const fileName = `products/${id}/${Date.now()}.${ext}`

        const { data: uploadData, error: uploadError } = await primary.storage
          .from('images')
          .upload(fileName, buffer, { cacheControl: '3600', upsert: false })

        if (uploadError) {
          console.error('❌ Upload error:', uploadError)
          throw uploadError
        }

        const publicUrlResult: any = primary.storage.from('images').getPublicUrl(fileName)
        const publicUrl = (publicUrlResult && publicUrlResult.data && (publicUrlResult.data.publicUrl || publicUrlResult.data.public_url)) || publicUrlResult?.publicURL || publicUrlResult?.publicUrl


        if (!publicUrl) {
          throw new Error('Failed to generate public URL for uploaded image')
        }

        ; (updateData as any).image_url = publicUrl
      } else {
        console.error('❌ Failed to parse data URL')
        throw new Error('Invalid data URL format')
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      throw new Error(`Failed to upload image: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (maybeFile) {
    try {
      // Generar key/filename único
      const timestamp = Date.now()
      const extension = typeof (maybeFile as any).name === 'string'
        ? ((maybeFile as any).name.split('.').pop() || 'png')
        : 'png'
      const fileName = `products/${id}/${timestamp}.${extension}`

      // Supabase storage espera un Blob/Buffer/File
      const fileBody = maybeFile instanceof Buffer ? maybeFile : (maybeFile as File)

      // Subir usando el cliente supabase (requiere que supabase client esté configurado con keys)
      const { data: uploadData, error: uploadError } = await primary.storage
        .from('images')
        .upload(fileName, fileBody, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        console.error('❌ File upload error:', uploadError)
        throw uploadError
      }


      // Obtener URL pública del archivo subido
      // Manejar distintos shapes de retorno entre versiones del SDK
      const publicUrlResult: any = primary.storage.from('images').getPublicUrl(fileName)
      const publicUrl = (publicUrlResult && publicUrlResult.data && (publicUrlResult.data.publicUrl || publicUrlResult.data.public_url)) || publicUrlResult?.publicURL || publicUrlResult?.publicUrl

      console.log('🌐 Generated public URL for file:', publicUrl)

      if (!publicUrl) {
        throw new Error('Failed to generate public URL for uploaded file')
      }

      ; (updateData as any).image_url = publicUrl
      console.log('✅ Updated image_url in updateData (file):', publicUrl)

      // Eliminar campo image_file para que no se intente guardar en la tabla
      delete (updateData as any).image_file
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('❌ Failed to upload file to storage', err)
      throw new Error(`Failed to upload image: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Clean up updateData before database update
  delete (updateData as any).image_file

  console.log('💾 Final updateData before database update:', JSON.stringify(updateData, null, 2))

  async function runUpdate(dbClient: any) {
    console.log('🔄 Running database update for product:', id)
    const updatePayload = {
      ...updateData,
      updated_at: new Date().toISOString()
    }
    console.log('📝 Update payload:', JSON.stringify(updatePayload, null, 2))

    return dbClient
      .from('products')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()
  }

  try {
    const { data: product, error } = await runUpdate(primary)
    if (error) {
      throw error
    }
    return product
  } catch (err: unknown) {
    // If it's a network/fetch error, try fallback client (if present)
    const isFetchError = err instanceof Error && /fetch failed/i.test(err.message)
    if (isFetchError && fallback) {
      try {
        const { data: product, error } = await runUpdate(fallback)
        if (error) throw error
        return product
      } catch (err2: unknown) {
        // fall through to detailed error below
        err = err2
      }
    }

    // Build a helpful error message
    let details = ''
    try {
      if (err instanceof Error) details = err.message || String(err)
      else details = JSON.stringify(err)
    } catch (e) {
      details = String(err)
    }

    // eslint-disable-next-line no-console
    console.error('Failed to update product', { id, details, SUPABASE_URL })
    throw new Error(`Failed to update product: ${details}`)
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const db = supabaseAdmin ?? supabase
  const { error } = await db
    .from('products')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`)
  }
}

export async function getProductsByCategory(category: string): Promise<Product[]> {
  // Use admin client to bypass RLS for license_category
  const db = supabaseAdmin ?? supabase
  const { data: products, error } = await db
    .from('products')
    .select('*, license_category(id, type)')
    .eq('category', category)

  if (error) {
    throw new Error(`Failed to fetch products by category: ${error.message}`)
  }

  return products || []
}

export interface LicenseType {
  id: string
  type: string
}

export async function listLicenseTypes(): Promise<LicenseType[]> {
  // Use admin client to bypass RLS for license_category
  const db = supabaseAdmin ?? supabase
  const { data: licenseTypes, error } = await db
    .from('license_category')
    .select('*')

  if (error) {
    throw new Error(`Failed to fetch license types: ${error.message}`)
  }

  return licenseTypes || []
}

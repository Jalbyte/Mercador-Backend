/**
 * Servicio para gestionar devoluciones (returns)
 * @module services/return.service
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
    AvailableKeyForReturn,
    CreateReturnDTO,
    PaginatedReturns,
    ProcessReturnDTO,
    ReturnEligibility,
    ReturnFilters,
    ReturnsSummary,
    ReturnStatus,
    ReturnWithDetails,
    StoreCreditBalance,
    StoreCreditStatus,
    UpdateReturnDTO
} from '../types/return.types.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Crea un cliente Supabase autenticado con el accessToken del usuario
 */
const createSupabaseClient = (accessToken: string) => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            headers: { Authorization: `Bearer ${accessToken}` }
        },
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    });
    logger.debug({ client }, 'createSupabaseClient')

    return client;
};

/**
 * Servicio de devoluciones
 */
export class ReturnService {
    /**
     * Crea una nueva solicitud de devolución
     */
    async createReturn(userId: string, data: CreateReturnDTO, accessToken?: string): Promise<ReturnWithDetails> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

            // 1. Validar que la orden pertenece al usuario (RLS ya filtra por user_id)
            const { data: order, error: orderError } = await client
                .from('orders')
                .select('id, user_id, total_amount, status')
                .eq('id', data.order_id)
                .eq('user_id', userId)
                .single();

            if (orderError || !order) {
                throw new NotFoundError('Orden no encontrada');
            }

            // 2. Validar que la orden esté en un estado válido para devolución
            if (!['confirmed', 'delivered'].includes(order.status)) {
                throw new ValidationError('La orden debe estar confirmada o entregada para solicitar devolución');
            }

            // 3. Obtener información de las claves a devolver
            const { data: productKeys, error: keysError } = await client
                .from('product_keys')
                .select(`
                    id,
                    product_id,
                    user_id,
                    status,
                    order_item_id,
                    products (
                        id,
                        name,
                        price
                    )
                `)
                .in('id', data.product_key_ids);

            if (keysError || !productKeys || productKeys.length === 0) {
                throw new ValidationError('No se encontraron las claves especificadas');
            }

            // 4. Validar que todas las claves pertenecen al usuario
            const invalidKeys = productKeys.filter(key => key.user_id !== userId);
            if (invalidKeys.length > 0) {
                throw new ForbiddenError('Una o más claves no pertenecen al usuario autenticado');
            }

            // 5. Validar que las claves están en estado válido para devolución
            const invalidStatusKeys = productKeys.filter(
                key => !['active', 'assigned'].includes(key.status)
            );
            if (invalidStatusKeys.length > 0) {
                throw new ValidationError(`Una o más claves no pueden devolverse (estado inválido)`);
            }

            // 6. Calcular el monto total del reembolso
            let refundAmount = 0;
            for (const key of productKeys) {
                const product = Array.isArray(key.products) ? key.products[0] : key.products;
                refundAmount += Number(product?.price || 0);
            }

            // 7. Crear la devolución
            const { data: returnData, error: returnError } = await client
                .from('returns')
                .insert({
                    order_id: data.order_id,
                    user_id: userId,
                    status: ReturnStatus.PENDING,
                    reason: data.reason,
                    refund_amount: refundAmount,
                })
                .select()
                .single();

            if (returnError) {
                logger.error({ error: returnError }, 'Error creating return');
                throw new Error('Error al crear la devolución');
            }

            // 8. Crear los items de la devolución (uno por cada clave)
            const returnItems = productKeys.map(key => {
                const product = Array.isArray(key.products) ? key.products[0] : key.products;
                return {
                    return_id: returnData.id,
                    product_key_id: key.id,
                    product_id: key.product_id,
                    price: Number(product?.price || 0),
                    reason: data.notes,
                };
            });

            const { error: itemsError } = await client
                .from('return_items')
                .insert(returnItems);

            if (itemsError) {
                // Rollback: eliminar la devolución creada
                await client.from('returns').delete().eq('id', returnData.id);
                logger.error({ error: itemsError }, 'Error creating return items');
                throw new Error('Error al crear los items de la devolución');
            }

            // 7. Retornar la devolución con detalles
            return await this.getReturnById(returnData.id, accessToken);
        } catch (error) {
            logger.error({ error }, 'Error in createReturn');
            throw error;
        }
    }

    /**
     * Obtiene una devolución por ID
     * RLS se encarga de filtrar según el rol del usuario
     */
    async getReturnById(returnId: number, accessToken?: string): Promise<ReturnWithDetails> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

            const { data: returnData, error } = await client
                .from('returns')
                .select(`
          *,
          order:orders(id, total_amount, created_at),
          user:profiles!returns_user_id_fkey(id, full_name, email),
          processor:profiles!returns_processed_by_fkey(id, full_name)
        `)
                .eq('id', returnId)
                .single();

            if (error || !returnData) {
                throw new NotFoundError('Devolución no encontrada');
            }

            // Obtener los items con información del producto
            const { data: items } = await client
                .from('return_items')
                .select(`
          *,
          product:products(id, name, image_url)
        `)
                .eq('return_id', returnId);

            return {
                ...returnData,
                items: items || [],
            } as ReturnWithDetails;
        } catch (error) {
            logger.error({ error }, 'Error in getReturnById');
            throw error;
        }
    }

    /**
     * Lista las devoluciones con filtros y paginación
     * RLS filtra automáticamente según el rol del usuario
     */
    async listReturns(filters: ReturnFilters, accessToken?: string): Promise<PaginatedReturns> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
            const page = filters.page || 1;
            const limit = filters.limit || 10;
            const offset = (page - 1) * limit;

            let query = client
                .from('returns')
                .select(`
          *,
          order:orders(id, total_amount, created_at),
          user:profiles!returns_user_id_fkey(id, full_name, email),
          processor:profiles!returns_processed_by_fkey(id, full_name)
        `, { count: 'exact' });

            // Aplicar filtros
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.user_id) {
                query = query.eq('user_id', filters.user_id);
            }
            if (filters.order_id) {
                query = query.eq('order_id', filters.order_id);
            }
            if (filters.start_date) {
                query = query.gte('created_at', filters.start_date.toISOString());
            }
            if (filters.end_date) {
                query = query.lte('created_at', filters.end_date.toISOString());
            }

            // Ordenar por fecha de creación descendente
            query = query.order('created_at', { ascending: false });

            // Aplicar paginación
            query = query.range(offset, offset + limit - 1);

            const { data: returns, error, count } = await query;

            if (error) {
                logger.error({ error }, 'Error listing returns');
                throw new Error('Error al obtener las devoluciones');
            }

            // Obtener items para cada devolución
            const returnsWithItems = await Promise.all(
                (returns || []).map(async (returnData) => {
                    const { data: items } = await client
                        .from('return_items')
                        .select(`
              *,
              product:products(id, name, image_url)
            `)
                        .eq('return_id', returnData.id);

                    return {
                        ...returnData,
                        items: items || [],
                    } as ReturnWithDetails;
                })
            );

            return {
                data: returnsWithItems,
                pagination: {
                    page,
                    limit,
                    total: count || 0,
                    total_pages: Math.ceil((count || 0) / limit),
                },
            };
        } catch (error) {
            logger.error({ error }, 'Error in listReturns');
            throw error;
        }
    }

    /**
     * Procesa una devolución (aprobar o rechazar) - Solo Admin
     * RLS verifica que el usuario sea admin
     */
    async processReturn(
        returnId: number,
        data: ProcessReturnDTO,
        adminId: string,
        accessToken?: string
    ): Promise<ReturnWithDetails> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

            // 1. Obtener la devolución
            const { data: returnData, error: fetchError } = await client
                .from('returns')
                .select('*')
                .eq('id', returnId)
                .single();

            if (fetchError || !returnData) {
                throw new NotFoundError('Devolución no encontrada');
            }

            // 2. Validar que esté en estado pending
            if (returnData.status !== ReturnStatus.PENDING) {
                throw new ValidationError('Solo se pueden procesar devoluciones en estado pending');
            }

            // 3. Validar método de reembolso si se aprueba
            if (data.status === ReturnStatus.APPROVED && !data.refund_method) {
                throw new ValidationError('Debe especificar un método de reembolso');
            }

            // 4. Actualizar la devolución
            const updateData: any = {
                status: data.status,
                admin_notes: data.admin_notes,
                processed_by: adminId,
                processed_at: new Date().toISOString(),
            };

            if (data.status === ReturnStatus.APPROVED) {
                updateData.refund_method = data.refund_method;
                // Si se aprueba, cambiar status a refunded directamente
                updateData.status = ReturnStatus.REFUNDED;
            }

            const { error: updateError } = await client
                .from('returns')
                .update(updateData)
                .eq('id', returnId);

            if (updateError) {
                logger.error({ error: updateError }, 'Error processing return');
                throw new Error('Error al procesar la devolución');
            }

            // 5. Si se rechaza, no hay más acciones
            // Si se aprueba, los triggers de la BD se encargarán de:
            //   - Restaurar el stock (restore_product_stock_on_refund)
            //   - Crear crédito de tienda si aplica (create_store_credit_on_refund)
            //   - Registrar el cambio de estado (log_return_status_change)

            // 6. Retornar la devolución actualizada
            return await this.getReturnById(returnId, accessToken);
        } catch (error) {
            logger.error({ error }, 'Error in processReturn');
            throw error;
        }
    }

    /**
     * Actualiza una devolución - Solo Admin
     * RLS verifica que el usuario sea admin
     */
    async updateReturn(
        returnId: number,
        data: UpdateReturnDTO,
        adminId: string,
        accessToken?: string
    ): Promise<ReturnWithDetails> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
            const updateData: any = { ...data };

            if (Object.keys(updateData).length === 0) {
                throw new ValidationError('No hay datos para actualizar');
            }

            const { error } = await client
                .from('returns')
                .update(updateData)
                .eq('id', returnId);

            if (error) {
                logger.error({ error }, 'Error updating return');
                throw new Error('Error al actualizar la devolución');
            }

            return await this.getReturnById(returnId, accessToken);
        } catch (error) {
            logger.error({ error }, 'Error in updateReturn');
            throw error;
        }
    }

    /**
     * Cancela una devolución - Usuario
     * RLS verifica que la devolución pertenezca al usuario
     */
    async cancelReturn(returnId: number, userId: string, accessToken?: string): Promise<ReturnWithDetails> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

            // 1. Obtener la devolución
            const { data: returnData, error: fetchError } = await client
                .from('returns')
                .select('*')
                .eq('id', returnId)
                .eq('user_id', userId)
                .single();

            if (fetchError || !returnData) {
                throw new NotFoundError('Devolución no encontrada');
            }

            // 2. Solo se puede cancelar si está en pending
            if (returnData.status !== ReturnStatus.PENDING) {
                throw new ValidationError('Solo se pueden cancelar devoluciones en estado pending');
            }

            // 3. Actualizar estado
            const { error: updateError } = await client
                .from('returns')
                .update({ status: ReturnStatus.CANCELLED })
                .eq('id', returnId);

            if (updateError) {
                logger.error({ error: updateError }, 'Error cancelling return');
                throw new Error('Error al cancelar la devolución');
            }

            return await this.getReturnById(returnId, accessToken);
        } catch (error) {
            logger.error({ error }, 'Error in cancelReturn');
            throw error;
        }
    }

    /**
     * Verifica la elegibilidad de una orden para devolución
     * Retorna las claves disponibles para devolver
     */
    async checkReturnEligibility(orderId: number, accessToken?: string): Promise<ReturnEligibility> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

            // 1. Obtener la orden
            const { data: order, error: orderError } = await client
                .from('orders')
                .select('id, user_id, created_at, status')
                .eq('id', orderId)
                .single();

            if (orderError || !order) {
                return {
                    eligible: false,
                    order_id: orderId,
                    order_date: new Date(),
                    days_since_purchase: 0,
                    return_window_days: 30,
                    available_keys: [],
                    reason: 'Orden no encontrada',
                };
            }

            // 2. Validar que la orden esté confirmada o entregada
            if (!['confirmed', 'delivered'].includes(order.status)) {
                return {
                    eligible: false,
                    order_id: orderId,
                    order_date: new Date(order.created_at),
                    days_since_purchase: 0,
                    return_window_days: 30,
                    available_keys: [],
                    reason: 'La orden debe estar confirmada o entregada',
                };
            }

            // 3. Calcular días desde la compra
            const orderDate = new Date(order.created_at);
            const now = new Date();
            const daysSince = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
            const returnWindowDays = 30; // Configurable

            // 4. Validar ventana de devolución
            if (daysSince > returnWindowDays) {
                return {
                    eligible: false,
                    order_id: orderId,
                    order_date: orderDate,
                    days_since_purchase: daysSince,
                    return_window_days: returnWindowDays,
                    available_keys: [],
                    reason: `Fuera de la ventana de devolución (${returnWindowDays} días)`,
                };
            }

            // 5. Obtener todas las claves de la orden que aún no se han devuelto
            const { data: productKeys, error: keysError } = await client
                .from('product_keys')
                .select(`
                    id,
                    product_id,
                    license_key,
                    status,
                    products (
                        id,
                        name,
                        price
                    )
                `)
                .eq('user_id', order.user_id)
                .in('status', ['active', 'assigned']);

            if (keysError) {
                logger.error({ error: keysError }, 'Error fetching product keys');
                return {
                    eligible: false,
                    order_id: orderId,
                    order_date: orderDate,
                    days_since_purchase: daysSince,
                    return_window_days: returnWindowDays,
                    available_keys: [],
                    reason: 'Error al obtener claves disponibles',
                };
            }

            // 6. Filtrar claves que ya fueron devueltas
            const { data: returnedKeys } = await client
                .from('return_items')
                .select('product_key_id');

            const returnedKeyIds = new Set((returnedKeys || []).map(ri => ri.product_key_id));

            const availableKeys: AvailableKeyForReturn[] = (productKeys || [])
                .filter(key => !returnedKeyIds.has(key.id))
                .map(key => {
                    const product = Array.isArray(key.products) ? key.products[0] : key.products;
                    // Mostrar primeros 4 caracteres de la clave y enmascarar el resto
                    // Ejemplos:
                    // - 'ABCD-EFGH-IJKL' -> 'ABCD-****-****' (si tiene separadores)
                    // - 'ABCDEFGHIJKL' -> 'ABCD-****-****'
                    // Si la clave es muy corta, mostrar lo disponible y enmascarar el resto
                    const raw = String(key.license_key || '');
                    const firstPart = raw.slice(0, 2);
                    const hasMore = raw.length > 2;
                    const masked = hasMore ? '****' : '';
                    // Construir un preview legible; si la clave tiene guiones, sólo mostrar la primera porción
                    const preview = firstPart + (masked ? `${masked}` : '');

                    return {
                        id: key.id,
                        product_id: key.product_id,
                        product_name: product?.name || 'Unknown Product',
                        license_key_preview: preview,
                        price: Number(product?.price || 0),
                        eligible: true,
                    };
                });

            return {
                eligible: availableKeys.length > 0,
                order_id: orderId,
                order_date: orderDate,
                days_since_purchase: daysSince,
                return_window_days: returnWindowDays,
                available_keys: availableKeys,
                reason: availableKeys.length === 0 ? 'No hay claves disponibles para devolver' : undefined,
            };
        } catch (error) {
            logger.error({ error }, 'Error checking return eligibility');
            throw error;
        }
    }

    /**
     * Obtiene el resumen de devoluciones - Admin
     * RLS verifica que el usuario sea admin
     */
    async getReturnsSummary(accessToken?: string): Promise<ReturnsSummary> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
            const { data: returns, error } = await client
                .from('returns')
                .select('status, refund_amount');

            if (error) {
                logger.error({ error }, 'Error getting returns summary');
                throw new Error('Error al obtener el resumen de devoluciones');
            }

            const summary: ReturnsSummary = {
                total_returns: returns?.length || 0,
                pending_returns: 0,
                approved_returns: 0,
                rejected_returns: 0,
                refunded_returns: 0,
                total_refund_amount: 0,
            };

            returns?.forEach(r => {
                switch (r.status) {
                    case ReturnStatus.PENDING:
                        summary.pending_returns++;
                        break;
                    case ReturnStatus.APPROVED:
                        summary.approved_returns++;
                        break;
                    case ReturnStatus.REJECTED:
                        summary.rejected_returns++;
                        break;
                    case ReturnStatus.REFUNDED:
                        summary.refunded_returns++;
                        summary.total_refund_amount += parseFloat(r.refund_amount);
                        break;
                }
            });

            return summary;
        } catch (error) {
            logger.error({ error }, 'Error in getReturnsSummary');
            throw error;
        }
    }

    /**
     * Obtiene el balance de créditos de tienda de un usuario
     * RLS verifica que el usuario solo pueda ver sus propios créditos
     */
    async getUserStoreCreditBalance(userId: string, accessToken?: string): Promise<StoreCreditBalance> {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
            const { data: credits, error } = await client
                .from('store_credits')
                .select('*')
                .eq('user_id', userId)
                .eq('status', StoreCreditStatus.ACTIVE)
                .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                .order('created_at', { ascending: true });

            if (error) {
                logger.error({ error }, 'Error getting store credit balance');
                throw new Error('Error al obtener el balance de créditos');
            }

            const totalBalance = credits?.reduce((sum, c) => sum + parseFloat(c.balance.toString()), 0) || 0;

            return {
                user_id: userId,
                total_balance: totalBalance,
                active_credits: credits || [],
            };
        } catch (error) {
            logger.error({ error }, 'Error in getUserStoreCreditBalance');
            throw error;
        }
    }

    /**
     * Obtiene el historial de cambios de estado de una devolución
     * RLS verifica que el usuario tenga acceso a la devolución
     */
    async getReturnHistory(returnId: number, accessToken?: string) {
        try {
            const client = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

            const { data: history, error } = await client
                .from('return_status_history')
                .select(`
          *,
          changed_by_user:profiles(id, full_name, email)
        `)
                .eq('return_id', returnId)
                .order('created_at', { ascending: false });

            if (error) {
                logger.error({ error }, 'Error getting return history');
                throw new Error('Error al obtener el historial');
            }

            return history || [];
        } catch (error) {
            logger.error({ error }, 'Error in getReturnHistory');
            throw error;
        }
    }
}

export const returnService = new ReturnService();

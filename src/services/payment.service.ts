/**
 * Servicio de integración con Mercado Pago
 * Maneja la creación de preferencias de pago y verificación de estados
 */

import mercadopago from 'mercadopago';
import { supabase } from '../config/supabase.js';
import { FRONTEND_URL, API_URL, NODE_ENV } from '../config/env.js';
import type { Product } from './product.service.js';
import type { CreatePaymentRequest, PaymentStatus } from '../types/payment.types.js';

// Determinar si estamos en modo sandbox (desarrollo/testing)
export const IS_SANDBOX = NODE_ENV !== 'production';

// Configurar cliente de Mercado Pago con el token correcto según el entorno
const accessToken = IS_SANDBOX 
  ? process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN 
  : process.env.MERCADO_PAGO_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ MERCADO_PAGO_ACCESS_TOKEN not configured');
}

console.log('🔧 Mercado Pago Configuration:', {
  mode: IS_SANDBOX ? '🧪 SANDBOX (Test Mode)' : '🚀 PRODUCTION',
  tokenConfigured: !!accessToken,
  tokenPrefix: accessToken?.substring(0, 10) + '...',
  environment: NODE_ENV,
});

const client = new mercadopago.MercadoPagoConfig({
  accessToken: accessToken || '',
});

// Instanciar APIs necesarias
const preferenceApi = new mercadopago.Preference(client);
const paymentApi = new mercadopago.Payment(client);

/**
 * Crea una preferencia de pago en Mercado Pago
 */
export async function createPaymentPreference(
  products: Product[],
  payerInfo: CreatePaymentRequest['payer'],
  orderId: string
) {
  const items = products.map((product) => ({
    id: product.id,
    title: product.name,
    quantity: 1,
    unit_price: Math.round(product.price),
    currency_id: 'COP', // Cambiar según tu país (ARS, MXN, CLP, etc.)
  }));


  // Validación adicional para producción
  if (!FRONTEND_URL || FRONTEND_URL === 'undefined') {
    throw new Error('FRONTEND_URL is not configured. Please set it in your environment variables.');
  }

  if (!accessToken) {
    throw new Error(`MERCADO_PAGO_${IS_SANDBOX ? 'TEST_' : ''}ACCESS_TOKEN is not configured.`);
  }

  console.log('🔍 Payment Configuration:', {
    mode: IS_SANDBOX ? '🧪 SANDBOX' : '🚀 PRODUCTION',
    FRONTEND_URL,
    API_URL,
    orderId,
    itemsCount: items.length,
  });

  console.log('🔍 Payment URLs:', {
    success: `${FRONTEND_URL}/payment/success`,
    failure: `${FRONTEND_URL}/payment/failure`,
    pending: `${FRONTEND_URL}/payment/pending`,
    webhook: `${API_URL}/payments/webhook`,
  });

  const preferenceData = {
    items,
    payer: {
      email: payerInfo.email,
      name: payerInfo.name,
      surname: payerInfo.surname,
    },
    back_urls: {
      success: `${FRONTEND_URL}/payment/success`,
      failure: `${FRONTEND_URL}/payment/failure`,
      pending: `${FRONTEND_URL}/payment/pending`,
    },
    auto_return: IS_SANDBOX ? undefined : ('approved' as const), // Solo en producción
    external_reference: orderId,
    notification_url: `${API_URL}/payments/webhook`,
    statement_descriptor: 'MERCADOR_STORE',
    binary_mode: false, // Desactivar modo binario para sandbox
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    // Metadata para debugging
    metadata: {
      order_id: orderId,
      environment: IS_SANDBOX ? 'sandbox' : 'production',
    },
  };

  try {
    const response = await preferenceApi.create({ body: preferenceData });
    
    // Log importante: Verificar qué URL se generó
    console.log('✅ Payment preference created:', {
      id: response.id,
      mode: IS_SANDBOX ? '🧪 SANDBOX' : '🚀 PRODUCTION',
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
      correct_url: IS_SANDBOX ? response.sandbox_init_point : response.init_point,
    });
    
    // Verificar que la URL correcta esté disponible
    const correctUrl = IS_SANDBOX ? response.sandbox_init_point : response.init_point;
    if (!correctUrl) {
      console.error('⚠️ WARNING: Correct init_point URL is missing!', {
        mode: IS_SANDBOX ? 'sandbox' : 'production',
        available_urls: {
          init_point: !!response.init_point,
          sandbox_init_point: !!response.sandbox_init_point,
        }
      });
    } else if (IS_SANDBOX && !correctUrl.includes('sandbox')) {
      console.error('🚨 CRITICAL: Using production URL in SANDBOX mode!');
      console.error('This will block test cards. URL:', correctUrl);
    }
    
    return response;
  } catch (error: any) {
    console.error('❌ Error creating preference:', {
      message: error.message,
      cause: error.cause,
      response: error.response?.data,
      status: error.status,
    });
    
    // Extraer mensaje de error más descriptivo
    const errorMessage = error.response?.data?.message 
      || error.message 
      || 'Unknown error occurred';
    
    throw new Error(`Failed to create payment preference: ${errorMessage}`);
  }
}

/**
 * Obtiene información de un pago desde Mercado Pago
 */
export async function getPaymentInfo(paymentId: string) {
  try {
    const payment = await paymentApi.get({ id: paymentId });
    return payment;
  } catch (error) {
    console.error('Error fetching payment info:', error);
    throw new Error(`Failed to get payment info: ${error}`);
  }
}

/**
 * Verifica el estado de un pago
 */
export async function verifyPayment(paymentId: string): Promise<PaymentStatus> {
  const payment = await getPaymentInfo(paymentId);
  
  return {
    id: payment.id!,
    status: payment.status || '',
    status_detail: payment.status_detail || '',
    external_reference: payment.external_reference || '',
    transaction_amount: payment.transaction_amount || 0,
    payer_email: payment.payer?.email,
    approved: payment.status === 'approved',
  };
}

/**
 * Asigna license keys disponibles a un usuario después de un pago aprobado
 */
export async function assignLicenseKeys(orderId: string, userId: string) {
  try {
    // 1. Obtener los items de la orden
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      throw new Error(`Failed to fetch order items: ${itemsError.message}`);
    }

    if (!orderItems || orderItems.length === 0) {
      console.log('No items found for order:', orderId);
      return;
    }

    // 2. Para cada producto en la orden, asignar license keys
    for (const item of orderItems) {
      for (let i = 0; i < item.quantity; i++) {
        // Buscar una key disponible para este producto
        const { data: availableKeys, error: keysError } = await supabase
          .from('product_keys')
          .select('id, license_key')
          .eq('product_id', item.product_id)
          .is('user_id', null)
          .eq('status', 'available')
          .limit(1);

        if (keysError) {
          console.error('Error fetching available keys:', keysError);
          continue;
        }

        if (availableKeys && availableKeys.length > 0) {
          const key = availableKeys[0];

          // Asignar la key al usuario
          const { error: updateError } = await supabase
            .from('product_keys')
            .update({
              user_id: userId,
              status: 'assigned',
              updated_at: new Date().toISOString(),
            })
            .eq('id', key.id);

          if (updateError) {
            console.error('Error assigning license key:', updateError);
          } else {
            console.log(`✅ License key ${key.license_key} assigned to user ${userId}`);
          }
        } else {
          console.warn(`⚠️ No available license keys for product ${item.product_id}`);
        }
      }
    }

    console.log(`✅ License keys assignment completed for order ${orderId}`);
  } catch (error) {
    console.error('Error in assignLicenseKeys:', error);
    throw error;
  }
}
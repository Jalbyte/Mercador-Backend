/**
 * Servicio de integración con Mercado Pago
 * Maneja la creación de preferencias de pago y verificación de estados
 */

import mercadopago from 'mercadopago';
import { supabase } from '../config/supabase.js';
import { FRONTEND_URL } from '../config/env.js';
import type { Product } from './product.service.js';
import type { CreatePaymentRequest, PaymentStatus } from '../types/payment.types.js';

// Configurar cliente de Mercado Pago
const client = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
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
    unit_price: product.price,
    currency_id: 'COP', // Cambiar según tu país (ARS, MXN, CLP, etc.)
  }));

  const backUrl = FRONTEND_URL || 'http://localhost:3000';
  const apiUrl = process.env.API_URL || 'http://localhost:3010';

  const preferenceData = {
    items,
    payer: {
      email: payerInfo.email,
      name: payerInfo.name,
      surname: payerInfo.surname,
    },
    back_urls: {
      success: `${backUrl}/payment/success`,
      failure: `${backUrl}/payment/failure`,
      pending: `${backUrl}/payment/pending`,
    },
    auto_return: 'approved' as const,
    external_reference: orderId,
    notification_url: `${apiUrl}/payments/webhook`,
    statement_descriptor: 'MERCADOR_STORE',
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    const response = await preferenceApi.create({ body: preferenceData });
    return response;
  } catch (error) {
    console.error('Error creating preference:', error);
    throw new Error(`Failed to create payment preference: ${error}`);
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
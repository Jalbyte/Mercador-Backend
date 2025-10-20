/**
 * Servicio de integración con PayU Latam
 * Maneja la creación de transacciones y verificación de estados
 * 
 * Documentación oficial: https://developers.payulatam.com/latam/es/docs/getting-started.html
 */

import axios from 'axios';
import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { 
  FRONTEND_URL, 
  API_URL, 
  NODE_ENV,
  PAYU_API_KEY,
  PAYU_API_LOGIN,
  PAYU_MERCHANT_ID,
  PAYU_ACCOUNT_ID,
  PAYU_SANDBOX_URL,
  PAYU_TEST,
} from '../config/env.js';
import type { Product } from './product.service.js';
import type { CreatePaymentRequest, PaymentStatus } from '../types/payment.types.js';

// Determinar si estamos en modo sandbox
export const IS_SANDBOX = NODE_ENV !== 'production' || PAYU_TEST;

// URL de la API de PayU
const PAYU_API_URL = IS_SANDBOX 
  ? PAYU_SANDBOX_URL 
  : 'https://api.payulatam.com/payments-api/4.0/service.cgi';

// Validar configuración
if (!PAYU_API_KEY || !PAYU_API_LOGIN || !PAYU_MERCHANT_ID || !PAYU_ACCOUNT_ID) {
  console.warn('⚠️ PayU credentials not fully configured. PayU payments will not work.');
}

console.log('🔧 PayU Configuration:', {
  mode: IS_SANDBOX ? '🧪 SANDBOX (Test Mode)' : '🚀 PRODUCTION',
  apiUrl: PAYU_API_URL,
  merchantId: PAYU_MERCHANT_ID,
  accountId: PAYU_ACCOUNT_ID,
  credentialsConfigured: !!(PAYU_API_KEY && PAYU_API_LOGIN),
  environment: NODE_ENV,
});

/**
 * Detecta el tipo de tarjeta basado en el número
 */
function detectCardType(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');
  
  if (/^4/.test(cleaned)) return 'VISA';
  if (/^5[1-5]/.test(cleaned)) return 'MASTERCARD';
  if (/^3[47]/.test(cleaned)) return 'AMEX';
  if (/^6(?:011|5)/.test(cleaned)) return 'DISCOVER';
  if (/^3(?:0[0-5]|[68])/.test(cleaned)) return 'DINERS';
  
  return 'VISA'; // Default
}

/**
 * Simula respuesta de PayU según tarjeta de prueba en modo sandbox
 * ✅ APROBADA:  4111111111111111
 * ❌ RECHAZADA: 4097440000000004  
 * ⏳ PENDIENTE: 4666666666666669
 */
function simulatePayUResponse(cardNumber: string, orderId: string, amount: number) {
  const cleaned = cardNumber.replace(/\s/g, '');
  
  // Tarjeta APROBADA
  if (cleaned === '4111111111111111') {
    return {
      code: 'SUCCESS',
      transactionResponse: {
        orderId: orderId,
        transactionId: `txn_${Date.now()}_approved`,
        state: 'APPROVED',
        paymentNetworkResponseCode: '00',
        paymentNetworkResponseErrorMessage: null,
        trazabilityCode: `traza_${Date.now()}`,
        authorizationCode: `AUTH_${Math.floor(Math.random() * 1000000)}`,
        pendingReason: null,
        responseCode: 'APPROVED',
        errorCode: null,
        responseMessage: 'Transacción aprobada',
        transactionDate: new Date().toISOString(),
        transactionTime: new Date().toISOString(),
        operationDate: new Date().toISOString(),
        extraParameters: {
          BANK_REFERENCED_CODE: `REF_${Date.now()}`
        }
      }
    };
  }
  
  // Tarjeta RECHAZADA
  if (cleaned === '4097440000000004') {
    return {
      code: 'SUCCESS',
      transactionResponse: {
        orderId: orderId,
        transactionId: `txn_${Date.now()}_declined`,
        state: 'DECLINED',
        paymentNetworkResponseCode: '05',
        paymentNetworkResponseErrorMessage: 'No autorizada',
        trazabilityCode: `traza_${Date.now()}`,
        authorizationCode: null,
        pendingReason: null,
        responseCode: 'ANTIFRAUD_REJECTED',
        errorCode: null,
        responseMessage: 'Transacción declinada',
        transactionDate: new Date().toISOString(),
        transactionTime: new Date().toISOString(),
        operationDate: new Date().toISOString(),
        extraParameters: {}
      }
    };
  }
  
  // Tarjeta PENDIENTE
  if (cleaned === '4666666666666669') {
    return {
      code: 'SUCCESS',
      transactionResponse: {
        orderId: orderId,
        transactionId: `txn_${Date.now()}_pending`,
        state: 'PENDING',
        paymentNetworkResponseCode: '25',
        paymentNetworkResponseErrorMessage: null,
        trazabilityCode: `traza_${Date.now()}`,
        authorizationCode: null,
        pendingReason: 'AWAITING_PAYMENT_IN_ENTITY',
        responseCode: 'PENDING_TRANSACTION_CONFIRMATION',
        errorCode: null,
        responseMessage: 'Transacción pendiente',
        transactionDate: new Date().toISOString(),
        transactionTime: new Date().toISOString(),
        operationDate: new Date().toISOString(),
        extraParameters: {}
      }
    };
  }
  
  // Default: APROBADA para cualquier otra tarjeta en sandbox
  return {
    code: 'SUCCESS',
    transactionResponse: {
      orderId: orderId,
      transactionId: `txn_${Date.now()}_approved`,
      state: 'APPROVED',
      paymentNetworkResponseCode: '00',
      paymentNetworkResponseErrorMessage: null,
      trazabilityCode: `traza_${Date.now()}`,
      authorizationCode: `AUTH_${Math.floor(Math.random() * 1000000)}`,
      pendingReason: null,
      responseCode: 'APPROVED',
      errorCode: null,
      responseMessage: 'Transacción aprobada',
      transactionDate: new Date().toISOString(),
      transactionTime: new Date().toISOString(),
      operationDate: new Date().toISOString(),
      extraParameters: {
        BANK_REFERENCED_CODE: `REF_${Date.now()}`
      }
    }
  };
}

/**
 * Genera el signature MD5 requerido por PayU
 * Formula: MD5(ApiKey~merchantId~referenceCode~amount~currency)
 * 
 * @param referenceCode - ID de referencia de la orden
 * @param amount - Monto total de la transacción
 * @param currency - Moneda (por defecto COP)
 */
function generateSignature(
  referenceCode: string, 
  amount: number, 
  currency: string = 'COP'
): string {
  // El monto debe tener exactamente 2 decimales
  const formattedAmount = amount.toFixed(2);
  const signatureString = `${PAYU_API_KEY}~${PAYU_MERCHANT_ID}~${referenceCode}~${formattedAmount}~${currency}`;
  
  console.log('🔐 Generating signature:', {
    referenceCode,
    amount: formattedAmount,
    currency,
    // No mostrar la key completa por seguridad
    apiKeyPrefix: PAYU_API_KEY?.substring(0, 10) + '...',
  });
  
  return crypto.createHash('md5').update(signatureString).digest('hex');
}

/**
 * Crea una preferencia de pago en PayU (transacción)
 * 
 * Nota: A diferencia de Mercado Pago, PayU NO genera una URL de checkout automática.
 * Tienes dos opciones:
 * 1. Usar el formulario web checkout de PayU (requiere integración HTML)
 * 2. Procesar el pago directamente desde el backend (como se hace aquí)
 * 
 * Esta implementación procesa el pago directamente con los datos de tarjeta.
 */
export async function createPaymentPreference(
  products: Product[],
  payerInfo: CreatePaymentRequest['payer'],
  orderId: string,
  creditCardInfo?: CreatePaymentRequest['creditCard']
) {
  // Calcular monto total
  const amount = products.reduce((acc, p) => acc + p.price, 0);
  const signature = generateSignature(orderId, amount);

  // Validación de configuración
  if (!FRONTEND_URL || FRONTEND_URL === 'undefined') {
    throw new Error('FRONTEND_URL is not configured. Please set it in your environment variables.');
  }

  if (!PAYU_API_KEY || !PAYU_API_LOGIN) {
    throw new Error('PayU credentials (PAYU_API_KEY, PAYU_API_LOGIN) are not configured.');
  }

  console.log('🔍 PayU Payment Configuration:', {
    mode: IS_SANDBOX ? '🧪 SANDBOX' : '🚀 PRODUCTION',
    FRONTEND_URL,
    API_URL,
    orderId,
    amount,
    itemsCount: products.length,
    signature,
  });

  // Estructura de la petición según documentación de PayU
  const requestBody = {
    language: 'es',
    command: 'SUBMIT_TRANSACTION',
    merchant: {
      apiLogin: PAYU_API_LOGIN,
      apiKey: PAYU_API_KEY,
    },
    transaction: {
      order: {
        accountId: PAYU_ACCOUNT_ID,
        referenceCode: orderId,
        description: `Compra de ${products.length} producto(s) en Mercador`,
        language: 'es',
        signature: signature,
        notifyUrl: `${API_URL}/payments/payu/webhook`,
        additionalValues: {
          TX_VALUE: {
            value: amount,
            currency: 'COP',
          },
        },
        buyer: {
          merchantBuyerId: payerInfo.email,
          fullName: `${payerInfo.name} ${payerInfo.surname}`,
          emailAddress: payerInfo.email,
          contactPhone: '3001234567', // Opcional: puedes agregarlo a payerInfo
          dniNumber: '123456789', // Opcional: puedes agregarlo a payerInfo
          shippingAddress: {
            street1: 'Calle 100',
            street2: 'Apartamento 101',
            city: 'Bogotá',
            state: 'Bogotá D.C.',
            country: 'CO',
            postalCode: '110111',
            phone: '3001234567',
          },
        },
      },
      payer: {
        merchantPayerId: payerInfo.email,
        fullName: `${payerInfo.name} ${payerInfo.surname}`,
        emailAddress: payerInfo.email,
        contactPhone: '3001234567',
        dniNumber: '123456789',
        billingAddress: {
          street1: 'Calle 100',
          street2: 'Apartamento 101',
          city: 'Bogotá',
          state: 'Bogotá D.C.',
          country: 'CO',
          postalCode: '110111',
          phone: '3001234567',
        },
      },
      // Datos de tarjeta - usar los proporcionados o tarjeta de prueba en sandbox
      creditCard: creditCardInfo || (IS_SANDBOX ? {
        number: '4111111111111111', // Tarjeta de prueba VISA APRO
        securityCode: '123',
        expirationDate: '2030/12',
        name: 'APRO',
      } : undefined),
      extraParameters: {
        INSTALLMENTS_NUMBER: 1,
      },
      type: 'AUTHORIZATION_AND_CAPTURE',
      paymentMethod: creditCardInfo 
        ? detectCardType(creditCardInfo.number)
        : 'VISA',
      paymentCountry: 'CO',
      deviceSessionId: orderId,
      ipAddress: '127.0.0.1', // En producción, obtener IP real del cliente
      cookie: `pt1t38347bs6jc9ruv2ecpv7o2`,
      userAgent: 'Mozilla/5.0 (Windows NT 5.1; rv:18.0) Gecko/20100101 Firefox/18.0',
    },
    test: IS_SANDBOX,
  };

  console.log('📤 Enviando transacción a PayU:', {
    mode: IS_SANDBOX ? '🧪 SANDBOX' : '🚀 PRODUCTION',
    orderId,
    amount,
    cardNumber: creditCardInfo ? `****${creditCardInfo.number.slice(-4)}` : '****1111',
  });

  try {
    let data;
    
    // En modo sandbox, simular respuesta según la tarjeta
    if (IS_SANDBOX && creditCardInfo) {
      console.log('🎭 Simulando respuesta PayU para tarjeta:', creditCardInfo.number.slice(-4));
      data = simulatePayUResponse(creditCardInfo.number, orderId, amount);
    } else {
      // En producción, llamar a la API real de PayU
      const response = await axios.post(PAYU_API_URL, requestBody, {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
      data = response.data;
    }

    console.log('✅ Respuesta PayU:', {
      code: data.code,
      error: data.error,
      transactionResponse: data.transactionResponse,
    });

    if (data.code !== 'SUCCESS') {
      const errorMsg = data.error || data.code;
      console.error('❌ Error en respuesta de PayU:', errorMsg);
      throw new Error(`Error al crear transacción PayU: ${errorMsg}`);
    }

    const transactionResponse = data.transactionResponse;

    // PayU no genera una URL de checkout como Mercado Pago
    // El pago se procesa directamente y retorna el estado
    return {
      transactionId: transactionResponse.transactionId,
      orderId: transactionResponse.orderId,
      state: transactionResponse.state, // APPROVED, DECLINED, PENDING, ERROR
      responseCode: transactionResponse.responseCode,
      paymentNetworkResponseCode: transactionResponse.paymentNetworkResponseCode,
      responseMessage: transactionResponse.responseMessage,
      operationDate: transactionResponse.operationDate,
      // PayU puede retornar una URL bancaria para algunos métodos de pago
      extraParameters: transactionResponse.extraParameters,
      // Construir URL de retorno según el estado
      redirectUrl: transactionResponse.state === 'APPROVED' 
        ? `${FRONTEND_URL}/payment/success?transaction_id=${transactionResponse.transactionId}`
        : transactionResponse.state === 'DECLINED'
        ? `${FRONTEND_URL}/payment/failure?transaction_id=${transactionResponse.transactionId}`
        : `${FRONTEND_URL}/payment/pending?transaction_id=${transactionResponse.transactionId}`,
    };
  } catch (error: any) {
    console.error('❌ Error calling PayU API:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });

    const errorMessage = error.response?.data?.error 
      || error.response?.data?.message 
      || error.message 
      || 'Unknown error occurred';

    throw new Error(`Failed to create PayU transaction: ${errorMessage}`);
  }
}

/**
 * Obtiene información de una transacción por referencia
 */
export async function getPaymentInfo(referenceCode: string) {
  const requestBody = {
    language: 'es',
    command: 'ORDER_DETAIL_BY_REFERENCE_CODE',
    merchant: {
      apiLogin: PAYU_API_LOGIN,
      apiKey: PAYU_API_KEY,
    },
    details: {
      referenceCode: referenceCode,
    },
    test: IS_SANDBOX,
  };

  try {
    const { data } = await axios.post(PAYU_API_URL, requestBody, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (data.code !== 'SUCCESS') {
      throw new Error(`Error fetching payment info: ${data.error || data.code}`);
    }

    return data.result?.payload;
  } catch (error: any) {
    console.error('Error fetching PayU payment info:', error);
    throw new Error(`Failed to get payment info: ${error.message}`);
  }
}

/**
 * Verifica el estado de un pago
 */
export async function verifyPayment(referenceCode: string): Promise<PaymentStatus> {
  const paymentInfo = await getPaymentInfo(referenceCode);
  
  const order = paymentInfo?.orders?.[0];
  const transaction = order?.transactions?.[0];
  const transactionResponse = transaction?.transactionResponse;

  if (!order || !transaction) {
    throw new Error('Payment not found');
  }

  // Mapear estados de PayU a tu formato
  const state = transactionResponse?.state || 'UNKNOWN';
  const isApproved = state === 'APPROVED';

  return {
    id: transaction.id || transactionResponse?.transactionId || '',
    status: state,
    status_detail: transactionResponse?.responseCode || '',
    external_reference: order.referenceCode || '',
    transaction_amount: order.additionalValues?.TX_VALUE?.value || 0,
    payer_email: order.buyer?.emailAddress,
    approved: isApproved,
  };
}

/**
 * Asigna license keys disponibles a un usuario después de un pago aprobado
 * Usa supabaseAdmin para tener permisos completos
 */
export async function assignLicenseKeys(orderId: string, userId: string) {
  try {
    // Usar cliente admin para tener permisos completos
    const client = supabaseAdmin || supabase;
    
    // 1. Obtener los items de la orden
    const { data: orderItems, error: itemsError } = await client
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
        const { data: availableKeys, error: keysError } = await client
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
          const { error: updateError } = await client
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

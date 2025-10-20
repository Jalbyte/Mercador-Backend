import { Hono } from 'hono';
import crypto from 'crypto';
import { authMiddleware } from '../middlewares/auth.js';
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js';
import * as payuService from '../services/payu.service.js';
import * as orderService from '../services/order.service.js';
import * as cartService from '../services/cart.service.js';
import { PAYU_API_KEY, PAYU_MERCHANT_ID } from '../config/env.js';
import type { CreatePaymentRequest, PayUNotification } from '../types/payment.types.js';

const payu = new Hono();

// Helper: Extrae token desde Authorization header
function getTokenFromRequest(c: any): string | undefined {
  const authHeader = c.req.header('Authorization');
  return authHeader ? authHeader.replace('Bearer ', '') : undefined;
}

// Aplicar middlewares (excepto webhook que es público)
payu.use('/create', cookieToAuthHeader);
payu.use('/create', authMiddleware);
payu.use('/status/:referenceCode', cookieToAuthHeader);
payu.use('/status/:referenceCode', authMiddleware);
payu.use('/order/:orderId', cookieToAuthHeader);
payu.use('/order/:orderId', authMiddleware);

/**
 * POST /api/payu/create
 * Crea una transacción de pago con PayU desde el carrito del usuario
 */
payu.post('/create', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }

    const token = getTokenFromRequest(c);

    const body = await c.req.json<{
      payer?: CreatePaymentRequest['payer'];
      creditCard?: CreatePaymentRequest['creditCard'];
      shipping_address?: any;
    }>();

    // Obtener el carrito del usuario
    const cart = await cartService.getUserCart(userId, token);

    if (!cart.items || cart.items.length === 0) {
      return c.json({ error: 'El carrito está vacío' }, 400);
    }

    // Extraer productos del carrito y validar
    const products = cart.items
      .filter((item: any) => item.product) // Filtrar items sin producto
      .map((item: any) => item.product);
    
    if (products.length === 0) {
      return c.json({ error: 'No hay productos válidos en el carrito' }, 400);
    }
    
    console.log('🛒 Cart products:', {
      itemCount: cart.items.length,
      validProducts: products.length,
      total: cart.total,
    });

    // Información del comprador (payer)
    const payerInfo = body.payer || {
      email: 'test@example.com',
      name: 'Test',
      surname: 'User',
    };

    // Crear la orden en la base de datos
    const order = await orderService.createOrder(
      userId,
      {
        shippingAddress: body.shipping_address,
        paymentMethod: 'payu',
      },
      token
    );

    console.log('📝 Order created:', order.id);

    // Crear transacción en PayU
    const transaction = await payuService.createPaymentPreference(
      products,
      payerInfo,
      order.id,
      body.creditCard // ✅ Pasar datos de tarjeta
    );

    console.log('💳 PayU transaction ready:', {
      mode: payuService.IS_SANDBOX ? '🧪 SANDBOX' : '🚀 PRODUCTION',
      transaction_id: transaction.transactionId,
      state: transaction.state,
      redirect_url: transaction.redirectUrl,
    });

    // Si el pago fue aprobado inmediatamente (modo sandbox con tarjeta de prueba APRO)
    if (transaction.state === 'APPROVED') {
      console.log('✅ Payment approved immediately (sandbox mode)');
      await orderService.updateOrderStatusWithPayment(
        order.id,
        'confirmed',
        transaction.transactionId,
        token
      );
      await payuService.assignLicenseKeys(order.id, userId);
    } else if (transaction.state === 'DECLINED') {
      console.log('❌ Payment declined');
      await orderService.updateOrderStatusWithPayment(
        order.id,
        'cancelled',
        transaction.transactionId,
        token
      );
    } else if (transaction.state === 'PENDING') {
      console.log('⏳ Payment pending');
      await orderService.updateOrderStatusWithPayment(
        order.id,
        'pending',
        transaction.transactionId,
        token
      );
    }

    return c.json({
      transaction_id: transaction.transactionId,
      order_id: order.id,
      state: transaction.state,
      redirect_url: transaction.redirectUrl,
      response_message: transaction.responseMessage,
      mode: payuService.IS_SANDBOX ? 'sandbox' : 'production',
    });
  } catch (error: any) {
    console.error('❌ Error creating PayU transaction:', error);
    return c.json(
      {
        error: 'Error al procesar el pago',
        details: error.message,
      },
      500
    );
  }
});

/**
 * POST /api/payu/webhook
 * Endpoint público para recibir notificaciones de PayU (confirmación de pago)
 * 
 * IMPORTANTE: PayU envía notificaciones en formato x-www-form-urlencoded
 * Documentación: https://developers.payulatam.com/latam/es/docs/integrations/webcheckout-integration/confirmation-page.html
 */
payu.post('/webhook', async (c) => {
  try {
    console.log('📩 PayU webhook received');

    // PayU envía los datos como form-urlencoded
    const body = await c.req.parseBody();
    const notification = body as unknown as PayUNotification;

    console.log('📦 Webhook payload:', notification);

    // Validar signature de PayU para seguridad
    const receivedSignature = notification.sign;
    const calculatedSignature = crypto
      .createHash('md5')
      .update(
        `${PAYU_API_KEY}~${PAYU_MERCHANT_ID}~${notification.reference_sale}~${notification.value}~${notification.currency}~${notification.state_pol}`
      )
      .digest('hex');

    if (receivedSignature !== calculatedSignature) {
      console.error('🚨 Invalid signature in PayU webhook!');
      console.error('Received:', receivedSignature);
      console.error('Calculated:', calculatedSignature);
      return c.json({ error: 'Invalid signature' }, 400);
    }

    const orderId = notification.reference_sale;
    const state = notification.state_pol;
    const transactionId = notification.transaction_id;

    if (!orderId) {
      console.error('❌ No reference_sale in notification');
      return c.json({ error: 'No reference' }, 400);
    }

    console.log('🔄 Processing webhook:', {
      orderId,
      state,
      transactionId,
      email: notification.email_buyer,
    });

    // Actualizar orden según el estado
    if (state === 'APPROVED') {
      console.log('✅ Payment approved via webhook');
      await orderService.updateOrderStatusWithPayment(orderId, 'confirmed', transactionId);
      
      // Asignar license keys al usuario
      // Necesitamos obtener el userId de la orden primero
      // En el webhook no tenemos el userId directamente, usamos el email
      const buyerEmail = notification.email_buyer;
      if (buyerEmail) {
        // Buscar el usuario por email o usar una función helper
        // Por ahora, logueamos y esperamos que el webhook se llame después del flujo normal
        console.log('📧 Buyer email from webhook:', buyerEmail);
        // TODO: Implementar búsqueda de usuario por email si es necesario
        // await payuService.assignLicenseKeys(orderId, userId);
      }
    } else if (state === 'DECLINED' || state === 'EXPIRED') {
      console.log('❌ Payment declined/expired via webhook');
      await orderService.updateOrderStatusWithPayment(orderId, 'cancelled', transactionId);
    } else if (state === 'PENDING') {
      console.log('⏳ Payment pending via webhook');
      await orderService.updateOrderStatusWithPayment(orderId, 'pending', transactionId);
    }

    // PayU espera una respuesta exitosa
    return c.text('OK', 200);
  } catch (error: any) {
    console.error('❌ Error processing PayU webhook:', error);
    // Retornar 200 para evitar reintentos de PayU
    return c.text('OK', 200);
  }
});

/**
 * GET /api/payu/status/:referenceCode
 * Consulta el estado de una transacción por su código de referencia (orderId)
 */
payu.get('/status/:referenceCode', async (c) => {
  try {
    const referenceCode = c.req.param('referenceCode');

    if (!referenceCode) {
      return c.json({ error: 'Reference code requerido' }, 400);
    }

    const paymentStatus = await payuService.verifyPayment(referenceCode);

    return c.json({
      status: paymentStatus.status,
      approved: paymentStatus.approved,
      details: paymentStatus,
    });
  } catch (error: any) {
    console.error('Error fetching PayU payment status:', error);
    return c.json(
      {
        error: 'Error al consultar el estado del pago',
        details: error.message,
      },
      500
    );
  }
});

/**
 * GET /api/payu/order/:orderId
 * Obtiene información de pago asociada a una orden
 */
payu.get('/order/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId');
    const userId = c.get('userId');

    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }

    if (!orderId) {
      return c.json({ error: 'Order ID requerido' }, 400);
    }

    // Verificar que la orden pertenezca al usuario
    const order = await orderService.getOrderById(userId, orderId);

    if (!order) {
      return c.json({ error: 'Orden no encontrada' }, 404);
    }

    if (order.user_id !== userId) {
      return c.json({ error: 'No autorizado' }, 403);
    }

    // Intentar obtener el estado del pago desde PayU usando el orderId como referencia
    try {
      const paymentStatus = await payuService.verifyPayment(orderId);
      return c.json({
        order,
        payment: paymentStatus,
      });
    } catch (paymentError) {
      console.error('Error fetching payment status:', paymentError);
      return c.json({
        order,
        payment: null,
        payment_error: 'No se pudo obtener el estado del pago',
      });
    }
  } catch (error: any) {
    console.error('Error fetching order:', error);
    return c.json(
      {
        error: 'Error al obtener la orden',
        details: error.message,
      },
      500
    );
  }
});

export default payu;

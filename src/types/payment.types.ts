export interface CreatePaymentRequest {
  items: Array<{
    product_id: string;
    quantity: number;
  }>;
  payer: {
    email: string;
    name?: string;
    surname?: string;
  };
  creditCard?: {
    number: string;
    securityCode: string;
    expirationDate: string; // Formato: YYYY/MM
    name: string;
  };
}

export interface PaymentItem {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
}

export interface PaymentNotification {
  action: string;
  api_version: string;
  data: {
    id: string;
  };
  date_created: string;
  id: number;
  live_mode: boolean;
  type: string;
  user_id: string;
}

export interface PaymentStatus {
  id: number | string; // PayU usa strings para IDs
  status: string;
  status_detail: string;
  external_reference: string;
  transaction_amount: number;
  payer_email?: string;
  approved: boolean;
}

// Tipos específicos de PayU
export interface PayUTransactionResponse {
  transactionId: string;
  orderId: string;
  state: 'APPROVED' | 'DECLINED' | 'PENDING' | 'ERROR';
  responseCode: string;
  paymentNetworkResponseCode?: string;
  responseMessage: string;
  operationDate: string;
  extraParameters?: Record<string, any>;
  redirectUrl: string;
}

export interface PayUNotification {
  merchant_id: string;
  state_pol: 'APPROVED' | 'DECLINED' | 'PENDING' | 'EXPIRED';
  risk?: string;
  response_code_pol: string;
  reference_sale: string;
  reference_pol: string;
  sign: string;
  extra1?: string;
  extra2?: string;
  payment_method: string;
  payment_method_type: string;
  installments_number: string;
  value: string;
  tax: string;
  additional_value?: string;
  transaction_date: string;
  currency: string;
  email_buyer: string;
  cus?: string;
  pse_bank?: string;
  test: string;
  description: string;
  billing_address?: string;
  shipping_address?: string;
  phone?: string;
  office_phone?: string;
  account_number_ach?: string;
  account_type_ach?: string;
  administrative_fee?: string;
  administrative_fee_base?: string;
  administrative_fee_tax?: string;
  airline_code?: string;
  attempts?: string;
  authorization_code?: string;
  travel_agency_authorization_code?: string;
  transaction_bank_id?: string;
  transaction_id: string;
  payment_method_id: string;
  payment_request_state?: string;
  fraud_score?: string;
  date?: string;
  pse_reference1?: string;
  pse_reference2?: string;
  pse_reference3?: string;
  nickname_buyer?: string;
  nickname_seller?: string;
  ip?: string;
}
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
  id: number;
  status: string;
  status_detail: string;
  external_reference: string;
  transaction_amount: number;
  payer_email?: string;
  approved: boolean;
}
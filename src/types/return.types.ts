/**
 * Tipos y interfaces para el sistema de devoluciones
 * @module types/return.types
 */

// ==================
// ENUMS
// ==================

/**
 * Estados posibles de una devolución
 */
export enum ReturnStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

/**
 * Métodos de reembolso disponibles
 */
export enum RefundMethod {
  ORIGINAL_PAYMENT = 'original_payment',
  STORE_CREDIT = 'store_credit',
  BANK_TRANSFER = 'bank_transfer'
}

/**
 * Estados de créditos de tienda
 */
export enum StoreCreditStatus {
  ACTIVE = 'active',
  USED = 'used',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

// ==================
// INTERFACES
// ==================

/**
 * Devolución principal
 */
export interface Return {
  id: number;
  order_id: number;
  user_id: string;
  status: ReturnStatus;
  reason: string;
  refund_amount: number;
  refund_method?: RefundMethod;
  admin_notes?: string;
  processed_by?: string;
  processed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Item individual de una devolución
 * Ahora trabaja con product_key_id para trazabilidad específica
 */
export interface ReturnItem {
  id: number;
  return_id: number;
  product_key_id: string; // UUID
  product_id: number;
  price: number;
  reason?: string;
  created_at: Date;
}

/**
 * Historial de cambios de estado
 */
export interface ReturnStatusHistory {
  id: number;
  return_id: number;
  old_status?: string;
  new_status: string;
  changed_by: string;
  notes?: string;
  created_at: Date;
}

/**
 * Crédito de tienda
 */
export interface StoreCredit {
  id: number;
  user_id: string;
  return_id?: number;
  amount: number;
  balance: number;
  status: StoreCreditStatus;
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// ==================
// DTOs (Data Transfer Objects)
// ==================

/**
 * DTO para crear una nueva devolución
 * Ahora usa product_key_ids para identificar claves específicas
 */
export interface CreateReturnDTO {
  order_id: number;
  reason: string;
  product_key_ids: string[]; // Array de UUIDs de claves de licencia
  notes?: string;
}

/**
 * DTO para crear un item de devolución (uso interno)
 */
export interface CreateReturnItemDTO {
  product_key_id: string; // UUID
  product_id: number;
  price: number;
  reason?: string;
}

/**
 * DTO para procesar (aprobar/rechazar) una devolución
 */
export interface ProcessReturnDTO {
  status: ReturnStatus.APPROVED | ReturnStatus.REJECTED;
  refund_method?: RefundMethod;
  admin_notes?: string;
}

/**
 * DTO para actualizar una devolución (solo admin)
 */
export interface UpdateReturnDTO {
  status?: ReturnStatus;
  refund_method?: RefundMethod;
  admin_notes?: string;
  refund_amount?: number;
}

/**
 * DTO para cancelar una devolución (solo usuario)
 */
export interface CancelReturnDTO {
  reason?: string;
}

// ==================
// RESPONSE TYPES
// ==================

/**
 * Devolución con información relacionada
 */
export interface ReturnWithDetails extends Return {
  items: ReturnItemWithProduct[];
  order?: {
    id: number;
    total_amount: number;
    created_at: Date;
  };
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
  processor?: {
    id: string;
    full_name: string;
  };
}

/**
 * Item de devolución con información del producto y clave
 */
export interface ReturnItemWithProduct extends ReturnItem {
  product?: {
    id: number;
    name: string;
    image_url?: string;
  };
  product_key?: {
    id: string; // UUID
    license_key: string; // Solo visible para admin
    status: string;
  };
}

/**
 * Resumen de devoluciones para el admin
 */
export interface ReturnsSummary {
  total_returns: number;
  pending_returns: number;
  approved_returns: number;
  rejected_returns: number;
  refunded_returns: number;
  total_refund_amount: number;
}

/**
 * Balance de créditos de tienda de un usuario
 */
export interface StoreCreditBalance {
  user_id: string;
  total_balance: number;
  active_credits: StoreCredit[];
}

// ==================
// FILTERS
// ==================

/**
 * Filtros para listar devoluciones
 */
export interface ReturnFilters {
  status?: ReturnStatus;
  user_id?: string;
  order_id?: number;
  start_date?: Date;
  end_date?: Date;
  page?: number;
  limit?: number;
}

/**
 * Respuesta paginada de devoluciones
 */
export interface PaginatedReturns {
  data: ReturnWithDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ==================
// VALIDATION TYPES
// ==================

/**
 * Resultado de validación de devolución
 */
export interface ReturnValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Información de elegibilidad para devolución de una orden
 */
export interface ReturnEligibility {
  eligible: boolean;
  order_id: number;
  order_date: Date;
  days_since_purchase: number;
  return_window_days: number;
  available_keys: AvailableKeyForReturn[];
  reason?: string;
}

/**
 * Clave disponible para devolución
 */
export interface AvailableKeyForReturn {
  id: string; // UUID
  product_id: number;
  product_name: string;
  license_key_preview: string; // Solo últimos 4 caracteres: "****-****-XXXX"
  price: number;
  eligible: boolean;
  reason?: string; // Razón si no es elegible
}


/**
 * @fileoverview Servicio de usuarios para Mercador.
 * Maneja operaciones relacionadas con autenticación, perfiles de usuario y MFA.
 *
 * @author Equipo de Desarrollo Mercador
 * @version 1.0.0
 * @since 2024
 */

import type { Factor, Session } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { APP_REDIRECT_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/env.js'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { redisService } from '../services/redis.service.js'
import { Context } from 'hono'
import { issueCsrfCookie } from '../middlewares/csrf.js'

/**
 * Interfaz que representa el perfil de un usuario en el sistema.
 * Contiene información básica del usuario obtenida de Supabase.
 */
export interface UserProfile {
  /** ID único del usuario */
  id: string
  /** Nombre completo del usuario */
  full_name: string
  /** Correo electrónico del usuario */
  email: string
  /** Rol del usuario en el sistema (cliente, admin, etc.) */
  role: string
  /** URL de la imagen de perfil del usuario (opcional) */
  image?: string
  /** URL alternativa del avatar (alias de image) */
  avatar_url?: string
  /** País de residencia del usuario (opcional) */
  country?: string,
  /** Indica si el usuario tiene autenticación de dos factores habilitada */
  two_factor_enabled?: boolean
  /** Fecha de creación del perfil (opcional) */
  created_at?: string
  /** Fecha de última actualización del perfil (opcional) */
  updated_at?: string
}

// --- Métodos de Registro e Inicio de Sesión ---

/**
 * Registra un nuevo usuario en el sistema usando email y contraseña.
 * Crea la cuenta en Supabase Auth y almacena metadatos adicionales.
 *
 * @param {string} email - Correo electrónico del usuario
 * @param {string} password - Contraseña del usuario
 * @param {object} metadata - Metadatos adicionales del usuario
 * @param {string} [metadata.full_name] - Nombre completo del usuario
 * @param {string} [metadata.country] - País de residencia (opcional)
 * @param {string} [metadata.role='cliente'] - Rol del usuario (opcional, por defecto 'cliente')
 * @returns {Promise<{data: any, error: any}>} Resultado del registro
 * @throws {Error} Si el email ya está registrado o hay un error en el registro
 */
export async function signupWithEmail(
  email: string,
  password: string,
  metadata: {
    full_name?: string
    country?: string
    role?: string
  }
) {
  // Verificar si el email ya existe y si la cuenta está eliminada
  try {
    if (supabaseAdmin === null) {
      throw new Error('Supabase admin client is not initialized')
    }
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, is_deleted')
      .eq('email', email)
      .single()

    if (existingProfile) {
      if (existingProfile.is_deleted === true) {
        throw new Error('This email is associated with a deleted account and cannot be reused')
      }
      throw new Error('Este correo ya está en uso')
    }
  } catch (err: any) {
    // Si el error es por cuenta eliminada o correo en uso, propagarlo
    if (err.message?.includes('deleted') || err.message?.includes('en uso')) {
      throw err
    }
    // Si no hay perfil (no existe), continuar con el signup
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: metadata.full_name ?? email.split('@')[0],
        country: metadata.country ?? null,
        role: metadata.role ?? 'cliente',
      },
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      throw new Error('Este correo ya está en uso')
    }
    throw new Error(`Signup failed: ${error.message}`)
  }

  if (!data.user) throw new Error('Signup failed: no user returned')

  return { data, error }
}

/**
 * Listar todos los usuarios (solo para admin)
 * @param {string} adminId - ID del usuario que solicita (debe ser admin)
 * @param {string} [accessToken] - Token de acceso opcional
 * @returns {Promise<UserProfile[]>} Lista de perfiles de usuario
 * @throws {Error} Si el usuario no es admin o hay error en la consulta
 */
export async function getAllUsers(adminId: string, accessToken?: string): Promise<UserProfile[]> {
  let client = supabase
  if (accessToken) {
    client = createSupabaseClient(accessToken)
  }
  // Verificar que el usuario sea admin
  const { data: adminProfile, error: adminError } = await client
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()
  if (adminError || !adminProfile) throw new Error('No autorizado')
  if (adminProfile.role !== 'admin') throw new Error('No autorizado')

  // Listar todos los usuarios (puedes filtrar eliminados si hay campo is_deleted)
  const { data: users, error } = await client
    .from('profiles')
    .select('id, email, full_name, role, image, country, created_at, updated_at, is_deleted')
    // .eq('is_deleted', false) // Descomenta si tienes campo is_deleted
  if (error) throw new Error('Error al obtener usuarios')
  return (users ?? []).map((u: any) => ({
    ...u,
    avatar_url: u.image,
  }))
}

/**
 * Actualizar datos de un usuario (solo admin)
 * @param {string} adminId - ID del admin
 * @param {string} userId - ID del usuario a actualizar
 * @param {Partial<UserProfile>} updateData - Datos a actualizar
 * @param {string} [accessToken] - Token de acceso opcional
 * @returns {Promise<UserProfile>} Perfil actualizado
 */
export async function adminUpdateUser(adminId: string, userId: string, updateData: Partial<UserProfile>, accessToken?: string): Promise<UserProfile> {
  // Usar siempre el cliente admin para ignorar RLS
  const client = supabaseAdmin ?? supabase;
  // Verificar admin
  const { data: adminProfile, error: adminError } = await client
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()
  if (adminError || !adminProfile) throw new Error('No autorizado')
  if (adminProfile.role !== 'admin') throw new Error('No autorizado')

  // Solo permitir actualizar campos permitidos
  const allowedFields = ['full_name', 'country', 'email']
  const filteredUpdate: Record<string, any> = {}
  for (const key of allowedFields) {
    if (updateData[key as keyof typeof updateData] !== undefined) {
      filteredUpdate[key] = updateData[key as keyof typeof updateData]
    }
  }

  // Actualizar usuario en profiles (incluyendo email)
  const { data: user, error } = await client
    .from('profiles')
    .update(filteredUpdate)
    .eq('id', userId)
    .select()
    .single()
  if (error) {
    console.error('Supabase update error:', error);
    throw new Error('Error al actualizar usuario')
  }
  return user as UserProfile
}

/**
 * Eliminar usuario (soft delete, solo admin)
 * @param {string} adminId - ID del admin
 * @param {string} userId - ID del usuario a eliminar
 * @param {string} [accessToken] - Token de acceso opcional
 * @returns {Promise<{ success: boolean }>} Resultado
 */
export async function adminDeleteUser(adminId: string, userId: string, accessToken?: string): Promise<{ success: boolean }> {
  // Use admin client when available to bypass RLS for admin operations
  const client = supabaseAdmin ?? supabase
  console.log('[user.service] adminDeleteUser starting', { adminId, userId, usingAdminClient: !!supabaseAdmin })

  // Verificar admin
  const { data: adminProfile, error: adminError } = await client
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (adminError || !adminProfile) {
    console.error('[user.service] adminDeleteUser failed to verify admin', { adminId, adminError })
    throw new Error('No autorizado')
  }
  if (adminProfile.role !== 'admin') {
    console.error('[user.service] adminDeleteUser user is not admin', { adminId, role: adminProfile.role })
    throw new Error('No autorizado')
  }

  // Soft delete: marcar is_deleted=true (ajusta si tu tabla tiene otro campo)
  try {
    console.log('[user.service] adminDeleteUser performing update', { targetUserId: userId })
    const { data, error } = await client
      .from('profiles')
      .update({ is_deleted: true })
      .eq('id', userId)
      .select()

    if (error) {
      console.error('[user.service] adminDeleteUser supabase error', { adminId, userId, error })
      // Try to include error details if present
      let details = ''
      try { details = JSON.stringify(error) } catch (_) { details = String(error) }
      throw new Error(`Error al eliminar usuario: ${details}`)
    }

    console.log('[user.service] adminDeleteUser success', { adminId, userId, updatedRows: Array.isArray(data) ? data.length : (data ? 1 : 0) })
    return { success: true }
  } catch (err: any) {
    console.error('[user.service] adminDeleteUser unexpected error', { adminId, userId, err: err && (err.stack || err.message || err) })
    throw new Error('Error al eliminar usuario')
  }
}

/**
 * Inicia sesión de un usuario usando email y contraseña.
 * Valida las credenciales con Supabase y guarda la sesión en Redis con TTL.
 * Si el usuario tiene MFA habilitado, devuelve un estado especial sin completar la sesión.
 *
 * @param {string} email - Correo electrónico del usuario
 * @param {string} password - Contraseña del usuario
 * @returns {Promise<{user: any, session: any, mfaRequired?: boolean, factorId?: string}>} Usuario y sesión de Supabase
 * @throws {Error} Si las credenciales son inválidas o hay error en el login
 */
export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw new Error(`Login failed: ${error.message}`)
  if (!data.user || !data.session)
    throw new Error('Login failed: no user/session returned')

  const { access_token, refresh_token, expires_in, user } = data.session

  // Verificar si el usuario tiene MFA habilitado
  const client = createSupabaseClient(access_token)
  const { data: aalData } = await client.auth.mfa.getAuthenticatorAssuranceLevel()

  // Verificar si tiene factores MFA verificados
  const { data: factorsData } = await client.auth.mfa.listFactors()
  const verifiedFactors = factorsData?.all?.filter((f: Factor) => f.status === 'verified') || []



  // Obtener información adicional del perfil y verificar si la cuenta está eliminada
  let enrichedUser: any = { ...data.user }
  let isDeleted = false;
  try {
    const { data: profile } = await client
      .from('profiles')
      .select('image, country, is_deleted')
      .eq('id', user.id)
      .single()

    isDeleted = profile?.is_deleted === true;

    if (profile) {
      enrichedUser = {
        ...enrichedUser,
        image: profile.image || null,
        avatar_url: profile.image || null,
        country: profile.country || null,
        two_factor_enabled: verifiedFactors.length > 0 && verifiedFactors[0].status === 'verified',
        is_deleted: profile.is_deleted || false,
      }
    }
  } catch (err: any) {
    // Ignorar errores al obtener el perfil adicional
    console.error('Error fetching profile during login:', err)
  }

  // Si la cuenta está eliminada, devolver flag especial
  if (isDeleted) {
    return {
      user: enrichedUser,
      session: null,
      mfaRequired: false,
      accountDeleted: true,
    }
  }

  // Si tiene MFA verificado pero el nivel actual es AAL1, requiere verificación adicional
  if (verifiedFactors.length > 0 && (aalData?.currentLevel === 'aal1' || aalData?.currentLevel === null)) {
    // No guardar la sesión completa en Redis aún
    // Guardar una sesión temporal con prefijo "mfa_pending:"
    await redisService.set(`mfa_pending:${access_token}`, user.id, 300) // 5 minutos para completar MFA

    return {
      user: enrichedUser,
      session: {
        ...data.session,
        user: enrichedUser,
      },
      mfaRequired: true,
      factorId: verifiedFactors[0].id,
    }
  }

  // Login completo sin MFA o MFA ya verificado
  await redisService.set(`session:${access_token}`, user.id, expires_in)
  // Guardar refresh token en Redis para validación y rotación (TTL en días)
  const refreshTtlSeconds = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7) * 24 * 60 * 60
  await redisService.set(`refresh:${refresh_token}`, user.id, refreshTtlSeconds)

  return {
    user: enrichedUser,
    session: {
      ...data.session,
      user: enrichedUser,
    },
    mfaRequired: false,
  }
}

/**
 * Iniciar sesión con Magic Link (OTP por email)
 */
export async function loginWithMagicLink(email: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: APP_REDIRECT_URL,
    },
  })

  if (error) {
    throw new Error(`Magic link login failed: ${error.message}`)
  }

  // No se devuelve sesión, solo se confirma el envío del correo.
  return { data, error }
}

// --- Métodos de Gestión de Contraseña y Recuperación ---

/**
 * Solicitar restablecimiento de contraseña.
 */
export async function requestPasswordReset(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_REDIRECT_URL}/update-password`,
  })

  if (error) {
    throw new Error(`Password reset request failed: ${error.message}`)
  }

  return { data, error }
}

/**
 * Actualizar la contraseña del usuario.
 */
export async function updatePassword(accessToken: string, newPassword: string) {
  if (accessToken) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      throw new Error(`Password update failed: ${error.message}`)
    }
    if (!data.user) {
      throw new Error('Password update failed: no user returned')
    }

    return { user: data.user, error }
  }

  throw new Error('Access token is required to update password')
}

/**
 * Refrescar sesión y actualizar Redis
 */
export async function refreshSession(refreshToken: string) {
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })
  if (error) throw new Error(error.message)

  if (data.session) {
    const { access_token, refresh_token, expires_in, user } = data.session

    // Verificar si la cuenta está eliminada antes de refrescar la sesión
    try {
      const client = createSupabaseClient(access_token)
      const { data: profile } = await client
        .from('profiles')
        .select('is_deleted')
        .eq('id', user.id)
        .single()

      if (profile?.is_deleted === true) {
        throw new Error('This account has been deleted and cannot be accessed')
      }
    } catch (err: any) {
      // Si el error es por cuenta eliminada, propagarlo
      if (err.message?.includes('deleted')) {
        throw err
      }
      // Ignorar otros errores de perfil
      console.error('Error checking profile during session refresh:', err)
    }

    await redisService.set(`session:${access_token}`, user.id, expires_in)
    // Rotate refresh token: delete old key and store new one with TTL
    try {
      await redisService.del(`refresh:${refreshToken}`)
    } catch (e) {
      // ignore
    }
    const refreshTtlSeconds = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7) * 24 * 60 * 60
    await redisService.set(`refresh:${refresh_token}`, user.id, refreshTtlSeconds)
  }

  return data.session
}



export const createSupabaseClient = (accessToken: string) => {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })
}


// --- MFA helpers ---
export type AuthError = { message: string }

export type AuthMFAEnrollTOTPResponse =
  | {
    data: {
      id: string
      type: 'totp'
      totp: {
        qr_code: string
        secret: string
        uri: string
      }
      friendly_name?: string
    }
    error: null
  }
  | {
    data: null
    error: AuthError
  }

export async function enrollMfa(accessToken: string): Promise<AuthMFAEnrollTOTPResponse> {
  const client = createSupabaseClient(accessToken)

  try {
    // Enroll un nuevo factor TOTP



    // 🔍 Listar todos los factores para este usuario
    const { data: factorsData, error: listError } = await client.auth.mfa.listFactors()
    if (listError) {
      return { data: null, error: listError }
    } else {
      const unverified = factorsData?.all?.filter(
        (f: Factor) => f.status !== "verified")

      for (const factor of unverified) {
        await client.auth.mfa.unenroll({ factorId: factor.id })
      }
    }


    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp' })

    if (error) {
      return { data: null, error }
    }


    return { data: data as any, error: null }
  } catch (err: any) {
    return { data: null, error: { message: err?.message ?? String(err) } }
  }
}

// --- Cookie helpers exported for use in routes ---
export function clearCookie(name: string, path = '/') {
  const isProduction = process.env.NODE_ENV === 'production'
  return [
    `${name}=;`,
    `HttpOnly`,
    `Path=${path}`,
    `Max-Age=0`,
    isProduction ? 'Secure' : '',
    `SameSite=Lax`
  ].filter(Boolean).join('; ')
}

export const clearSessionCookie = (): string => {
  const isProduction = process.env.NODE_ENV === 'production'
  const accessCookie = [
    `sb_access_token=;`,
    `HttpOnly`,
    `Path=/`,
    `Max-Age=0`,
    isProduction ? 'Secure' : '',
    `SameSite=Lax`
  ].filter(Boolean).join('; ')

  const refreshCookie = [
    `sb_refresh_token=;`,
    `HttpOnly`,
    `Path=/auth`,
    `Max-Age=0`,
    isProduction ? 'Secure' : '',
    `SameSite=Lax`
  ].filter(Boolean).join('; ')

  const csrf = issueCsrfCookie()
  return [accessCookie, refreshCookie, csrf].join(', ')
}



// --- Métodos de Gestión de Perfil ---

/**
 * Obtiene el perfil completo de un usuario desde la base de datos.
 * Incluye información básica del usuario y metadatos adicionales.
 *
 * @param {string} userId - ID único del usuario
 * @param {string} [accessToken] - Token de acceso opcional para autenticación
 * @returns {Promise<UserProfile>} Perfil del usuario con todos sus datos
 * @throws {Error} Si el usuario no existe o hay error en la consulta
 */
export async function getUserById(userId: string, accessToken?: string): Promise<UserProfile> {
  let client = supabase
  if (accessToken) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    })
  }

  const { data: profile, error } = await client
    .from('profiles')
    .select('id, email, full_name, role, image, country, created_at, updated_at')
    .eq('id', userId)
    .single()

  if (error || !profile) throw new Error(JSON.stringify(error) || 'User not found')

  // Verificar si tiene MFA habilitado
  let two_factor_enabled = false
  if (accessToken) {
    try {
      const { data: factorsData } = await client.auth.mfa.listFactors()
      two_factor_enabled = factorsData?.all?.[0]?.status === 'verified'
    } catch (err) {
      // Ignorar errores al obtener factores MFA
    }
  }

  return {
    ...profile,
    avatar_url: profile.image,
    two_factor_enabled,
  } as UserProfile
}

/**
 * Actualizar perfil de usuario
 */
export async function updateUser(
  userId: string,
  updateData: Partial<{
    full_name: string
    address: string
    city: string
    country: string
  }>,
  accessToken?: string
): Promise<UserProfile> {
  let client = supabase
  if (accessToken) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    })
  }

  const { data: user, error } = await client
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
    .select()
    .single()

  if (error) throw new Error(`Update failed: ${error.message}`)
  if (!user) throw new Error('Update failed: user not found')

  return user as UserProfile
}

/**
 * Actualizar el perfil de usuario, incluyendo la subida de avatar
 * Opcionalmente recibe un accessToken para usar un cliente autenticado
 */
export async function updateUserProfile(
  userId: string,
  profileData: Partial<{ full_name?: string; country?: string; image_file?: any }>,
  accessToken?: string
) {
  // Cliente para operaciones en tablas (autenticado si hay token)
  let client = supabase
  if (accessToken) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
  }

  const { full_name, country, image_file } = profileData
  const updatePayload: { [key: string]: any } = {}

  if (full_name) updatePayload.full_name = full_name
  if (country) updatePayload.country = country

  // Subida de avatar (similar a lógica de productos: soporta File/Buffer o data URL)
  try {
    if (image_file) {
      // Caso data URL (string base64)
      if (typeof image_file === 'string' && image_file.startsWith('data:')) {
        const match = image_file.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
        if (match) {
          const mime = match[1]
          const b64 = match[2]
          const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png'
          const buffer = Buffer.from(b64, 'base64')
          const fileName = `avatars/${userId}/${Date.now()}.${ext}`
          const primary = supabaseAdmin ?? client
          const { error: uploadError } = await primary.storage
            .from('images')
            .upload(fileName, buffer, { cacheControl: '3600', upsert: true })
          if (uploadError) throw uploadError
          const publicUrlResult: any = primary.storage.from('images').getPublicUrl(fileName)
          const publicUrl = (publicUrlResult && publicUrlResult.data && (publicUrlResult.data.publicUrl || publicUrlResult.data.public_url)) || publicUrlResult?.publicURL || publicUrlResult?.publicUrl
          updatePayload.image = publicUrl
        }
      } else if (image_file?.size > 0 || image_file instanceof Buffer) {
        // Caso File / Buffer (Node o navegador)
        const namePart = typeof (image_file as any).name === 'string' ? (image_file as any).name : 'avatar.png'
        const ext = namePart.includes('.') ? namePart.split('.').pop() : 'png'
        const fileName = `avatars/${userId}/${Date.now()}.${ext}`
        const storageClient = accessToken ? client : (supabaseAdmin ?? client)
        const body = image_file instanceof Buffer ? image_file : image_file
        const { error: uploadError } = await storageClient.storage
          .from('images')
          .upload(fileName, body, { cacheControl: '3600', upsert: true })
        if (uploadError) throw uploadError
        const publicUrlResult: any = storageClient.storage.from('images').getPublicUrl(fileName)
        const publicUrl = (publicUrlResult && publicUrlResult.data && (publicUrlResult.data.publicUrl || publicUrlResult.data.public_url)) || publicUrlResult?.publicURL || publicUrlResult?.publicUrl
        updatePayload.image = publicUrl
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to upload avatar', err)
    let details = ''
    try {
      if (err instanceof Error) details = err.message || String(err)
      else details = JSON.stringify(err)
    } catch {
      details = String(err)
    }
    throw new Error(`Failed to upload avatar: ${details}`)
  }

  if (Object.keys(updatePayload).length === 0) {
    const { data: existingProfile, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) throw new Error(`Failed to fetch profile: ${error.message}`)
    return existingProfile
  }

  const primary = supabaseAdmin ?? client
  try {
    const { data, error } = await primary
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  } catch (err) {
    let details = ''
    try {
      if (err instanceof Error) details = err.message || String(err)
      else details = JSON.stringify(err)
    } catch { details = String(err) }
    // eslint-disable-next-line no-console
    console.error('Failed to update profile', { userId, details })
    throw new Error(`Failed to update profile: ${details}`)
  }
}


// --- Métodos de Manejo de Cuenta (Soft Delete y Restaurar) ---

/**
 * Marca la cuenta del usuario como eliminada (soft delete, is_deleted=true)
 * @param {string} userId - ID del usuario autenticado
 * @param {string} [accessToken] - Token de acceso opcional
 * @returns {Promise<{ success: boolean }>} Resultado
 */
export async function softDeleteUser(userId: string, accessToken?: string): Promise<{ success: boolean }> {
  let client = supabase
  if (accessToken) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
  }
  try {
    const primary = supabaseAdmin ?? client
    const { error, data } = await primary
      .from('profiles')
      .update({ is_deleted: true })
      .eq('id', userId)

    if (error) {
      console.error('[user.service] softDeleteUser supabase error', { userId, error })
      throw new Error(`Error al eliminar la cuenta: ${error?.message || JSON.stringify(error)}`)
    }

    console.log('[user.service] softDeleteUser success', { userId, updated: !!data })
    return { success: true }
  } catch (err: any) {
    console.error('[user.service] softDeleteUser unexpected error', { userId, err: err && (err.stack || err.message || err) })
    throw err
  }
}

/**
 * Restaura la cuenta del usuario (is_deleted=false)
 * @param {string} userId - ID del usuario autenticado
 * @param {string} [accessToken] - Token de acceso opcional
 * @returns {Promise<{ success: boolean }>} Resultado
 */
export async function restoreUser(userId: string, accessToken?: string): Promise<{ success: boolean }> {
  let client = supabase
  if (accessToken) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
  }
  const primary = supabaseAdmin ?? client
  const { error } = await primary
    .from('profiles')
    .update({ is_deleted: false })
    .eq('id', userId)
  if (error) throw new Error('Error al restaurar la cuenta')
  return { success: true }
}

// --- Métodos de Manejo de Sesión ---

/**
 * Obtener la sesión activa del usuario, validando con Redis
 */
export async function getSession(accessToken: string) {
  // Validar contra Redis
  const exists = await redisService.exists(`session:${accessToken}`)
  if (!exists) return null

  // If an access token is provided, validate it directly with Supabase
  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (error) throw new Error(`Could not validate access token: ${error.message}`)
    if (!data?.user) return null

    // Return a minimal session-like object containing the access token and user
    return {
      access_token: accessToken,
      refresh_token: null,
      expires_in: null,
      user: data.user,
    }
  }

  // Fallback: get the current session from the Supabase client (uses server-side stored session)
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(`Could not get session: ${error.message}`)

  return data.session
}

/**
 * Obtener los datos del usuario autenticado actualmente.
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw new Error(`Could not get user: ${error.message}`)
  }

  return data.user
}

/**
 * Cerrar la sesión del usuario actual, limpiando Redis
 */
export async function signOut(accessToken?: string) {
  if (accessToken) {
    await redisService.del(`session:${accessToken}`)
  }

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(`Sign out failed: ${error.message}`)
  }
}

/**
 * Revoca (elimina) un refresh token almacenado en Redis (best-effort)
 */
export async function revokeRefreshToken(refreshToken: string) {
  try {
    await redisService.del(`refresh:${refreshToken}`)
  } catch (e) {
    // no hace falta fallar si Redis no está disponible
  }
}

/**
 * Escuchar cambios en el estado de autenticación (login, logout, etc).
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback)

  return subscription
}

/**
 * Obtener usuario a partir de un access_token (usado por el callback OAuth)
 * Incluye información adicional del perfil (imagen, país) y estado de MFA
 */
export async function getUserByAccessToken(access_token: string) {
  const client = createSupabaseClient(access_token)
  const { data: authData, error } = await client.auth.getUser()

  if (error || !authData?.user) {
    return { data: authData, error }
  }

  try {
    // Obtener información adicional del perfil
    const { data: profile } = await client
      .from('profiles')
      .select('image, country, is_deleted')
      .eq('id', authData.user.id)
      .single()

    // Verificar si la cuenta está eliminada
    if (profile?.is_deleted === true) {
      return {
        data: null,
        error: new Error('This account has been deleted and cannot be accessed'),
      }
    }

    // Verificar si tiene MFA habilitado
    const { data: factorsData } = await client.auth.mfa.listFactors()
    const hasVerifiedMFA = factorsData?.all?.[0]?.status === 'verified'

    // Enriquecer el objeto user con la información adicional
    const enrichedUser = {
      ...authData.user,
      image: profile?.image || null,
      avatar_url: profile?.image || null,
      country: profile?.country || null,
      two_factor_enabled: hasVerifiedMFA,
      is_deleted: profile?.is_deleted || false,
    }

    return {
      data: { user: enrichedUser },
      error: null,
    }
  } catch (err: any) {
    // Si el error es por cuenta eliminada, propagarlo
    if (err.message?.includes('deleted')) {
      return { data: null, error: err }
    }
    // Si falla la consulta adicional, retornar solo los datos de auth
    console.error('Error fetching additional user data:', err)
    return { data: authData, error: null }
  }
}


export const verifyMFA = async (
  accessToken: string,
  factorId: string,
  code: string
) => {
  const client = createSupabaseClient(accessToken)

  // Paso 1: crear challenge
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId })
  if (challengeError) return { data: null, error: challengeError }

  // Paso 2: verificar challenge con el código TOTP
  const { data: verified, error: verifyError } = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })

  return { data: verified, error: verifyError }
}

/**
 * Unenroll (eliminar) un factor MFA del usuario
 */
export const unenrollMFA = async (accessToken: string, factorId: string) => {
  const client = createSupabaseClient(accessToken)

  const { data, error } = await client.auth.mfa.unenroll({ factorId })
  if (error) return { data: null, error }

  return { data, error: null }
}

/**
 * Listar todos los factores MFA del usuario
 */
export const listMFAFactors = async (accessToken: string) => {
  const client = createSupabaseClient(accessToken)

  const { data, error } = await client.auth.mfa.listFactors()
  if (error) return { data: null, error }

  return { data, error: null }
}

/**
 * Obtener el nivel de autenticación del usuario (AAL1 o AAL2)
 * AAL2 significa que el usuario completó MFA
 */
export const getAuthenticatorAssuranceLevel = async (accessToken: string) => {
  const client = createSupabaseClient(accessToken)

  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) return { data: null, error }

  return { data, error: null }
}

/**
 * Completar el login después de verificar MFA
 * Mueve la sesión de "mfa_pending" a "session" en Redis
 */
export const completeMFALogin = async (newAccessToken: string, refreshToken: string, userId: string, expiresIn: number, originalTempToken: string) => {
  // TEMPORAL: Skip Redis verification in development
  if (process.env.NODE_ENV === 'development') {
    // Solo guardar la nueva sesión, skip verificación pendiente
    await redisService.set(`session:${newAccessToken}`, userId, expiresIn)

    const refreshTtlSeconds = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7) * 24 * 60 * 60
    await redisService.set(`refresh:${refreshToken}`, userId, refreshTtlSeconds)

    return { success: true }
  }

  // Código original para producción
  const pendingExists = await redisService.exists(`mfa_pending:${originalTempToken}`)
  if (!pendingExists) {
    throw new Error('No pending MFA session found or session expired')
  }

  await redisService.del(`mfa_pending:${originalTempToken}`)
  await redisService.set(`session:${newAccessToken}`, userId, expiresIn)

  const refreshTtlSeconds = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7) * 24 * 60 * 60
  await redisService.set(`refresh:${refreshToken}`, userId, refreshTtlSeconds)

  return { success: true }
}

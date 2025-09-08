import type { Factor, Session } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { APP_REDIRECT_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/env.js'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { redisService } from '../services/redis.service.js'
import { Context } from 'hono'
import { issueCsrfCookie } from '../middlewares/csrf.js'

/**
 * Tipo de perfil de usuario
 */
export interface UserProfile {
  id: string
  full_name: string
  email: string
  role: string
  image?: string
  country?: string
  created_at?: string
  updated_at?: string
}

// --- Métodos de Registro e Inicio de Sesión ---

/**
 * Registro con email y contraseña
 */
export async function signupWithEmail(
  email: string,
  password: string,
  metadata: {
    full_name: string
    country?: string
    role?: string
  }
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: metadata.full_name,
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
 * Login con email y contraseña
 * Guarda la sesión en Redis con TTL
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

  // Guardar sesión en Redis con TTL
  await redisService.set(`session:${access_token}`, user.id, expires_in)
  // Guardar refresh token en Redis para validación y rotación (TTL en días)
  const refreshTtlSeconds = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7) * 24 * 60 * 60
  await redisService.set(`refresh:${refresh_token}`, user.id, refreshTtlSeconds)

  return {
    user: data.user,
    session: data.session,
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
export async function updatePassword(newPassword: string) {
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
 * Obtener perfil desde la tabla profiles
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
    .select('id, email, full_name, role, image, created_at, updated_at')
    .eq('id', userId)
    .single()

  if (error || !profile) throw new Error('User not found')

  return profile as UserProfile
}

/**
 * Actualizar perfil de usuario
 */
export async function updateUser(
  userId: string,
  updateData: Partial<{
    full_name: string
    phone: string
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
 */
export async function getUserByAccessToken(access_token: string) {
  const { data, error } = await supabase.auth.getUser(access_token)
  return { data, error }
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

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export type BiometricMethod = 'webauthn' | 'pin'

export interface BiometricAuthResult {
  success: boolean
  method: BiometricMethod | 'none'
  error?: string
}

/**
 * 生物识别验证 Hook
 * 支持 WebAuthn（指纹/Face ID）和 PIN 码两种方式
 */
export function useBiometricAuth() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 检查浏览器是否支持 WebAuthn
   */
  const supportsWebAuthn = useCallback((): boolean => {
    return !!window.PublicKeyCredential
  }, [])

  /**
   * 检查员工是否已注册 WebAuthn
   */
  const hasWebAuthnRegistered = useCallback(async (
    employeeId: string
  ): Promise<boolean> => {
    try {
      const { count, error } = await supabase
        .from('employee_biometrics')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', employeeId)
        .eq('biometric_type', 'webauthn')
        .eq('is_active', true)

      if (error) return false
      return (count || 0) > 0
    } catch {
      return false
    }
  }, [])

  /**
   * 注册 WebAuthn 凭证（首次设置）
   */
  const registerWebAuthn = useCallback(async (
    employeeId: string,
    employeeName: string
  ): Promise<BiometricAuthResult> => {
    setLoading(true)
    setError(null)

    try {
      if (!supportsWebAuthn()) {
        return {
          success: false,
          method: 'none',
          error: '您的设备不支持指纹/Face ID 验证。请使用 PIN 码。'
        }
      }

      // 1. 生成挑战码
      const challenge = crypto.getRandomValues(new Uint8Array(32))

      // 2. 调用 WebAuthn API 创建凭证
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'ULTRA POS - 家傳芋曉',
            id: window.location.hostname
          },
          user: {
            id: new TextEncoder().encode(employeeId),
            name: employeeId,
            displayName: employeeName
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },  // ES256
            { type: 'public-key', alg: -257 } // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // 使用设备内置指纹/Face ID
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000,
          attestation: 'none'
        }
      }) as PublicKeyCredential

      if (!credential) {
        return {
          success: false,
          method: 'none',
          error: '注册失败，请重试。'
        }
      }

      // 3. 提取凭证信息
      const response = credential.response as AuthenticatorAttestationResponse
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)))
      const publicKey = btoa(String.fromCharCode(...new Uint8Array(response.getPublicKey!())))

      // 4. 存储到数据库
      const { error: insertError } = await supabase
        .from('employee_biometrics')
        .insert([{
          employee_id: employeeId,
          biometric_type: 'webauthn',
          credential_id: credentialId,
          public_key: publicKey,
          device_name: navigator.userAgent.slice(0, 100),
          is_active: true
        }])

      if (insertError) throw insertError

      return { success: true, method: 'webauthn' }

    } catch (err: any) {
      const errorMsg = err?.message || '指纹/Face ID 注册失败'
      setError(errorMsg)
      return { success: false, method: 'none', error: errorMsg }
    } finally {
      setLoading(false)
    }
  }, [supportsWebAuthn])

  /**
   * 使用 WebAuthn 验证身份（弹窗式生物识别）
   * 注意：完整 WebAuthn 验证需要后端配合验证签名，
   * 此处使用简化方案——弹窗让用户确认指纹/Face ID
   */
  const verifyWebAuthn = useCallback(async (
    employeeId: string
  ): Promise<BiometricAuthResult> => {
    setLoading(true)
    setError(null)

    try {
      if (!supportsWebAuthn()) {
        return {
          success: false,
          method: 'none',
          error: '设备不支持指纹/Face ID。'
        }
      }

      // 检查是否已注册
      const { data: biometrics } = await supabase
        .from('employee_biometrics')
        .select('credential_id, public_key')
        .eq('employee_id', employeeId)
        .eq('biometric_type', 'webauthn')
        .eq('is_active', true)
        .single()

      if (!biometrics) {
        return {
          success: false,
          method: 'none',
          error: '未注册指纹/Face ID。'
        }
      }

      // 使用 WebAuthn 获取断言（弹窗让用户按指纹/扫脸）
      const challenge = crypto.getRandomValues(new Uint8Array(32))

      // 解码 credential_id
      const credentialIdBytes = Uint8Array.from(
        atob(biometrics.credential_id),
        c => c.charCodeAt(0)
      )

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{
            id: credentialIdBytes,
            type: 'public-key'
          }],
          userVerification: 'required',
          timeout: 30000
        }
      })

      if (assertion) {
        return { success: true, method: 'webauthn' }
      } else {
        return {
          success: false,
          method: 'webauthn',
          error: '指纹/Face ID 验证未通过。'
        }
      }

    } catch (err: any) {
      // 用户取消也算失败
      if (err?.name === 'NotAllowedError') {
        return {
          success: false,
          method: 'webauthn',
          error: '指纹/Face ID 验证被取消。'
        }
      }
      const errorMsg = err?.message || '指纹/Face ID 验证失败'
      setError(errorMsg)
      return { success: false, method: 'webauthn', error: errorMsg }
    } finally {
      setLoading(false)
    }
  }, [supportsWebAuthn])

  /**
   * 注册/更改 PIN 码
   */
  const setPIN = useCallback(async (
    employeeId: string,
    pin: string
  ): Promise<BiometricAuthResult> => {
    setLoading(true)
    setError(null)

    try {
      if (pin.length < 4) {
        return {
          success: false,
          method: 'pin',
          error: 'PIN 码至少需要 4 位数字。'
        }
      }

      // 检查是否为简单密码
      if (isSimplePIN(pin)) {
        return {
          success: false,
          method: 'pin',
          error: '请勿使用过于简单的 PIN 码（如 1234、0000）。'
        }
      }

      // 生成随机盐值
      const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      // 前端哈希
      const hash = await hashPIN(pin, salt)

      // 删除旧的 PIN，插入新的（upsert）
      const { error: deleteError } = await supabase
        .from('employee_biometrics')
        .delete()
        .eq('employee_id', employeeId)
        .eq('biometric_type', 'pin')

      if (deleteError) throw deleteError

      const { error: insertError } = await supabase
        .from('employee_biometrics')
        .insert([{
          employee_id: employeeId,
          biometric_type: 'pin',
          pin_hash: hash,
          pin_salt: salt,
          is_active: true
        }])

      if (insertError) throw insertError

      return { success: true, method: 'pin' }

    } catch (err: any) {
      const errorMsg = err?.message || 'PIN 码设置失败'
      setError(errorMsg)
      return { success: false, method: 'pin', error: errorMsg }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * 验证 PIN 码
   */
  const verifyPIN = useCallback(async (
    employeeId: string,
    pin: string
  ): Promise<BiometricAuthResult> => {
    setLoading(true)
    setError(null)

    try {
      // 获取存储的 PIN 哈希
      const { data, error: fetchError } = await supabase
        .from('employee_biometrics')
        .select('pin_hash, pin_salt')
        .eq('employee_id', employeeId)
        .eq('biometric_type', 'pin')
        .eq('is_active', true)
        .single()

      if (fetchError || !data) {
        return {
          success: false,
          method: 'pin',
          error: '未设置 PIN 码，请联系管理员。'
        }
      }

      // 验证哈希
      const hashedInput = await hashPIN(pin, data.pin_salt)

      if (hashedInput === data.pin_hash) {
        return { success: true, method: 'pin' }
      } else {
        return {
          success: false,
          method: 'pin',
          error: 'PIN 码错误，请重试。'
        }
      }

    } catch (err: any) {
      const errorMsg = err?.message || 'PIN 验证失败'
      setError(errorMsg)
      return { success: false, method: 'pin', error: errorMsg }
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    supportsWebAuthn,
    hasWebAuthnRegistered,
    registerWebAuthn,
    verifyWebAuthn,
    setPIN,
    verifyPIN
  }
}

// ============ 辅助函数 ============

/**
 * SHA-256 哈希 PIN 码
 */
async function hashPIN(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 检查是否为简单 PIN 码
 */
function isSimplePIN(pin: string): boolean {
  // 相同数字：0000, 1111
  if (new Set(pin).size === 1) return true
  // 连续递增：1234, 2345
  const nums = pin.split('').map(Number)
  let asc = true, desc = true
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) asc = false
    if (nums[i] !== nums[i - 1] - 1) desc = false
  }
  if (asc || desc) return true
  // 常见密码：1111, 1234, 0000, 1212
  const common = ['0000', '1111', '1234', '1212', '2222', '3333']
  if (common.includes(pin)) return true
  return false
}

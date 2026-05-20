import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface LocationInfo {
  latitude: number
  longitude: number
  accuracy: number
  wifiSSID?: string
}

export interface LocationVerificationResult {
  verified: boolean
  location?: LocationInfo
  distance?: number
  error?: string
}

/**
 * GPS 地理位置验证 Hook
 * 确保员工在店铺范围内打卡
 */
export function useLocationVerification() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 获取当前 GPS 位置
   */
  const getCurrentPosition = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('浏览器不支持地理位置功能'))
        return
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,  // 高精度模式
        timeout: 10000,            // 10 秒超时
        maximumAge: 0              // 强制获取最新位置（不使用缓存）
      })
    })
  }, [])

  /**
   * 计算两个经纬度之间的距离（Haversine 公式）
   * @returns 距离（公尺）
   */
  const calculateDistance = useCallback((
    lat1: number, lng1: number,
    lat2: number, lng2: number
  ): number => {
    const R = 6371000  // 地球半径（公尺）
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }, [])

  /**
   * 从数据库获取店铺位置信息
   */
  const getStoreLocation = useCallback(async (restaurantId: string) => {
    // 优先从 store_locations 表读取
    const { data: storeData, error: storeError } = await supabase
      .from('store_locations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)

    if (!storeError && storeData && storeData.length > 0) {
      return storeData[0]
    }

    // 降级：从 settings 表读取
    const { data: settings } = await supabase
      .from('settings')
      .select('setting_value')
      .eq('setting_key', 'store_location')
      .eq('restaurant_id', restaurantId)
      .single()

    if (settings?.setting_value) {
      try {
        const parsed = JSON.parse(settings.setting_value)
        return {
          latitude: parsed.lat,
          longitude: parsed.lng,
          allowed_radius: parsed.radius || 200,
          location_name: '总店'
        }
      } catch {
        return null
      }
    }

    return null
  }, [])

  /**
   * 验证员工是否在店铺范围内
   * @returns 验证结果
   */
  const verifyStoreLocation = useCallback(async (
    restaurantId: string
  ): Promise<LocationVerificationResult> => {
    setLoading(true)
    setError(null)

    try {
      // 1. 获取店铺位置配置
      const storeLocation = await getStoreLocation(restaurantId)

      if (!storeLocation) {
        // 没有配置位置，跳过验证
        return { verified: true }
      }

      // 2. 获取当前 GPS 位置
      let position: GeolocationPosition
      try {
        position = await getCurrentPosition()
      } catch (gpsErr: any) {
        if (gpsErr.code === 1) {
          // PERMISSION_DENIED
          return {
            verified: false,
            error: '需要允许地理位置权限才能打卡。请在浏览器设置中允许位置访问。'
          }
        }
        if (gpsErr.code === 2) {
          // POSITION_UNAVAILABLE
          return {
            verified: false,
            error: '无法获取位置信息，请在开阔位置重试。'
          }
        }
        // TIMEOUT
        return {
          verified: false,
          error: '获取位置超时，请检查 GPS 是否开启后重试。'
        }
      }

      const userLat = position.coords.latitude
      const userLng = position.coords.longitude
      const accuracy = position.coords.accuracy

      // 3. 检查 GPS 精度（精度太差可能是模拟的）
      if (accuracy > 100) {
        return {
          verified: false,
          location: { latitude: userLat, longitude: userLng, accuracy },
          error: `GPS 精度不足（${Math.round(accuracy)} 公尺），请在开阔位置重试。`
        }
      }

      const locationInfo: LocationInfo = {
        latitude: userLat,
        longitude: userLng,
        accuracy
      }

      // 4. 计算距离
      const distance = calculateDistance(
        userLat, userLng,
        storeLocation.latitude, storeLocation.longitude
      )

      const allowedRadius = storeLocation.allowed_radius || 200

      // 5. 验证距离
      if (distance > allowedRadius) {
        return {
          verified: false,
          location: locationInfo,
          distance: Math.round(distance),
          error: `您距离店铺约 ${Math.round(distance)} 公尺，请在店铺 ${allowedRadius} 公尺范围内打卡。`
        }
      }

      // 验证通过
      return {
        verified: true,
        location: locationInfo,
        distance: Math.round(distance)
      }

    } catch (err: any) {
      const errorMsg = err?.message || '位置验证失败'
      setError(errorMsg)
      return { verified: false, error: errorMsg }
    } finally {
      setLoading(false)
    }
  }, [getCurrentPosition, calculateDistance, getStoreLocation])

  return {
    loading,
    error,
    verifyStoreLocation,
    getCurrentPosition,
    calculateDistance,
    getStoreLocation
  }
}

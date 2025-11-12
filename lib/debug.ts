// lib/debug.ts
import { supabase } from './supabase'

export async function logDebug(location: string, payload: any, note: string | null = null) {
  try {
    // минимизируем размер: если payload слишком большой, можно JSON.stringify с обрезкой
    await supabase
      .from('debug_logs')
      .insert([{ location, note, payload }])
  } catch (err) {
    // не ломаем приложение из-за логов
    // eslint-disable-next-line no-console
    console.warn('logDebug failed', err)
  }
}

// pages/api/upload-avatar-base64.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error: 'Method not allowed' })
  try {
    const { telegram_id, filename, mime, b64 } = req.body || {}
    if (!telegram_id || !b64) return res.status(400).json({ ok:false, error: 'telegram_id and b64 required' })

    // decode base64
    const buffer = Buffer.from(b64, 'base64')
    const ext = (filename || 'img').split('.').pop() || 'png'
    const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
    const filePath = `${telegram_id}/${Date.now()}.${safeExt}`

    const { error: uploadError } = await supabaseAdmin.storage.from('avatars').upload(filePath, buffer, {
      contentType: mime || 'application/octet-stream',
      upsert: true
    })
    if (uploadError) {
      return res.status(500).json({ ok:false, error: uploadError.message })
    }

    // update DB
    const maybeNum = Number(telegram_id)
    const upd = !Number.isNaN(maybeNum)
      ? await supabaseAdmin.from('users').update({ avatar_url: filePath }).eq('telegram_id', maybeNum)
      : await supabaseAdmin.from('users').update({ avatar_url: filePath }).eq('telegram_id_text', telegram_id)

    if (upd.error) return res.status(200).json({ ok:true, path: filePath, warning: 'uploaded_but_db_update_failed' })

    const publicRes = supabaseAdmin.storage.from('avatars').getPublicUrl(filePath) as any
    const publicURL = publicRes?.publicURL ?? publicRes?.publicUrl ?? null

    return res.status(200).json({ ok:true, path: filePath, publicURL })
  } catch (e: any) {
    console.error('upload-avatar-base64 error', e)
    return res.status(500).json({ ok:false, error: e?.message || 'Server error' })
  }
}

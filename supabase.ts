import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wtmyscaixrvfoyowqgjb.supabase.co'
const supabaseKey = 'sb_publishable_j2ugXfugKDEqlGRZYTKBCQ_P5Crt1p7'

export const supabase = createClient(supabaseUrl, supabaseKey)

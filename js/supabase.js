import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = "https://kcddvlfdiudsrrrumshz.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZGR2bGZkaXVkc3JycnVtc2h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Njg4NDcsImV4cCI6MjA5NjU0NDg0N30.6KqYKbHmYJIdZQBi1RPsyxgjpqUSsXB7AUCu7TeB4Ks"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Ажиллаж байгааг шалгах тест
if (supabase.auth) {
    console.log("Supabase амжилттай холбогдлоо!");
}

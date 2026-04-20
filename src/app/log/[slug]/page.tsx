import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LogForm } from './log-form'

export default async function LogPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: symptom } = await supabase
    .from('symptoms')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (!symptom) notFound()

  return <LogForm symptom={symptom} userId={user.id} />
}
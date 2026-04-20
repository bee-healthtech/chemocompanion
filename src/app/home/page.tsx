import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user has completed onboarding
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at, display_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.onboarding_completed_at) {
    redirect('/onboarding')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">
          Welcome back, {profile.display_name}
        </h1>
        <p className="text-gray-600 mb-2">
          You are signed in as <strong>{user.email}</strong>
        </p>
        <p className="text-sm text-gray-500 mt-4">
          (Dashboard coming next — log a symptom, view timeline, generate PDF.)
        </p>
      </div>
    </main>
  )
}
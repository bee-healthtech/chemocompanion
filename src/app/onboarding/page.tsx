'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [infusionDate, setInfusionDate] = useState('')
  const [cycleLengthDays, setCycleLengthDays] = useState<string>('21')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Not signed in — please refresh and try again.')
      setSubmitting(false)
      return
    }

    // 1. Create profile
    const cycleLength = cycleLengthDays === 'irregular' ? null : parseInt(cycleLengthDays, 10)
    const { error: profileError } = await supabase.from('profiles').insert({
      id: user.id,
      display_name: displayName,
      cycle_length_days: cycleLength,
      onboarding_completed_at: new Date().toISOString(),
    })

    if (profileError) {
      setError(`Could not save profile: ${profileError.message}`)
      setSubmitting(false)
      return
    }

    // 2. Create first infusion record
    const { error: infusionError } = await supabase.from('infusions').insert({
      user_id: user.id,
      infusion_date: infusionDate,
      cycle_number: 1,
      cycle_length_days: cycleLength,
    })

    if (infusionError) {
      setError(`Could not save infusion: ${infusionError.message}`)
      setSubmitting(false)
      return
    }

    // 3. Log activation event
    await supabase.from('activation_events').insert({
      user_id: user.id,
      event_type: 'onboarding_complete',
    })

    router.push('/home')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border">
        <h1 className="text-2xl font-bold mb-2">Welcome to ChemoCompanion</h1>
        <p className="text-gray-600 mb-6">
          A few quick questions so the app can organize your symptoms around your treatment cycle.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              What should we call you?
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="First name or nickname"
              disabled={submitting}
            />
          </div>

          <div>
            <label
              htmlFor="infusionDate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              When was your most recent chemotherapy treatment?
            </label>
            <input
              id="infusionDate"
              type="date"
              required
              value={infusionDate}
              onChange={(e) => setInfusionDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={submitting}
            />
            <p className="text-xs text-gray-500 mt-1">
              Use today if you had treatment today.
            </p>
          </div>

          <div>
            <label
              htmlFor="cycleLength"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              How often do you have treatment?
            </label>
            <select
              id="cycleLength"
              value={cycleLengthDays}
              onChange={(e) => setCycleLengthDays(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={submitting}
            >
              <option value="7">Every week</option>
              <option value="14">Every 2 weeks</option>
              <option value="21">Every 3 weeks</option>
              <option value="28">Every 4 weeks</option>
              <option value="irregular">Irregular / I&apos;m not sure</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting || !displayName || !infusionDate}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : 'Get started'}
          </button>

          {error && (
            <p className="text-red-700 text-sm">{error}</p>
          )}
        </form>

        <p className="text-xs text-gray-500 mt-6">
          Your data stays in Canada. We never share it. You can export or delete it anytime.
        </p>
      </div>
    </main>
  )
}
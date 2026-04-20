'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

    await supabase.from('activation_events').insert({
      user_id: user.id,
      event_type: 'onboarding_complete',
    })

    router.push('/home')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to ChemoCompanion</CardTitle>
          <CardDescription>
            A few quick questions so the app can organize your symptoms around
            your treatment cycle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">What should we call you?</Label>
              <Input
                id="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="First name or nickname"
                disabled={submitting}
                suppressHydrationWarning
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="infusionDate">
                When was your most recent chemotherapy treatment?
              </Label>
              <Input
                id="infusionDate"
                type="date"
                required
                value={infusionDate}
                onChange={(e) => setInfusionDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                disabled={submitting}
                suppressHydrationWarning
              />
              <p className="text-xs text-muted-foreground">
                Use today if you had treatment today.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycleLength">
                How often do you have treatment?
              </Label>
              <Select
                value={cycleLengthDays}
                onValueChange={setCycleLengthDays}
                disabled={submitting}
              >
                <SelectTrigger id="cycleLength" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Every week</SelectItem>
                  <SelectItem value="14">Every 2 weeks</SelectItem>
                  <SelectItem value="21">Every 3 weeks</SelectItem>
                  <SelectItem value="28">Every 4 weeks</SelectItem>
                  <SelectItem value="irregular">
                    Irregular / I&apos;m not sure
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={submitting || !displayName || !infusionDate}
              className="w-full"
            >
              {submitting ? 'Saving...' : 'Get started'}
            </Button>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            Your data stays in Canada. We never share it. You can export or
            delete it anytime.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
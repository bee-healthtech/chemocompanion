import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check onboarding state
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at, cycle_length_days')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.onboarding_completed_at) {
    redirect('/onboarding')
  }

  // Get most recent infusion for cycle-day calculation
  const { data: latestInfusion } = await supabase
    .from('infusions')
    .select('infusion_date, cycle_number')
    .eq('user_id', user.id)
    .order('infusion_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Calculate cycle day
  let cycleDay: number | null = null
  let cycleNumber: number | null = null
  if (latestInfusion) {
    const infusionDate = new Date(latestInfusion.infusion_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    infusionDate.setHours(0, 0, 0, 0)
    const diffMs = today.getTime() - infusionDate.getTime()
    cycleDay = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
    cycleNumber = latestInfusion.cycle_number
  }

  // Get all symptoms for the picker
  const { data: symptoms } = await supabase
    .from('symptoms')
    .select('slug, patient_label, patient_description, tier, red_flag_rule')
    .order('display_order', { ascending: true })

  const tier1Symptoms = symptoms?.filter(s => s.tier === 1) ?? []
  const tier2Symptoms = symptoms?.filter(s => s.tier === 2) ?? []
  const tier3Symptoms = symptoms?.filter(s => s.tier === 3) ?? []

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header with cycle context */}
        <section className="mb-2">
  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
        Hi, {profile.display_name}
      </h1>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {cycleDay && (
          <span className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700">
            Cycle {cycleNumber} · Day {cycleDay}
          </span>
        )}

        <span className="text-sm text-slate-500">
          Log symptoms in under 15 seconds.
        </span>
      </div>
    </div>
  </div>
</section>

        {/* Symptom picker — Tier 1 (core) */}
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-slate-900">
  How are you feeling today?
</CardTitle>
            <CardDescription className="text-slate-500 text-base">
  Pick any symptom to log. You can log as many as you like.
</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tier1Symptoms.map(symptom => (
              <Link
                key={symptom.slug}
                href={`/log/${symptom.slug}`}
                className="group block"
              >
               <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-5 transition-all hover:border-teal-300 hover:shadow-sm">
    
    <div className="flex flex-col">
      <p className="text-xl font-medium text-slate-900">
        {symptom.patient_label}
      </p>

      {symptom.patient_description && (
        <p className="mt-1 text-base text-slate-500">
          {symptom.patient_description}
        </p>
      )}
    </div> 
                  <span className="text-xl text-teal-600 transition-transform group-hover:translate-x-0.5">
      →
    </span>

  </div>
</Link>
            ))}
          </CardContent>
        </Card>

        {/* Tier 2 — Common */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Other common symptoms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tier2Symptoms.map(symptom => (
              <Link
  key={symptom.slug}
  href={`/log/${symptom.slug}`}
  className="group block"
>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-5 transition-all hover:border-teal-300 hover:shadow-sm">
                  <div>
                    <p className="text-xl font-medium text-slate-900">{symptom.patient_label}</p>
                    {symptom.patient_description && (
                      <p className="mt-1 text-base text-slate-500">
                        {symptom.patient_description}
                      </p>
                    )}
                  </div>
                  <span className="text-xl text-teal-600 transition-transform group-hover:translate-x-0.5">
  →
</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Tier 3 — Mental / emotional */}
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-slate-900">How you are feeling</CardTitle>
            <CardDescription>Sleep, mood, anxiety, concentration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tier3Symptoms.map(symptom => (
              <Link
                key={symptom.slug}
                href={`/log/${symptom.slug}`}
                className="block"
              >
                <div className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="font-medium">{symptom.patient_label}</p>
                    {symptom.patient_description && (
                      <p className="mt-1 text-base text-slate-500">
  {symptom.patient_description}
</p>
                    )}
                  </div>
                  <span className="text-xl text-teal-600 transition-transform group-hover:translate-x-0.5">
  →
</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/timeline">View timeline</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pdf">Pre-visit summary</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
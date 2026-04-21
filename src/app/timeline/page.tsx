import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SymptomEntry {
  id: string
  symptom_slug: string
  occurred_on: string
  cycle_day: number | null
  severity: number | null
  interference: number | null
  numeric_value: number | null
  numeric_unit: string | null
  note: string | null
  red_flag_triggered: boolean
  logged_at: string
}

interface SymptomMeta {
  slug: string
  patient_label: string
}

const SEVERITY_COLORS: Record<number, string> = {
  0: 'bg-gray-300',
  1: 'bg-green-400',
  2: 'bg-yellow-400',
  3: 'bg-orange-500',
  4: 'bg-red-600',
}

const SEVERITY_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Mild',
  2: 'Moderate',
  3: 'Severe',
  4: 'Very severe',
}

export default async function TimelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get profile + latest infusion
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, cycle_length_days')
    .eq('id', user.id)
    .maybeSingle()

  const { data: latestInfusion } = await supabase
    .from('infusions')
    .select('infusion_date, cycle_number')
    .eq('user_id', user.id)
    .order('infusion_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get all symptom entries for the current cycle
  const { data: entries } = await supabase
    .from('symptom_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('cycle_number', latestInfusion?.cycle_number ?? 1)
    .order('occurred_on', { ascending: true })
    .order('logged_at', { ascending: true })

  // Get all symptoms (for labels)
  const { data: symptoms } = await supabase
    .from('symptoms')
    .select('slug, patient_label')

  const symptomMap = new Map<string, SymptomMeta>(
    (symptoms ?? []).map(s => [s.slug, s])
  )

  const cycleLength = profile?.cycle_length_days ?? 21
  const cycleNumber = latestInfusion?.cycle_number ?? 1

  // Calculate current cycle day for the marker
  let currentCycleDay: number | null = null
  if (latestInfusion) {
    const infusionDate = new Date(latestInfusion.infusion_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    infusionDate.setHours(0, 0, 0, 0)
    const diffMs = today.getTime() - infusionDate.getTime()
    currentCycleDay = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
  }

  // Group entries by cycle_day
  const entriesByDay = new Map<number, SymptomEntry[]>()
  for (const entry of entries ?? []) {
    if (entry.cycle_day === null) continue
    if (!entriesByDay.has(entry.cycle_day)) {
      entriesByDay.set(entry.cycle_day, [])
    }
    entriesByDay.get(entry.cycle_day)!.push(entry)
  }

  // Build the day array
  const days = Array.from({ length: cycleLength }, (_, i) => i + 1)

  // Determine peak severity per day for the timeline dots
  const peakSeverityByDay = new Map<number, number>()
  for (const [day, dayEntries] of entriesByDay.entries()) {
    const severities = dayEntries
      .filter(e => e.severity !== null)
      .map(e => e.severity!)
    const hasRedFlag = dayEntries.some(e => e.red_flag_triggered)
    if (hasRedFlag) {
      peakSeverityByDay.set(day, 4)
    } else if (severities.length > 0) {
      peakSeverityByDay.set(day, Math.max(...severities))
    } else if (dayEntries.length > 0) {
      // Entries without severity (e.g., fever logged only as numeric)
      peakSeverityByDay.set(day, 2)
    }
  }

  return (
    <main className="min-h-screen bg-muted/40 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link
            href="/home"
            className="text-sm text-muted-foreground hover:underline mb-2 inline-block"
          >
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">Timeline</h1>
          <p className="text-muted-foreground">
            Cycle {cycleNumber} — Day 1 through Day {cycleLength}
          </p>
        </div>

        {/* Timeline visualization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current cycle</CardTitle>
            <CardDescription>
              Each dot represents a day. Colored dots show days you logged symptoms.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5 py-2">
              {days.map(day => {
                const severity = peakSeverityByDay.get(day)
                const isToday = day === currentCycleDay
                const isFuture = currentCycleDay !== null && day > currentCycleDay
                const color = severity !== undefined
                  ? SEVERITY_COLORS[severity]
                  : isFuture
                    ? 'bg-gray-100 border border-gray-200'
                    : 'bg-gray-200'

                return (
                  <div
                    key={day}
                    className="flex flex-col items-center gap-1"
                    title={`Day ${day}${severity !== undefined ? ` — ${SEVERITY_LABELS[severity]}` : ''}`}
                  >
                    <div
                      className={`
                        w-7 h-7 rounded-full flex items-center justify-center
                        ${color}
                        ${isToday ? 'ring-2 ring-blue-600 ring-offset-2' : ''}
                      `}
                    >
                      <span className={`text-[10px] font-medium ${severity !== undefined && severity >= 2 ? 'text-white' : 'text-gray-700'}`}>
                        {day}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-gray-200"></div>
                <span>No entries</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <span>Mild</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <span>Moderate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span>Severe</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-600"></div>
                <span>Very severe / alert</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Entries list grouped by cycle day */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All entries this cycle</CardTitle>
          </CardHeader>
          <CardContent>
            {entriesByDay.size === 0 ? (
              <p className="text-sm text-muted-foreground">
                No symptoms logged yet this cycle. Go to the{' '}
                <Link href="/home" className="underline">dashboard</Link>{' '}
                to log one.
              </p>
            ) : (
              <div className="space-y-4">
                {Array.from(entriesByDay.keys()).sort((a, b) => a - b).map(day => (
                  <div key={day} className="border-l-2 pl-4">
                    <h3 className="font-medium mb-2">Day {day}</h3>
                    <div className="space-y-2">
                      {entriesByDay.get(day)!.map(entry => {
                        const meta = symptomMap.get(entry.symptom_slug)
                        return (
                          <div
                            key={entry.id}
                            className={`p-3 rounded-md border text-sm ${
                              entry.red_flag_triggered
                                ? 'border-red-300 bg-red-50'
                                : 'bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">
                                  {meta?.patient_label ?? entry.symptom_slug}
                                </p>
                                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                  {entry.severity !== null && (
                                    <p>Severity: {SEVERITY_LABELS[entry.severity]}</p>
                                  )}
                                  {entry.numeric_value !== null && (
                                    <p>
                                      {entry.numeric_value}
                                      {entry.numeric_unit && ` ${entry.numeric_unit}`}
                                    </p>
                                  )}
                                  {entry.note && (
                                    <p className="italic mt-1">&ldquo;{entry.note}&rdquo;</p>
                                  )}
                                </div>
                              </div>
                              {entry.red_flag_triggered && (
                                <span className="text-xs font-medium text-red-700 shrink-0">
                                  Alert
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <Button variant="outline" asChild>
            <Link href="/home">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
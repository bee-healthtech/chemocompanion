import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface Entry {
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
  logged_by: string
  logged_at: string
}

interface RedFlagEvent {
  id: string
  rule_slug: string
  rule_severity: string
  triggered_at: string
  acknowledgment_choice: string | null
  symptom_entry_id: string
}

const SEVERITY_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Mild',
  2: 'Moderate',
  3: 'Severe',
  4: 'Very severe',
}

const INTERFERENCE_LABELS: Record<number, string> = {
  0: 'Not at all',
  1: 'A little bit',
  2: 'Somewhat',
  3: 'Quite a bit',
  4: 'Very much',
}

export default async function PreVisitSummaryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, cycle_length_days')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')

  const { data: latestInfusion } = await supabase
    .from('infusions')
    .select('infusion_date, cycle_number')
    .eq('user_id', user.id)
    .order('infusion_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const cycleNumber = latestInfusion?.cycle_number ?? 1

  const { data: entriesData } = await supabase
    .from('symptom_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('cycle_number', cycleNumber)
    .order('occurred_on', { ascending: true })
    .order('logged_at', { ascending: true })

  const entries = (entriesData ?? []) as Entry[]

  const { data: symptoms } = await supabase
    .from('symptoms')
    .select('slug, patient_label')
  const symptomMap = new Map(
    (symptoms ?? []).map(s => [s.slug, s.patient_label])
  )

  const entryIds = entries.map(e => e.id)
  const { data: redFlagData } = entryIds.length > 0
    ? await supabase
        .from('red_flag_events')
        .select('*')
        .in('symptom_entry_id', entryIds)
        .order('triggered_at', { ascending: true })
    : { data: [] }

  const redFlagEvents = (redFlagData ?? []) as RedFlagEvent[]

  const entriesWithLabels = entries.map(e => ({
    ...e,
    symptom_label: symptomMap.get(e.symptom_slug) ?? e.symptom_slug,
  }))

  // Per-symptom summary
  interface SymptomSummary {
    slug: string
    label: string
    count: number
    peakSeverity: number | null
    peakInterference: number | null
    cycleDays: number[]
  }
  const summaryMap = new Map<string, SymptomSummary>()
  for (const entry of entriesWithLabels) {
    if (!summaryMap.has(entry.symptom_slug)) {
      summaryMap.set(entry.symptom_slug, {
        slug: entry.symptom_slug,
        label: entry.symptom_label,
        count: 0,
        peakSeverity: null,
        peakInterference: null,
        cycleDays: [],
      })
    }
    const s = summaryMap.get(entry.symptom_slug)!
    s.count += 1
    if (entry.severity !== null) {
      s.peakSeverity = Math.max(s.peakSeverity ?? 0, entry.severity)
    }
    if (entry.interference !== null) {
      s.peakInterference = Math.max(s.peakInterference ?? 0, entry.interference)
    }
    if (entry.cycle_day !== null && !s.cycleDays.includes(entry.cycle_day)) {
      s.cycleDays.push(entry.cycle_day)
    }
  }
  for (const s of summaryMap.values()) {
    s.cycleDays.sort((a, b) => a - b)
  }

  // Group red-flag events by (symptom + day + rule) for cleaner display
  interface GroupedAlert {
    symptom_slug: string
    symptom_label: string
    cycle_day: number | null
    rule_slug: string
    rule_severity: string
    events: Array<{
      entry_id: string
      triggered_at: string
      acknowledgment_choice: string | null
      numeric_value: number | null
      numeric_unit: string | null
    }>
  }
  const entryLookup = new Map(entriesWithLabels.map(e => [e.id, e]))
  const alertGroups = new Map<string, GroupedAlert>()
  for (const rf of redFlagEvents) {
    const entry = entryLookup.get(rf.symptom_entry_id)
    if (!entry) continue
    const key = `${entry.symptom_slug}|${entry.cycle_day}|${rf.rule_slug}`
    if (!alertGroups.has(key)) {
      alertGroups.set(key, {
        symptom_slug: entry.symptom_slug,
        symptom_label: entry.symptom_label,
        cycle_day: entry.cycle_day,
        rule_slug: rf.rule_slug,
        rule_severity: rf.rule_severity,
        events: [],
      })
    }
    alertGroups.get(key)!.events.push({
      entry_id: rf.symptom_entry_id,
      triggered_at: rf.triggered_at,
      acknowledgment_choice: rf.acknowledgment_choice,
      numeric_value: entry.numeric_value,
      numeric_unit: entry.numeric_unit,
    })
  }
  const groupedAlerts = Array.from(alertGroups.values()).sort((a, b) =>
    (a.cycle_day ?? 0) - (b.cycle_day ?? 0)
  )

  // Entries by cycle day
  const entriesByDay = new Map<number, typeof entriesWithLabels>()
  for (const entry of entriesWithLabels) {
    if (entry.cycle_day === null) continue
    if (!entriesByDay.has(entry.cycle_day)) {
      entriesByDay.set(entry.cycle_day, [])
    }
    entriesByDay.get(entry.cycle_day)!.push(entry)
  }
  const sortedDays = Array.from(entriesByDay.keys()).sort((a, b) => a - b)
  const firstDay = sortedDays[0] ?? null
  const lastDay = sortedDays[sortedDays.length - 1] ?? null

  // Notes grouped by cycle day
  interface NoteItem {
    cycle_day: number
    symptom_label: string
    note: string
  }
  const notes: NoteItem[] = entriesWithLabels
    .filter(e => e.note && e.cycle_day !== null)
    .map(e => ({
      cycle_day: e.cycle_day!,
      symptom_label: e.symptom_label,
      note: e.note!,
    }))
    .sort((a, b) => a.cycle_day - b.cycle_day)

  const patientCount = entriesWithLabels.filter(e => e.logged_by === 'patient').length
  const caregiverCount = entriesWithLabels.filter(e => e.logged_by === 'caregiver').length

  // Top reported symptoms
  const topByCount = Array.from(summaryMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  // Highest severity symptoms
  const highestSeverity = Array.from(summaryMap.values())
    .filter(s => s.peakSeverity !== null && s.peakSeverity >= 1)
    .sort((a, b) => (b.peakSeverity ?? 0) - (a.peakSeverity ?? 0))
    .slice(0, 3)

  // Numeric indicators
  const totalEntries = entriesWithLabels.length
  const symptomsLogged = summaryMap.size
  const alertCount = groupedAlerts.length
  const daysWithSymptoms = sortedDays.length

  // Auto-generated patient-reported summary paragraph
  let summaryParagraph = ''
  if (totalEntries === 0) {
    summaryParagraph = 'No symptoms logged yet for this cycle.'
  } else {
    const parts: string[] = []

    if (topByCount.length > 0) {
      const topLabels = topByCount.map(s => s.label.toLowerCase()).join(' and ')
      parts.push(
        `During this cycle, the most frequently reported symptoms were ${topLabels}.`
      )
    }

    if (groupedAlerts.length > 0) {
      const alertPhrase = groupedAlerts
        .map(a => {
          const daySuffix = a.cycle_day !== null ? ` on Day ${a.cycle_day}` : ''
          const count = a.events.length
          return `${count} ${a.symptom_label.toLowerCase()} entr${count === 1 ? 'y' : 'ies'}${daySuffix} triggered ${a.rule_severity === 'emergency' ? 'urgent ' : ''}safety alerts`
        })
        .join('; ')
      parts.push(alertPhrase.charAt(0).toUpperCase() + alertPhrase.slice(1) + '.')
    }

    const peakSeverities = Array.from(summaryMap.values())
      .filter(s => s.peakSeverity !== null)
      .map(s => s.peakSeverity!)
    if (peakSeverities.length > 0) {
      const overallPeak = Math.max(...peakSeverities)
      parts.push(`Highest severity reported: ${SEVERITY_LABELS[overallPeak]}.`)
    }

    summaryParagraph = parts.join(' ')
  }

  const generatedAt = new Date().toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <main className="min-h-screen bg-muted/40 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Action bar — not part of the printable document */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/home"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back
          </Link>
          <Button variant="outline" disabled>
            Download PDF (coming next)
          </Button>
        </div>

        {/* The document */}
        <Card className="p-8 md:p-12 shadow-sm bg-white">
          {/* Document header — document-first, brand secondary */}
          <div className="border-b border-gray-300 pb-4 mb-6">
            <h1 className="text-xl font-bold text-gray-900">
              Pre-Visit Symptom Summary
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Generated by ChemoCompanion
            </p>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">{profile.display_name}</span>
                {' — '}
                Cycle {cycleNumber}
                {firstDay !== null && lastDay !== null && (
                  <>, Day {firstDay}{firstDay !== lastDay && ` through Day ${lastDay}`}</>
                )}
              </p>
              <p className="text-xs text-gray-500">Generated: {generatedAt}</p>
            </div>
          </div>

          {totalEntries === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-sm">
                No symptoms logged yet for this cycle. Log your first symptom to see your summary.
              </p>
              <Link
                href="/home"
                className="text-sm text-blue-700 underline mt-2 inline-block"
              >
                Go to dashboard
              </Link>
            </div>
          ) : (
            <>
              {/* Compact numeric indicators */}
              <div className="grid grid-cols-4 gap-2 mb-5 pb-5 border-b border-gray-200">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Entries</p>
                  <p className="text-xl font-semibold text-gray-900">{totalEntries}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Symptoms</p>
                  <p className="text-xl font-semibold text-gray-900">{symptomsLogged}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Alerts</p>
                  <p className={`text-xl font-semibold ${alertCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                    {alertCount}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Active days</p>
                  <p className="text-xl font-semibold text-gray-900">{daysWithSymptoms}</p>
                </div>
              </div>

              {/* Patient-reported summary — narrative */}
              <section className="mb-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                  Patient-reported summary
                </h2>
                <p className="text-sm text-gray-800 leading-relaxed">
                  {summaryParagraph}
                </p>
              </section>

              {/* Safety alerts — visually dominant */}
              {groupedAlerts.length > 0 && (
                <section className="mb-6">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-red-800 mb-2">
                    Safety alerts
                  </h2>
                  <div className="space-y-2">
                    {groupedAlerts.map((group, idx) => {
                      const contactedCount = group.events.filter(e => e.acknowledgment_choice === 'contacted').length
                      const notYetCount = group.events.filter(e => e.acknowledgment_choice === 'not_yet').length
                      return (
                        <div
                          key={idx}
                          className="bg-red-50 border-l-4 border-red-600 rounded-r p-3"
                        >
                          <div className="flex items-baseline justify-between gap-3 mb-1">
                            <p className="text-sm font-bold text-red-900">
                              {group.symptom_label}
                              {group.cycle_day !== null && ` — Day ${group.cycle_day}`}
                            </p>
                            {group.rule_severity === 'emergency' && (
                              <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider">
                                Emergency
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-red-900 space-y-0.5">
                            <p>
                              {group.events.length} alert-triggering {group.events.length === 1 ? 'entry' : 'entries'}
                              {group.events.some(e => e.numeric_value !== null) && (
                                <>: {group.events
                                  .filter(e => e.numeric_value !== null)
                                  .map(e => `${e.numeric_value}${e.numeric_unit ? e.numeric_unit : ''}`)
                                  .join(', ')}
                                </>
                              )}
                            </p>
                            <p>
                              Patient action:{' '}
                              {contactedCount > 0 && `contacted care team (${contactedCount})`}
                              {contactedCount > 0 && notYetCount > 0 && '; '}
                              {notYetCount > 0 && `not yet contacted (${notYetCount})`}
                              {contactedCount === 0 && notYetCount === 0 && 'no acknowledgment recorded'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Symptom summary — tabular */}
              <section className="mb-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                  Symptom summary
                </h2>
                <div className="border border-gray-200 rounded">
                  {/* Header row */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    <div className="col-span-5">Symptom</div>
                    <div className="col-span-1 text-right">#</div>
                    <div className="col-span-2">Peak severity</div>
                    <div className="col-span-2">Peak interf.</div>
                    <div className="col-span-2">Days</div>
                  </div>
                  {/* Data rows */}
                  {Array.from(summaryMap.values())
                    .sort((a, b) => (b.peakSeverity ?? -1) - (a.peakSeverity ?? -1) || b.count - a.count)
                    .map(s => (
                      <div
                        key={s.slug}
                        className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0 text-sm text-gray-800"
                      >
                        <div className="col-span-5 font-medium">{s.label}</div>
                        <div className="col-span-1 text-right">{s.count}</div>
                        <div className="col-span-2 text-gray-600">
                          {s.peakSeverity !== null ? SEVERITY_LABELS[s.peakSeverity] : '—'}
                        </div>
                        <div className="col-span-2 text-gray-600">
                          {s.peakInterference !== null ? INTERFERENCE_LABELS[s.peakInterference] : '—'}
                        </div>
                        <div className="col-span-2 text-gray-600">
                          {s.cycleDays.length > 0 ? s.cycleDays.join(', ') : '—'}
                        </div>
                      </div>
                    ))}
                </div>
              </section>

              {/* Top-level "at a glance" secondary info */}
              {highestSeverity.length > 0 && (
                <section className="mb-6 text-sm text-gray-700">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <p>
                      <span className="font-medium text-gray-500">Highest severity:</span>{' '}
                      {SEVERITY_LABELS[highestSeverity[0].peakSeverity!]} ({highestSeverity[0].label.toLowerCase()})
                    </p>
                    {topByCount.length > 0 && (
                      <p>
                        <span className="font-medium text-gray-500">Most reported:</span>{' '}
                        {topByCount[0].label.toLowerCase()} ({topByCount[0].count}x)
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Notes by cycle day */}
              {notes.length > 0 && (
                <section className="mb-6">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                    Patient notes
                  </h2>
                  <div className="space-y-1.5">
                    {notes.map((n, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium text-gray-700">Day {n.cycle_day}</span>
                        <span className="text-gray-500"> — {n.symptom_label}: </span>
                        <em className="text-gray-700">&ldquo;{n.note}&rdquo;</em>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Entries by cycle day — tighter, lower visual weight */}
              <section className="mb-6">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Entries by cycle day
                </h2>
                <div className="space-y-2 text-xs">
                  {sortedDays.map(day => (
                    <div key={day}>
                      <p className="font-semibold text-gray-700">Day {day}</p>
                      <ul className="text-gray-600 space-y-0 mt-0.5 pl-3">
                        {entriesByDay.get(day)!.map(e => (
                          <li key={e.id}>
                            {e.symptom_label}
                            {e.severity !== null && ` — ${SEVERITY_LABELS[e.severity]}`}
                            {e.numeric_value !== null && (
                              <>
                                {' — '}
                                {e.numeric_value}
                                {e.numeric_unit && ` ${e.numeric_unit}`}
                              </>
                            )}
                            {e.logged_by === 'caregiver' && (
                              <span className="text-gray-400"> (caregiver)</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              {/* Attribution */}
              {(patientCount > 0 || caregiverCount > 0) && (
                <p className="text-[11px] text-gray-500 mb-4">
                  Entries logged by: patient ({patientCount})
                  {caregiverCount > 0 && `, caregiver (${caregiverCount})`}.
                </p>
              )}
            </>
          )}

          {/* Disclaimer footer — visually recessive */}
          <div className="mt-6 pt-3 border-t border-gray-200 text-[9px] text-gray-400 leading-relaxed space-y-0.5">
            <p>
              Patient-reported data; not a clinical assessment. ChemoCompanion tracks
              patient-reported symptoms using PRO-CTCAE-aligned scales.
            </p>
            <p>
              Not a diagnostic tool; review alongside clinical assessment.
            </p>
            <p>
              ChemoCompanion is not a medical device. Always follow the guidance of
              your healthcare team.
            </p>
          </div>
        </Card>
      </div>
    </main>
  )
}
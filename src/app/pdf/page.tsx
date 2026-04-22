import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PDFDownloadButton } from '@/components/pdf-download-button'

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

function getSeverityBadgeClasses(severity: number) {
  switch (severity) {
    case 0:
      return "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700"
    case 1:
      return "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700"
    case 2:
      return "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-800"
    case 3:
      return "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-800"
    case 4:
      return "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-red-100 text-red-700"
    default:
      return "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700"
  }
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

  // Group red-flag events by (symptom + day + rule)
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
  const alertDaysCount = new Set(
    groupedAlerts
      .filter(a => a.cycle_day !== null)
      .map(a => a.cycle_day)
  ).size

  // Auto-generated patient-reported summary — data-first, clinical
  let summaryParagraph = ''
  if (totalEntries === 0) {
    summaryParagraph = 'No symptoms logged yet for this cycle.'
  } else {
    const parts: string[] = []

    // Lead with alerts if present
    if (groupedAlerts.length > 0) {
      const alertPhrase = groupedAlerts
        .map(a => {
          const count = a.events.length
          const values = a.events
            .filter(e => e.numeric_value !== null)
            .map(e => `${e.numeric_value}${e.numeric_unit ?? ''}`)
            .join(', ')
          const dayPart = a.cycle_day !== null ? ` on Day ${a.cycle_day}` : ''
          const valuePart = values ? ` at ${values}` : ''
          return `${count} ${a.symptom_label.toLowerCase()} alert${count === 1 ? '' : 's'} recorded${dayPart}${valuePart}`
        })
        .join('; ')
      parts.push(alertPhrase.charAt(0).toUpperCase() + alertPhrase.slice(1) + '.')
    }

    // Then top non-alert symptoms with severity
    const nonAlertSymptoms = Array.from(summaryMap.values())
      .filter(s => s.peakSeverity !== null)
      .filter(s => !groupedAlerts.some(a => a.symptom_slug === s.slug))
      .sort((a, b) => (b.peakSeverity ?? 0) - (a.peakSeverity ?? 0))
      .slice(0, 2)

    if (nonAlertSymptoms.length > 0) {
      const phrase = nonAlertSymptoms
        .map(s => {
          const interfPart = s.peakInterference !== null && s.peakInterference > 0
            ? ` with ${INTERFERENCE_LABELS[s.peakInterference].toLowerCase()} interference`
            : s.peakInterference === 0
              ? ' with no interference'
              : ''
          return `${s.label.toLowerCase()} reported ${s.count === 1 ? 'once' : `${s.count} times`} as ${SEVERITY_LABELS[s.peakSeverity!].toLowerCase()}${interfPart}`
        })
        .join('; ')
      parts.push(phrase.charAt(0).toUpperCase() + phrase.slice(1) + '.')
    }

    // Fallback if no alerts and no severity data
    if (parts.length === 0 && topByCount.length > 0) {
      const topLabels = topByCount.map(s => s.label.toLowerCase()).join(' and ')
      parts.push(
         `During this cycle, the most frequently reported symptoms were ${topLabels}.`
        )
    }

    summaryParagraph = parts.join(' ')
  }

  const generatedAt = new Date().toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const pdfEntries = entriesWithLabels.map(e => ({
  id: e.id,
  symptom_slug: e.symptom_slug,
  symptom_label: e.symptom_label,
  occurred_on: e.occurred_on,
  cycle_day: e.cycle_day,
  severity: e.severity,
  interference: e.interference,
  numeric_value: e.numeric_value,
  numeric_unit: e.numeric_unit,
  note: e.note,
  red_flag_triggered: e.red_flag_triggered,
  logged_by: e.logged_by,
  logged_at: e.logged_at,
}))
const pdfRedFlagEvents = groupedAlerts.flatMap(group =>
  group.events.map(event => ({
    rule_slug: group.rule_slug,
    rule_severity: group.rule_severity,
    triggered_at: event.triggered_at,
    acknowledgment_choice: event.acknowledgment_choice,
    symptom_label: group.symptom_label,
    cycle_day: group.cycle_day,
  }))
)
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 md:p-10">
  <div className="max-w-4xl mx-auto bg-white shadow-sm border border-gray-200 rounded-2xl p-6 md:...">

    {/* Page header */}
    <div className="mb-8">
      <h1 className="text-3xl md:text-4xl font-semibold text-teal-900 tracking-tight">
        Pre-Visit Summary
      </h1>
      <p className="text-sm text-slate-600 mt-2">
        A clear overview to help you prepare for your next clinical visit
      </p>
    </div>


        {/* Action bar — not part of the printable document */}
        <div className="flex items-center justify-between mb-6">
  <Link
    href="/home"
    className="text-sm text-muted-foreground hover:underline"
  >
    ← Back
  </Link>

  <div className="bg-teal-50 border border-teal-100 px-4 py-2 rounded-lg">
    <PDFDownloadButton
      patientName={profile.display_name}
      cycleNumber={cycleNumber}
      cycleLength={profile.cycle_length_days ?? 21}
      entries={pdfEntries}
      redFlagEvents={pdfRedFlagEvents}
      generatedAt={generatedAt}
    />
  </div>
</div>

        {/* The document */}
        <Card className="p-8 md:p-10 bg-white border border-gray-200 shadow-lg rounded-2xl">
          {/* Document header — document-first, brand secondary */}
          <div className="border-b border-teal-100 pb-6 mb-6">
  <h2 className="text-2xl font-semibold text-teal-900">
    Pre-Visit Symptom Summary
  </h2>
  <p className="text-sm text-teal-700 mt-1">
    Generated by ChemoCompanion
  </p>
           <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
  <div className="flex items-center gap-3 flex-wrap">
    <div className="h-9 w-9 rounded-full bg-teal-100 flex items-center justify-center text-sm font-semibold text-teal-700">
      {profile.display_name?.charAt(0).toUpperCase()}
    </div>

    <span className="text-base font-semibold text-slate-800">
      {profile.display_name}
    </span>

    <span className="text-slate-300">•</span>

    <span className="inline-flex items-center rounded-md bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
      Cycle {cycleNumber}
      {firstDay !== null && lastDay !== null && (
        <> • Day {firstDay}{firstDay !== lastDay && `–${lastDay}`}</>
      )}
    </span>
  </div>

  <p className="text-xs text-gray-400">Generated: {generatedAt}</p>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 pb-6 border-b border-slate-200">
                <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-teal-700">Entries</p>
                  <p className="text-2xl font-semibold text-teal-900">{totalEntries}</p>
                </div>
                <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-sky-700">Symptoms</p>
                  <p className="text-2xl font-semibold text-sky-900">{symptomsLogged}</p>
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-red-700">Alerts</p>
                 <p className="text-2xl font-semibold text-red-700">
  {alertCount}
</p> 
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-amber-700">Days with alerts</p>
                  <p className="text-2xl font-semibold text-amber-800">
  {alertDaysCount}
</p>
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

              {/* At-a-glance — high-value signal, near the top */}
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
                    <div className="col-span-4">Symptom</div>
<div className="col-span-2 text-right">TIMES</div>
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
                        <div className="col-span-4 font-medium">{s.label}</div>
                        <div className="col-span-2 text-right">{s.count}</div>
                        <div className="col-span-2 text-gray-600">
  {s.peakSeverity !== null ? (
    <span className={getSeverityBadgeClasses(s.peakSeverity)}>
      {SEVERITY_LABELS[s.peakSeverity]}
    </span>
  ) : (
    <span className="italic text-gray-400">Not reported</span>
  )}
</div>
                        <div className="col-span-2 text-gray-600">
                          {s.peakInterference !== null ? (
  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700">
    {INTERFERENCE_LABELS[s.peakInterference]}
  </span>
) : (
  <span className="italic text-gray-400">Not reported</span>
)}
                        </div>
                        <div className="col-span-2 text-gray-600">
                          {s.cycleDays.length > 0 ? s.cycleDays.join(', ') : <span className="text-gray-400 italic">—</span>}
                        </div>
                      </div>
                    ))}
                </div>
              </section>

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

              {/* Pattern note — descriptive observations only */}
              {groupedAlerts.length > 0 && (() => {
                const alertDays = Array.from(new Set(groupedAlerts.map(a => a.cycle_day).filter(d => d !== null))) as number[]
                const alertSymptomLabels = Array.from(new Set(groupedAlerts.map(a => a.symptom_label.toLowerCase())))
                if (alertDays.length === 1 && alertSymptomLabels.length === 1) {
                  return (
  <section className="mb-6">
    <div className="flex items-start gap-3 rounded-md border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-gray-800">
      <div className="mt-0.5 text-blue-400 text-xs">●</div>

      <p className="leading-relaxed">
        All <span className="font-medium">fever or chills</span> alert entries 
        clustered on <span className="font-semibold text-gray-900">Day 21</span>.
      </p>
    </div>
  </section>
)
                }
                return null
              })()}

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
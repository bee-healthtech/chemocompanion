'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  evaluateRedFlagRule,
  insertSymptomEntry,
  insertRedFlagEvent,
  markEntryRedFlagTriggered,
  updateRedFlagAcknowledgment,
  type RedFlagRule,
} from '@/lib/symptom-entries'
import { RedFlagDialog } from '@/components/red-flag-dialog'

interface Symptom {
  slug: string
  patient_label: string
  patient_description: string | null
  why_text: string
  uses_severity: boolean
  uses_interference: boolean
  uses_numeric: boolean
  numeric_prompt: string | null
  numeric_unit: string | null
  red_flag_rule: RedFlagRule | null
  red_flag_message: string | null
}

const SEVERITY_LABELS = [
  'None',
  'Mild — noticeable but not really bothering me',
  'Moderate — bothering me, some things harder',
  'Severe — making most of my day difficult',
  'Very severe — can\'t do usual activities',
]

const INTERFERENCE_LABELS = [
  'Not at all',
  'A little bit',
  'Somewhat',
  'Quite a bit',
  'Very much',
]

export function LogForm({ symptom, userId }: { symptom: Symptom; userId: string }) {
  const router = useRouter()
  const [severity, setSeverity] = useState<number | null>(
    symptom.uses_severity ? 1 : null
  )
  const [interference, setInterference] = useState<number | null>(
    symptom.uses_interference ? 0 : null
  )
  const [numericValue, setNumericValue] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Red-flag state
  const [redFlagOpen, setRedFlagOpen] = useState(false)
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null)
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const numericParsed = numericValue.trim() === '' ? null : parseFloat(numericValue)
    if (symptom.uses_numeric && (numericParsed === null || isNaN(numericParsed))) {
      setError('Please enter a number.')
      setSubmitting(false)
      return
    }

    const today = new Date().toISOString().split('T')[0]

    const entryInput = {
      symptom_slug: symptom.slug,
      severity,
      interference,
      numeric_value: numericParsed,
      numeric_unit: symptom.uses_numeric ? symptom.numeric_unit : null,
      note: note.trim() === '' ? null : note.trim(),
      occurred_on: today,
      logged_by: 'patient' as const,
    }

    // Evaluate red-flag rule BEFORE saving
    const triggered = evaluateRedFlagRule(symptom.red_flag_rule, {
      severity: entryInput.severity,
      interference: entryInput.interference,
      numeric_value: entryInput.numeric_value,
    })

    // Save the entry
    const { data: entry, error: insertError } = await insertSymptomEntry(entryInput, userId)
    if (insertError || !entry) {
      setError(`Could not save: ${insertError?.message ?? 'unknown error'}`)
      setSubmitting(false)
      return
    }

    if (triggered && symptom.red_flag_rule && symptom.red_flag_message) {
      // Mark the entry as red-flag-triggered
      await markEntryRedFlagTriggered(entry.id)

      // Insert the red_flag_event
      const { data: event } = await insertRedFlagEvent(
        userId,
        entry.id,
        symptom.red_flag_rule.rule_slug,
        symptom.red_flag_rule.severity,
        symptom.red_flag_message,
      )

      setPendingEntryId(entry.id)
      setPendingEventId(event?.id ?? null)
      setRedFlagOpen(true)
      // Keep submitting=true to prevent resubmission while modal is open
      return
    }

    // No red flag → go back to dashboard
    router.push('/home')
    router.refresh()
  }

  async function handleAcknowledge(choice: 'contacted' | 'not_yet') {
    if (pendingEventId) {
      await updateRedFlagAcknowledgment(pendingEventId, choice)
    }
    setRedFlagOpen(false)
    router.push('/home')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-muted/40 p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        <Link
          href="/home"
          className="text-sm text-muted-foreground hover:underline mb-4 inline-block"
        >
          ← Back
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>{symptom.patient_label}</CardTitle>
            {symptom.patient_description && (
              <CardDescription>{symptom.patient_description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {symptom.uses_numeric && (
                <div className="space-y-2">
                  <Label htmlFor="numeric">
                    {symptom.numeric_prompt}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="numeric"
                      type="number"
                      step="0.1"
                      required
                      value={numericValue}
                      onChange={(e) => setNumericValue(e.target.value)}
                      disabled={submitting}
                      className="max-w-[140px]"
                      suppressHydrationWarning
                    />
                    {symptom.numeric_unit && (
                      <span className="text-muted-foreground">
                        {symptom.numeric_unit}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {symptom.uses_severity && (
                <div className="space-y-3">
                  <Label>How severe is it?</Label>
                  <div className="space-y-2">
                    {SEVERITY_LABELS.map((label, idx) => (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                          severity === idx
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="severity"
                          value={idx}
                          checked={severity === idx}
                          onChange={() => setSeverity(idx)}
                          disabled={submitting}
                          className="mt-1"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {symptom.uses_interference && (
                <div className="space-y-3">
                  <Label>
                    How much did it get in the way of your usual activities?
                  </Label>
                  <div className="space-y-2">
                    {INTERFERENCE_LABELS.map((label, idx) => (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                          interference === idx
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="interference"
                          value={idx}
                          checked={interference === idx}
                          onChange={() => setInterference(idx)}
                          disabled={submitting}
                          className="mt-1"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="note">
                  Anything else to note? (optional)
                </Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Any details you want your care team to know about"
                  disabled={submitting}
                  suppressHydrationWarning
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full"
              >
                {submitting ? 'Saving...' : 'Save'}
              </Button>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </form>

            <div className="mt-6 pt-6 border-t">
              <p className="text-xs text-muted-foreground">
                <strong>Why this matters:</strong> {symptom.why_text}
              </p>
            </div>
          </CardContent>
        </Card>

        <RedFlagDialog
          open={redFlagOpen}
          severity={symptom.red_flag_rule?.severity ?? 'contact'}
          message={symptom.red_flag_message ?? ''}
          onAcknowledge={handleAcknowledge}
        />
      </div>
    </main>
  )
}
import { createClient } from '@/lib/supabase/client'

export interface LogEntryInput {
  symptom_slug: string
  severity: number | null
  interference: number | null
  numeric_value: number | null
  numeric_unit: string | null
  note: string | null
  occurred_on: string
  logged_by: 'patient' | 'caregiver'
}

export async function insertSymptomEntry(input: LogEntryInput, userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('symptom_entries')
    .insert({
      user_id: userId,
      ...input,
      red_flag_triggered: false, // will be updated if a red flag fires
    })
    .select()
    .single()
  return { data, error }
}

export async function insertRedFlagEvent(
  userId: string,
  symptomEntryId: string,
  ruleSlug: string,
  ruleSeverity: string,
  messageShown: string,
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('red_flag_events')
    .insert({
      user_id: userId,
      symptom_entry_id: symptomEntryId,
      rule_slug: ruleSlug,
      rule_severity: ruleSeverity,
      message_shown: messageShown,
    })
    .select()
    .single()
  return { data, error }
}

export async function updateRedFlagAcknowledgment(
  eventId: string,
  choice: 'contacted' | 'not_yet',
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('red_flag_events')
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledgment_choice: choice,
    })
    .eq('id', eventId)
  return { error }
}

export async function markEntryRedFlagTriggered(entryId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('symptom_entries')
    .update({ red_flag_triggered: true })
    .eq('id', entryId)
  return { error }
}

// Simple rule evaluator. Matches the JSONB shape in the symptoms table.
export interface RedFlagRule {
  rule_slug: string
  condition: {
    field: 'numeric_value' | 'severity' | 'interference'
    operator: '>=' | '<=' | '>' | '<' | '=='
    value: number
  }
  severity: 'emergency' | 'same_day' | 'contact'
  require_acknowledgment: boolean
}

export function evaluateRedFlagRule(
  rule: RedFlagRule | null,
  entry: { severity: number | null; interference: number | null; numeric_value: number | null }
): boolean {
  if (!rule) return false
  const value = entry[rule.condition.field]
  if (value === null) return false
  switch (rule.condition.operator) {
    case '>=': return value >= rule.condition.value
    case '<=': return value <= rule.condition.value
    case '>': return value > rule.condition.value
    case '<': return value < rule.condition.value
    case '==': return value === rule.condition.value
    default: return false
  }
}
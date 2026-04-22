import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'

export type PreVisitPDFProps = {
  patientName: string
  cycleNumber: number
  cycleLength: number
  generatedAt: string
  entries: {
    id: string
    symptom_label: string
    cycle_day: number | null
    severity: number | null
    interference: number | null
    numeric_value: number | null
    numeric_unit: string | null
    note: string | null
  }[]
  redFlagEvents: {
    rule_slug: string
    rule_severity: string
    symptom_label: string
    cycle_day: number | null
    triggered_at: string
    acknowledgment_choice?: string | null
  }[]
}

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 18,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 10,
    marginBottom: 12,
    color: '#555',
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  row: {
    marginBottom: 2,
  },
})

export function PreVisitPDF(props: PreVisitPDFProps) {
  const { patientName, cycleNumber, generatedAt, entries, redFlagEvents } = props

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Pre-Visit Symptom Summary</Text>

        <Text style={styles.subtitle}>
          {patientName} • Cycle {cycleNumber} • Generated {generatedAt}
        </Text>

        {/* Entries */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Symptoms</Text>

          {entries.map((e, i) => (
            <Text key={i} style={styles.row}>
              {e.symptom_label}
              {e.severity !== null ? ` — severity ${e.severity}` : ''}
              {e.numeric_value !== null
                ? ` — ${e.numeric_value}${e.numeric_unit ?? ''}`
                : ''}
            </Text>
          ))}
        </View>

        {/* Alerts */}
        {redFlagEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alerts</Text>

            {redFlagEvents.map((a, i) => (
              <Text key={i} style={styles.row}>
                {a.symptom_label} — {a.rule_severity} (Day {a.cycle_day})
              </Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  )
}
'use client'

import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import { PreVisitPDF, type PreVisitPDFProps } from './pre-visit-pdf'

export function PDFDownloadButton(props: PreVisitPDFProps) {
  const [generating, setGenerating] = useState(false)

  async function handleDownload() {
    setGenerating(true)
    try {
      const blob = await pdf(<PreVisitPDF {...props} />).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ChemoCompanion-Cycle${props.cycleNumber}-Summary.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Button
      onClick={handleDownload}
      disabled={generating}
      variant="default"
    >
      {generating ? 'Generating PDF...' : 'Download PDF'}
    </Button>
  )
}
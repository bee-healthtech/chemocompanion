'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RedFlagDialogProps {
  open: boolean
  severity: 'emergency' | 'same_day' | 'contact'
  message: string
  onAcknowledge: (choice: 'contacted' | 'not_yet') => void
}

const SEVERITY_COPY = {
  emergency: {
    title: 'Contact your care team now',
    tone: 'border-red-600 bg-red-50',
    titleColor: 'text-red-900',
  },
  same_day: {
    title: 'Contact your care team today',
    tone: 'border-orange-500 bg-orange-50',
    titleColor: 'text-orange-900',
  },
  contact: {
    title: 'Contact your care team',
    tone: 'border-amber-500 bg-amber-50',
    titleColor: 'text-amber-900',
  },
} as const

export function RedFlagDialog({
  open,
  severity,
  message,
  onAcknowledge,
}: RedFlagDialogProps) {
  const [choosing, setChoosing] = useState(false)
  const copy = SEVERITY_COPY[severity]

  function handleChoice(choice: 'contacted' | 'not_yet') {
    setChoosing(true)
    onAcknowledge(choice)
  }

  return (
    <Dialog
      open={open}
      // Intentionally do NOT allow dismissal by clicking outside, escape, or back button
      onOpenChange={() => { /* blocked */ }}
    >
      <DialogContent
        className={`${copy.tone} border-2`}
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className={copy.titleColor}>{copy.title}</DialogTitle>
          <DialogDescription className="text-foreground text-base pt-2">
            {message}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col sm:flex-col gap-2 mt-4">
          <Button
            onClick={() => handleChoice('contacted')}
            disabled={choosing}
            className="w-full"
            variant={severity === 'emergency' ? 'destructive' : 'default'}
          >
            I&apos;ve contacted them
          </Button>
          <Button
            onClick={() => handleChoice('not_yet')}
            disabled={choosing}
            variant="outline"
            className="w-full"
          >
            Not yet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
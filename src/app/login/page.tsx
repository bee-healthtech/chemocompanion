'use client'

import { useState } from 'react'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('sent')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">ChemoCompanion</CardTitle>
          <CardDescription>
            Sign in with a magic link sent to your email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'sent' ? (
            <Alert>
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                We sent a sign-in link to <strong>{email}</strong>. Click the
                link to finish signing in.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={status === 'sending'}
                  suppressHydrationWarning
                />
              </div>

              <Button
                type="submit"
                disabled={status === 'sending' || !email}
                className="w-full"
              >
                {status === 'sending' ? 'Sending...' : 'Send magic link'}
              </Button>

              {status === 'error' && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}
            </form>
          )}

          <p className="text-xs text-muted-foreground mt-6 text-center">
            Your data stays in Canada. We never share it.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
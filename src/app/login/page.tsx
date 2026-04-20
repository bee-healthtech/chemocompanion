'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
    <main className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border">
        <h1 className="text-2xl font-bold mb-2">ChemoCompanion</h1>
        <p className="text-gray-600 mb-6">
          Sign in with a magic link sent to your email.
        </p>

        {status === 'sent' ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded">
            <p className="text-green-800 font-medium mb-1">Check your email</p>
            <p className="text-green-700 text-sm">
              We sent a sign-in link to <strong>{email}</strong>. Click the link
              to finish signing in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
                disabled={status === 'sending'}
              />
            </div>

            <button
              type="submit"
              disabled={status === 'sending' || !email}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'sending' ? 'Sending...' : 'Send magic link'}
            </button>

            {status === 'error' && (
              <p className="text-red-700 text-sm">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
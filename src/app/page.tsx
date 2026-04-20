import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { error } = await supabase.from('_test_nonexistent_table').select('*').limit(1)

  // Any error that mentions the missing table = connection works
  const connectionWorking = error?.message?.toLowerCase().includes('table') ||
                            error?.message?.toLowerCase().includes('not find')

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">ChemoCompanion</h1>
        <p className="mb-4 text-gray-600">Supabase connection test</p>
        <div className="p-4 rounded border">
          {connectionWorking ? (
            <p className="text-green-700">
              ✓ Connected to Supabase successfully
            </p>
          ) : error ? (
            <p className="text-red-700">
              ✗ Unexpected error: {error.message}
            </p>
          ) : (
            <p className="text-yellow-700">
              Unexpected success — check your config
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
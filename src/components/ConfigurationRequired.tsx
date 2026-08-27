/** Rendered instead of <App/> when required Supabase env vars are missing -
 * see src/lib/supabase.ts for why this can't just be a thrown error. */
export function ConfigurationRequired({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">CampusLink isn't configured yet</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StoreProvider } from '../store'
import { api, type ProposalMeta } from '../lib/api'
import App from '../App'

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const proposalId = id ?? ''

  const [meta, setMeta] = useState<ProposalMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!proposalId) return
    let cancelled = false
    api.getProposal(proposalId)
      .then(p => { if (!cancelled) setMeta(p) })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [proposalId])

  if (!proposalId) return <NotFound />
  if (error) return <NotFound message={error} />
  if (!meta) return <Loading />

  return (
    <StoreProvider key={proposalId} proposalId={proposalId}>
      <App />
    </StoreProvider>
  )
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-[15px] text-[var(--color-muted)]">
      Загружаем…
    </div>
  )
}

function NotFound({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-[15px] text-[var(--color-muted)]">
      <div>КП не найдено{message ? `: ${message}` : ''}</div>
      <Link to="/" className="text-[#6366f1] hover:underline">← На дэшборд</Link>
    </div>
  )
}

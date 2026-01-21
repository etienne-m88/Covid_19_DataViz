'use client'

import { useEffect, useMemo, useState } from 'react'

type StatsResponse = {
  global?: {
    lastUpdate?: string | null
  } | null
  dataRange?: {
    lastDate?: string | null
  }
}

export default function Footer() {
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/covid/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: StatsResponse | null) => {
        const date =
          data?.dataRange?.lastDate ??
          data?.global?.lastUpdate ??
          null
        setLastUpdate(date)
      })
      .catch(() => {
        setLastUpdate(null)
      })
  }, [])

  const formattedUpdate = useMemo(() => {
    if (!lastUpdate) return 'N/A'
    const date = new Date(lastUpdate)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  }, [lastUpdate])

  return (
    <footer className="bg-white border-t border-gray-200 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex flex-col space-y-2">
            <p className="text-sm text-gray-600 font-medium">
              COVID-19 DataViz Dashboard
            </p>
            <p className="text-xs text-gray-500">
              Data provided by{' '}
              <a
                href="https://github.com/CSSEGISandData/COVID-19"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-800 underline"
              >
                Johns Hopkins CSSE
              </a>
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <p className="text-xs text-gray-500">
              Last update: {formattedUpdate}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            © 2025 COVID-19 DataViz. Created with Next.js, Tailwind CSS, and Prisma.
          </p>
        </div>
      </div>
    </footer>
  )
}

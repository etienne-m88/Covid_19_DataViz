'use client'

import Footer from '@/components/ui/Footer'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface TimelineData {
  date: string
  confirmed: number
  deaths: number
  newDeaths?: number
  recovered: number | null
  active: number
  incidentRate?: number | null
  population?: number | null
}

interface TopCountry {
  country: string
  confirmed: number
  deaths: number
  recovered: number | null
  active: number
  incidentRate?: number | null
  caseFatalityRatio?: number | null
  population?: number | null
}

interface StatsResponse {
  topCountries: TopCountry[]
  countryTotals?: TopCountry[]
}

export default function AnalyticsPage() {
  const [globalTimeline, setGlobalTimeline] = useState<TimelineData[]>([])
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [countryTimeline, setCountryTimeline] = useState<TimelineData[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(90)
  const [startDate, setStartDate] = useState<string>('')
  const [timelineMode, setTimelineMode] = useState<'cumulative' | 'daily'>('cumulative')
  const [stats, setStats] = useState<StatsResponse | null>(null)

  const buildTimelineParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('deathsMode', timelineMode)

    if (startDate) {
      const start = new Date(startDate)

      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start)
        end.setDate(end.getDate() + period - 1)

        params.set('startDate', start.toISOString())
        params.set('endDate', end.toISOString())
        return params
      }
    }

    params.set('limit', String(period))
    return params
  }, [period, startDate, timelineMode])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const baseParams = buildTimelineParams()
      const globalUrl = `/api/covid/timeline?${baseParams.toString()}`
      // Load global timeline
      const globalRes = await fetch(globalUrl)
      const globalData = await globalRes.json()
      setGlobalTimeline(globalData.timeline || [])

      // Load available countries from stats
      const statsRes = await fetch('/api/covid/stats')
      const statsData: StatsResponse = await statsRes.json()
      setStats(statsData)
      const countryList = Array.isArray(statsData.countryTotals) && statsData.countryTotals.length
        ? statsData.countryTotals.map((c) => c.country)
        : Array.isArray(statsData.topCountries)
          ? statsData.topCountries.map((c) => c.country)
          : []
      const enrichedCountries = Array.from(new Set(countryList)).sort((a, b) =>
        a.localeCompare(b)
      )
      setCountries(enrichedCountries)
      if (enrichedCountries.length && selectedCountry && !enrichedCountries.includes(selectedCountry)) {
        setSelectedCountry(enrichedCountries[0])
      }

      // Load the selected country's timeline
      if (selectedCountry) {
        const countryParams = buildTimelineParams()
        const countryUrl = `/api/covid/timeline?country=${encodeURIComponent(
          selectedCountry
        )}&${countryParams.toString()}`
        const countryRes = await fetch(
          countryUrl
        )
        const countryData = await countryRes.json()
        setCountryTimeline(countryData.timeline || [])
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [buildTimelineParams, selectedCountry])

  useEffect(() => {
    loadData()
  }, [loadData])

  const computeDailySeries = useCallback((data: TimelineData[]) => {
    let prev: TimelineData | null = null
    return data.map((entry) => {
      const confirmedDaily = prev ? Math.max(0, entry.confirmed - prev.confirmed) : 0
      const deathsDelta = entry.newDeaths ?? (prev ? entry.deaths - prev.deaths : 0)
      const deathsDaily = Math.max(0, deathsDelta)
      const recoveredDaily =
        prev && entry.recovered !== null && entry.recovered !== undefined && prev.recovered !== null && prev.recovered !== undefined
          ? Math.max(0, entry.recovered - prev.recovered)
          : entry.recovered !== null && entry.recovered !== undefined
            ? 0
            : null
      const activeDaily = prev ? Math.max(0, entry.active - prev.active) : 0
      prev = entry
      return {
        date: entry.date,
        confirmed: confirmedDaily,
        deaths: deathsDaily,
        recovered: recoveredDaily,
        active: activeDaily,
      }
    })
  }, [])

  const globalDaily = useMemo(() => computeDailySeries(globalTimeline), [computeDailySeries, globalTimeline])
  const countryDaily = useMemo(() => computeDailySeries(countryTimeline), [computeDailySeries, countryTimeline])

  const globalSeries = useMemo(() => {
    return globalTimeline.map((entry, index) => ({
      date: entry.date,
      confirmed: timelineMode === 'daily' ? globalDaily[index]?.confirmed ?? 0 : entry.confirmed,
      deaths: timelineMode === 'daily' ? globalDaily[index]?.deaths ?? 0 : entry.deaths,
      recovered: timelineMode === 'daily' ? globalDaily[index]?.recovered ?? null : entry.recovered,
      active: entry.active,
    }))
  }, [globalDaily, globalTimeline, timelineMode])

  const countrySeries = useMemo(() => {
    return countryTimeline.map((entry, index) => ({
      date: entry.date,
      confirmed: timelineMode === 'daily' ? countryDaily[index]?.confirmed ?? 0 : entry.confirmed,
      deaths: timelineMode === 'daily' ? countryDaily[index]?.deaths ?? 0 : entry.deaths,
      recovered: timelineMode === 'daily' ? countryDaily[index]?.recovered ?? null : entry.recovered,
      active: entry.active,
    }))
  }, [countryDaily, countryTimeline, timelineMode])

  const countryDeathRatio = useMemo(() => {
    if (!countryTimeline.length) return null
    const last = [...countryTimeline].reverse().find((entry) => entry.confirmed > 0)
    if (!last || last.confirmed <= 0) return null
    const ratio = (last.deaths / last.confirmed) * 100
    return Number.isFinite(ratio) ? ratio : null
  }, [countryTimeline])

  const infectionPopulationRatio = useMemo(() => {
    if (!countryTimeline.length) return null
    const last = [...countryTimeline].reverse().find((entry) => entry.confirmed > 0)
    if (!last) return null
    const population =
      last.population ??
      (last.incidentRate && last.incidentRate > 0
        ? (last.confirmed / (last.incidentRate / 100000))
        : null)
    if (!population || population <= 0) return null
    const ratio = (last.confirmed / population) * 100
    return Number.isFinite(ratio) ? ratio : null
  }, [countryTimeline])

  const deathPopulationRatio = useMemo(() => {
    if (!countryTimeline.length) return null
    const last = [...countryTimeline].reverse().find((entry) => entry.deaths > 0)
    if (!last) return null
    const population =
      last.population ??
      (last.incidentRate && last.incidentRate > 0
        ? (last.confirmed / (last.incidentRate / 100000))
        : null)
    if (!population || population <= 0) return null
    const ratio = (last.deaths / population) * 100
    return Number.isFinite(ratio) ? ratio : null
  }, [countryTimeline])

  const recoveredConfirmedRatio = useMemo(() => {
    if (!countryTimeline.length) return null
    const last = [...countryTimeline].reverse().find((entry) => entry.confirmed > 0)
    if (!last || last.confirmed <= 0 || last.recovered === null || last.recovered <= 0) return null
    const ratio = (last.recovered / last.confirmed) * 100
    return Number.isFinite(ratio) ? ratio : null
  }, [countryTimeline])

  const recoveredPopulationRatio = useMemo(() => {
    if (!countryTimeline.length) return null
    const last = [...countryTimeline].reverse().find((entry) => (entry.recovered ?? 0) > 0)
    if (!last || last.recovered === null || last.recovered <= 0) return null
    const population =
      last.population ??
      (last.incidentRate && last.incidentRate > 0
        ? (last.confirmed / (last.incidentRate / 100000))
        : null)
    if (!population || population <= 0) return null
    const ratio = (last.recovered / population) * 100
    return Number.isFinite(ratio) ? ratio : null
  }, [countryTimeline])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
    })
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
    return num.toString()
  }

  const globalYAxisDomain = useMemo(
    () => (timelineMode === 'daily' ? ['auto', 'auto'] : [0, 650_000_000]),
    [timelineMode]
  )

  const deathsLabel =
    timelineMode === 'daily' ? 'Daily deaths' : 'Deaths'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Analytics COVID-19
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Detailed analysis and evolution charts
            </p>
          </div>
          <Link
            href="/dashboard"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-black">
              Period (days):
            </label>
            <input
              type="number"
              min={1}
              value={period}
              onChange={(e) => {
                const value = Number(e.target.value)
                setPeriod(Number.isFinite(value) && value > 0 ? value : 1)
              }}
              className="w-24 text-black border border-black rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-black">
              Start date:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-black border border-black rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-black">
              Country:
            </label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="text-black border border-black rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option className="bg-white text-black" value="" disabled>
                No selection
              </option>
              {countries.map((country) => (
                <option className='bg-white text-black' key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-black">View mode:</span>
            <label className="inline-flex items-center gap-1 text-sm text-black">
              <input
                type="radio"
                name="timelineMode"
                value="cumulative"
                checked={timelineMode === 'cumulative'}
                onChange={() => setTimelineMode('cumulative')}
                className="text-indigo-600"
              />
              Cumulative
            </label>
            <label className="inline-flex items-center gap-1 text-sm text-black">
              <input
                type="radio"
                name="timelineMode"
                value="daily"
                checked={timelineMode === 'daily'}
                onChange={() => setTimelineMode('daily')}
                className="text-indigo-600"
              />
              Daily
            </label>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading data...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Chart 1: Global trend */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Global evolution
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={globalSeries}>
                  <defs>
                    <linearGradient
                      id="colorConfirmed"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="colorDeaths"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="colorRecovered"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    tickFormatter={formatNumber}
                    style={{ fontSize: '12px' }}
                    domain={globalYAxisDomain as [number | 'auto', number | 'auto']}
                  />
                  <Tooltip
                    formatter={(value) => {
                      if (value === null || value === undefined) return 'N/A'
                      if (Array.isArray(value)) return value.join(', ')
                      const num = typeof value === 'number' ? value : Number(value)
                      if (!Number.isFinite(num)) return 'N/A'
                      return new Intl.NumberFormat('en-US').format(num)
                    }}
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString('en-US')
                    }
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="confirmed"
                    name="Confirmed cases"
                    stroke="#3B82F6"
                    fillOpacity={1}
                    fill="url(#colorConfirmed)"
                  />
                  <Area
                    type="monotone"
                    dataKey="deaths"
                    name={deathsLabel}
                    stroke="#EF4444"
                    fillOpacity={1}
                    fill="url(#colorDeaths)"
                  />
                  <Area
                    type="monotone"
                    dataKey="recovered"
                    name="Recoveries"
                    stroke="#10B981"
                    fillOpacity={1}
                    fill="url(#colorRecovered)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Selected country timeline */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {selectedCountry || 'No selection'} timeline
              </h2>
              {countryTimeline.length ? (
                <div className="space-y-3">
                  <ResponsiveContainer width="100%" height={360}>
                  <AreaChart data={countrySeries}>
                    <defs>
                      <linearGradient id="countryConfirmed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    <linearGradient id="countryDeaths" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="countryRecovered" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDate} style={{ fontSize: '12px' }} />
                    <YAxis tickFormatter={formatNumber} style={{ fontSize: '12px' }} />
                    <Tooltip
                      formatter={(value) => {
                        if (value === null || value === undefined) return 'N/A'
                        if (Array.isArray(value)) return value.join(', ')
                        const num = typeof value === 'number' ? value : Number(value)
                        if (!Number.isFinite(num)) return 'N/A'
                        return new Intl.NumberFormat('en-US').format(num)
                      }}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('en-US')}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="confirmed"
                      name="Confirmed cases"
                      stroke="#3B82F6"
                      fillOpacity={1}
                      fill="url(#countryConfirmed)"
                    />
                    <Area
                      type="monotone"
                      dataKey="recovered"
                      name="Recoveries"
                      stroke="#10B981"
                      fillOpacity={1}
                      fill="url(#countryRecovered)"
                    />
                    <Area
                      type="monotone"
                      dataKey="deaths"
                      name={deathsLabel}
                      stroke="#EF4444"
                      fillOpacity={1}
                      fill="url(#countryDeaths)"
                    />
                  </AreaChart>
                  </ResponsiveContainer>
                  {(countryDeathRatio !== null || infectionPopulationRatio !== null || deathPopulationRatio !== null || recoveredConfirmedRatio !== null || recoveredPopulationRatio !== null) && (
                    <div className="text-sm text-gray-700 space-y-1">
                      {countryDeathRatio !== null && (
                        <div>
                          Death / confirmed ratio:{' '}
                          <span className="font-semibold">{countryDeathRatio.toFixed(2)}%</span>
                        </div>
                      )}
                      {infectionPopulationRatio !== null && (
                        <div>
                          Confirmed / population:{' '}
                          <span className="font-semibold">{infectionPopulationRatio.toFixed(2)}%</span>
                        </div>
                      )}
                      {deathPopulationRatio !== null && (
                        <div>
                          Deaths / population:{' '}
                          <span className="font-semibold">{deathPopulationRatio.toFixed(2)}%</span>
                        </div>
                      )}
                      {recoveredConfirmedRatio !== null && (
                        <div>
                          Recovered / confirmed ratio:{' '}
                          <span className="font-semibold">{recoveredConfirmedRatio.toFixed(2)}%</span>
                        </div>
                      )}
                      {recoveredPopulationRatio !== null && (
                        <div>
                          Recovered / population:{' '}
                          <span className="font-semibold">{recoveredPopulationRatio.toFixed(2)}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No timeline available for this country with the current filters.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}

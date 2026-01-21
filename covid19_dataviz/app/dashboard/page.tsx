'use client'

import Footer from '@/components/ui/Footer'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  GeometryObject
} from 'geojson'
import type { Topology } from 'topojson-specification'
import worldData from 'world-atlas/countries-110m.json'

interface CovidStats {
  global: {
    totalConfirmed: number
    totalDeaths: number
    totalRecovered: number | null
    totalActive: number
    lastUpdate: string
    recoveredLastUpdate?: string | null
  } | null
  topCountries: Array<{
    country: string
    confirmed: number
    deaths: number
    recovered: number
  }>
  countryTotals?: Array<{
    country: string
    confirmed: number
    deaths: number
    recovered: number
    active: number
    incidentRate?: number | null
    caseFatalityRatio?: number | null
  }>
  mapData?: Array<{
    country: string
    province: string | null
    admin2: string | null
    lat: number | null
    lng: number | null
    confirmed: number
    deaths: number
    recovered: number
    active: number
    incidentRate?: number | null
    caseFatalityRatio?: number | null
  }>
  dataRange?: {
    firstDate: string | null
    lastDate: string | null
  }
}

type CountryTotal = NonNullable<CovidStats['countryTotals']>[number]

const normalizeCountryName = (value?: string) => {
  if (!value) return ''
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '')
}

const COUNTRY_ALIAS: Record<string, string> = {
  unitedstatesofamerica: 'us',
  usa: 'us',
  southkorea: 'korea, south',
  northkorea: 'korea, north',
  unitedkingdom: 'united kingdom'
}

export default function Dashboard() {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [stats, setStats] = useState<CovidStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  // Types from world-atlas don't align perfectly with topojson typings; force-cast here.
  const countriesObject =
    (worldData as unknown as { objects: { countries: GeometryObject } }).objects.countries
  const worldFeatureCollection = feature(
    worldData as unknown as Topology,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countriesObject as any
  ) as unknown as FeatureCollection<Geometry, GeoJsonProperties>
  const worldFeatures: Feature<Geometry, GeoJsonProperties>[] =
    worldFeatureCollection?.features ?? []

  const { maxDeathRate, deathRateMap } = useMemo(() => {
    const map = new Map<string, number>()
    let max = 0

    if (!stats?.countryTotals) {
      return { maxDeathRate: 0, deathRateMap: map }
    }

    for (const country of stats.countryTotals) {
      const norm = normalizeCountryName(country.country)

      if (country.incidentRate && country.incidentRate > 0 && country.confirmed > 0) {
        const estimatedPopulation = country.confirmed / (country.incidentRate / 100000)
        if (estimatedPopulation > 0) {
          const deathRate = (country.deaths / estimatedPopulation) * 100000
          if (Number.isFinite(deathRate)) {
            map.set(norm, deathRate)

            const alias = COUNTRY_ALIAS[norm]
            if (alias) {
              map.set(alias, deathRate)
            }

            if (deathRate > max) {
              max = deathRate
            }
          }
        }
      }
    }

    return { maxDeathRate: max, deathRateMap: map }
  }, [stats?.countryTotals])

  const projection = useMemo(
    () =>
      geoMercator()
        .scale(145)
        .translate([480, 330]),
    []
  )

  const pathGenerator = useMemo(() => geoPath(projection), [projection])

  useEffect(() => {
    setMapLoaded(true)

    // Fetch statistics from the API
    fetch('/api/covid/stats')
      .then(async (res) => {
        if (!res.ok) {
          return null
        }
        return res.json()
      })
      .then((data: CovidStats | null) => {
        setStats(data)
        setLoading(false)
      })
      .catch((error) => {
        console.error('Error retrieving stats:', error)
        setLoading(false)
      })
  }, [])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num)
  }

  const formatDate = (value?: string) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat('en-US').format(date)
  }

  const deathsRanking = useMemo(() => {
    if (!stats?.countryTotals?.length) {
      return []
    }

    return [...stats.countryTotals]
      .filter((country) => country.deaths > 0)
      .sort((a, b) => b.deaths - a.deaths)
  }, [stats?.countryTotals])

  const infectionsRanking = useMemo(() => {
    if (!stats?.countryTotals?.length) {
      return []
    }

    return [...stats.countryTotals]
      .filter((country) => country.confirmed > 0)
      .sort((a, b) => b.confirmed - a.confirmed)
  }, [stats?.countryTotals])

  const recoveriesRanking = useMemo(() => {
    if (!stats?.countryTotals?.length) {
      return []
    }

    return [...stats.countryTotals]
      .filter((country) => country.recovered > 0)
      .sort((a, b) => b.recovered - a.recovered)
  }, [stats?.countryTotals])

  const countryTotalsMap = useMemo(() => {
    const map = new Map<string, CountryTotal>()
    if (!stats?.countryTotals) return map

    for (const country of stats.countryTotals) {
      const norm = normalizeCountryName(country.country)
      if (norm) {
        map.set(norm, country)
      }
      const aliasKey = COUNTRY_ALIAS[norm]
      if (aliasKey) {
        map.set(aliasKey, country)
      }
    }
    return map
  }, [stats?.countryTotals])

  const lastUpdateDate = formatDate(
    (stats?.dataRange?.lastDate ?? stats?.global?.lastUpdate) || undefined
  )
  const firstUpdateDate = formatDate(
    (stats?.dataRange?.firstDate ?? undefined)
  )

  const selectedCountryStats = useMemo(() => {
    if (!selectedCountry) return null
    const norm = normalizeCountryName(selectedCountry)
    if (!norm) return null
    const direct = countryTotalsMap.get(norm)
    if (direct) return direct
    const alias = COUNTRY_ALIAS[norm]
    if (alias) {
      return countryTotalsMap.get(alias) ?? null
    }
    return null
  }, [countryTotalsMap, selectedCountry])

  const recoveredTotal = stats?.global?.totalRecovered ?? null
  const hasRecoveredTotal = typeof recoveredTotal === 'number' && recoveredTotal > 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              COVID-19 Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-1">Real-time global data</p>
          </div>
          <div className="flex gap-4 items-center">
            <Link
              href="/dashboard/analytics"
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
            >
              Analytics
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 w-full">
        {/* Statistic cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-600 uppercase">
                Confirmed worldwide
              </h2>
              <span className="text-2xl">🦠</span>
            </div>
            {loading ? (
              <div className="h-10 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <>
                <p className="text-3xl font-bold text-blue-600">
                  {stats?.global
                    ? formatNumber(stats.global.totalConfirmed)
                    : 'N/A'}
                </p>
                <p className="text-xs text-gray-500 mt-2">Data not available since 2023</p>
              </>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-600 uppercase">
                Deaths worldwide
              </h2>
              <span className="text-2xl">💔</span>
            </div>
            {loading ? (
              <div className="h-10 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <>
                <p className="text-3xl font-bold text-red-600">
                  {stats?.global
                    ? formatNumber(stats.global.totalDeaths)
                    : 'N/A'}
                </p>
                <p className="text-xs text-gray-500 mt-2">Data not available since 2023</p>
              </>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-600 uppercase">
                Recovered worldwide
              </h2>
              <span className="text-2xl">✅</span>
            </div>
            {loading ? (
              <div className="h-10 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <>
                <p className="text-3xl font-bold text-green-600">
                  {hasRecoveredTotal
                    ? formatNumber(recoveredTotal)
                    : 'N/A'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {hasRecoveredTotal
                    ? `Global total${stats?.global?.recoveredLastUpdate ? ` (last update: ${formatDate(String(stats.global.recoveredLastUpdate))})` : ''}`
                    : 'Data unavailable'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Interactive world map */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Global distribution
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Select a country to view its figures.
              </p>
            </div>
            {selectedCountryStats && (
              <div className="text-right text-sm text-gray-700">
                <p className="font-semibold">{selectedCountryStats.country}</p>
                <p>Confirmed : {formatNumber(selectedCountryStats.confirmed)}</p>
                <p>Deaths : {formatNumber(selectedCountryStats.deaths)}</p>
              </div>
            )}
          </div>
          <div className="relative" style={{ height: '520px' }}>
            {mapLoaded ? (
              <svg viewBox="0 0 960 660" className="w-full h-full">
                <g>
                  {worldFeatures.map((featureItem, index) => {
                    const path = pathGenerator(featureItem)
                    if (!path) return null

                    const countryName =
                      (featureItem.properties?.name as string) || 'Unknown'
                    const normName = normalizeCountryName(countryName)
                    const deathRate = deathRateMap.get(normName)

                    const ratio =
                      maxDeathRate && deathRate
                        ? Math.min(1, Math.max(0, deathRate / maxDeathRate))
                        : 0

                    const start = [34, 197, 94] // green-500
                    const end = [239, 68, 68] // red-500
                    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

                    const fillColor = `rgb(${Math.round(
                      lerp(start[0], end[0], ratio)
                    )}, ${Math.round(lerp(start[1], end[1], ratio))}, ${Math.round(
                      lerp(start[2], end[2], ratio)
                    )})`
                    const isSelected =
                      selectedCountry &&
                      countryName.toLowerCase() ===
                        selectedCountry.toLowerCase()

                    return (
                      <path
                        key={featureItem.id ?? index}
                        d={path}
                        fill={isSelected ? '#C7D2FE' : fillColor}
                        stroke="#64748B"
                        strokeWidth={0.5}
                        className="cursor-pointer transition"
                        onClick={() => setSelectedCountry(countryName)}
                      >
                        <title>{countryName}</title>
                      </path>
                    )
                  })}
                </g>
              </svg>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading map...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Global rankings */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Global deaths ranking
                </h2>
                <p className="text-sm text-gray-500">
                  Every country sorted by total COVID-19 deaths.
                </p>
              </div>
              {!loading && (
                <p className="text-sm text-gray-500">
                  {deathsRanking.length.toLocaleString()} countries ranked
                </p>
              )}
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, index) => (
                  <div
                    key={index}
                    className="h-10 bg-gray-200 animate-pulse rounded"
                  ></div>
                ))}
              </div>
            ) : deathsRanking.length ? (
              <div className="border rounded-lg divide-y max-h-[520px] overflow-y-auto">
                {deathsRanking.map((country, index) => (
                  <div
                    key={`${country.country}-deaths-${index}`}
                    className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-gray-400 w-10 text-right">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800">
                          {country.country}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">
                        {formatNumber(country.deaths)}
                      </p>
                      <p className="text-xs text-gray-500">total deaths</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                There is no death statistics available. Import the latest CSV
                reports first.
              </p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Global infections ranking
                </h2>
                <p className="text-sm text-gray-500">
                  Every country sorted by total confirmed infections.
                </p>
              </div>
              {!loading && (
                <p className="text-sm text-gray-500">
                  {infectionsRanking.length.toLocaleString()} countries ranked
                </p>
              )}
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, index) => (
                  <div
                    key={index}
                    className="h-10 bg-gray-200 animate-pulse rounded"
                  ></div>
                ))}
              </div>
            ) : infectionsRanking.length ? (
              <div className="border rounded-lg divide-y max-h-[520px] overflow-y-auto">
                {infectionsRanking.map((country, index) => (
                  <div
                    key={`${country.country}-confirmed-${index}`}
                    className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-gray-400 w-10 text-right">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800">
                          {country.country}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-blue-600">
                        {formatNumber(country.confirmed)}
                      </p>
                      <p className="text-xs text-gray-500">confirmed cases</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                There is no infection statistics available. Import the latest
                CSV reports first.
              </p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Global recoveries ranking
                </h2>
                <p className="text-sm text-gray-500">
                  Every country sorted by total recoveries.
                </p>
              </div>
              {!loading && (
                <p className="text-sm text-gray-500">
                  {recoveriesRanking.length.toLocaleString()} countries ranked
                </p>
              )}
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, index) => (
                  <div
                    key={index}
                    className="h-10 bg-gray-200 animate-pulse rounded"
                  ></div>
                ))}
              </div>
            ) : recoveriesRanking.length ? (
              <div className="border rounded-lg divide-y max-h-[520px] overflow-y-auto">
                {recoveriesRanking.map((country, index) => (
                  <div
                    key={`${country.country}-recovered-${index}`}
                    className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-gray-400 w-10 text-right">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800">
                          {country.country}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">
                        {formatNumber(country.recovered)}
                      </p>
                      <p className="text-xs text-gray-500">total recovered</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                There is no recovery statistics available. Import the latest
                CSV reports first.
              </p>
            )}
          </div>
        </div>
        {/* About section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">About</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              This dashboard displays real-time global COVID-19 data. The
              statistics are aggregated from official sources.{' '}
            </p>
            {(firstUpdateDate || lastUpdateDate) && (
              <div className="text-xs text-gray-500 space-y-1">
                {firstUpdateDate && (
                  <p>
                    First data update : {firstUpdateDate}
                  </p>
                )}
                {lastUpdateDate && (
                  <p>
                    Last data update : {lastUpdateDate}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

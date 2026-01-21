import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country')

    // 1. Get the most recent date in the database
    const latestDateResult = await prisma.dailyGlobalStats.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true }
    })

    if (!latestDateResult) {
      return NextResponse.json({ error: 'No data available' }, { status: 404 })
    }

    const latestDate = latestDateResult.date

    // 2. Retrieve global stats for the most recent date
    const latestGlobalStats = await prisma.dailyGlobalStats.findFirst({
      where: { date: latestDate },
      orderBy: { date: 'desc' }
    })

    // 3. Retrieve global trend (last 30 days)
    const thirtyDaysAgo = new Date(latestDate)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const globalTrend = await prisma.dailyGlobalStats.findMany({
      where: {
        date: { 
          gte: thirtyDaysAgo,
          lte: latestDate
        }
      },
      orderBy: { date: 'asc' }
    })

    const earliestGlobalStat = await prisma.dailyGlobalStats.findFirst({
      orderBy: { date: 'asc' },
      select: { date: true }
    })

    // 4. Totals by country at latest date
    const countryTotals = await prisma.countryStats.findMany({
      where: { 
        date: latestDate 
      },
      orderBy: { 
        totalConfirmed: 'desc' 
      }
    })

    // 4b. Recovery fallback: take the latest non-zero recovered per country (fall back to latest even if zero)
    const recoveryCandidates = await prisma.countryStats.findMany({
      where: {
        date: { lte: latestDate }
      },
      orderBy: { date: 'desc' },
      select: {
        countryRegion: true,
        totalRecovered: true
      }
    })

    const recoveryMap = new Map<string, number>()
    for (const entry of recoveryCandidates) {
      const current = recoveryMap.get(entry.countryRegion)
      if (current === undefined) {
        recoveryMap.set(entry.countryRegion, entry.totalRecovered)
      } else if (current === 0 && entry.totalRecovered > 0) {
        // upgrade zero to the latest non-zero
        recoveryMap.set(entry.countryRegion, entry.totalRecovered)
      }
    }

    const adjustedCountryTotals = countryTotals.map((country) => {
      const recovered = recoveryMap.get(country.countryRegion)
      return {
        ...country,
        totalRecovered: recovered !== undefined ? recovered : country.totalRecovered
      }
    })

    const topCountries = adjustedCountryTotals.slice(0, 10)

    // 4c. Population lookup (latest available year)
    const latestPopulationYear = await prisma.countryPopulation.findFirst({
      orderBy: { year: 'desc' },
      select: { year: true }
    })

    const populationMap = new Map<string, number>()
    if (latestPopulationYear) {
      const populations = await prisma.countryPopulation.findMany({
        where: { year: latestPopulationYear.year }
      })
      for (const entry of populations) {
        populationMap.set(entry.country, Number(entry.population))
      }
    }

    // 5. If a country is specified, retrieve its details
    let countryDetails = null
    if (country) {
      const countryTrend = await prisma.countryStats.findMany({
        where: {
          countryRegion: country,
          date: { 
            gte: thirtyDaysAgo,
            lte: latestDate
          }
        },
        orderBy: { date: 'asc' }
      })

      const countryRegions = await prisma.dailyReport.findMany({
        where: {
          countryRegion: country,
          reportDate: latestDate
        },
        orderBy: { confirmed: 'desc' }
      })

      countryDetails = {
        trend: countryTrend,
        regions: countryRegions
      }
    }

    // 6. Compute continent-level stats
    const continentMapping: Record<string, string> = {
      'US': 'Americas',
      'Canada': 'Americas',
      'Brazil': 'Americas',
      'Mexico': 'Americas',
      'Argentina': 'Americas',
      'Colombia': 'Americas',
      'Peru': 'Americas',
      'Chile': 'Americas',
      'China': 'Asia',
      'India': 'Asia',
      'Japan': 'Asia',
      'Korea, South': 'Asia',
      'Indonesia': 'Asia',
      'Philippines': 'Asia',
      'Vietnam': 'Asia',
      'Thailand': 'Asia',
      'Malaysia': 'Asia',
      'France': 'Europe',
      'Germany': 'Europe',
      'Italy': 'Europe',
      'Spain': 'Europe',
      'United Kingdom': 'Europe',
      'Russia': 'Europe',
      'Turkey': 'Europe',
      'Poland': 'Europe',
      'Netherlands': 'Europe',
      'Belgium': 'Europe',
      'Ukraine': 'Europe',
      'Austria': 'Europe',
      'Australia': 'Oceania',
      'New Zealand': 'Oceania',
      'South Africa': 'Africa',
      'Egypt': 'Africa',
      'Morocco': 'Africa',
      'Tunisia': 'Africa'
    }

    type ContinentSummary = {
      continent: string
      confirmed: number
      deaths: number
      recovered: number
      active: number
      countries: number
    }

    const continentStats = countryTotals.reduce<Record<string, ContinentSummary>>((acc, country) => {
      const continent = continentMapping[country.countryRegion] || 'Other'

      if (!acc[continent]) {
        acc[continent] = {
          continent,
          confirmed: 0,
          deaths: 0,
          recovered: 0,
          active: 0,
          countries: 0
        }
      }

      acc[continent].confirmed += country.totalConfirmed
      acc[continent].deaths += country.totalDeaths
      acc[continent].recovered += country.totalRecovered
      acc[continent].active += country.totalActive
      acc[continent].countries += 1
      return acc
    }, {})

    return NextResponse.json({
      latestDate: latestDate,
      global: latestGlobalStats ? {
        totalConfirmed: Number(latestGlobalStats.totalConfirmed),
        totalDeaths: Number(latestGlobalStats.totalDeaths),
        totalRecovered: latestGlobalStats.totalRecovered > 0
          ? Number(latestGlobalStats.totalRecovered)
          : null,
        totalActive: Number(latestGlobalStats.totalActive),
        lastUpdate: latestGlobalStats.date,
        recoveredLastUpdate: latestGlobalStats.totalRecovered > 0
          ? latestGlobalStats.date
          : null
      } : null,
      globalTrend: globalTrend.map(stat => ({
        date: stat.date,
        confirmed: Number(stat.totalConfirmed),
        deaths: Number(stat.totalDeaths),
        recovered: Number(stat.totalRecovered),
        active: Number(stat.totalActive)
      })),
      dataRange: {
        firstDate: earliestGlobalStat?.date ?? null,
        lastDate: latestDate
      },
      topCountries: topCountries.map(country => ({
        country: country.countryRegion,
        confirmed: country.totalConfirmed,
        deaths: country.totalDeaths,
        recovered: country.totalRecovered,
        active: country.totalActive,
        incidentRate: country.incidentRate,
        caseFatalityRatio: country.caseFatalityRatio,
        population: populationMap.get(country.countryRegion) ?? null
      })),
      countryTotals: adjustedCountryTotals.map(country => ({
        country: country.countryRegion,
        confirmed: country.totalConfirmed,
        deaths: country.totalDeaths,
        recovered: country.totalRecovered,
        active: country.totalActive,
        incidentRate: country.incidentRate,
        caseFatalityRatio: country.caseFatalityRatio,
        population: populationMap.get(country.countryRegion) ?? null
      })),
      continentStats: Object.values(continentStats),
      countryDetails
    })

  } catch (error) {
    console.error('Error retrieving stats:', error)
    return NextResponse.json(
      { error: 'Error retrieving stats', details: String(error) },
      { status: 500 }
    )
  }
}

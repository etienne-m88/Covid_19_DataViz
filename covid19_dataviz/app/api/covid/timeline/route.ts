import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country')
    const limit = parseInt(searchParams.get('limit') || '90') // Default 90 days
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const deathsMode = searchParams.get('deathsMode') || 'cumulative'

    let startDate: Date | null = null
    let endDate: Date | null = null

    if (startDateParam) {
      const parsed = new Date(startDateParam)
      if (!Number.isNaN(parsed.getTime())) {
        startDate = parsed
      }
    }

    if (endDateParam) {
      const parsed = new Date(endDateParam)
      if (!Number.isNaN(parsed.getTime())) {
        endDate = parsed
      }
    }

    if (startDate && endDate && startDate > endDate) {
      const tmp = startDate
      startDate = endDate
      endDate = tmp
    }

    const dateFilter =
      startDate || endDate
        ? {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {})
          }
        : null

    if (country) {
      // Timeline for a specific country
      const countryTimeline = await prisma.countryStats.findMany({
        where: {
          countryRegion: country,
          ...(dateFilter ? { date: dateFilter } : {})
        },
        orderBy: { date: 'desc' },
        ...(dateFilter ? {} : { take: limit })
      })

      const years = Array.from(
        new Set(countryTimeline.map((stat) => stat.date.getUTCFullYear()))
      )
      const populationByYear = new Map<number, number>()
      if (years.length) {
        const populations = await prisma.countryPopulation.findMany({
          where: {
            country: country,
            year: { in: years }
          },
          select: { year: true, population: true }
        })
        for (const entry of populations) {
          populationByYear.set(entry.year, Number(entry.population))
        }
      }

      const timeline = countryTimeline.reverse().map((stat, index, arr) => {
        const prev = index > 0 ? arr[index - 1].totalDeaths : null
        const dailyDeaths =
          stat.newDeaths ??
          (prev !== null ? stat.totalDeaths - prev : stat.totalDeaths)

        const population = populationByYear.get(stat.date.getUTCFullYear()) ?? null

        return {
          date: stat.date,
          confirmed: stat.totalConfirmed,
          deaths: deathsMode === 'daily' ? dailyDeaths : stat.totalDeaths,
          newDeaths: stat.newDeaths ?? dailyDeaths,
          recovered: stat.totalRecovered > 0 ? stat.totalRecovered : null,
          active: stat.totalActive,
          incidentRate: stat.incidentRate,
          caseFatalityRatio: stat.caseFatalityRatio,
          population
        }
      })

      return NextResponse.json({
        country,
        timeline
      })
    } else {
      // Global timeline
      const globalTimeline = await prisma.dailyGlobalStats.findMany({
        where: dateFilter ? { date: dateFilter } : undefined,
        orderBy: { date: 'desc' },
        ...(dateFilter ? {} : { take: limit })
      })

      const timeline = globalTimeline.reverse().map((stat, index, arr) => {
        const prev = index > 0 ? arr[index - 1].totalDeaths : null
        const dailyDeaths =
          stat.newDeaths ??
          (prev !== null ? Number(stat.totalDeaths - prev) : Number(stat.totalDeaths))

        return {
          date: stat.date,
          confirmed: Number(stat.totalConfirmed),
          deaths: deathsMode === 'daily' ? dailyDeaths : Number(stat.totalDeaths),
          newDeaths: Number(stat.newDeaths ?? dailyDeaths),
          recovered: Number(stat.totalRecovered) > 0 ? Number(stat.totalRecovered) : null,
          active: Number(stat.totalActive)
        }
      })

      return NextResponse.json({
        timeline
      })
    }
  } catch (error) {
    console.error('Error retrieving timeline:', error)
    return NextResponse.json(
      { error: 'Error retrieving timeline' },
      { status: 500 }
    )
  }
}

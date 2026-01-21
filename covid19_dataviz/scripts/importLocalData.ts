import { PrismaClient } from '@prisma/client'
import Papa from 'papaparse'
import * as fs from 'fs'
import * as path from 'path'

// Create a Prisma client instance directly here
const prisma = new PrismaClient()

// Path to local CSV files
const CSV_DIR = path.join(process.cwd(), 'covid_19_daily_reports')

interface DailyReportRow {
  FIPS?: string
  Admin2?: string
  Province_State?: string
  'Province/State'?: string
  Country_Region?: string
  'Country/Region'?: string
  Last_Update?: string
  'Last Update'?: string
  Lat?: string
  Latitude?: string
  Long_?: string
  Longitude?: string
  Confirmed?: string
  Deaths?: string
  Recovered?: string
  Active?: string
  Combined_Key?: string
  Incident_Rate?: string
  'Incidence_Rate'?: string
  'Case-Fatality_Ratio'?: string
  'Case_Fatality_Ratio'?: string
}

function parseDate(filename: string): Date {
  // Format: MM-DD-YYYY.csv
  const match = filename.match(/(\d{2})-(\d{2})-(\d{4})\.csv/)
  if (match) {
    const [, month, day, year] = match
    return new Date(`${year}-${month}-${day}`)
  }
  throw new Error(`Format de fichier invalide: ${filename}`)
}

function parseValue(value: string | undefined, defaultValue: any = null): any {
  if (!value || value === '') return defaultValue
  return value
}

function parseNumber(value: string | undefined, defaultValue: number = 0): number {
  if (!value || value === '') return defaultValue
  const parsed = parseFloat(value)
  return isNaN(parsed) ? defaultValue : parsed
}

function parseInteger(value: string | undefined, defaultValue: number = 0): number {
  if (!value || value === '') return defaultValue
  const parsed = parseInt(value)
  return isNaN(parsed) ? defaultValue : parsed
}

async function readCSVFile(filePath: string): Promise<DailyReportRow[]> {
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  
  const result = Papa.parse<DailyReportRow>(fileContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header) => header.trim()
  })

  return result.data
}

async function importDailyReports() {
  console.log('🚀 Starting COVID-19 import from local CSV files...\n')

  try {
    // 1. Ensure the folder exists
    if (!fs.existsSync(CSV_DIR)) {
      throw new Error(`Folder ${CSV_DIR} does not exist!`)
    }

    // 2. List all CSV files
    const files = fs.readdirSync(CSV_DIR)
      .filter(file => file.endsWith('.csv'))
      .sort() // Sort by date

    console.log(`${files.length} CSV files found`)
    console.log(`   First: ${files[0]}`)
    console.log(`   Last: ${files[files.length - 1]}\n`)

    // 3. Wipe previous data
    console.log('Cleaning previous data...')
    await prisma.dailyReport.deleteMany({})
    await prisma.dailyGlobalStats.deleteMany({})
    await prisma.countryStats.deleteMany({})
    console.log('   ✓ Data cleared\n')

    // 4. Process each file
    const filesToProcess = files
    console.log(`Processing ${filesToProcess.length} files\n`)
    
    let totalRecords = 0
    const globalStatsByDate = new Map<string, any>()
    const countryStatsByDate = new Map<string, Map<string, any>>()

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i]
      const filePath = path.join(CSV_DIR, file)
      
      try {
        const reportDate = parseDate(file)
        const dateKey = reportDate.toISOString().split('T')[0]
        
        console.log(`[${i + 1}/${filesToProcess.length}] Processing ${file}...`)
        
        const rows = await readCSVFile(filePath)
        const dataToInsert: any[] = []
        
        // Initialize global stats for this date
        let dailyConfirmed = 0
        let dailyDeaths = 0
        let dailyRecovered = 0
        let dailyActive = 0

        // Initialize per-country stats for this date
        if (!countryStatsByDate.has(dateKey)) {
          countryStatsByDate.set(dateKey, new Map())
        }
        const countryStatsMap = countryStatsByDate.get(dateKey)!

        for (const row of rows) {
          // Support multiple column naming conventions
          const countryRegion = parseValue(
            row.Country_Region || row['Country/Region']
          )
          
          if (!countryRegion) continue

          const confirmed = parseInteger(row.Confirmed)
          const deaths = parseInteger(row.Deaths)
          const recovered = parseInteger(row.Recovered)
          const active = parseInteger(row.Active, confirmed - deaths - recovered)

          // Accumulate global stats
          dailyConfirmed += confirmed
          dailyDeaths += deaths
          dailyRecovered += recovered
          dailyActive += active

          // Accumulate per-country stats
          if (!countryStatsMap.has(countryRegion)) {
            countryStatsMap.set(countryRegion, {
              confirmed: 0,
              deaths: 0,
              recovered: 0,
              active: 0,
              incidentRates: [],
              fatalityRatios: []
            })
          }
          const countryStats = countryStatsMap.get(countryRegion)!
          countryStats.confirmed += confirmed
          countryStats.deaths += deaths
          countryStats.recovered += recovered
          countryStats.active += active

          const incidentRate = parseNumber(
            row.Incident_Rate || row.Incidence_Rate
          )
          const fatalityRatio = parseNumber(
            row['Case-Fatality_Ratio'] || row.Case_Fatality_Ratio
          )

          if (incidentRate > 0) countryStats.incidentRates.push(incidentRate)
          if (fatalityRatio > 0) countryStats.fatalityRatios.push(fatalityRatio)

          // Prepare detailed row
          dataToInsert.push({
            fips: parseValue(row.FIPS),
            admin2: parseValue(row.Admin2),
            provinceState: parseValue(
              row.Province_State || row['Province/State']
            ),
            countryRegion,
            lastUpdate: new Date(
              parseValue(row.Last_Update || row['Last Update'], reportDate.toISOString())
            ),
            latitude: parseNumber(row.Lat || row.Latitude),
            longitude: parseNumber(row.Long_ || row.Longitude),
            confirmed,
            deaths,
            recovered,
            active,
            combinedKey: parseValue(row.Combined_Key),
            incidentRate: incidentRate > 0 ? incidentRate : null,
            caseFatalityRatio: fatalityRatio > 0 ? fatalityRatio : null,
            reportDate
          })
        }

        // Store global stats
        globalStatsByDate.set(dateKey, {
          date: reportDate,
          totalConfirmed: dailyConfirmed,
          totalDeaths: dailyDeaths,
          totalRecovered: dailyRecovered,
          totalActive: dailyActive
        })

        // Insert data in batches
        const batchSize = 500
        for (let j = 0; j < dataToInsert.length; j += batchSize) {
          const batch = dataToInsert.slice(j, j + batchSize)
          await prisma.dailyReport.createMany({
            data: batch,
            skipDuplicates: true
          })
        }

        totalRecords += dataToInsert.length
        console.log(`   ✓ ${dataToInsert.length} records inserted`)

      } catch (error) {
        console.error(`Error with ${file}:`, error)
      }
    }

    // 5. Insert global statistics
    console.log('\n📊 Inserting global statistics...')
    for (const stats of globalStatsByDate.values()) {
      await prisma.dailyGlobalStats.create({
        data: {
          date: stats.date,
          totalConfirmed: BigInt(stats.totalConfirmed),
          totalDeaths: BigInt(stats.totalDeaths),
          totalRecovered: BigInt(stats.totalRecovered),
          totalActive: BigInt(stats.totalActive)
        }
      })
    }
    console.log(`   ✓ ${globalStatsByDate.size} days of global stats inserted`)

    // 6. Insert per-country statistics
    console.log('\nInserting per-country statistics...')
    let countryStatsCount = 0
    for (const [dateKey, countryMap] of countryStatsByDate.entries()) {
      const reportDate = new Date(dateKey)
      for (const [country, stats] of countryMap.entries()) {
        await prisma.countryStats.create({
          data: {
            countryRegion: country,
            date: reportDate,
            totalConfirmed: stats.confirmed,
            totalDeaths: stats.deaths,
            totalRecovered: stats.recovered,
            totalActive: stats.active,
            incidentRate: stats.incidentRates.length > 0
              ? stats.incidentRates.reduce((a: number, b: number) => a + b, 0) / stats.incidentRates.length
              : null,
            caseFatalityRatio: stats.fatalityRatios.length > 0
              ? stats.fatalityRatios.reduce((a: number, b: number) => a + b, 0) / stats.fatalityRatios.length
              : null
          }
        })
        countryStatsCount++
      }
    }
    console.log(`   ✓ ${countryStatsCount} country stats inserted`)

    // 7. Final summary
    const latestStats = Array.from(globalStatsByDate.values()).pop()
    console.log('\nImport completed successfully!')
    console.log(`Total records: ${totalRecords.toLocaleString()}`)
    console.log(`Days of data: ${globalStatsByDate.size}`)
    console.log(`Countries: ${new Set(
      Array.from(countryStatsByDate.values())
        .flatMap(m => Array.from(m.keys()))
    ).size}`)
    
    if (latestStats) {
      console.log('\nLatest global statistics:')
      console.log(`Confirmed: ${latestStats.totalConfirmed.toLocaleString()}`)
      console.log(`Deaths: ${latestStats.totalDeaths.toLocaleString()}`)
      console.log(`Recovered: ${latestStats.totalRecovered.toLocaleString()}`)
      console.log(`Active: ${latestStats.totalActive.toLocaleString()}`)
    }

  } catch (error) {
    console.error('Error during import:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
importDailyReports()
  .then(() => {
    console.log('\nScript completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nFatal error:', error)
    process.exit(1)
  })

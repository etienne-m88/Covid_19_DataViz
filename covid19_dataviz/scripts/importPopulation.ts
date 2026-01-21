import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'

type Row = Record<string, string>

const prisma = new PrismaClient()

const CSV_PATH = path.join(
  process.cwd(),
  'country_population',
  'API_SP.POP.TOTL_DS2_en_csv_v2_2461.csv'
)

const YEARS = ['2020', '2021', '2022', '2023']

function loadRows(): Row[] {
  const text = fs.readFileSync(CSV_PATH, { encoding: 'utf-8' })
  const lines = text.split(/\r?\n/)

  // Find header line starting with Country Name
  const headerIndex = lines.findIndex((line) => line.startsWith('\"Country Name\"') || line.startsWith('Country Name'))
  if (headerIndex === -1) {
    throw new Error('Header not found in population CSV')
  }

  const data = lines.slice(headerIndex).join('\n')
  const parsed = Papa.parse<Row>(data, {
    header: true,
    skipEmptyLines: true
  })
  return parsed.data
}

async function importPopulation() {
  console.log('🚀 Import population data (2020-2023)')

  const rows = await loadRows()
  console.log(`Found ${rows.length} rows`)

  const entries: { country: string; year: number; population: bigint }[] = []

  for (const row of rows) {
    const country = row['Country Name']
    if (!country) continue

    for (const year of YEARS) {
      const value = row[year]
      if (!value) continue
      const populationNum = Number(value)
      if (!Number.isFinite(populationNum)) continue
      entries.push({ country, year: Number(year), population: BigInt(Math.trunc(populationNum)) })
    }
  }

  console.log(`Prepared ${entries.length} country-year records`)

  console.log('Clearing previous CountryPopulation data...')
  await prisma.countryPopulation.deleteMany({})

  const chunkSize = 1000
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    await prisma.countryPopulation.createMany({
      data: chunk,
      skipDuplicates: true
    })
    console.log(`Inserted ${Math.min(i + chunkSize, entries.length)} / ${entries.length}`)
  }

  console.log('✅ Population import complete')
}

importPopulation()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

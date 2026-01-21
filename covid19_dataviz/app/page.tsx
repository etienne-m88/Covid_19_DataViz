'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="text-center space-y-8 max-w-2xl">
        {/* Titre */}
        <h1 className="text-5xl font-bold text-gray-900 tracking-tight">
          Welcome to Covid-19 DataViz
        </h1>
        
        {/* Phrase d'accroche */}
        <p className="text-xl text-gray-600 leading-relaxed">
          Discover a data visualization of the Covid-19 pandemic around the world.
        </p>
        
        {/* Bouton */}
        <div className="pt-4">
          <Link 
            href="/dashboard"
            className="inline-block bg-indigo-600 text-white font-semibold px-8 py-4 rounded-lg 
                       hover:bg-indigo-700 transition-colors duration-200 shadow-lg 
                       hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Access the Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}

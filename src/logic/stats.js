import { storage } from '../utils/storage.js'
import ApexCharts from 'apexcharts'

export const statsPage = () => ({
  /* =========================================================================
                          1. LOCAL STATE & CONFIGURATION
  ========================================================================= */
  // Core Utilities & State Pengontrol
  storage,
  timeFrame: 'Monthly',
  chartMode: 'line', // Tetap default awal ke area trend

  chart: null,

  // State Penampung Array Data
  topCategories: [],

  // State Akumulasi Finansial Utama
  summary: {
    totalIncome: 0,
    totalExpense: 0,
    savingsRate: 0,
  },

  // State Rapor Diagnosa Sistem
  insight: {
    status: 'Analysing...',
    message: 'Mohon tunggu, sedang menghitung data keuanganmu.',
  },

  // Kompas/jangkar utama navigasi bulan & tahun aktif
  anchorDate: new Date(),

  /* =========================================================================
              2. INITIALIZATION & REFRESH DATA (Core Data Flow)
  ========================================================================= */
  init() {
    // Pastikan DOM sudah siap sepenuhnya sebelum mengambil data awal
    this.$nextTick(() => {
      this.refreshData()
    })

    // Re-render otomatis setiap kali user mengubah filter periode (Weekly/Monthly/Yearly)
    this.$watch('timeFrame', () => this.refreshData())

    // SUNTIKAN BARU: Re-render otomatis jika user klik tombol ganti jenis grafik
    this.$watch('chartMode', () => this.refreshData())

    // Sinkronisasi Real-Time: Jika ada transaksi baru masuk di LocalStorage, data langsung ter-update otomatis
    window.addEventListener('storage', (e) => {
      if (e.key === 'DION_TRANSACTIONS') this.refreshData()
    })
  },

  refreshData() {
    const transactions = storage.getTransactions() || []

    // 1. Panggil Parser untuk mengolah Summary, Kategori, & Insight
    const parsedData = this._parseTransactionData(transactions, this.timeFrame)

    // 2. Update Local State UI Component
    this.summary = parsedData.summary
    this.topCategories = parsedData.categories
    this.insight = parsedData.insight

    // 3. Delegasikan tugas rendering grafik ke Helper Method khusus
    this._renderActiveChart(transactions)
  },

  /* =========================================================================
              3. INTERNAL HELPERS (Underscore Prefix - Not DRY)
  ========================================================================= */
  _renderActiveChart(transactions) {
    // A. FORCE DESTROY GRAPH LAMA: Bersihkan memori biar gak memory leak/tumpang tindih
    if (this.chart) {
      try {
        this.chart.destroy()
      } catch (e) {}
      this.chart = null
    }

    // B. KAMUS STRUKTUR KANVAS (Anti-DRY Configuration)
    // Memetakan mode grafik ke ID Container DOM pasangannya masing-masing
    const modeContainerMap = {
      radar: 'holder-canvas-radar',
      stacked: 'holder-canvas-stacked',
      line: 'holder-canvas-line',
    }

    // Ambil target ID berdasarkan mode aktif saat ini, default balik ke 'line' (Area Chart)
    const activeMode = modeContainerMap[this.chartMode]
      ? this.chartMode
      : 'line'
    const targetElementId = modeContainerMap[activeMode]

    // C. BERSIHKAN DOM CONTAINER SECARA AMAN
    const container = document.getElementById(targetElementId)
    if (container) {
      container.innerHTML = ''
    }

    // D. EKSEKUSI PIPELINE DATA & RENDERING SECARA MODULAR
    const chartPayload = this._generateChartData(
      transactions,
      this.timeFrame,
      activeMode,
    )

    this._renderChart(
      chartPayload.series,
      chartPayload.labels,
      activeMode,
      targetElementId,
    )
  },

  // ----------------------

  _parseTransactionData(transactions, frame) {
    const currentMonth = this.anchorDate.getMonth()
    const currentYear = this.anchorDate.getFullYear()

    // A. FILTER DATA PERIODE AKTIF (Sesuai Frame)
    const activeFiltered = transactions.filter((t) => {
      const d = new Date(t.date)
      return frame === 'Yearly'
        ? d.getFullYear() === currentYear
        : d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

    // B. HITUNG TOTAL CASHFLOW & MAP KATEGORI PERIODE AKTIF
    const { totalIn, totalOut, categoryMap } =
      this._calculateCategoryTotals(activeFiltered)

    // C. HITUNG TREN HISTORIS (Auto-Adaptif Bulan Lalu vs Tahun Lalu)
    const categories = this._calculateCategoryTrends(
      transactions,
      categoryMap,
      frame,
      totalOut,
    )

    // D. HITUNG SAVINGS RATE & RETURN DATA COMPONENT STATE
    const savingsRate = totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : 0

    return {
      summary: {
        totalIncome: totalIn,
        totalExpense: totalOut,
        savingsRate: Math.max(0, Math.round(savingsRate)),
      },
      categories,
      insight: this.generateSmartInsight(totalIn, totalOut, savingsRate),
    }
  },

  _calculateCategoryTotals(filteredTransactions) {
    return filteredTransactions.reduce(
      (acc, t) => {
        const amt = Number(t.amount) || 0
        if (t.type === 'income') {
          acc.totalIn += amt
        } else if (t.type === 'expense') {
          acc.totalOut += amt

          if (!acc.categoryMap[t.category]) {
            acc.categoryMap[t.category] = { amount: 0, transactionCount: 0 }
          }

          acc.categoryMap[t.category].amount += amt
          acc.categoryMap[t.category].transactionCount += 1
        }
        return acc
      },
      { totalIn: 0, totalOut: 0, categoryMap: {} },
    )
  },

  _calculateCategoryTrends(transactions, categoryMap, frame, totalOut) {
    const currentMonth = this.anchorDate.getMonth()
    const currentYear = this.anchorDate.getFullYear()
    const isYearly = frame === 'Yearly'

    // 1. TENTUKAN TARGET SENSOR MASA LALU (Bulan Lalu vs Tahun Lalu)
    const targetMonth = currentMonth === 0 ? 11 : currentMonth - 1
    const targetYearForMonth =
      currentMonth === 0 ? currentYear - 1 : currentYear
    const targetYearForYearly = currentYear - 1

    // 2. OPTIMASI PERFORMA: Ekstrak nominal masa lalu dalam 1 kali loop penuh (Anti-Nested Loop!)
    const pastCategoryTotals = {}
    transactions.forEach((t) => {
      if (t.type !== 'expense') return

      const d = new Date(t.date)
      const isMatchPast = isYearly
        ? d.getFullYear() === targetYearForYearly // Cocokkan Tahun Lalu jika Yearly
        : d.getMonth() === targetMonth && d.getFullYear() === targetYearForMonth // Cocokkan Bulan Lalu jika Monthly/Weekly

      if (isMatchPast) {
        pastCategoryTotals[t.category] =
          (pastCategoryTotals[t.category] || 0) + (Number(t.amount) || 0)
      }
    })

    // 3. FORMAT DAN HITUNG PERSENTASE TREN SECARA PRESISI
    return Object.keys(categoryMap)
      .map((catName) => {
        const currentAmt = categoryMap[catName].amount
        const transactionCount = categoryMap[catName].transactionCount
        const prevAmt = pastCategoryTotals[catName] || 0 // Ambil instan dari kamus optimasi kita

        let trend = ''
        let trendText = 'Baru periode ini'

        if (prevAmt > 0) {
          const diffPercent = ((currentAmt - prevAmt) / prevAmt) * 100
          const absPercent = Math.abs(Math.round(diffPercent))
          trend = diffPercent >= 0 ? 'up' : 'down'

          trendText =
            absPercent > 0
              ? `${trend === 'up' ? 'naik' : 'hemat'} ${absPercent}%`
              : 'Stabil'
        }

        return {
          name: catName,
          amount: currentAmt,
          percentage: totalOut > 0 ? (currentAmt / totalOut) * 100 : 0,
          transactionCount,
          averageAmount: Math.round(currentAmt / transactionCount),
          icon: this.getIconByCategory(catName),
          color: this.getColorByCategory(catName),
          trend,
          trendText,
        }
      })
      .sort((a, b) => b.amount - a.amount)
  },

  // ----------------------

  _generateChartData(transactions, frame, mode = 'line') {
    const currentMonth = this.anchorDate.getMonth()
    const currentYear = this.anchorDate.getFullYear()

    // Menyerahkan mandat penuh ke masing-masing sub-engine murni
    if (mode === 'line') {
      return this._generateLineChartData(
        transactions,
        frame,
        currentMonth,
        currentYear,
      )
    }
    if (mode === 'radar') {
      return this._generateRadarChartData(
        transactions,
        frame,
        currentMonth,
        currentYear,
      )
    }
    if (mode === 'stacked') {
      return this._generateStackedChartData(
        transactions,
        frame,
        currentMonth,
        currentYear,
      )
    }

    return { series: [], labels: [] }
  },

  _generateLineChartData(transactions, frame, currentMonth, currentYear) {
    let labels = []
    let incomeData = []
    let expenseData = []

    if (frame === 'Weekly') {
      labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']
      incomeData = [0, 0, 0, 0, 0, 0]
      expenseData = [0, 0, 0, 0, 0, 0]

      const firstDayInstance = new Date(currentYear, currentMonth, 1).getDay()
      const firstDayOfWeek = firstDayInstance + 1

      transactions.forEach((t) => {
        const d = new Date(t.date)
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          const dayOfMonth = d.getDate()
          const weekNum = Math.ceil((dayOfMonth + firstDayOfWeek - 1) / 7)
          const idx = Math.min(weekNum - 1, 5)

          const amt = Number(t.amount) || 0
          if (t.type === 'income') incomeData[idx] += amt
          else if (t.type === 'expense') expenseData[idx] += amt
        }
      })
    } else if (frame === 'Monthly') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1)
        labels.push(d.toLocaleString('id-ID', { month: 'short' }))

        const m = d.getMonth()
        const y = d.getFullYear()

        const monthly = transactions.filter((t) => {
          const td = new Date(t.date)
          return td.getMonth() === m && td.getFullYear() === y
        })

        incomeData.push(
          monthly
            .filter((t) => t.type === 'income')
            .reduce((s, t) => s + Number(t.amount), 0),
        )
        expenseData.push(
          monthly
            .filter((t) => t.type === 'expense')
            .reduce((s, t) => s + Number(t.amount), 0),
        )
      }
    } else if (frame === 'Yearly') {
      for (let i = 3; i >= 0; i--) {
        const targetYear = currentYear - i
        labels.push(targetYear.toString())

        const yearly = transactions.filter(
          (t) => new Date(t.date).getFullYear() === targetYear,
        )
        incomeData.push(
          yearly
            .filter((t) => t.type === 'income')
            .reduce((s, t) => s + Number(t.amount), 0),
        )
        expenseData.push(
          yearly
            .filter((t) => t.type === 'expense')
            .reduce((s, t) => s + Number(t.amount), 0),
        )
      }
    }

    return {
      series: [
        { name: 'In', data: incomeData },
        { name: 'Out', data: expenseData },
      ],
      labels,
    }
  },

  _generateRadarChartData(transactions, frame, currentMonth, currentYear) {
    const labels = ['LVG', 'LFST', 'TRA', 'SAV', 'PRTC']
    const radarValues = { living: 0, lifestyle: 0, transport: 0, protection: 0 }

    const isYearlyFrame = frame === 'Yearly'
    let savingsCalculated = 0

    if (isYearlyFrame) {
      const monthlyCashflow = Array.from({ length: 12 }, () => ({
        income: 0,
        expense: 0,
      }))

      transactions.forEach((t) => {
        const d = new Date(t.date)
        if (d.getFullYear() === currentYear) {
          const amt = Number(t.amount) || 0
          const m = d.getMonth()
          const cat = (t.category || '').toLowerCase()

          if (t.type === 'income') {
            monthlyCashflow[m].income += amt
          } else if (t.type === 'expense') {
            monthlyCashflow[m].expense += amt

            if (
              [
                'food',
                'groceries',
                'utilities',
                'internet',
                'health',
                'other',
              ].includes(cat)
            ) {
              radarValues.living += amt
            } else if (
              ['shopping', 'entertainment', 'self-care', 'gift'].includes(cat)
            ) {
              radarValues.lifestyle += amt
            } else if (['transport'].includes(cat)) {
              radarValues.transport += amt
            } else if (['subscription', 'education'].includes(cat)) {
              radarValues.protection += amt
            }
          }
        }
      })

      savingsCalculated = monthlyCashflow.reduce((totalSavings, bulan) => {
        return totalSavings + Math.max(0, bulan.income - bulan.expense)
      }, 0)
    } else {
      let totalInMonth = 0
      let totalOutMonth = 0

      transactions.forEach((t) => {
        const d = new Date(t.date)
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          const amt = Number(t.amount) || 0
          const cat = (t.category || '').toLowerCase()

          if (t.type === 'income') {
            totalInMonth += amt
          } else if (t.type === 'expense') {
            totalOutMonth += amt

            if (
              [
                'food',
                'groceries',
                'utilities',
                'internet',
                'health',
                'other',
              ].includes(cat)
            ) {
              radarValues.living += amt
            } else if (
              ['shopping', 'entertainment', 'self-care', 'gift'].includes(cat)
            ) {
              radarValues.lifestyle += amt
            } else if (['transport'].includes(cat)) {
              radarValues.transport += amt
            } else if (['subscription', 'education'].includes(cat)) {
              radarValues.protection += amt
            }
          }
        }
      })

      savingsCalculated = Math.max(0, totalInMonth - totalOutMonth)
    }

    const realRadarRupiah = {
      LVG: radarValues.living,
      LFST: radarValues.lifestyle,
      TRA: radarValues.transport,
      SAV: savingsCalculated,
      PRTC: radarValues.protection,
    }

    const seriesDataManipulated = [
      Math.round(Math.sqrt(radarValues.living)),
      Math.round(Math.sqrt(radarValues.lifestyle)),
      Math.round(Math.sqrt(radarValues.transport)),
      Math.round(Math.sqrt(savingsCalculated)),
      Math.round(Math.sqrt(radarValues.protection)),
    ]

    return {
      series: [{ name: 'Alokasi Finansial', data: seriesDataManipulated }],
      labels,
      realRadarRupiah,
    }
  },

  _generateStackedChartData(transactions, frame, currentMonth, currentYear) {
    const labels = []
    const monthlyDataRaw = []
    const isYearlyFrame = frame === 'Yearly'

    for (let i = 2; i >= 0; i--) {
      let periodExpenses = []

      if (isYearlyFrame) {
        const targetYear = currentYear - i
        labels.push(targetYear.toString())
        periodExpenses = transactions.filter((t) => {
          return (
            new Date(t.date).getFullYear() === targetYear &&
            t.type === 'expense'
          )
        })
      } else {
        const d = new Date(currentYear, currentMonth - i, 1)
        labels.push(d.toLocaleString('id-ID', { month: 'short' }))
        const m = d.getMonth()
        const y = d.getFullYear()

        periodExpenses = transactions.filter((t) => {
          const td = new Date(t.date)
          return (
            td.getMonth() === m &&
            td.getFullYear() === y &&
            t.type === 'expense'
          )
        })
      }

      const categoryTotals = {}
      periodExpenses.forEach((t) => {
        const cat = t.category || 'Other'
        categoryTotals[cat] =
          (categoryTotals[cat] || 0) + (Number(t.amount) || 0)
      })

      const sortedThisPeriod = Object.keys(categoryTotals)
        .map((cat) => ({ category: cat, amount: categoryTotals[cat] }))
        .sort((a, b) => a.amount - b.amount)

      monthlyDataRaw.push(sortedThisPeriod)
    }

    const maxLayers = Math.max(...monthlyDataRaw.map((arr) => arr.length))
    const series = []

    for (let layerIdx = 0; layerIdx < maxLayers; layerIdx++) {
      const dataManipulated = monthlyDataRaw.map((periodArr) => {
        const item = periodArr[layerIdx]
        return !item || item.amount === 0
          ? 0
          : Math.round(Math.sqrt(item.amount))
      })

      series.push({
        name: `Layer_${layerIdx}`,
        data: dataManipulated,
      })
    }

    return { series, labels, monthlyDataRaw }
  },

  // ----------------------

  _renderChart(series, labels, mode = 'line', targetElementId) {
    const container = document.getElementById(targetElementId)
    if (!container) return

    let options = {}

    // Delegasikan peracikan konfigurasi raksasa ke masing-masing sub-method murni
    if (mode === 'line') {
      options = this._getLineChartOptions(series, labels)
    } else if (mode === 'radar') {
      options = this._getRadarChartOptions(series, labels)
    } else if (mode === 'stacked') {
      options = this._getStackedChartOptions(series, labels)
    }

    // Eksekusi render instan ke layar murni gres!
    this.chart = new ApexCharts(container, options)
    this.chart.render()
  },

  _getLineChartOptions(series, labels) {
    return {
      series: series,
      chart: {
        type: 'area',
        height: 250,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
      colors: ['#34d399', '#FF2056'],
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 3 },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.5,
          opacityTo: 0,
          stops: [0, 90, 100],
        },
        opacity: 0.4,
      },
      grid: {
        borderColor: '#334155',
        strokeDashArray: 4,
        padding: { left: 15, right: 15 },
      },
      xaxis: {
        type: 'category',
        categories: labels,
        labels: {
          show: true,
          style: { colors: '#94a3b8', fontSize: '11px', fontWeight: 600 },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { show: false },
      legend: { show: false },
      tooltip: {
        theme: 'dark',
        style: { fontSize: '12px' },
        shared: true,
        intersect: false,
        custom: function ({ series, seriesIndex, dataPointIndex, w }) {
          const labelX =
            (w.globals.categoryLabels &&
              w.globals.categoryLabels[dataPointIndex]) ||
            (w.globals.labels && w.globals.labels[dataPointIndex]) ||
            (w.config.xaxis.categories &&
              w.config.xaxis.categories[dataPointIndex]) ||
            ''

          const rawText = String(labelX).trim()
          let headerText = rawText

          const kamusBulanLengkap = {
            Jan: 'Januari',
            Feb: 'Februari',
            Mar: 'Maret',
            Apr: 'April',
            Mei: 'Mei',
            Jun: 'Juni',
            Jul: 'Juli',
            Agu: 'Agustus',
            Sep: 'September',
            Okt: 'Oktober',
            Nov: 'November',
            Des: 'Desember',
          }

          if (/^[Ww]\d+$/.test(rawText)) {
            headerText = `Minggu Ke-${rawText.replace(/^[Ww]/, '')}`
          } else if (kamusBulanLengkap[rawText]) {
            headerText = `${kamusBulanLengkap[rawText]}`
          } else if (rawText.match(/^\d{4}$/)) {
            headerText = `Tahun ${rawText}`
          } else if (rawText) {
            headerText = rawText
          } else {
            headerText = 'Detail Data'
          }

          let nominalIn = 0
          let nominalOut = 0

          w.config.series.forEach((s, idx) => {
            const nameLower = s.name.toLowerCase()
            if (nameLower.includes('in') || nameLower.includes('pemasukan')) {
              nominalIn = series[idx][dataPointIndex] || 0
            } else if (
              nameLower.includes('out') ||
              nameLower.includes('pengeluaran')
            ) {
              nominalOut = series[idx][dataPointIndex] || 0
            }
          })

          return `
            <div class="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl font-sans w-44">
              <div class="text-xs font-bold text-slate-300 tracking-wide uppercase mb-2">${headerText}</div>
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">In</span>
                  </div>
                  <span class="text-[11px] font-semibold text-emerald-400">Rp ${nominalIn.toLocaleString('id-ID')}</span>
                </div>
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-rose-400"></span>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Out</span>
                  </div>
                  <span class="text-[11px] font-semibold text-rose-400">Rp ${nominalOut.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>
          `
        },
      },
    }
  },

  _getRadarChartOptions(series, labels) {
    const chartPayload = this._generateChartData(
      storage.getTransactions() || [],
      this.timeFrame,
      'radar',
    )
    const realRadarRupiah = chartPayload.realRadarRupiah || {}

    const pilarColorMap = {
      LVG: '#94a3b8',
      LFST: '#f472b6',
      TRA: '#fbbf24',
      SAV: '#34d399',
      PRTC: '#38bdf8',
    }

    return {
      series: series,
      chart: {
        type: 'radar',
        height: 260,
        toolbar: { show: false },
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        dropShadow: { enabled: true, blur: 3, left: 1, top: 1, opacity: 0.1 },
      },
      plotOptions: {
        radar: {
          size: 100,
          offsetX: 10,
          offsetY: 0,
          polygons: { strokeColors: '#bda9a9', connectorColors: '#bda9a9' },
        },
      },
      colors: ['#6366f1'],
      stroke: { width: 2 },
      fill: { opacity: 0.2 },
      markers: {
        size: 4,
        strokeColors: '#6366f1',
        strokeWidth: 1,
        hover: { size: 6 },
      },
      xaxis: {
        categories: labels,
        labels: {
          style: {
            colors: ['#94a3b8', '#f472b6', '#fbbf24', '#34d399', '#38bdf8'],
            fontSize: '11px',
            fontWeight: 600,
          },
        },
      },
      yaxis: { show: false, tickAmount: 4 },
      legend: { show: false },
      grid: { borderColor: '#334155', strokeDashArray: 2 },
      tooltip: {
        theme: 'dark',
        style: { fontSize: '12px' },
        custom: function ({ series, seriesIndex, dataPointIndex, w }) {
          const pilarCode = w.config.xaxis.categories[dataPointIndex]
          const nominalAsliRupiah = realRadarRupiah[pilarCode] || 0

          const pilarFullNames = {
            LVG: 'Living',
            LFST: 'Lifestyle',
            TRA: 'Transport',
            SAV: 'Savings',
            PRTC: 'Protection',
          }
          const pilarBreakdownMap = {
            LVG: 'Food, Groceries, Utilities, Internet, Health, Other',
            LFST: 'Shopping, Entertainment, Self-Care, Gift',
            TRA: 'Transport',
            SAV: 'Sisa Uang Bersih (Surplus Finansial)',
            PRTC: 'Subscription, Education',
          }

          return `
            <div class="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl font-sans w-44">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" style="background-color: ${pilarColorMap[pilarCode] || '#6366f1'}"></span>
                <span class="text-xs font-bold text-slate-200">${pilarFullNames[pilarCode] || pilarCode}</span>
              </div>
              <div class="text-[11px] font-semibold text-rose-400 mt-1">Rp ${nominalAsliRupiah.toLocaleString('id-ID')}</div>
              <div class="border-t border-slate-800 my-1.5"></div>
              <div class="text-[9px] text-slate-400 leading-normal font-medium tracking-wide whitespace-normal wrap-break-words">
                <span class="text-slate-500 block font-bold uppercase text-[8px] tracking-wider mb-0.5">Termasuk:</span>
                ${pilarBreakdownMap[pilarCode] || ''}
              </div>
            </div>
          `
        },
      },
    }
  },

  _getStackedChartOptions(series, labels) {
    const chartPayload = this._generateChartData(
      storage.getTransactions() || [],
      this.timeFrame,
      'stacked',
    )
    const realDataRupiah = chartPayload.monthlyDataRaw || []
    const currentFrame = this.timeFrame

    const categoryColorMap = {
      Food: '#6366f1',
      Transport: '#10b981',
      Shopping: '#ff4d6d',
      Groceries: '#34d399',
      Utilities: '#38bdf8',
      Internet: '#22d3ee',
      Health: '#f43f5e',
      Subscription: '#a855f7',
      Entertainment: '#ec4899',
      Education: '#f59e0b',
      'Self-Care': '#fb7185',
      Gift: '#f472b6',
      Investment: '#2defa1',
      Other: '#64748b',
    }
    const fallbackPalette = [
      '#f59e0b',
      '#14b8a6',
      '#f43f5e',
      '#84cc16',
      '#eab308',
      '#fb923c',
    ]

    const generatedColors = series.map((layer, layerIdx) => {
      return function ({ value, seriesIndex, dataPointIndex, w }) {
        const periodeDataArray = realDataRupiah[dataPointIndex] || []
        const targetItem = periodeDataArray[layerIdx]
        if (!targetItem) return '#64748b'
        return (
          categoryColorMap[targetItem.category] ||
          fallbackPalette[layerIdx % fallbackPalette.length]
        )
      }
    })

    return {
      series: series,
      chart: {
        type: 'bar',
        height: 260,
        stacked: true,
        toolbar: { show: false },
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
      colors: generatedColors,
      plotOptions: {
        bar: { horizontal: false, columnWidth: '40%', borderRadius: 6 },
      },
      dataLabels: { enabled: false },
      stroke: { show: true, width: 2, colors: ['#1D1E20'] },
      grid: {
        borderColor: '#334155',
        strokeDashArray: 4,
        padding: { left: 10, right: 10 },
      },
      xaxis: {
        categories: labels,
        labels: {
          style: { colors: '#94a3b8', fontSize: '11px', fontWeight: 600 },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { show: false },
      legend: { show: false },
      fill: { opacity: 1 },
      tooltip: {
        theme: 'dark',
        style: { fontSize: '12px' },
        shared: false,
        custom: function ({ series, seriesIndex, dataPointIndex, w }) {
          const periodeDataArray = realDataRupiah[dataPointIndex] || []
          const targetItem = periodeDataArray[seriesIndex]
          if (!targetItem || targetItem.amount === 0) return ''

          const kategoriName = targetItem.category
          const nominalAsliRupiah = targetItem.amount
          const totalPengeluaranPeriodeIni = periodeDataArray.reduce(
            (sum, item) => sum + (item.amount || 0),
            0,
          )
          const persentaseAsli =
            totalPengeluaranPeriodeIni > 0
              ? (
                  (nominalAsliRupiah / totalPengeluaranPeriodeIni) *
                  100
                ).toFixed(1)
              : 0

          const labelX =
            (w.globals.categoryLabels &&
              w.globals.categoryLabels[dataPointIndex]) ||
            (w.globals.labels && w.globals.labels[dataPointIndex]) ||
            (w.config.xaxis.categories &&
              w.config.xaxis.categories[dataPointIndex]) ||
            ''

          const rawText = String(labelX).trim()
          let headerText = rawText

          const kamusBulanLengkap = {
            Jan: 'Januari',
            Feb: 'Februari',
            Mar: 'Maret',
            Apr: 'April',
            Mei: 'Mei',
            Jun: 'Juni',
            Jul: 'Juli',
            Agu: 'Agustus',
            Sep: 'September',
            Okt: 'Oktober',
            Nov: 'November',
            Des: 'Desember',
          }

          if (currentFrame === 'Yearly' || rawText.match(/^\d{4}$/)) {
            headerText = `Tahun ${rawText}`
          } else if (kamusBulanLengkap[rawText]) {
            headerText = `${kamusBulanLengkap[rawText]}`
          } else if (rawText) {
            headerText = `Periode ${rawText}`
          }

          return `
            <div class="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl font-sans w-48">
              <div class="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1.5 pb-1 border-b border-slate-800">${headerText}</div>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" style="background-color: ${categoryColorMap[kategoriName] || fallbackPalette[seriesIndex % fallbackPalette.length]}"></span>
                <span class="text-xs font-bold text-slate-200">${kategoriName}</span>
              </div>
              <div class="text-[11px] font-semibold text-rose-400 mt-1 flex items-center gap-1.5">
                <span>Rp ${nominalAsliRupiah.toLocaleString('id-ID')}</span>
                <span class="text-slate-400 text-[10px] font-normal">(${persentaseAsli}%)</span>
              </div>
            </div>
          `
        },
      },
    }
  },
  /* =========================================================================
                        4. UI HELPERS & COMPUTED LOGIC
  ========================================================================= */
  prevPeriod() {
    const currentMonth = this.anchorDate.getMonth()
    const currentYear = this.anchorDate.getFullYear()

    if (this.timeFrame === 'Weekly' || this.timeFrame === 'Monthly') {
      // Mundur 1 bulan penuh
      this.anchorDate = new Date(currentYear, currentMonth - 1, 1)
    } else if (this.timeFrame === 'Yearly') {
      // Mundur 1 tahun penuh
      this.anchorDate = new Date(currentYear - 1, currentMonth, 1)
    }

    // Trigger re-render data global
    this.refreshData()
  },

  nextPeriod() {
    const now = new Date()
    const currentMonth = this.anchorDate.getMonth()
    const currentYear = this.anchorDate.getFullYear()

    if (this.timeFrame === 'Weekly' || this.timeFrame === 'Monthly') {
      const targetDate = new Date(currentYear, currentMonth + 1, 1)

      // GUARD RAILS: Jika bulan target melewati bulan berjalan asli saat ini, KUNCI MATI!
      if (
        targetDate.getFullYear() > now.getFullYear() ||
        (targetDate.getFullYear() === now.getFullYear() &&
          targetDate.getMonth() > now.getMonth())
      ) {
        return
      }
      this.anchorDate = targetDate
    } else if (this.timeFrame === 'Yearly') {
      const targetYear = currentYear + 1

      // GUARD RAILS: Jika tahun target melewati tahun berjalan asli saat ini, KUNCI MATI!
      if (targetYear > now.getFullYear()) {
        return
      }
      this.anchorDate = new Date(targetYear, currentMonth, 1)
    }

    // Trigger re-render data global
    this.refreshData()
  },

  getPeriodLabel() {
    if (this.timeFrame === 'Yearly') {
      return this.anchorDate.getFullYear().toString()
    }

    // Format menjadi "NamaBulan Tahun" (e.g., Mei 2026)
    return this.anchorDate.toLocaleString('id-ID', {
      month: 'long',
      year: 'numeric',
    })
  },

  getSummaryMessage() {
    const now = new Date()
    const isCurrent =
      this.anchorDate.getMonth() === now.getMonth() &&
      this.anchorDate.getFullYear() === now.getFullYear()

    const balance = this.summary.totalIncome - this.summary.totalExpense
    const isSurplus = balance >= 0

    // 1. KONDISI JIKA SALDO SURPLUS/AMAN (>= 0)
    if (isSurplus) {
      if (isCurrent) {
        return {
          icon: 'fa-solid fa-lightbulb text-amber-400',
          bgClass: 'border-emerald-100 bg-emerald-50 text-slate-700',
          text: 'Sisa saku aman. Pertahankan ritme ini sampai akhir periode!',
        }
      } else {
        return {
          icon: 'fa-solid fa-circle-check text-emerald-500',
          bgClass: 'border-emerald-100 bg-emerald-50 text-slate-700',
          text: 'Rapor keuangan periode ini tercatat aman dan terkendali dengan baik.',
        }
      }
    }

    // 2. KONDISI JIKA SALDO DEFISIT/MINUS (< 0)
    else {
      if (isCurrent) {
        return {
          icon: 'fa-solid fa-triangle-exclamation text-rose-500',
          bgClass: 'border-rose-100 bg-rose-50 text-rose-700 font-bold',
          text: 'Pengeluaran melebihi pemasukan! Yuk, rem dulu belanja impulsifnya.',
        }
      } else {
        return {
          icon: 'fa-solid fa-circle-xmark text-rose-500',
          bgClass: 'border-rose-100 bg-rose-50 text-rose-700 font-bold',
          text: 'Periode ini ditutup dengan evaluasi defisit. Mari lebih ketat di periode depan!',
        }
      }
    }
  },

  calculateMetricValue(id) {
    // Ambil data transaksi mentah dan filter murni berbasis periode jangkar aktif saat ini
    const transactions = storage.getTransactions() || []
    const currentMonth = this.anchorDate.getMonth()
    const currentYear = this.anchorDate.getFullYear()

    const periodTransactions = transactions.filter((t) => {
      const d = new Date(t.date)
      return this.timeFrame === 'Yearly'
        ? d.getFullYear() === currentYear
        : d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

    const expenses = periodTransactions.filter((t) => t.type === 'expense')
    const incomes = periodTransactions.filter((t) => t.type === 'income')

    // Hitung pondasi dasar total matematika uangnya
    const totalOut = expenses.reduce(
      (sum, t) => sum + (Number(t.amount) || 0),
      0,
    )
    const totalIn = incomes.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

    // Deteksi jumlah hari efektif di dalam periode terfilter
    const now = new Date()
    let daysInPeriod = 30
    if (this.timeFrame === 'Weekly' || this.timeFrame === 'Monthly') {
      const isCurrentMonth =
        currentMonth === now.getMonth() && currentYear === now.getFullYear()
      // Jika bulan berjalan, pembaginya adalah tanggal hari ini. Jika masa lalu, pembaginya full hari sebulan (e.g., 31 hari)
      daysInPeriod = isCurrentMonth
        ? now.getDate()
        : new Date(currentYear, currentMonth + 1, 0).getDate()
    } else {
      daysInPeriod =
        currentYear === now.getFullYear()
          ? Math.ceil(
              (now - new Date(currentYear, 0, 1)) / (1000 * 60 * 60 * 24),
            )
          : 365
    }

    // MASUK KE GERBANG EVALUASI LOGIKA 12 INDIKATOR
    switch (id) {
      case 1: // Burn Rate Harian
        const burnRate =
          daysInPeriod > 0 ? Math.round(totalOut / daysInPeriod) : 0
        return `Rp ${burnRate.toLocaleString('id-ID')} / hari`

      case 2: // Sisa Kuota Harian (Asumsi target batas aman hemat lo misal Rp 150rb atau sisa saldo dibagi hari)
        const sisaSaldo = Math.max(0, totalIn - totalOut)
        const sisaHari = Math.max(1, 30 - daysInPeriod)
        const kuota =
          this.timeFrame === 'Yearly'
            ? Math.round(sisaSaldo / 365)
            : Math.round(sisaSaldo / sisaHari)
        return `Rp ${kuota > 0 ? kuota.toLocaleString('id-ID') : '0'} / hari`

      case 3: // Proyeksi Akhir Bulan / Periode
        const avgDaily = daysInPeriod > 0 ? totalOut / daysInPeriod : 0
        const multiplier = this.timeFrame === 'Yearly' ? 365 : 30
        return `Rp ${Math.round(avgDaily * multiplier).toLocaleString('id-ID')}`

      case 4: // Fixed Cost Ratio (Kategori wajib: Utilities, Internet, Health, Edu, dsb)
        const fixedCategories = [
          'Utilities',
          'Internet',
          'Health',
          'Education',
          'Subscription',
        ]
        const fixedOut = expenses
          .filter((t) => fixedCategories.includes(t.category))
          .reduce((s, t) => s + (Number(t.amount) || 0), 0)
        const fixedRatio =
          totalOut > 0 ? Math.round((fixedOut / totalOut) * 100) : 0
        return `${fixedRatio}%`

      case 5: // Variable Cost Ratio (Kategori gaya hidup: Food, Shopping, Entertainment, dsb)
        const variableCategories = [
          'Food',
          'Shopping',
          'Entertainment',
          'Self-Care',
          'Transport',
          'Other',
        ]
        const varOut = expenses
          .filter((t) => variableCategories.includes(t.category))
          .reduce((s, t) => s + (Number(t.amount) || 0), 0)
        const varRatio =
          totalOut > 0 ? Math.round((varOut / totalOut) * 100) : 0
        return `${varRatio}%`

      case 6: // Expense-to-Income
        const expToInc =
          totalIn > 0 ? Math.round((totalOut / totalIn) * 100) : 0
        return totalIn > 0 ? `${expToInc}%` : 'No Income Data'

      case 7: // Budget-to-Income (Rasio limit anggaran terdaftar vs pemasukan, kita fallback aman)
        return totalIn > 0
          ? `${Math.round(((totalOut * 1.1) / totalIn) * 100)}%`
          : '85%'

      case 8: // Hari Terboros
        if (expenses.length === 0) return '-'

        // Grouping nominal belanja berdasarkan tanggal unik kalender
        const dateMap = expenses.reduce((acc, t) => {
          const dateStr = new Date(t.date).toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric', // <--- Menampilkan Tahun
          })
          acc[dateStr] = (acc[dateStr] || 0) + (Number(t.amount) || 0)
          return acc
        }, {})

        // Cari tahu tanggal mana yang akumulasi pengeluarannya paling besar
        const baddestDay = Object.keys(dateMap).reduce(
          (a, b) => (dateMap[a] > dateMap[b] ? a : b),
          '',
        )

        if (!baddestDay) return '-'
        // Output akhir gabungan: "Kamis, 14 Mei 2026 (Rp 1.500.000)"
        return `${baddestDay}\n(Rp ${dateMap[baddestDay].toLocaleString('id-ID')})`

      case 9: // Transaksi Tertinggi
        if (expenses.length === 0) return 'Rp 0'
        const maxAmt = Math.max(...expenses.map((t) => Number(t.amount) || 0))
        return `Rp ${maxAmt.toLocaleString('id-ID')}`

      case 10: // Kategori Terfrequent / Tersering
        if (expenses.length === 0) return '-'

        const freqMap = expenses.reduce((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + 1
          return acc
        }, {})

        const topFreqCat = Object.keys(freqMap).reduce(
          (a, b) => (freqMap[a] > freqMap[b] ? a : b),
          '',
        )

        return topFreqCat ? `${topFreqCat} (${freqMap[topFreqCat]}x)` : '-'

      case 11: // Kepatuhan Anggaran
        // Jika belum ada pemasukan sama sekali tapi sudah ada pengeluaran, otomatis dihukum skor 0
        if (totalIn === 0) {
          return totalOut > 0 ? '0 / 100' : '100 / 100'
        }

        const savingsRate = ((totalIn - totalOut) / totalIn) * 100
        let finalScore = 50 // Titik tengah ideal (Gaji habis pas tanpa utang)

        if (savingsRate >= 0) {
          // SKENARIO HEMAT: Plafon 30% Tabungan sudah dihitung sebagai pencapaian 100/100 sempurna!
          // Pengali 1.67 didapat dari 50 poin sisa skor dibagi target 30% (50 / 30 = 1.67)
          finalScore = 50 + Math.round(savingsRate * 1.67)
        } else {
          // SKENARIO BOROS: Skor merosot turun dari 50 menuju minimal 0 murni
          // Penggali dibikin proporsional agar jika boros/utang sebanyak 30% dari pemasukan, skor langsung drop ke 0
          finalScore = 50 - Math.round(Math.abs(savingsRate) * 1.67)
        }

        // Kunci pengaman (Guard Rails) agar skor tidak jebol di bawah 0 dan tidak meluber di atas 100
        const absoluteScore = Math.min(100, Math.max(0, finalScore))
        return `${absoluteScore} / 100`

      case 12: // Days of Runway (Sisa Napas Finansial)
        if (totalOut === 0) return 'Aman parah'
        const dailyRate = totalOut / daysInPeriod
        const currentBalance = totalIn - totalOut
        if (currentBalance <= 0) return '0 Hari Lagi'
        const remainingDays =
          dailyRate > 0 ? Math.round(currentBalance / dailyRate) : 0
        return `${remainingDays} Hari Lagi`

      default:
        return '-'

      case 13: // Kepatuhan Anggaran (BARU: Real membaca data DION_SETTINGS > budgets dari halaman sebelah)
        try {
          // 1. Ambil data settings global dari localStorage
          const localSettings = localStorage.getItem('DION_SETTINGS')
          if (!localSettings) return '100 / 100' // Jika belum bikin budget sama sekali, default aman

          const parsedSettings = JSON.parse(localSettings)
          const allBudgets = parsedSettings.budgets || []

          // 2. Filter budget yang bulannya DAN tahunnya sinkron dengan anchorDate aktif saat ini
          // Ingat: timeframe 'Yearly' akan mengabaikan filter bulan, sedangkan Weekly/Monthly membaca bulan aktif
          const activeBudgets = allBudgets.filter((b) => {
            return this.timeFrame === 'Yearly'
              ? Number(b.year) === currentYear
              : Number(b.month) === currentMonth &&
                  Number(b.year) === currentYear
          })

          if (activeBudgets.length === 0) return '100 / 100' // Balik ke 100 jika gak ada limit set di bulan itu

          // 3. Hitung total pengeluaran riil per kategori dari transaksi yang sudah terfilter di atas
          const actualExpenseMap = expenses.reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + (Number(t.amount) || 0)
            return acc
          }, {})

          let totalPenaltyPoints = 0
          let budgetCount = activeBudgets.length

          // 4. Cari dosa over-budget: Bandingkan limit belanja vs realitas pengeluaran lapangan
          activeBudgets.forEach((b) => {
            const limit = Number(b.limit) || 0
            const actualSpent = actualExpenseMap[b.category] || 0

            if (actualSpent > limit && limit > 0) {
              // Hitung seberapa brutal persentase over-budget-nya (Misal over 20% gajian)
              const overPercent = ((actualSpent - limit) / limit) * 100
              // Beri penalti poin secara proporsional dibagi rata jumlah limit terdaftar
              totalPenaltyPoints += overPercent / budgetCount
            }
          })

          // Start awal modal user adalah nilai kesempurnaan 100, lalu dipotong poin penalti dosa belanja
          const complianceScore = 100 - Math.round(totalPenaltyPoints)

          return `${Math.min(100, Math.max(0, complianceScore))} / 100`
        } catch (error) {
          return '100 / 100' // Safe fallback jika parse JSON bermasalah
        }
    }
  },

  generateSmartInsight(totalIn, totalOut, savingsRate) {
    const transactions = storage.getTransactions()
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Helper: Cek pengeluaran kategori tertentu

    const stats = transactions.reduce(
      (acc, t) => {
        const d = new Date(t.date)
        const isSameYear = d.getFullYear() === currentYear
        const isSameMonth = d.getMonth() === currentMonth

        // Logic Filter: Kalau Yearly cuma cek Tahun, kalau Monthly cek Bulan & Tahun
        const isInPeriod =
          this.timeFrame === 'Yearly' ? isSameYear : isSameMonth && isSameYear

        if (!isInPeriod) return acc

        // Itung datanya
        if (t.type === 'income') acc.incomeCount++
        if (t.type === 'expense') {
          if (t.category === 'Food') acc.food += Number(t.amount)
          if (t.category === 'Shopping') acc.shopping += Number(t.amount)
        }

        return acc
      },
      { food: 0, shopping: 0, incomeCount: 0 },
    )

    // 1. Kasus: Baru mulai (Data Kosong)
    if (totalIn === 0 && totalOut === 0)
      return {
        status: 'Halo Dion!',
        message:
          'Mulai catat transaksimu hari ini untuk melihat analisis keuangan yang cerdas di sini.',
      }

    // 2. Kasus: Defisit (Danger)
    if (totalOut > totalIn && totalIn > 0)
      return {
        status: 'Dompet Kritis!',
        message:
          'Pengeluaranmu sudah menjebol pemasukan. Coba cek kategori paling boros dan mulai ngerem pengeluaran ya!',
      }

    // 3. Kasus: Foodie (Boros di Makan)
    if (stats.food > totalOut * 0.5)
      return {
        status: 'Foodie Alert!',
        message:
          'Lebih dari 50% pengeluaranmu lari ke makanan. Mungkin sudah saatnya coba masak sendiri di rumah?',
      }

    // 4. Kasus: Impulsive Shopping
    if (stats.shopping > totalIn * 0.2)
      return {
        status: 'Rem Belanja!',
        message:
          'Belanja shopping kamu sudah tembus 20% gajian. Pastikan beli karena butuh, bukan sekadar laper mata.',
      }

    // 5. Kasus: Nabung Banyak (Excellent)
    if (savingsRate >= 40)
      return {
        status: 'Master of Saving',
        message: `Gokil! Kamu berhasil nabung ${Math.round(savingsRate)}% bulan ini. Pertahankan gaya hidup hemat ini, Dion!`,
      }

    // 6. Kasus: Pas-pasan (Breaking Even)
    if (savingsRate > 0 && savingsRate < 10)
      return {
        status: 'Zona Tipis',
        message:
          'Tabunganmu di bawah 10%. Coba pangkas pengeluaran kecil yang nggak perlu biar saldo akhir bulan lebih aman.',
      }

    // 7. Kasus: Income Hunter (Banyak Income)
    // const incomeCount = transactions.filter(
    //   (t) =>
    //     t.type === 'income' && new Date(t.date).getMonth() === now.getMonth(),
    // ).length
    if (stats.incomeCount > 3)
      return {
        status: 'Side Hustle King',
        message:
          'Gue liat ada banyak sumber pemasukan masuk. Manajemen cashflow-mu makin oke nih!',
      }

    // 8. Kasus: Konsisten (Stable)
    return {
      status: 'Keuangan Aman',
      message:
        'Sejauh ini ritme keuanganmu cukup stabil. Tetap disiplin catat transaksi biar nggak ada yang kelewat!',
    }
  },

  getIconByCategory(cat) {
    const icons = {
      Food: 'fa-utensils',
      Transport: 'fa-car',
      Shopping: 'fa-bag-shopping',
      Groceries: 'fa-basket-shopping',
      Utilities: 'fa-bolt',
      Internet: 'fa-wifi',
      Health: 'fa-heart-pulse',
      Subscription: 'fa-credit-card',
      Entertainment: 'fa-clapperboard',
      Education: 'fa-book-open',
      'Self-Care': 'fa-pump-soap',
      Gift: 'fa-gift',
      Investment: 'fa-chart-line',
      Bonus: 'fa-sack-dollar',
      Salary: 'fa-wallet',
      Freelance: 'fa-laptop-code',
      Other: 'fa-ellipsis',
    }
    return icons[cat] || 'fa-tag'
  },

  getColorByCategory(cat) {
    const colors = {
      Food: 'bg-orange-500',
      Transport: 'bg-blue-500',
      Shopping: 'bg-pink-500',
      Groceries: 'bg-teal-500',
      Utilities: 'bg-yellow-500',
      Internet: 'bg-indigo-500',
      Health: 'bg-rose-500',
      Subscription: 'bg-cyan-500',
      Entertainment: 'bg-purple-500',
      Education: 'bg-emerald-500',
      'Self-Care': 'bg-fuchsia-500',
      Gift: 'bg-violet-500',
      Other: 'bg-slate-500',
      Investment: 'bg-amber-600',
      Bonus: 'bg-lime-500',
      Salary: 'bg-green-600',
      Freelance: 'bg-sky-500',
    }
    return colors[cat] || 'bg-slate-400'
  },
})

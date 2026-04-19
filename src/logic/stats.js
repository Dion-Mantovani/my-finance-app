import { storage } from '../utils/storage.js'
import ApexCharts from 'apexcharts'

export const statsPage = () => ({
  showAmount: localStorage.getItem('DION_PRIVACY') !== 'false',
  timeFrame: 'Weekly',
  chart: null,
  topCategories: [],
  summary: {
    totalIncome: 0,
    totalExpense: 0,
    savingsRate: 0,
  },
  insight: {
    status: 'Analysing...',
    message: 'Mohon tunggu, sedang menghitung data keuanganmu.',
  },

  init() {
    this.refreshStats()

    // Tambahkan (this) agar TS tidak error
    this.$watch('timeFrame', () => this.refreshStats())

    window.addEventListener('storage', (e) => {
      if (e.key === 'DION_TRANSACTIONS') this.refreshStats()
    })
  },

  refreshStats() {
    const transactions = storage.getTransactions() || []

    // 1. Panggil Parser (Akan kita buat fungsinya di bawah)
    const parsedData = this.parseTransactionData(transactions, this.timeFrame)

    // 2. Update State untuk Summary & Kategori
    this.summary = parsedData.summary
    this.topCategories = parsedData.categories
    this.insight = parsedData.insight

    // 3. Update Grafik dengan Best Practice (Destroy & Recreate)
    this.renderChart(parsedData.chartSeries, parsedData.chartLabels)
  },

  parseTransactionData(transactions, frame) {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // --- 1. FILTER UNTUK SUMMARY & CATEGORY LIST (Bulan Berjalan) ---
    const summaryFiltered = transactions.filter((t) => {
      const d = new Date(t.date)
      return frame === 'Yearly'
        ? d.getFullYear() === currentYear
        : d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

    // --- 2. HITUNG SUMMARY (Income vs Expense) ---
    let { totalIn, totalOut, categoryMap } = summaryFiltered.reduce(
      (acc, t) => {
        const amt = Number(t.amount) || 0
        if (t.type === 'income') acc.totalIn += amt
        else if (t.type === 'expense') {
          acc.totalOut += amt
          acc.categoryMap[t.category] = (acc.categoryMap[t.category] || 0) + amt
        }
        return acc
      },
      { totalIn: 0, totalOut: 0, categoryMap: {} },
    )

    // --- 3. IDENTIFIKASI PERIODE LALU UNTUK HITUNG TREND ---
    // Cari tahu bulan lalu itu bulan apa dan tahun berapa
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear

    // --- 4. FORMAT DATA KATEGORI DENGAN REAL TREND % ---
    const categories = Object.keys(categoryMap)
      .map((catName) => {
        const currentAmt = categoryMap[catName]

        // Hitung berapa pengeluaran kategori ini di BULAN LALU
        const prevAmt = transactions.reduce((sum, t) => {
          const d = new Date(t.date)
          return t.category === catName &&
            t.type === 'expense' &&
            d.getMonth() === lastMonth &&
            d.getFullYear() === lastMonthYear
            ? sum + Number(t.amount)
            : sum
        }, 0)

        // Kalkulasi Persentase Perubahan
        let trend = ''
        let trendText = 'Baru bulan ini'

        if (prevAmt > 0) {
          const diffPercent = ((currentAmt - prevAmt) / prevAmt) * 100
          const absPercent = Math.abs(Math.round(diffPercent))
          trend = diffPercent >= 0 ? 'up' : 'down'

          // Jika naik 0% atau sangat kecil, anggap stabil/down
          trendText =
            absPercent > 0
              ? `${trend === 'up' ? 'naik' : 'hemat'} ${absPercent}%`
              : 'Stabil'
        }

        return {
          name: catName,
          amount: currentAmt,
          percentage: totalOut > 0 ? (currentAmt / totalOut) * 100 : 0,
          icon: this.getIconByCategory(catName),
          color: this.getColorByCategory(catName),
          trend,
          trendText,
        }
      })
      .sort((a, b) => b.amount - a.amount)

    // --- 5. GENERATE DATA CHART (Trend 3 Periode) ---
    const chartData = this.generateChartData(transactions, frame)

    const savingsRate = totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : 0

    return {
      summary: {
        totalIncome: totalIn,
        totalExpense: totalOut,
        savingsRate: Math.max(0, Math.round(savingsRate)),
      },
      categories: categories,
      insight: this.generateSmartInsight(totalIn, totalOut, savingsRate),
      chartSeries: chartData.series,
      chartLabels: chartData.labels,
    }
  },

  generateChartData(transactions, frame) {
    const now = new Date()
    let labels = []
    let incomeData = []
    let expenseData = []

    if (frame === 'Weekly') {
      labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']
      incomeData = [0, 0, 0, 0, 0]
      expenseData = [0, 0, 0, 0, 0]

      transactions.forEach((t) => {
        const d = new Date(t.date)
        if (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        ) {
          const day = d.getDate()
          const idx = Math.min(Math.floor((day - 1) / 7), 4)
          const amt = Number(t.amount) || 0
          if (t.type === 'income') incomeData[idx] += amt
          else if (t.type === 'expense') expenseData[idx] += amt
        }
      })
    } else if (frame === 'Monthly') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
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
      for (let i = 2; i >= 0; i--) {
        const targetYear = now.getFullYear() - i
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

  renderChart(series, labels) {
    if (this.chart) this.chart.destroy()

    const isWeekly = this.timeFrame === 'Weekly'
    const chartType = isWeekly ? 'bar' : 'area'

    const options = {
      series: series,
      chart: {
        type: chartType,
        height: 250,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        // Menghilangkan shadow di chart container jika ada
        dropShadow: { enabled: false },
      },
      plotOptions: {
        bar: {
          borderRadius: 6,
          columnWidth: '60%',
          borderRadiusApplication: 'around',
          // Memastikan tidak ada shadow bawaan dari plot
          dataLabels: { position: 'top' },
        },
      },
      colors: ['#34d399', '#FF2056'],
      dataLabels: { enabled: false },
      stroke: {
        curve: 'smooth',
        width: isWeekly ? 0 : 3,
      },
      // BAGIAN INI YANG DIUBAH JADI SOLID
      fill: {
        // Untuk Area Chart, kita pake gradient tapi opacity-nya diturunin
        type: isWeekly ? 'solid' : 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: isWeekly ? 1 : 0.5, // Turunin dari 0.4 ke 0.3 biar lebih tembus pandang
          opacityTo: 0, // Biar menghilang halus ke bawah
          stops: [0, 90, 100],
        },
        opacity: isWeekly ? 1 : 0.4,
      },

      // Memastikan tidak ada efek shadow/glow pada garis atau batang
      states: {
        hover: {
          filter: { type: 'none' },
        },
        active: {
          filter: { type: 'none' },
        },
      },
      grid: {
        borderColor: '#334155',
        strokeDashArray: 4,
        padding: { left: 10, right: 10 },
      },
      xaxis: {
        categories: labels,
        labels: {
          show: true,
          style: {
            colors: '#94a3b8',
            fontSize: '11px',
            fontWeight: 600,
          },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { show: false },
      legend: { show: false },
      tooltip: {
        theme: 'dark',
        x: { show: true },
        // Menghilangkan drop shadow di tooltip agar konsisten
        style: { fontSize: '12px' },
        y: {
          formatter: (val) => 'Rp ' + val.toLocaleString('id-ID'),
        },
      },
    }

    this.chart = new ApexCharts(this.$refs.chartCanvas, options)
    this.chart.render()
  },
})

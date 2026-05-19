import { storage } from '../utils/storage.js'
import ApexCharts from 'apexcharts'

export const homeDashboard = () => ({
  /* =========================================================================
                          1. LOCAL STATE & CONFIGURATION
  ========================================================================= */
  // Data Utama
  storage,
  transactions: [],
  criticalBudgets: [],

  // Saldo & Akumulasi Asset
  totalAsset: 0,

  // Monthly Cashflow
  monthlyIncome: 0,
  monthlyExpense: 0,

  // Daily Tracking
  dailyExpense: 0,
  greeting: {}, // Menyimpan teks & icon selamat pagi/malam

  // UI Components & State
  chart: null,
  alertTrigger: 0,

  /* =========================================================================
              2. INITIALIZATION & REFRESH DATA (Core Data Flow)
  ========================================================================= */
  init() {
    this.refreshData()
    window.addEventListener('storage', () => this.refreshData())
  },

  refreshData() {
    const allTx = storage.getTransactions() || []
    const settings = storage.getSettings()
    const wallets = settings.wallets || []

    // Ambil penanda waktu harian
    const todayStr = storage.formatLocalDate()

    // 1. Filter Transaksi Bulan Ini (Dipakai bersama oleh income, expense, dan budget)
    const now = new Date()
    const currentMonthTx = allTx.filter((t) => {
      const d = new Date(t.date)
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      )
    })

    // 2. Distribusi Hasil Kalkulasi Finansial (Memanfaatkan internal helper)
    this.monthlyIncome = this._sumAmount(currentMonthTx, 'income')
    this.monthlyExpense = this._sumAmount(currentMonthTx, 'expense')

    // 3. Kalkulasi Expense Hari Ini
    const todayExpenseTx = allTx.filter(
      (t) => t.type === 'expense' && t.date === todayStr,
    )
    this.dailyExpense = this._sumAmount(todayExpenseTx)

    // 4. Ambil Total Asset Terkini
    this.totalAsset = storage
      .getBalances(wallets, allTx)
      .totalAsset.toLocaleString('id-ID')

    // 5. Jalankan Evaluasi Budget Kuota & Update Komponen Greeting
    this._checkBudgets(settings.budgets || [], currentMonthTx)
    this.greeting = storage.getGreeting()

    // 6. Logic Transaksi Terakhir + wallet source
    this.transactions = allTx.slice(0, 5).map((item) => {
      const source = wallets.find((w) => w.id === item.walletId)
      const dest = item.walletIdDest
        ? wallets.find((w) => w.id === item.walletIdDest)
        : null
      return {
        ...item,
        walletSource: source ? source.name : 'Unknown Wallet',
        walletDestName: dest ? dest.name : '',
      }
    })

    // 7. Render Grafik Mingguan
    this._renderWeeklyHomeChart(allTx)
  },

  /* =========================================================================
              3. INTERNAL HELPERS (Underscore Prefix - Not DRY)
  ========================================================================= */
  _sumAmount(transactions, type = null) {
    return transactions
      .filter((t) => !type || t.type === type)
      .reduce((sum, t) => sum + Number(t.amount), 0)
      .toLocaleString('id-ID')
  },

  _checkBudgets(budgets, currentMonthTx) {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    this.criticalBudgets = budgets
      // 1. Filter kuota budget bulan & tahun ini
      .filter((b) => b.month === currentMonth && b.year === currentYear)
      .map((b) => {
        // Filter transaksi expense khusus untuk kategori budget ini
        const categoryExpenses = currentMonthTx.filter(
          (t) => t.type === 'expense' && t.category === b.category,
        )

        const usedStr = this._sumAmount(categoryExpenses)
        const used = Number(usedStr.replace(/\./g, ''))

        return {
          ...b,
          used,
          percentage: b.limit > 0 ? (used / b.limit) * 100 : 0,
          remaining: (b.limit - used).toLocaleString('id-ID'),
        }
      })
      // 2. Hanya ambil budget yang pemakaiannya sudah mencapai/melebihi 80%
      .filter((b) => b.percentage >= 80)
      // 3. Urutkan dari yang paling kritis (persentase tertinggi)
      .sort((a, b) => b.percentage - a.percentage)
      // 4. Ambil maksimal 3 data teratas buat ditampilin di list
      .slice(0, 3)
  },

  _getWeeklyExpenses(transactions) {
    const now = new Date()
    const currentDay = now.getDay() // 0 = Minggu, 1 = Senin, dst.

    // Hitung jarak mundur ke hari Senin minggu ini
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - distanceToMonday)
    monday.setHours(0, 0, 0, 0)

    const dailyExpenses = [0, 0, 0, 0, 0, 0, 0]

    transactions.forEach((t) => {
      if (!t || !t.type || !t.date) return

      const tDate = new Date(t.date)
      if (isNaN(tDate.getTime())) return
      tDate.setHours(0, 0, 0, 0)

      // Filter: Harus >= Senin minggu ini, <= Hari ini, dan tipenya wajib 'expense'
      if (tDate >= monday && tDate <= now && t.type === 'expense') {
        let dayIndex = tDate.getDay() - 1
        if (dayIndex === -1) dayIndex = 6 // Mengubah hari Minggu (0) jadi index terakhir (6)

        dailyExpenses[dayIndex] +=
          Number(String(t.amount).replace(/\D/g, '')) || 0
      }
    })

    return dailyExpenses
  },

  _renderWeeklyHomeChart(transactions) {
    // 1. Ambil data pengolahan angka dari internal helper
    const dailyExpenses = this._getWeeklyExpenses(transactions)

    // 2. Logic Dynamic Y-Axis (Minimal Rp 15.000)
    const maxExpense = Math.max(...dailyExpenses)
    const yAxisMax = maxExpense > 15000 ? maxExpense : 15000

    // 3. Hancurkan instance chart lama jika sudah ada
    if (this.chartHomeInstance) {
      this.chartHomeInstance.destroy()
    }

    // 4. Konfigurasi Options ApexCharts
    const options = {
      series: [{ name: 'Pengeluaran', data: dailyExpenses }],
      chart: {
        type: 'bar',
        height: 180,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
      plotOptions: {
        bar: {
          borderRadius: 6,
          columnWidth: '60%',
          borderRadiusApplication: 'around',
          dataLabels: { position: 'top' },
        },
      },
      colors: ['#818cf8'], // Indigo-400 mewah
      dataLabels: { enabled: false },
      states: {
        hover: { filter: { type: 'none' } },
        active: { filter: { type: 'none' } },
      },
      grid: {
        borderColor: '#808386',
        strokeDashArray: 4,
        padding: { left: 20, right: 20 },
      },
      xaxis: {
        type: 'category',
        categories: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
        tickPlacement: 'between',
        labels: {
          style: {
            colors: '#64748b',
            fontSize: '11px',
            fontWeight: 600,
          },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        min: 0,
        max: yAxisMax,
        show: false,
      },
      tooltip: {
        theme: 'dark',
        x: { show: true },
        y: {
          formatter: (val) => 'Rp ' + val.toLocaleString('id-ID'),
        },
      },
    }

    // 5. Render menggunakan target x-ref canvas lo
    if (this.$refs.chartCanvasHome) {
      this.chartHomeInstance = new ApexCharts(
        this.$refs.chartCanvasHome,
        options,
      )
      this.chartHomeInstance.render()
    }
  },

  _getAlertLocks() {
    const locks = localStorage.getItem('dashboard_alerts_lock')
    return locks
      ? JSON.parse(locks)
      : { critical: 0, has_expense: 0, no_expense: 0 }
  },

  _saveAlertLock(type, expireTime) {
    const currentLocks = this._getAlertLocks()
    currentLocks[type] = expireTime
    localStorage.setItem('dashboard_alerts_lock', JSON.stringify(currentLocks))
  },

  /* =========================================================================
                        4. UI HELPERS & COMPUTED LOGIC
  ========================================================================= */
  isAlertLocked(type) {
    this.alertTrigger // Pancingan reaktivitas Alpine
    const locks = this._getAlertLocks()
    return Date.now() < Number(locks[type] || 0)
  },

  dismissAlert() {
    const currentInsight = this.getDailyInsight()
    if (!currentInsight) return

    const now = Date.now()

    // 1. Jika Kritis -> Gembok 'critical' selama 3 Jam
    if (currentInsight.type === 'warning') {
      const hours3 = 3 * 60 * 60 * 1000
      this._saveAlertLock('critical', now + hours3)
    }

    // 2. Jika Info Biasa -> Gembok langsung sesuai ID-nya ('has_expense' / 'no_expense') selama 8 Jam
    else {
      const hours8 = 8 * 60 * 60 * 1000
      this._saveAlertLock(currentInsight.id, now + hours8)
    }

    // 3. Pancing Reaktivitas Alpine
    this.alertTrigger++
    if (typeof this.refreshData === 'function') this.refreshData()
  },

  getDailyInsight() {
    this.alertTrigger // Pancingan wajib reaktivitas Alpine di dalam fungsi pembaca

    const locks = this._getAlertLocks()
    const now = Date.now()

    // 1. KONDISI BUDGET KRITIS (Hanya tampil jika lolos sensor gembok critical)
    if (this.criticalBudgets.length > 0 && now >= Number(locks.critical || 0)) {
      const b = this.criticalBudgets[0]
      return {
        id: 'critical', // Tambahin ID unik buat patokan dismissAlert
        type: 'warning',
        icon: 'fa-triangle-exclamation',
        label: 'Attention Needed',
        message: `Your <span class="text-rose-600 font-bold">${b.category}</span> budget is almost empty.`,
      }
    }

    // 2. KONDISI BELUM ADA PENGELUARAN (Hanya tampil jika lolos sensor gembok no_expense)
    if (
      (this.dailyExpense === '0' || this.dailyExpense === 0) &&
      now >= Number(locks.no_expense || 0)
    ) {
      return {
        id: 'no_expense', // ID unik
        type: 'info',
        icon: 'fa-leaf',
        label: 'Daily Status',
        message: 'Clean slate! No spending yet today. ✨',
      }
    }

    // 3. KONDISI ADA PENGELUARAN (Hanya tampil jika lolos sensor gembok has_expense)
    if (
      this.dailyExpense !== '0' &&
      this.dailyExpense !== 0 &&
      now >= Number(locks.has_expense || 0)
    ) {
      return {
        id: 'has_expense', // ID unik
        type: 'info',
        icon: 'fa-chart-line',
        label: 'Spending Trend',
        message: `You've used <span class="text-indigo-600 font-bold">Rp ${this.dailyExpense}</span> today.`,
      }
    }

    // Jika kondisi yang aktif lagi kegembok semua, return null (alert bakal ilang dari layar)
    return null
  },
})

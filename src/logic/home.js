// 📌 START HERE

// ----------------------- LOCAL STATE -----------------------
// ----------------- INITIALIZATION & REFRESH DATA -----------------
// ----------------------- INTERNAL HELPERS -----------------------
// ------------------- UI HELPERS / COMPUTED LOGIC -------------------
// ----------------------- USER ACTION  -----------------------

import { storage } from '../utils/storage.js'
import ApexCharts from 'apexcharts'

export const homeDashboard = () => ({
  storage,
  transactions: [],
  criticalBudgets: [],
  totalAsset: 0,
  monthlyIncome: 0,
  monthlyExpense: 0,
  dailyExpense: 0,
  greeting: {},
  chart: null,
  alertTrigger: 0,

  init() {
    this.refreshData()
    window.addEventListener('storage', () => this.refreshData())
  },

  refreshData() {
    const allTx = storage.getTransactions() || []
    const settings = storage.getSettings()
    const wallets = settings.wallets || []
    const now = new Date()
    const todayStr = storage.formatLocalDate(now)

    // 1. Filter Transaksi Bulan Ini
    const currentMonthTx = allTx.filter((t) => {
      const d = new Date(t.date)
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      )
    })

    // 2. Kalkulasi Income & Expense Bulan Ini
    this.monthlyIncome = currentMonthTx
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0)
      .toLocaleString('id-ID')

    this.monthlyExpense = currentMonthTx
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0)
      .toLocaleString('id-ID')

    // 3. Kalkulasi Expense Hari Ini
    this.dailyExpense = allTx
      .filter((t) => t.type === 'expense' && t.date === todayStr)
      .reduce((sum, t) => sum + Number(t.amount), 0)
      .toLocaleString('id-ID')

    // 4. Ambil Total Asset
    this.totalAsset = storage
      .getBalances(wallets, allTx)
      .totalAsset.toLocaleString('id-ID')

    // 5. Logic Budget (Critical Budgets)
    this.checkBudgets(settings.budgets || [], currentMonthTx)

    // 6. Update Greeting (biar waktunya dinamis)
    this.greeting = storage.getGreeting()

    // 7. Logic Transaksi Terakhir + wallet source
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

    // Nanti weeklyData ini yang bakal kita umpan ke Chart.js
    this._renderWeeklyHomeChart(allTx)
  },

  checkBudgets(budgets, currentMonthTx) {
    const allTx = storage.getTransactions()
    const now = new Date()

    this.criticalBudgets = budgets
      // 1. Filter bulan & tahun ini
      .filter((b) => b.month === now.getMonth() && b.year === now.getFullYear())
      .map((b) => {
        const used = currentMonthTx
          .filter(
            (t) =>
              t.type === 'expense' &&
              t.category === b.category &&
              new Date(t.date).getMonth() === now.getMonth(),
          )
          .reduce((sum, t) => sum + Number(t.amount), 0)

        return {
          ...b,
          used,
          percentage: (used / b.limit) * 100,
          remaining: (b.limit - used).toLocaleString('id-ID'),
        }
      })
      // 2. Hanya yang di atas 80%
      .filter((b) => b.percentage >= 80)
      // 3. Urutkan dari yang paling kritis (persentase tertinggi)
      .sort((a, b) => b.percentage - a.percentage)
      // 4. Ambil maksimal 2 data
      .slice(0, 3)
  },

  // getDailyInsight() {
  //   if (this.criticalBudgets.length > 0) {
  //     const b = this.criticalBudgets[0]
  //     return {
  //       type: 'warning',
  //       icon: 'fa-triangle-exclamation',
  //       label: 'Attention Needed',
  //       message: `Your <span class="text-rose-600">${b.category}</span> budget is almost empty.`,
  //     }
  //   }

  //   if (this.dailyExpense === '0' || this.dailyExpense === 0) {
  //     return {
  //       type: 'info',
  //       icon: 'fa-leaf',
  //       label: 'Daily Status',
  //       message: 'Clean slate! No spending yet today. ✨',
  //     }
  //   }

  //   return {
  //     type: 'info',
  //     icon: 'fa-chart-line',
  //     label: 'Spending Trend',
  //     message: `You've used <span class="text-indigo-600">Rp ${this.dailyExpense}</span> today.`,
  //   }
  // },

  _renderWeeklyHomeChart(transactions) {
    // ==========================================
    // 1. LOGIC FILTER DATA MINGGUAN (SENIN - MINGGU)
    // ==========================================
    const now = new Date()
    const currentDay = now.getDay() // 0 = Minggu, 1 = Senin, dst.

    // Hitung jarak mundur ke hari Senin minggu ini
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - distanceToMonday)
    monday.setHours(0, 0, 0, 0) // Kunci di jam 00:00 awal hari Senin

    // Array default untuk menampung data pengeluaran [Sen, Sel, Rab, Kam, Jum, Sab, Min]
    const dailyExpenses = [0, 0, 0, 0, 0, 0, 0]

    // Loop data transaksi dengan pengaman (Guard Clause)
    transactions.forEach((t) => {
      if (!t || !t.type || !t.date) return // Skip jika data transaksi cacat

      const tDate = new Date(t.date)
      if (isNaN(tDate.getTime())) return // Skip jika format tanggal error
      tDate.setHours(0, 0, 0, 0)

      // Filter: Harus >= Senin minggu ini, <= Hari ini, dan tipenya wajib 'expense'
      if (tDate >= monday && tDate <= now && t.type === 'expense') {
        let dayIndex = tDate.getDay() - 1
        if (dayIndex === -1) dayIndex = 6 // Ubah hari Minggu (0) jadi index terakhir (6)

        // Tambahkan nominal pengeluaran (pake replace regex biar aman dari format string)
        dailyExpenses[dayIndex] +=
          Number(String(t.amount).replace(/\D/g, '')) || 0
      }
    })

    // ==========================================
    // 2. LOGIC DYNAMIC Y-AXIS (MINIMAL Rp 15.000)
    // ==========================================
    const maxExpense = Math.max(...dailyExpenses)
    // Gembok max Y-Axis di 15k jika pengeluaran ceper. Jika ada yang tembus, dia ngikutin otomatis.
    const yAxisMax = maxExpense > 15000 ? maxExpense : 15000

    // ==========================================
    // 3. INSIALISASI & RENDER APEXCHARTS PAKE X-REF
    // ==========================================
    // Hancurkan instance chart lama jika sudah ada biar gak tumpang tindih
    if (this.chartHomeInstance) {
      this.chartHomeInstance.destroy()
    }

    // Konfigurasi Options ApexCharts
    const options = {
      series: [
        {
          name: 'Pengeluaran',
          data: dailyExpenses,
        },
      ],
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
      colors: ['#818cf8'], // Indigo-400 biar mewah dan konsisten
      dataLabels: { enabled: false },
      states: {
        hover: {
          filter: { type: 'none' },
        },
        active: {
          filter: { type: 'none' },
        },
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
        max: yAxisMax, // Tetap mempertahankan logic limit dinamis 15k lo
        show: false, // KUNCI UTAMA: Menyembunyikan sumbu Y beserta label angkanya secara total
      },
      tooltip: {
        theme: 'dark',
        x: { show: true },
        y: {
          formatter: (val) => 'Rp ' + val.toLocaleString('id-ID'),
        },
      },
    }

    // Render menggunakan target x-ref canvas lo
    if (this.$refs.chartCanvasHome) {
      this.chartHomeInstance = new ApexCharts(
        this.$refs.chartCanvasHome,
        options,
      )
      this.chartHomeInstance.render()
    }
  },

  getAlertLocks() {
    const locks = localStorage.getItem('dashboard_alerts_lock')
    return locks
      ? JSON.parse(locks)
      : { critical: 0, has_expense: 0, no_expense: 0 }
  },

  saveAlertLock(type, expireTime) {
    const currentLocks = this.getAlertLocks()
    currentLocks[type] = expireTime
    localStorage.setItem('dashboard_alerts_lock', JSON.stringify(currentLocks))
  },

  isAlertLocked(type) {
    this.alertTrigger // Pancingan reaktivitas Alpine
    const locks = this.getAlertLocks()
    return Date.now() < Number(locks[type] || 0)
  },

  /**
   * CORE INTERACTION: Pas tombol close diklik
   * Menentukan gembok berdasarkan ID insight yang sedang aktif di layar
   */
  dismissAlert() {
    const currentInsight = this.getDailyInsight()
    if (!currentInsight) return

    const now = Date.now()

    if (currentInsight.type === 'warning') {
      const threeHours = now + 3 * 60 * 60 * 1000 // Kritis gembok 3 jam
      this.saveAlertLock('critical', threeHours)
    } else {
      const calendarHours = now + 8 * 60 * 60 * 1000 // Biasa gembok 8 jam

      if (currentInsight.id === 'has_expense') {
        this.saveAlertLock('has_expense', calendarHours)
      } else if (currentInsight.id === 'no_expense') {
        this.saveAlertLock('no_expense', calendarHours)
      }
    }

    this.alertTrigger++ // Trigger Alpine buat re-render detik ini juga
    if (typeof this.refreshData === 'function') this.refreshData()
  },

  /**
   * FUNGSI ASLI LO (UPDATED VERSION)
   * Tetep pake nama fungsi lama lo, tapi sekarang udah pinter nyaring gembok
   */
  getDailyInsight() {
    this.alertTrigger // Pancingan wajib reaktivitas Alpine di dalam fungsi pembaca

    const locks = this.getAlertLocks()
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
        // Tambahin .toLocaleString('id-ID') biar format rupiah lo rapi ada titik ribuan
        message: `You've used <span class="text-indigo-600 font-bold">Rp ${this.dailyExpense}</span> today.`,
      }
    }

    // Jika kondisi yang aktif lagi kegembok semua, return null (alert bakal ilang dari layar)
    return null
  },
})

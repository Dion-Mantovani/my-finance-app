import { storage } from '../utils/storage.js'

export const homeDashboard = () => ({
  storage,
  transactions: [],
  criticalBudgets: [],
  totalAsset: 0,
  monthlyIncome: 0,
  monthlyExpense: 0,
  dailyExpense: 0,
  greeting: {},

  init() {
    this.refreshData()
    window.addEventListener('storage', () => this.refreshData())
  },

  refreshData() {
    const allTx = storage.getTransactions()
    const settings = storage.getSettings()
    const wallets = settings.wallets || []
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

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
      // 2. Hanya yang di atas 90%
      .filter((b) => b.percentage >= 90)
      // 3. Urutkan dari yang paling kritis (persentase tertinggi)
      .sort((a, b) => b.percentage - a.percentage)
      // 4. Ambil maksimal 2 data
      .slice(0, 2)
  },

  getDailyInsight() {
    if (this.criticalBudgets.length > 0) {
      const b = this.criticalBudgets[0]
      return {
        type: 'warning',
        icon: 'fa-triangle-exclamation',
        label: 'Attention Needed',
        message: `Your <span class="text-rose-600">${b.category}</span> budget is almost empty.`,
      }
    }

    if (this.dailyExpense === '0' || this.dailyExpense === 0) {
      return {
        type: 'info',
        icon: 'fa-leaf',
        label: 'Daily Status',
        message: 'Clean slate! No spending yet today. ✨',
      }
    }

    return {
      type: 'info',
      icon: 'fa-chart-line',
      label: 'Spending Trend',
      message: `You've used <span class="text-indigo-600">Rp ${this.dailyExpense}</span> today.`,
    }
  },
})

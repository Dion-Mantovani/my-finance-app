import { storage } from '../utils/storage.js'

export const expensePage = () => ({
  storage,
  transactions: [],
  groupedTransactions: {},
  summary: { income: 0, expense: 0, balance: 0 },

  // Data Master
  wallets: [],
  categories: [],

  // States
  searchQuery: '',
  filterType: 'all',
  filterWallet: 'all',
  filterCategory: 'all',
  startDate: '',
  endDate: '',
  selectedDate: new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
  }).format(new Date()),
  showFilterModal: false,

  init() {
    const settings = storage.getSettings()
    this.wallets = settings.wallets || []
    this.categories = settings.categories || []

    this.refreshAll()

    window.addEventListener('storage', () => this.refreshAll())
  },

  refreshAll() {
    const allRawData = storage.getTransactions() || []
    const settings = storage.getSettings()
    const wallets = settings.wallets || []

    // STEP 1: Enrich Data (Sesuai dugaan lo, ID -> Nama dulu)
    const enrichedData = allRawData.map((item) => {
      const source = wallets.find((w) => String(w.id) === String(item.walletId))
      const dest = item.walletIdDest
        ? wallets.find((w) => String(w.id) === String(item.walletIdDest))
        : null

      return {
        ...item,
        walletName: source ? source.name : 'Unknown Wallet', // Kita pake 'walletName' biar konsisten
        walletDestName: dest ? dest.name : '',
      }
    })

    const filtered = enrichedData.filter((t) => {
      const matchesDate =
        this.startDate && this.endDate
          ? t.date >= this.startDate && t.date <= this.endDate
          : t.date === this.selectedDate

      const matchesSearch =
        (t.notes || '')
          .toLowerCase()
          .includes(this.searchQuery.toLowerCase()) ||
        (t.category || '')
          .toLowerCase()
          .includes(this.searchQuery.toLowerCase())

      const matchesType =
        this.filterType === 'all' ? true : t.type === this.filterType

      const matchesWallet =
        this.filterWallet === 'all' ||
        String(t.walletId) === String(this.filterWallet) ||
        (t.walletIdDest && String(t.walletIdDest) === String(this.filterWallet))

      const matchesCategory =
        this.filterCategory === 'all'
          ? true
          : t.category === this.filterCategory

      return (
        matchesDate &&
        matchesSearch &&
        matchesType &&
        matchesWallet &&
        matchesCategory
      )
    })

    this.calculateSummary(filtered)
    this.groupData(filtered)
    this.transactions = filtered
  },

  calculateSummary(data) {
    const income = data
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + Number(t.amount), 0)
    const expense = data
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount), 0)

    this.summary = {
      income: storage.formatCurrency(income),
      expense: storage.formatCurrency(expense),
      balance: storage.formatCurrency(income - expense),
    }
  },

  groupData(data) {
    // Inisialisasi object kosong agar tidak menumpuk data lama
    const groups = {}

    data.forEach((item) => {
      const dateKey = item.date // YYYY-MM-DD

      if (!groups[dateKey]) {
        groups[dateKey] = { items: [], totalDaily: 0 }
      }

      // Cari nama wallet dari data master
      const wallet = this.wallets.find((w) => w.id === item.walletId)
      const walletDest = item.walletIdDest
        ? this.wallets.find((w) => w.id === item.walletIdDest)
        : null

      groups[dateKey].items.push({
        ...item,
        walletSource: wallet ? wallet.name : 'Unknown Wallet',
        walletDestName: walletDest ? walletDest.name : '',
      })

      // Update saldo harian (Abaikan transfer agar tidak double count)
      if (item.type === 'income')
        groups[dateKey].totalDaily += Number(item.amount)
      if (item.type === 'expense')
        groups[dateKey].totalDaily -= Number(item.amount)
    })

    // Sort tanggal dari yang terbaru
    const sortedDates = Object.keys(groups).sort(
      (a, b) => new Date(b) - new Date(a),
    )

    const finalResult = {}
    sortedDates.forEach((date) => {
      finalResult[date] = {
        ...groups[date],
        formattedDate: storage.formatDateTitle(date), // Dipindah ke sini agar HTML tinggal pakai
        totalDailyLabel: storage.formatCurrency(groups[date].totalDaily),
      }
    })

    this.groupedTransactions = finalResult
  },

  // ------------ UI HELPERS (Hanya dipanggil di HTML) ------------

  isFilterActive() {
    return (
      this.filterType !== 'all' ||
      this.filterWallet !== 'all' ||
      this.filterCategory !== 'all' ||
      (this.startDate && this.endDate) ||
      this.searchQuery !== ''
    )
  },

  resetFilter() {
    this.filterType = 'all'
    this.filterWallet = 'all'
    this.filterCategory = 'all'
    this.startDate = ''
    this.endDate = ''
    this.searchQuery = ''
    this.refreshAll()
  },

  applyFilter() {
    this.showFilterModal = false
    this.refreshAll()
  },

  getDateLabel() {
    // 1. Range Date
    if (this.startDate && this.endDate) {
      const options = { day: 'numeric', month: 'short', year: 'numeric' }
      return `${new Date(this.startDate).toLocaleDateString('id-ID', options)} - ${new Date(this.endDate).toLocaleDateString('id-ID', options)}`
    }

    // 2. Single Date (Harian)
    const d = new Date(this.selectedDate)
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
    }).format(new Date())

    const dateStr = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    // Return "Today, Tanggal" atau "Nama Hari, Tanggal"
    return this.selectedDate === today
      ? `Today, ${dateStr}`
      : `${d.toLocaleDateString('id-ID', { weekday: 'long' })}, ${dateStr}`
  },

  changeDate(days) {
    const d = new Date(this.selectedDate)
    d.setDate(d.getDate() + days)

    // Update state & langsung refresh UI
    this.selectedDate = d.toISOString().split('T')[0]
    this.refreshAll()
  },
})

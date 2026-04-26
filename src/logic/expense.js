import { storage } from '../utils/storage.js'

export const expensePage = () => ({
  // ----------------------- LOCAL STATE -----------------------
  // Data Storage (Cache)
  storage,
  transactions: [],
  groupedTransactions: {},
  summary: { income: 0, expense: 0, balance: 0 },

  // Master Data (Buat dropdown filter)
  wallets: [],
  categories: [],

  // Filter State (UI)
  searchQuery: '',
  filterType: 'all',
  filterWallet: 'all',
  filterCategory: 'all',
  startDate: '',
  endDate: '',

  // Meta State
  isLoading: false,
  showFilterModal: false,

  // Tanggal Default (YYYY-MM-DD)
  selectedDate: new Date().toISOString().split('T')[0],

  // ----------------- INITIALIZATION & REFRESH DATA -----------------

  init() {
    // 1. Load Master Data (Langsung dari gatekeeper storage)
    const settings = storage.getSettings()
    this.wallets = settings.wallets
    this.categories = settings.categories

    // 2. Initial Data Load
    this.refreshAll()

    // 3. Storage Listener (Sync antar Tab)
    window.addEventListener('storage', (event) => {
      if (event.key === 'DION_TRANSACTIONS' || event.key === 'DION_SETTINGS') {
        this.refreshAll()
      }
    })
  },

  refreshAll() {
    const allRawData = storage.getTransactions() || []
    const query = this.searchQuery.toLowerCase()
    const isRange = this.startDate && this.endDate

    const filtered = allRawData.filter((t) => {
      const matchesDate = isRange
        ? t.date >= this.startDate && t.date <= this.endDate
        : t.date === this.selectedDate

      const matchesSearch =
        query === '' || `${t.notes} ${t.category}`.toLowerCase().includes(query)

      const matchesType =
        this.filterType === 'all' || t.type === this.filterType

      const matchesWallet =
        this.filterWallet === 'all' ||
        String(t.walletId) === String(this.filterWallet) ||
        (t.walletIdDest && String(t.walletIdDest) === String(this.filterWallet))

      const matchesCategory =
        this.filterCategory === 'all' || t.category === this.filterCategory

      return (
        matchesDate &&
        matchesSearch &&
        matchesType &&
        matchesWallet &&
        matchesCategory
      )
    })

    this._calculateSummary(filtered)
    this._groupData(filtered)
    this.transactions = filtered
  },

  // ----------------------- INTERNAL HELPERS -----------------------

  _calculateSummary(data) {
    // Sekali jalan (single pass) pake reduce untuk hitung keduanya
    const totals = data.reduce(
      (acc, t) => {
        const amt = Number(t.amount) || 0
        if (t.type === 'income') acc.income += amt
        if (t.type === 'expense') acc.expense += amt
        return acc
      },
      { income: 0, expense: 0 },
    )

    // Update state dengan format currency
    this.summary = {
      income: storage.formatCurrency(totals.income),
      expense: storage.formatCurrency(totals.expense),
      balance: storage.formatCurrency(totals.income - totals.expense),
      // Bonus: simpan angka mentahnya kalau sewaktu-waktu butuh buat logic lain
      rawBalance: totals.income - totals.expense,
    }
  },

  _groupData(data) {
    // 1. Inisialisasi object untuk menampung grup
    const groups = {}

    data.forEach((item) => {
      const dateKey = item.date // YYYY-MM-DD

      if (!groups[dateKey]) {
        groups[dateKey] = { items: [], totalDaily: 0 }
      }

      // // Cari nama wallet dari data master
      const wallet = this.wallets.find((w) => w.id === item.walletId)
      const walletDest = item.walletIdDest
        ? this.wallets.find((w) => w.id === item.walletIdDest)
        : null

      groups[dateKey].items.push({
        ...item,
        walletSource: wallet ? wallet.name : 'Unknown Wallet',
        walletDestName: walletDest ? walletDest.name : '',
      })

      // 2. Hitung Saldo Harian (Net Change)
      const amt = Number(item.amount) || 0
      if (item.type === 'income') groups[dateKey].totalDaily += amt
      if (item.type === 'expense') groups[dateKey].totalDaily -= amt
    })

    // 3. Sorting Tanggal (Terbaru di atas) & Formatting
    const sortedResult = {}

    Object.keys(groups)
      .sort((a, b) => new Date(b) - new Date(a))
      .forEach((date) => {
        sortedResult[date] = {
          ...groups[date],
          formattedDate: storage.formatDateTitle(date),
          totalDailyLabel: storage.formatCurrency(groups[date].totalDaily),
        }
      })

    this.groupedTransactions = sortedResult
  },

  // ------------------- UI HELPERS / COMPUTED LOGIC -------------------

  isFilterActive() {
    return (
      this.filterType !== 'all' ||
      this.filterWallet !== 'all' ||
      this.filterCategory !== 'all' ||
      (!!this.startDate && !!this.endDate) ||
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
    this.showFilterModal = false
    this.refreshAll()
  },

  applyFilter() {
    this.showFilterModal = false
    this.$nextTick(() => {
      this.refreshAll()
    })
  },

  getDateLabel() {
    const optionsLong = { day: 'numeric', month: 'long', year: 'numeric' }
    const optionsShort = { day: 'numeric', month: 'short', year: 'numeric' }

    // 1. Range Date (Periode)
    if (this.startDate && this.endDate) {
      // Pake helper buat minimalisir error timezone
      const start = new Date(this.startDate).toLocaleDateString(
        'id-ID',
        optionsShort,
      )
      const end = new Date(this.endDate).toLocaleDateString(
        'id-ID',
        optionsShort,
      )
      return `${start} - ${end}`
    }

    // 2. Single Date (Harian)
    const d = new Date(this.selectedDate)
    const todayStr = new Date().toISOString().split('T')[0]

    const fullDate = d.toLocaleDateString('id-ID', optionsLong)
    const dayName = d.toLocaleDateString('id-ID', { weekday: 'long' })

    // Return "Hari Ini, Tanggal" atau "Nama Hari, Tanggal"
    return this.selectedDate === todayStr
      ? `Hari Ini, ${fullDate}`
      : `${dayName}, ${fullDate}`
  },

  changeDate(days) {
    // 1. Pecah string YYYY-MM-DD biar nggak kena masalah timezone UTC
    const [year, month, day] = this.selectedDate.split('-').map(Number)

    // 2. Buat objek Date berdasarkan local time (bulan di JS mulai dari 0)
    const d = new Date(year, month - 1, day)

    // 3. Tambah/Kurang hari
    d.setDate(d.getDate() + days)

    // 4. Balikin ke format YYYY-MM-DD secara manual biar aman
    const newY = d.getFullYear()
    const newM = String(d.getMonth() + 1).padStart(2, '0')
    const newD = String(d.getDate()).padStart(2, '0')

    // 5. Update state & Refresh
    this.selectedDate = `${newY}-${newM}-${newD}`

    // Reset range filter kalau user navigasi harian biar nggak bentrok
    this.startDate = ''
    this.endDate = ''

    this.refreshAll()
  },
})

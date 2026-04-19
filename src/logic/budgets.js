import { storage } from '../utils/storage.js'

export const budgetPage = () => ({
  budgets: [],
  categoriesList: [],
  isBudgetModalOpen: false,
  isEditMode: false,
  editId: null,
  viewMonth: new Date().getMonth(),
  viewYear: new Date().getFullYear(),
  monthNames: [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ],

  newBudget: { category: '', limit: 0 },

  init() {
    const updateCats = () => {
      const settings = storage.getSettings() || {}
      this.categoriesList = (settings.categories || []).map((name, id) => ({
        id,
        name,
      }))
    }

    updateCats()
    this.refreshBudget()
    this.cleanupOldData()

    window.addEventListener('storage', (e) => {
      if (['DION_SETTINGS', 'DION_TRANSACTIONS'].includes(e.key)) {
        updateCats()
        this.refreshBudget()
      }
    })
  },

  isAtLimit() {
    const now = new Date()
    const currentTotal = now.getFullYear() * 12 + now.getMonth()
    const viewTotal = this.viewYear * 12 + this.viewMonth
    return currentTotal - viewTotal >= 12
  },

  prevMonth() {
    if (this.isAtLimit()) return
    if (--this.viewMonth < 0) {
      this.viewMonth = 11
      this.viewYear--
    }
    this.refreshBudget()
  },

  nextMonth() {
    if (this.isCurrentMonth()) return
    if (++this.viewMonth > 11) {
      this.viewMonth = 0
      this.viewYear++
    }
    this.refreshBudget()
  },

  cleanupOldData() {
    const settings = storage.getSettings() || {}
    if (!settings.budgets) return

    const now = new Date()
    const currentTotal = now.getFullYear() * 12 + now.getMonth()

    settings.budgets = settings.budgets.filter(
      (b) => currentTotal - (b.year * 12 + b.month) < 12,
    )

    storage.setSettings(settings)
  },

  refreshBudget() {
    const settings = storage.getSettings() || {}
    const allBudgets = settings.budgets || []
    const transactions = storage.getTransactions() // Pakai storage.js

    // FILTER berdasarkan viewMonth & viewYear (Bukan new Date() lagi)
    const monthlyBudgets = allBudgets.filter(
      (b) => b.month === this.viewMonth && b.year === this.viewYear,
    )

    this.budgets = monthlyBudgets.map((b) => {
      // FILTER 2: Hitung transaksi expense yang cocok kategori & bulannya
      const used = transactions.reduce((sum, t) => {
        const d = new Date(t.date)
        // Cek kategori, tipe expense, dan kecocokan waktu dalam satu baris
        if (
          t.category === b.category &&
          t.type === 'expense' &&
          d.getMonth() === this.viewMonth &&
          d.getFullYear() === this.viewYear
        ) {
          return sum + Number(t.amount)
        }
        return sum
      }, 0)

      return {
        ...b,
        used,
        remaining: b.limit - used,
        percentage: (used / b.limit) * 100,
        isOver: used > b.limit,
      }
    })
  },

  copyBudgets() {
    const lastBudget = this.getLastAvailableBudget()
    if (!lastBudget) return

    const settings = storage.getSettings() || {}

    // Clone data: ambil kategori & limit, set bulan & tahun ke view sekarang
    const duplicatedBudgets = lastBudget.data.map((b) => ({
      id: 'b-' + Date.now() + Math.random(), // ID baru
      category: b.category,
      limit: b.limit,
      month: this.viewMonth,
      year: this.viewYear,
      color: b.color || 'bg-indigo-600',
    }))

    settings.budgets.push(...duplicatedBudgets)
    storage.setSettings(settings)
    this.refreshBudget()
  },

  getLastAvailableBudget() {
    const allBudgets = (storage.getSettings() || {}).budgets || []
    if (!allBudgets.length) return null

    let month = this.viewMonth
    let year = this.viewYear

    // Mundur maksimal 12 bulan
    for (let i = 0; i < 12; i++) {
      if (--month < 0) {
        month = 11
        year--
      }

      const found = allBudgets.filter(
        (b) => b.month === month && b.year === year,
      )
      if (found.length) {
        return {
          monthName: this.monthNames[month],
          data: found,
        }
      }
    }
    return null
  },

  saveBudget() {
    // PENGAMAN TAMBAHAN: Cek apakah user mencoba save di bulan selain sekarang
    if (!this.isCurrentMonth()) {
      alert('History mode is read-only. You cannot modify past budgets.')
      return
    }

    if (!this.newBudget.category || !this.newBudget.limit) {
      return alert('Lengkapi data!')
    }

    const settings = storage.getSettings()
    settings.budgets = settings.budgets || []
    const { viewMonth, viewYear } = this

    if (this.isEditMode) {
      // Logic UPDATE
      const index = settings.budgets.findIndex((b) => b.id === this.editId)
      if (index !== -1) {
        settings.budgets[index] = {
          ...settings.budgets[index],
          category: this.newBudget.category,
          limit: Number(this.newBudget.limit),
        }
      }
    } else {
      // Cek duplikat hanya pas tambah baru [cite: 102]
      const isDuplicate = settings.budgets.some(
        (b) =>
          b.category === this.newBudget.category &&
          b.month === viewMonth &&
          b.year === viewYear,
      )
      if (isDuplicate) return alert('Budget kategori ini sudah ada!')

      settings.budgets.push({
        id: 'b-' + Date.now(),
        category: this.newBudget.category,
        limit: Number(this.newBudget.limit),
        month: viewMonth,
        year: viewYear,
        color: 'bg-indigo-600',
      })
    }

    storage.setSettings(settings)
    this.closeModal()
    this.refreshBudget()
  },

  deleteBudget() {
    if (!confirm('Yakin mau hapus budget ini?')) return

    const settings = storage.getSettings()
    settings.budgets = (settings.budgets || []).filter(
      (b) => b.id !== this.editId,
    )

    storage.setSettings(settings)
    this.closeModal()
    this.refreshBudget()
  },

  isCurrentMonth() {
    const now = new Date()
    return (
      this.viewMonth === now.getMonth() && this.viewYear === now.getFullYear()
    )
  },

  editBudget(budget) {
    this.isEditMode = true
    this.editId = budget.id
    this.newBudget = {
      category: budget.category,
      limit: budget.limit,
    }
    this.isBudgetModalOpen = true
  },

  closeModal() {
    this.isBudgetModalOpen = false
    this.isEditMode = false
    this.editId = null
    this.newBudget = { category: '', limit: 0 }
  },
})

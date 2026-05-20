import { storage } from '../utils/storage.js'

export const budgetPage = () => ({
  /* =========================================================================
                          1. LOCAL STATE & CONFIGURATION
  ========================================================================= */
  // Data Storage & Core Arrays (Cache)
  storage,
  budgets: [],
  tempBudgets: [],
  categoriesList: [],

  // UI Status / Flags / Modals
  isBudgetModalOpen: false,
  isEditMode: false,
  isReordering: false,
  editId: null,

  // View Configuration (Persisted)
  viewMode: localStorage.getItem('DION_BUDGET_VIEW_MODE') || 'card',
  originalViewBeforeEdit: null,

  // Date & Calendar Filter State
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

  // Form State (Single Object untuk Reset yang Lebih Mudah)
  newBudget: { category: '', limit: 0 },

  /* =========================================================================
              2. INITIALIZATION & REFRESH DATA (Core Data Flow)
  ========================================================================= */
  init() {
    const updateCats = () => {
      const settings = storage.getSettings() || {}
      this.categoriesList = (settings.categories || []).map((name, id) => ({
        id,
        name,
      }))
    }

    updateCats()
    this.refreshData()
    this.cleanupOldData()

    window.addEventListener('storage', (e) => {
      if (['DION_SETTINGS', 'DION_TRANSACTIONS'].includes(e.key)) {
        updateCats()
        this.refreshData()
      }
    })
  },

  refreshData() {
    const settings = storage.getSettings() || {}
    const allBudgets = settings.budgets || []
    const transactions = storage.getTransactions() // Pakai storage.js

    const orderedBudgets = this._ensureBudgetOrder(allBudgets)
    const monthlyBudgets = orderedBudgets.filter(
      (b) => b.month === this.viewMonth && b.year === this.viewYear,
    )

    this.budgets = monthlyBudgets.map((b) => {
      // FILTER 2: Hitung transaksi expense yang cocok kategori & bulannya
      const used = this._calculateCategorySpent(b.category, transactions)

      return {
        ...b,
        used,
        remaining: b.limit - used,
        percentage: (used / b.limit) * 100,
        isOver: used > b.limit,
      }
    })
  },

  /* =========================================================================
              3. INTERNAL HELPERS (Underscore Prefix - Not DRY)
  ========================================================================= */
  _ensureBudgetOrder(rawBudgets) {
    let needsMigration = false

    // 1. FILTER: Pisahkan data khusus bulan aktif & data masa lalu (Archive)
    const { currentMonthBudgets, archiveBudgets } = rawBudgets.reduce(
      (acc, b) => {
        const isCurrent = b.month === this.viewMonth && b.year === this.viewYear
        acc[isCurrent ? 'currentMonthBudgets' : 'archiveBudgets'].push(b)
        return acc
      },
      { currentMonthBudgets: [], archiveBudgets: [] },
    )

    // 2. MIGRASI: Hanya cek dan tambah properti 'order' pada data BULAN AKTIF yang belum punya
    let activeOrderCounter = 0
    const migratedActiveData = currentMonthBudgets.map((budget) => {
      if (budget.order === undefined) {
        needsMigration = true
        return { ...budget, order: activeOrderCounter++ }
      }
      activeOrderCounter = budget.order + 1
      return budget
    })

    // Urutkan data bulan aktif berdasarkan order-nya
    migratedActiveData.sort((a, b) => a.order - b.order)

    const finalCombinedBudgets = [...migratedActiveData, ...archiveBudgets]

    // 3. SIMPAN: Jika ada data baru yang dimigrasi, gabungkan kembali dengan data archive lalu save
    if (needsMigration) {
      const currentSettings = storage.getSettings() || {}
      currentSettings.budgets = finalCombinedBudgets
      storage.setSettings(currentSettings)
    }

    // 4. RETURN: Gabungkan kembali agar state utama 'budgets' di app lo tetep utuh
    // tapi bagian bulan aktifnya sudah rapi terurut di paling atas/sesuai urutan
    return finalCombinedBudgets
  },

  _calculateCategorySpent(category, transactions) {
    return transactions.reduce((sum, t) => {
      const d = new Date(t.date)

      const isMatch =
        t.category === category &&
        t.type === 'expense' &&
        d.getMonth() === this.viewMonth &&
        d.getFullYear() === this.viewYear

      return isMatch ? sum + Number(t.amount) : sum
    }, 0)
  },

  _handleCreateBudget(budgetsArray) {
    const { viewMonth, viewYear } = this

    // Cek duplikat kategori murni di bulan berjalan
    const isDuplicate = budgetsArray.some(
      (b) =>
        b.category === this.newBudget.category &&
        b.month === viewMonth &&
        b.year === viewYear,
    )
    if (isDuplicate) {
      alert('Budget kategori ini sudah ada!')
      return false
    }

    // Hitung sisa lapak order murni dari database berjalan
    const currentActiveCount = budgetsArray.filter(
      (b) => b.month === viewMonth && b.year === viewYear,
    ).length

    // Push data bersih
    budgetsArray.push({
      id: 'b-' + Date.now() + Math.random().toString(36).substring(2, 5), // ID unik pendek anti-desimal
      category: this.newBudget.category,
      limit: Number(this.newBudget.limit),
      month: viewMonth,
      year: viewYear,
      color: 'bg-indigo-600',
      order: currentActiveCount, // Taruh di urutan paling bontot
    })

    return true
  },

  _handleUpdateBudget(budgetsArray) {
    const targetIndex = budgetsArray.findIndex((b) => b.id === this.editId)

    if (targetIndex === -1) {
      alert('Data budget tidak ditemukan!')
      return false
    }

    // Update data dengan mempertahankan properti database orisinil (termasuk .order lama)
    budgetsArray[targetIndex] = {
      ...budgetsArray[targetIndex],
      category: this.newBudget.category,
      limit: Number(this.newBudget.limit),
    }

    return true
  },

  /* =========================================================================
                        4. UI HELPERS & COMPUTED LOGIC
  ========================================================================= */
  cleanupOldData() {
    const settings = storage.getSettings() || {}
    if (!settings.budgets) return

    const now = new Date()
    const currentTotal = now.getFullYear() * 12 + now.getMonth()

    // Hitung jumlah data awal sebelum disapu
    const initialLength = settings.budgets.length

    settings.budgets = settings.budgets.filter(
      (b) => currentTotal - (b.year * 12 + b.month) < 12,
    )

    if (settings.budgets.length !== initialLength) {
      storage.setSettings(settings)
    }
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
    this.refreshData()
  },

  nextMonth() {
    if (this.isCurrentMonth()) return
    if (++this.viewMonth > 11) {
      this.viewMonth = 0
      this.viewYear++
    }
    this.refreshData()
  },

  isCurrentMonth() {
    const now = new Date()
    return (
      this.viewMonth === now.getMonth() && this.viewYear === now.getFullYear()
    )
  },

  copyBudgets() {
    const lastBudget = this.getLastAvailableBudget()
    if (!lastBudget) return

    const settings = storage.getSettings() || {}

    // Clone data: ambil kategori & limit, set bulan & tahun ke view sekarang
    const duplicatedBudgets = lastBudget.data.map((b, index) => ({
      id: 'b-' + Date.now() + Math.random().toString(36).substring(2, 7),
      category: b.category,
      limit: b.limit,
      month: this.viewMonth,
      year: this.viewYear,
      color: b.color || 'bg-indigo-600',
      order: index,
    }))

    settings.budgets.push(...duplicatedBudgets)
    storage.setSettings(settings)
    this.refreshData()
  },

  getLastAvailableBudget() {
    const allBudgets = (storage.getSettings() || {}).budgets || []
    if (allBudgets.length === 0) return null

    let targetMonth = this.viewMonth
    let targetYear = this.viewYear

    // Mundur maksimal 12 bulan ke belakang untuk mencari data terdekat
    for (let i = 0; i < 12; i++) {
      if (--targetMonth < 0) {
        targetMonth = 11
        targetYear--
      }

      // REFACTOR: Gunakan .filter() hanya untuk bulan target di iterasi ini
      const foundBudgets = allBudgets.filter(
        (b) => b.month === targetMonth && b.year === targetYear,
      )

      // Begitu ditemukan data di bulan terdekat, langsung KELUAR dari loop (Early Return)
      if (foundBudgets.length > 0) {
        // REFACTOR: Pastikan data yang diambil di-copy bersih, buang properti dynamic UI (used, remaining, dll)
        const cleanFoundData = foundBudgets.map(
          ({ used, remaining, percentage, isOver, ...clean }) => clean,
        )

        return {
          monthName: this.monthNames[targetMonth],
          data: cleanFoundData,
        }
      }
    }
    return null
  },

  openEditModalBudget(budget) {
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

  toggleViewMode() {
    this.viewMode = this.viewMode === 'card' ? 'list' : 'card'
    localStorage.setItem('DION_BUDGET_VIEW_MODE', this.viewMode)
  },

  toggleEditOrder() {
    // GUARD: Kalau user lagi buka bulan lalu/archive, tombol ini mati total gak bisa diklik
    if (!this.isCurrentMonth()) return

    if (this.isReordering) {
      // --- FASE KELUAR ---

      // 1. Cek apakah urutan ID berubah
      const currentOrderIds = JSON.stringify(this.tempBudgets.map((b) => b.id))
      const originalOrderIds = JSON.stringify(this.budgets.map((b) => b.id))

      if (currentOrderIds !== originalOrderIds) {
        // Ada perubahan, tanya user
        if (confirm('Simpan urutan kategori budget yang baru?')) {
          this.saveNewOrder() // Fungsi simpan permanen
        } else {
          // User batal, reset tempWallets ke data asli
          this.tempBudgets = JSON.parse(JSON.stringify(this.budgets))
        }
      }

      // 2. Kembalikan tampilan ke mode semula (Card atau List)
      this.viewMode = this.originalViewBeforeEdit
      this.isReordering = false
    } else {
      // --- FASE MASUK ---

      // 1. Catat mode user saat ini
      this.originalViewBeforeEdit = this.viewMode

      // 2. Paksa pindah ke List agar sorting lebih enak
      this.viewMode = 'list'
      this.isReordering = true

      // 3. Siapkan draft urutan (Murni DEEP COPY data bulan aktif saja, data archive ditinggal)
      this.tempBudgets = JSON.parse(JSON.stringify(this.budgets))
    }
  },

  moveUp(index) {
    if (index > 0) {
      // 1. Ambil elemen kategori budget yang mau dipindah
      const currentItem = this.tempBudgets[index]
      const aboveItem = this.tempBudgets[index - 1]

      // 2. Tukar posisi di array tempBudgets
      this.tempBudgets[index - 1] = currentItem
      this.tempBudgets[index] = aboveItem

      // 3. Update properti 'order' agar sinkron dengan urutan index array baru
      this.reassignTempOrder()
    }
  },

  moveDown(index) {
    if (index < this.tempBudgets.length - 1) {
      // 1. Ambil elemen kategori budget yang mau dipindah
      const currentItem = this.tempBudgets[index]
      const belowItem = this.tempBudgets[index + 1]

      // 2. Tukar posisi di array tempBudgets
      this.tempBudgets[index + 1] = currentItem
      this.tempBudgets[index] = belowItem

      // 3. Update properti 'order' agar sinkron dengan urutan index array baru
      this.reassignTempOrder()
    }
  },

  reassignTempOrder() {
    this.tempBudgets.forEach((budget, i) => {
      budget.order = i
    })
    // Trigger Alpine untuk render ulang dengan spread operator
    this.tempBudgets = [...this.tempBudgets]
  },

  /* =========================================================================
                                5. USER ACTION
  ========================================================================= */

  saveNewOrder() {
    // 1. Bersihkan data virtual jika ada (Sesuai taktik wallet lo)
    // Kalau di budget lo gak ada properti hitungan dinamis yang aneh-aneh, copy biasa aja udah cukup.
    const activeBudgetsToSave = this.tempBudgets.map(
      ({ used, remaining, percentage, isOver, ...cleanBudget }) => cleanBudget,
    )

    // 2. Ambil data database utuh saat ini untuk memisahkan data Archive
    const currentSettings = storage.getSettings() || {}
    const allRawBudgets = currentSettings.budgets || []

    // Filter untuk mengamankan data masa lalu (Archive) agar TIDAK TERHAPUS
    const archiveBudgets = allRawBudgets.filter(
      (b) => !(b.month === this.viewMonth && b.year === this.viewYear),
    )

    // 3. GABUNGKAN: Data bulan aktif yang baru diacak + data archive masa lalu
    const finalBudgetsToSave = [...activeBudgetsToSave, ...archiveBudgets]

    // 4. Simpan permanen ke localStorage
    currentSettings.budgets = finalBudgetsToSave
    storage.setSettings(currentSettings)

    this.refreshData()
  },

  saveBudget() {
    // 1. GUARD: Validasi Hak Akses Halaman (Read-Only History)
    if (!this.isCurrentMonth()) {
      alert('History mode is read-only. You cannot modify past budgets.')
      return
    }

    // 2. GUARD: Validasi Input Form Kosong
    if (!this.newBudget.category || !this.newBudget.limit) {
      alert('Lengkapi data!')
      return
    }

    const settings = storage.getSettings() || {}
    settings.budgets = settings.budgets || []

    // 3. LOGIC ORCHESTRATION: Pecah alur menggunakan internal helper
    if (this.isEditMode) {
      const isUpdated = this._handleUpdateBudget(settings.budgets)
      if (!isUpdated) return
    } else {
      const isCreated = this._handleCreateBudget(settings.budgets)
      if (!isCreated) return
    }

    storage.setSettings(settings)
    this.closeModal()
    this.refreshData()
  },

  deleteBudget() {
    if (!confirm('Yakin mau hapus budget ini?')) return

    const settings = storage.getSettings()
    settings.budgets = (settings.budgets || []).filter(
      (b) => b.id !== this.editId,
    )

    storage.setSettings(settings)
    this.closeModal()
    this.refreshData()
  },
})

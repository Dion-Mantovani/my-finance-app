import { storage } from '../utils/storage.js'

export const budgetPage = () => ({
  storage,
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

  viewMode: localStorage.getItem('DION_BUDGET_VIEW_MODE') || 'card',
  tempBudgets: [],
  isEditMode: false,
  isReordering: false,
  originalViewBeforeEdit: null,

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
      // Cek duplikat hanya pas tambah baru
      const isDuplicate = settings.budgets.some(
        (b) =>
          b.category === this.newBudget.category &&
          b.month === viewMonth &&
          b.year === viewYear,
      )
      if (isDuplicate) return alert('Budget kategori ini sudah ada!')

      // FIX AKURAT DI SINI: Hitung jumlah budget bulan berjalan LANGSUNG dari database
      const currentActiveBudgetsCount = settings.budgets.filter(
        (b) => b.month === viewMonth && b.year === viewYear,
      )

      settings.budgets.push({
        id: 'b-' + Date.now(),
        category: this.newBudget.category,
        limit: Number(this.newBudget.limit),
        month: viewMonth,
        year: viewYear,
        color: 'bg-indigo-600',
        order: currentActiveBudgetsCount.length,
      })
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

  isCurrentMonth() {
    const now = new Date()
    return (
      this.viewMonth === now.getMonth() && this.viewYear === now.getFullYear()
    )
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

  // ==================================

  toggleViewMode() {
    this.viewMode = this.viewMode === 'card' ? 'list' : 'card'
    localStorage.setItem('DION_BUDGET_VIEW_MODE', this.viewMode)
  },

  _ensureBudgetOrder(rawBudgets) {
    let needsMigration = false

    // 1. FILTER: Pisahkan data khusus bulan aktif & data masa lalu (Archive)
    const currentMonthBudgets = rawBudgets.filter(
      (b) => b.month === this.viewMonth && b.year === this.viewYear,
    )
    const archiveBudgets = rawBudgets.filter(
      (b) => !(b.month === this.viewMonth && b.year === this.viewYear),
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

    // 3. SIMPAN: Jika ada data baru yang dimigrasi, gabungkan kembali dengan data archive lalu save
    if (needsMigration) {
      const currentSettings = storage.getSettings() || {}
      currentSettings.budgets = [...migratedActiveData, ...archiveBudgets]
      storage.setSettings(currentSettings)
    }

    // 4. RETURN: Gabungkan kembali agar state utama 'budgets' di app lo tetep utuh
    // tapi bagian bulan aktifnya sudah rapi terurut di paling atas/sesuai urutan
    return [...migratedActiveData, ...archiveBudgets]
  },

  toggleEditOrder() {
    // GUARD: Kalau user lagi buka bulan lalu/archive, tombol ini mati total gak bisa diklik
    if (!this.isCurrentMonth()) return

    if (this.isReordering) {
      // --- FASE KELUAR ---

      // 1. Cek apakah urutan ID berubah
      const currentOrderIds = JSON.stringify(this.tempBudgets.map((b) => b.id))
      const originalOrderIds = JSON.stringify(
        this.budgets
          .filter((b) => b.month === this.viewMonth && b.year === this.viewYear)
          .map((b) => b.id),
      )

      if (currentOrderIds !== originalOrderIds) {
        // Ada perubahan, tanya user
        if (confirm('Simpan urutan kategori budget yang baru?')) {
          this.saveNewOrder() // Fungsi simpan permanen
        } else {
          // User batal, reset tempWallets ke data asli
          this.tempBudgets = JSON.parse(
            JSON.stringify(
              this.budgets.filter(
                (b) => b.month === this.viewMonth && b.year === this.viewYear,
              ),
            ),
          )
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
      this.tempBudgets = JSON.parse(
        JSON.stringify(
          this.budgets.filter(
            (b) => b.month === this.viewMonth && b.year === this.viewYear,
          ),
        ),
      )
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

  saveNewOrder() {
    // 1. Bersihkan data virtual jika ada (Sesuai taktik wallet lo)
    // Kalau di budget lo gak ada properti hitungan dinamis yang aneh-aneh, copy biasa aja udah cukup.
    const activeBudgetsToSave = this.tempBudgets.map((budget) => {
      // Misal lo ada properti temp/virtual, bisa di-destructuring di sini.
      // Kalau gak ada, return { ...budget } aja murni biar aman.
      const { used, remaining, percentage, isOver, ...cleanBudget } = budget
      return cleanBudget
    })

    // 2. Ambil data database utuh saat ini untuk memisahkan data Archive
    const currentSettings = storage.getSettings() || {}
    const allRawBudgets = currentSettings.budgets || []

    // Filter untuk mengamankan data masa lalu (Archive) agar TIDAK TERHAPUS
    const archiveBudgets = allRawBudgets.filter(
      (b) => !(b.month === this.viewMonth && b.year === this.viewYear),
    )

    // 3. GABUNGKAN: Data bulan aktif yang baru diacak + data archive masa lalu
    const finalBudgetsToSave = [...activeBudgetsToSave, ...archiveBudgets]

    // 4. Update state utama aplikasi (biar UI langsung merespons secara live)
    // Kita urutkan state utama berdasarkan data yang baru disave
    this.budgets = [...finalBudgetsToSave]

    // 5. Simpan permanen ke localStorage
    currentSettings.budgets = finalBudgetsToSave
    storage.setSettings(currentSettings)

    this.refreshData()
  },
})

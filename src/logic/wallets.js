import { storage } from '../utils/storage.js'

export const walletPage = () => ({
  // ----------------------- LOCAL STATE -----------------------
  // Data Storage (Cache)
  storage,
  wallets: [],
  tempWallets: [], // Draft untuk sorting

  // UI Status / Flags
  isModalOpen: false,
  isEditMode: false,
  isReordering: false, //
  editId: null,
  viewMode: localStorage.getItem('DION_WALLET_VIEW_MODE') || 'card',
  originalViewBeforeEdit: null, //

  // Summary Data (Hasil Kalkulasi)
  totalAsset: 0,
  transactionCount: 0,
  totalTransactionsCount: 0,
  topWalletName: '',

  // Form State (Untuk Reset yang Lebih Mudah)
  newWallet: {
    name: '',
    balance: 0,
    icon: 'fa-wallet',
    colorName: 'blue',
    gradient: 'from-blue-400 to-blue-700',
  },

  // Konstanta (Data Statis)
  icons: [
    { name: 'Wallet', val: 'fa-wallet' },
    { name: 'Bank', val: 'fa-building-columns' },
    { name: 'Cash', val: 'fa-money-bill-wave' },
    { name: 'Savings', val: 'fa-piggy-bank' },
    { name: 'Investment', val: 'fa-chart-line' },
    { name: 'Card', val: 'fa-credit-card' },
    { name: 'Gold', val: 'fa-coins' },
    { name: 'Phone', val: 'fa-mobile-screen-button' },
  ],
  colors: [
    { name: 'blue', bg: 'bg-blue-500' },
    { name: 'green', bg: 'bg-green-500' },
    { name: 'rose', bg: 'bg-rose-500' },
    { name: 'amber', bg: 'bg-amber-500' },
    { name: 'indigo', bg: 'bg-indigo-500' },
    { name: 'violet', bg: 'bg-violet-500' },
    { name: 'cyan', bg: 'bg-cyan-500' },
    { name: 'slate', bg: 'bg-slate-500' },
  ],

  // ----------------- INITIALIZATION & REFRESH DATA -----------------

  init() {
    this.refreshData()

    window.addEventListener('storage', (e) => {
      if (['DION_SETTINGS', 'DION_TRANSACTIONS'].includes(e.key)) {
        this.refreshData()
      }
    })
  },

  refreshData() {
    const settings = storage.getSettings() || {}
    const allTransactions = storage.getTransactions() || []

    // STEP A: Ambil data mentah & pastikan urutan (Order)
    const rawWalletsOrdered = this._ensureWalletOrder(settings.wallets || [])
    const balanceData = storage.getBalances(rawWalletsOrdered, allTransactions)

    // STEP B: Mapping data wallet dengan saldo dan jumlah transaksi
    this.wallets = this._mapWalletData(
      rawWalletsOrdered,
      allTransactions,
      balanceData.byWallet,
    )

    // STEP C: Inisialisasi tempWallets untuk mode edit nanti malam
    if (!this.isReordering) {
      this.tempWallets = JSON.parse(JSON.stringify(this.wallets))
    }

    // STEP D: Update Global Summary (Aset, Transaksi Bulan Ini, Top Wallet)
    this.totalAsset = storage.formatCurrency(balanceData.totalAsset)
    this.totalTransactionsCount =
      this._calculateMonthlyTransactions(allTransactions)
    this.topWalletName = this._getTopWalletName()
  },

  // ----------------------- INTERNAL HELPERS -----------------------
  _ensureWalletOrder(rawWallets) {
    let needsMigration = false

    // 1. Cek & Tambah Properti Order
    const migratedData = rawWallets.map((wallet, index) => {
      if (wallet.order === undefined) {
        needsMigration = true
        return { ...wallet, order: index }
      }
      return wallet
    })

    // 2. Simpan jika ada perubahan (Pake setSetting sesuai info lo)
    if (needsMigration) {
      const currentSettings = storage.getSettings() || {}
      currentSettings.wallets = migratedData
      storage.setSettings(currentSettings)
    }

    // 3. Kembalikan data mentah yang sudah ada 'order'-nya
    return migratedData.sort((a, b) => a.order - b.order)
  },

  _mapWalletData(rawWallets, allTransactions, balances) {
    return rawWallets.map((w) => ({
      ...w,
      currentBalance: balances[w.id] || 0,
      transactionCount: allTransactions.filter(
        (t) => t.walletId === w.id || t.walletIdDest === w.id,
      ).length,
    }))
  },

  _calculateMonthlyTransactions(allTransactions) {
    const sekarang = new Date()
    const bulanIni = sekarang.getMonth()
    const tahunIni = sekarang.getFullYear()

    return allTransactions.filter((t) => {
      const tDate = new Date(t.date)
      return tDate.getMonth() === bulanIni && tDate.getFullYear() === tahunIni
    }).length
  },

  _getTopWalletName() {
    if (this.wallets.length === 0) return '-'

    const top = [...this.wallets].sort(
      (a, b) => b.currentBalance - a.currentBalance,
    )[0]

    return top ? top.name : '-'
  },

  _applyBalanceCorrection(walletId, oldName, currentBalance) {
    const targetBalance = Number(this.newWallet.balance)

    if (targetBalance !== currentBalance) {
      const diff = targetBalance - currentBalance

      const history = storage.getTransactions()

      const adjustment = {
        id: 'adj-' + Date.now(),
        type: diff > 0 ? 'income' : 'expense',
        amount: Math.abs(diff),
        walletId: walletId,
        category: 'Adjustment',
        notes: `Balance Correction: ${oldName}`,
        date: storage.formatLocalDate(),
      }

      history.unshift(adjustment)
      storage.setTransactions(history)
    }
  },

  _handleUpdateWallet(wallets) {
    const index = wallets.findIndex((w) => w.id === this.editId)
    if (index === -1) return

    const oldWallet = wallets[index]
    const currentInSystem =
      this.wallets.find((w) => w.id === this.editId)?.currentBalance || 0

    // Jalankan koreksi saldo jika ada perbedaan input vs system
    this._applyBalanceCorrection(this.editId, oldWallet.name, currentInSystem)

    // Update properti fisik wallet
    wallets[index] = {
      ...oldWallet,
      name: this.newWallet.name,
      icon: this.newWallet.icon,
      gradient: this.newWallet.gradient,
    }
  },

  _handleCreateWallet(wallets) {
    wallets.push({
      id: 'w' + Date.now(),
      name: this.newWallet.name,
      balance: Number(this.newWallet.balance), // Saldo awal permanen
      icon: this.newWallet.icon,
      gradient: this.newWallet.gradient,
      order: wallets.length, // Langsung kasih order biar gak perlu migrasi lagi
    })
  },

  _resetForm() {
    this.newWallet = {
      name: '',
      balance: 0,
      icon: 'fa-wallet',
      colorName: 'blue',
      gradient: 'from-blue-400 to-blue-700',
    }
    this.editId = null
  },

  // ------------------- 📌 UI HELPERS / COMPUTED LOGIC -------------------
  openAddModal() {
    this.isEditMode = false
    this._resetForm()
    this.isModalOpen = true
  },

  openEditModal(wallet) {
    this.isEditMode = true
    this.editId = wallet.id

    this.newWallet = {
      name: wallet.name,
      balance: wallet.currentBalance,
      icon: wallet.icon,
      colorName: wallet.colorName,
      gradient: wallet.gradient,
    }

    this.transactionCount = wallet.transactionCount
    this.isModalOpen = true
  },

  closeModal() {
    this.isModalOpen = false
    this.isEditMode = false
    this._resetForm()
  },

  formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(Number(num) || 0)
  },

  toggleEditOrder() {
    if (this.isReordering) {
      // --- FASE KELUAR ---

      // 1. Cek apakah urutan ID berubah
      const currentOrderIds = JSON.stringify(this.tempWallets.map((w) => w.id))
      const originalOrderIds = JSON.stringify(this.wallets.map((w) => w.id))

      if (currentOrderIds !== originalOrderIds) {
        // Ada perubahan, tanya user
        if (confirm('Simpan urutan dompet yang baru?')) {
          this.saveNewOrder() // Fungsi simpan permanen
        } else {
          // User batal, reset tempWallets ke data asli
          this.tempWallets = JSON.parse(JSON.stringify(this.wallets))
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

      // 3. Siapkan draft urutan (Deep Copy)
      this.tempWallets = JSON.parse(JSON.stringify(this.wallets))
    }
  },

  moveUp(index) {
    if (index > 0) {
      // 1. Ambil elemen yang mau dipindah
      const currentItem = this.tempWallets[index]
      const aboveItem = this.tempWallets[index - 1]

      // 2. Tukar posisi di array tempWallets
      this.tempWallets[index - 1] = currentItem
      this.tempWallets[index] = aboveItem

      // 3. Update properti 'order' agar sinkron dengan index baru
      this.reassignTempOrder()
    }
  },

  moveDown(index) {
    if (index < this.tempWallets.length - 1) {
      // 1. Ambil elemen yang mau dipindah
      const currentItem = this.tempWallets[index]
      const belowItem = this.tempWallets[index + 1]

      // 2. Tukar posisi di array
      this.tempWallets[index + 1] = currentItem
      this.tempWallets[index] = belowItem

      // 3. Update properti 'order'
      this.reassignTempOrder()
    }
  },

  reassignTempOrder() {
    this.tempWallets.forEach((wallet, i) => {
      wallet.order = i
    })
    // Trigger Alpine untuk render ulang dengan spread operator
    this.tempWallets = [...this.tempWallets]
  },

  saveNewOrder() {
    // 1. Bersihkan data: Hapus properti virtual sebelum simpan
    const walletsToSave = this.tempWallets.map((wallet) => {
      // Kita buat copy dan hapus properti yang gak mau disimpan
      const { currentBalance, transactionCount, ...cleanWallet } = wallet

      // Pastikan order-nya sudah yang terbaru
      // cleanWallet sekarang cuma berisi properti asli + order
      return cleanWallet
    })

    // 2. Update state utama (untuk UI)
    this.wallets = [...this.tempWallets]

    // 3. Simpan data yang sudah BERSIH ke localStorage
    const currentSettings = storage.getSettings() || {}
    currentSettings.wallets = walletsToSave // Pakai yang sudah di-map (walletsToSave)
    storage.setSettings(currentSettings)
  },

  toggleViewMode() {
    this.viewMode = this.viewMode === 'card' ? 'list' : 'card'
    localStorage.setItem('DION_WALLET_VIEW_MODE', this.viewMode)

    // Opsional: Kasih feedback haptic/vibrasi singkat kalau di HP
    // if (navigator.vibrate) navigator.vibrate(10)
  },

  selectColor(name) {
    this.newWallet.colorName = name
    this.newWallet.gradient = `from-${name}-400 to-${name}-700`
  },

  // ----------------------- USER ACTION  -----------------------
  saveWallet() {
    if (!this.newWallet.name) return alert('Nama wallet wajib diisi!')

    const settings = storage.getSettings()
    settings.wallets ??= []

    if (this.isEditMode) {
      this._handleUpdateWallet(settings.wallets)
    } else {
      this._handleCreateWallet(settings.wallets)
    }

    storage.setSettings(settings)
    this.closeModal()
    this.refreshData()
  },

  deleteWallet() {
    // Cek guard yang sudah kita siapkan di modal
    if (this.transactionCount > 0) {
      alert(
        `Cannot delete wallet! You have ${this.transactionCount} transactions linked to this wallet. Please delete the transactions first.`,
      )
      return this.closeModal()
    }

    if (confirm('Are you sure you want to delete this wallet?')) {
      const settings = storage.getSettings()
      settings.wallets = (settings.wallets ??= []).filter(
        (w) => w.id !== this.editId,
      )

      storage.setSettings(settings)
      this.closeModal()
      this.refreshData()
    }
  },
})

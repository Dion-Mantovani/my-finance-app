import { storage } from '../utils/storage.js'

export const walletPage = () => ({
  storage,
  wallets: [],
  isModalOpen: false,
  isEditMode: false,
  editId: null,
  transactionCount: 0,
  totalAsset: 0,
  totalTransactionsCount: 0,
  topWallet: '',

  newWallet: {
    name: '',
    balance: 0,
    icon: 'fa-wallet',
    colorName: 'blue',
    gradient: 'from-blue-400 to-blue-700',
  },

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

  init() {
    this.refreshWallets()

    window.addEventListener('storage', (e) => {
      if (['DION_SETTINGS', 'DION_TRANSACTIONS'].includes(e.key)) {
        this.refreshWallets()
      }
    })
  },

  refreshWallets() {
    const settings = storage.getSettings() || {}
    const rawWallets = settings.wallets || []
    const allTransactions = storage.getTransactions() || []

    const balanceData = storage.getBalances(rawWallets, allTransactions)
    const balances = balanceData.byWallet

    // Sekarang .map gak akan error karena sumbernya minimal []
    this.wallets = rawWallets.map((w) => {
      return {
        ...w,
        currentBalance: balances[w.id] || 0,
        transactionCount: allTransactions.filter(
          (t) => t.walletId === w.id || t.walletIdDest === w.id,
        ).length,
      }
    })

    this.totalAsset = balanceData.totalAsset

    const sekarang = new Date()
    const bulanIni = sekarang.getMonth() // 0-11
    const tahunIni = sekarang.getFullYear()

    const transaksiBulanIni = allTransactions.filter((t) => {
      const tDate = new Date(t.date)
      return tDate.getMonth() === bulanIni && tDate.getFullYear() === tahunIni
    })

    this.totalTransactionsCount = transaksiBulanIni.length

    if (this.wallets.length > 0) {
      const top = [...this.wallets].sort(
        (a, b) => b.currentBalance - a.currentBalance,
      )[0]
      this.topWalletName = top.name
    } else {
      this.topWalletName = 'No Wallet'
    }
  },

  // Fungsi buat buka modal mode Tambah
  openAddModal() {
    this.isEditMode = false
    this.editId = null
    this.newWallet = {
      name: '',
      balance: 0,
      icon: 'fa-wallet',
      colorName: 'blue',
      gradient: 'from-blue-400 to-blue-700',
    }
    this.isModalOpen = true
  },

  // Fungsi buat buka modal mode Detail/Edit
  openEditModal(wallet) {
    this.isEditMode = true
    this.editId = wallet.id

    // Isi form dengan data wallet yang diklik
    this.newWallet = {
      name: wallet.name,
      balance: wallet.currentBalance, // Kita tampilkan saldo saat ini
      icon: wallet.icon,
      colorName: wallet.colorName,
      gradient: wallet.gradient,
    }

    // Cek jumlah transaksi buat Guard Delete nanti
    this.transactionCount = wallet.transactionCount
    this.isModalOpen = true
  },

  // Fungsi pembantu buat reset modal
  closeModal() {
    this.isModalOpen = false
    this.isEditMode = false
    this.editId = null
    this.newWallet = {
      name: '',
      balance: 0,
      icon: 'fa-wallet',
      colorName: 'blue',
      gradient: 'from-blue-400 to-blue-700',
    }
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

  saveWallet() {
    if (!this.newWallet.name) return alert('Nama wallet wajib diisi!')

    const settings = storage.getSettings()
    settings.wallets = settings.wallets || []

    if (this.isEditMode) {
      // --- MODE EDIT & KOREKSI SALDO ---
      const index = settings.wallets.findIndex((w) => w.id === this.editId)
      if (index === -1) return

      const oldWallet = settings.wallets[index]
      const currentInSystem =
        this.wallets.find((w) => w.id === this.editId)?.currentBalance || 0

      this._applyBalanceCorrection(this.editId, oldWallet.name, currentInSystem)

      // Update data profil wallet-nya
      settings.wallets[index] = {
        ...oldWallet,
        name: this.newWallet.name,
        icon: this.newWallet.icon,
        gradient: this.newWallet.gradient,
      }
    } else {
      // --- MODE TAMBAH BARU ---
      settings.wallets.push({
        id: 'w' + Date.now(),
        name: this.newWallet.name,
        balance: Number(this.newWallet.balance), // Ini jadi saldo awal
        icon: this.newWallet.icon,
        gradient: this.newWallet.gradient,
      })
    }

    storage.setSettings(settings)
    this.closeModal()
    this.refreshWallets()
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
      settings.wallets = (settings.wallets || []).filter(
        (w) => w.id !== this.editId,
      )

      storage.setSettings(settings)
      this.closeModal()
      this.refreshWallets()
    }
  },

  selectColor(name) {
    this.newWallet.colorName = name
    this.newWallet.gradient = `from-${name}-400 to-${name}-700`
  },

  formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num)
  },
})

// src/utils/storage.js

const KEYS = {
  TRANSACTIONS: 'DION_TRANSACTIONS',
  SETTINGS: 'DION_SETTINGS',
}

// Data default saat aplikasi pertama kali dijalankan
const DEFAULT_SETTINGS = {
  user: { name: 'Dion' },
  wallets: [],
  categories: [
    'Food',
    'Transport',
    'Shopping',
    'Health',
    'Subscription',
    'Gift',
    'Salary',
    'Freelance',
  ],
}

export const storage = {
  // --- 1. SETTINGS HANDLER (User, Wallets, Categories) ---
  getSettings() {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS
    const data = localStorage.getItem(KEYS.SETTINGS)
    return data ? JSON.parse(data) : DEFAULT_SETTINGS
  },

  saveSettings(newSettings) {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(newSettings))
  },

  // --- 2. TRANSACTIONS HANDLER ---
  getTransactions() {
    if (typeof window === 'undefined') return []
    const data = localStorage.getItem(KEYS.TRANSACTIONS)
    return data ? JSON.parse(data) : []
  },

  addTransaction(record) {
    const all = this.getTransactions()

    // Pastikan data bersih & ID unik
    const newRecord = {
      ...record,
      id: Date.now(),
      amount: Number(record.amount) || 0, // Force ke Number
      createdAt: new Date().toISOString(),
    }

    all.unshift(newRecord) // Tambah ke paling atas (terbaru)
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all))
    return newRecord
  },

  deleteTransaction(id) {
    const all = this.getTransactions().filter((t) => t.id !== id)
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all))
  },

  // --- 3. AUTO BALANCE & ASSET CALCULATION ---
  // src/utils/storage.js

  getBalances() {
    const transactions = this.getTransactions()
    const settings = this.getSettings()

    let balances = {}
    const wallets = settings.wallets || []

    // 1. Inisialisasi saldo awal pake ID sebagai kunci
    wallets.forEach((w) => {
      balances[w.id] = Number(w.balance) || 0
    })

    // 2. Hitung semua transaksi berdasarkan walletId
    transactions.forEach((t) => {
      const amt = Number(t.amount)

      if (t.type === 'income') {
        if (balances.hasOwnProperty(t.walletId)) balances[t.walletId] += amt
      } else if (t.type === 'expense') {
        if (balances.hasOwnProperty(t.walletId)) balances[t.walletId] -= amt
      } else if (t.type === 'transfer') {
        // Transfer ngurangin sumber, nambah tujuan (pake ID)
        if (balances.hasOwnProperty(t.walletId)) balances[t.walletId] -= amt
        if (balances.hasOwnProperty(t.walletIdDest))
          balances[t.walletIdDest] += amt
      }
    })

    return {
      byWallet: balances, // Isinya sekarang { "w1": 50000, "w-123": 10000 }
      totalAsset: Object.values(balances).reduce((a, b) => a + b, 0),
    }
  },

  getPrivacy() {
    if (typeof window === 'undefined') return true
    const privacy = localStorage.getItem('DION_PRIVACY')
    return privacy !== null ? JSON.parse(privacy) : true
  },

  setPrivacy(value) {
    localStorage.setItem('DION_PRIVACY', JSON.stringify(value))
  },
}

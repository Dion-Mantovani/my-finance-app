// src/utils/storage.js

const KEYS = {
  TRANSACTIONS: 'DION_TRANSACTIONS',
  SETTINGS: 'DION_SETTINGS',
  PRIVACY: 'DION_PRIVACY',
}

const DEFAULT_SETTINGS = {
  user: { name: 'User' },
  wallets: [],
  budgets: [],
  categories: [
    'Salary',
    'Freelance',
    'Bonus',
    'Food',
    'Transport',
    'Shopping',
    'Groceries',
    'Utilities',
    'Internet',
    'Health',
    'Subscription',
    'Entertainment',
    'Education',
    'Self-Care',
    'Gift',
    'Investment',
    'Other',
  ],
}

const getFromStorage = (key, fallback) => {
  if (typeof window === 'undefined') return fallback
  const data = localStorage.getItem(key)
  return data !== null ? JSON.parse(data) : fallback
}

const saveToStorage = (key, data) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(data))
  }
}

export const storage = {
  // --------------------- 1. SETTINGS HANDLER ---------------------
  getSettings() {
    let settings = getFromStorage(KEYS.SETTINGS, DEFAULT_SETTINGS)

    if (settings.categories && settings.categories.includes('SelfCare')) {
      console.log('Migrating: SelfCare -> Self-Care')

      // Update di daftar kategori settings
      settings.categories = settings.categories.map((cat) =>
        cat === 'SelfCare' ? 'Self-Care' : cat,
      )
      this.saveSettings(settings)

      // Update di history transaksi agar icon tetap muncul
      this.migrateTransactionCategories('SelfCare', 'Self-Care')
    }

    return settings
  },

  saveSettings(newSettings) {
    saveToStorage(KEYS.SETTINGS, newSettings)
  },

  // --------------------- 2. TRANSACTIONS HANDLER ---------------------
  getTransactions() {
    return getFromStorage(KEYS.TRANSACTIONS, [])
  },

  saveTransactions(transactions) {
    saveToStorage(KEYS.TRANSACTIONS, transactions)
  },

  migrateTransactionCategories(oldCat, newCat) {
    const transactions = this.getTransactions()
    if (transactions.some((t) => t.category === oldCat)) {
      const updated = transactions.map((t) => ({
        ...t,
        category: t.category === oldCat ? newCat : t.category,
      }))
      this.saveTransactions(updated)
      console.log(`History migrated: ${oldCat} fixed.`)
    }
  },

  // --------------------- 3. PRIVACY HANDLER ---------------------
  getPrivacy() {
    return getFromStorage(KEYS.PRIVACY, true)
  },

  setPrivacy(value) {
    saveToStorage(KEYS.PRIVACY, value)
  },

  // --------------------- 4. CALCULATION LOGIC ---------------------

  getBalances(wallets = [], transactions = []) {
    const balances = wallets.reduce(
      (acc, wallet) => ({
        ...acc,
        [wallet.id]: Number(wallet.balance) || 0,
      }),
      {},
    )

    transactions.forEach(({ type, amount, walletId, walletIdDest }) => {
      const amt = Number(amount) || 0
      if (type === 'income') balances[walletId] += amt
      if (type === 'expense') balances[walletId] -= amt
      if (type === 'transfer') {
        balances[walletId] -= amt
        if (walletIdDest) balances[walletIdDest] += amt
      }
    })

    return {
      byWallet: balances,
      totalAsset: Object.values(balances).reduce((sum, val) => sum + val, 0),
    }
  },

  // --------------------- 5. UTILITIES LOGIC ---------------------

  formatCurrency(value) {
    return Number(value || 0).toLocaleString('id-ID')
  },

  formatDateTitle(dateStr) {
    const d = new Date(dateStr)
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
    }).format(new Date())

    const options = { day: 'numeric', month: 'long', year: 'numeric' }
    const dateFormatted = d.toLocaleDateString('id-ID', options)
    const dayName = d.toLocaleDateString('id-ID', { weekday: 'long' })

    if (dateStr === today) {
      return `${dayName} (Hari ini), ${dateFormatted}`
    }

    return `${dayName}, ${dateFormatted}`
  },

  getGreeting() {
    const hour = new Date().getHours()
    if (hour < 11) return { title: 'Good Morning', icon: '☀️' }
    if (hour < 15) return { title: 'Good Afternoon', icon: '🌤️' }
    if (hour < 19) return { title: 'Good Evening', icon: '🌅' }
    return { title: 'Good Night', icon: '🌙' }
  },

  getCategoryIcon(categoryName) {
    const icons = {
      Food: 'fa-utensils',
      Transport: 'fa-car',
      Shopping: 'fa-bag-shopping',
      Groceries: 'fa-basket-shopping',
      Utilities: 'fa-bolt',
      Internet: 'fa-wifi',
      Health: 'fa-heart-pulse',
      Subscription: 'fa-credit-card',
      Entertainment: 'fa-clapperboard',
      Education: 'fa-book-open',
      'Self-Care': 'fa-pump-soap',
      Gift: 'fa-gift',
      Investment: 'fa-chart-line',
      Bonus: 'fa-sack-dollar',
      Salary: 'fa-wallet',
      Freelance: 'fa-laptop-code',
      Other: 'fa-ellipsis',
    }
    return icons[categoryName] || 'fa-wallet'
  },
}

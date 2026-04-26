/**
 * STORAGE JS (Standard)
 * Pondasi utama untuk manajemen localStorage.
 */

// 1. CONSTANTS (Keys)
const SETTINGS_KEY = 'DION_SETTINGS'
const TRANSACTIONS_KEY = 'DION_TRANSACTIONS'
const PRIVACY_KEY = 'DION_PRIVACY'
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

// 2. CORE ENGINE (Internal Helpers) - Urusan JSON & Try-Catch di sini
const _fetch = (key) => {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.error(`Error fetching ${key}:`, e)
    return null
  }
}

const _store = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.error(`Error storing ${key}:`, e)
  }
}

export const storage = {
  //  ---------------- 3. SETTINGS ACTIONS (Get & Set) ----------------
  getSettings() {
    let settings = _fetch(SETTINGS_KEY) || DEFAULT_SETTINGS

    if (settings.categories && settings.categories.includes('SelfCare')) {
      // A. Bersih-bersih di level Settings dulu
      settings.categories = settings.categories.map((c) =>
        c === 'SelfCare' ? 'Self-Care' : c,
      )
      this.setSettings(settings)

      // B. Bersih-bersih di level Transactions
      this._migrateTransactionCategories('SelfCare', 'Self-Care')
    }

    return settings
  },
  setSettings(data) {
    _store(SETTINGS_KEY, data)
  },

  // 4. -------------- TRANSACTIONS ACTIONS (Get & Set) --------------
  getTransactions() {
    return _fetch(TRANSACTIONS_KEY) || []
  },
  setTransactions(data) {
    _store(TRANSACTIONS_KEY, data)
  },

  // ---------------- 5. PRIVACY ACTIONS (Get & Set) ----------------
  getPrivacy() {
    return _fetch(PRIVACY_KEY)
  },
  setPrivacy(value) {
    _store(PRIVACY_KEY, value)
  },

  // ---------------------------- HELPER ----------------------------
  _migrateTransactionCategories(oldCat, newCat) {
    const transactions = this.getTransactions()

    // Cek dulu, ada nggak transaksi yang pake kategori lama?
    const hasOldData = transactions.some((t) => t.category === oldCat)

    if (hasOldData) {
      console.log(`Migrating Transactions: ${oldCat} -> ${newCat}`)

      const updated = transactions.map((t) => ({
        ...t,
        category: t.category === oldCat ? newCat : t.category,
      }))

      this.setTransactions(updated)
    }
  },

  // ---------------------- LOGIC UTILITIES ----------------------
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

  getGreeting() {
    const hour = new Date().getHours()
    if (hour < 11) return { title: 'Good Morning', icon: '☀️' }
    if (hour < 15) return { title: 'Good Afternoon', icon: '🌤️' }
    if (hour < 19) return { title: 'Good Evening', icon: '🌅' }
    return { title: 'Good Night', icon: '🌙' }
  },
  // ---------------------- STYLE UTILITIES ----------------------

  formatCurrency(num) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num || 0)
  },

  formatDateTitle(dateStr) {
    if (!dateStr) return ''

    const d = new Date(dateStr)
    const now = new Date()

    const todayStr = now.toISOString().split('T')[0]

    const dateFormatted = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const dayName = d.toLocaleDateString('id-ID', { weekday: 'long' })

    const label = dateStr === todayStr ? ' (Hari ini)' : ''

    return `${dayName}${label}, ${dateFormatted}`
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

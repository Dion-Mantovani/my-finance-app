import { storage } from '../utils/storage.js'

// Helper untuk generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Helper format nama wallet (misal: "bca" -> "BCA", "cash" -> "Cash")
function formatAccountName(name) {
  if (!name) return 'Account'
  if (name.toLowerCase() === 'bca') return 'BCA'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// Map FontAwesome Lama -> Lucide Icon Baru (Account)
function mapWalletIcon(oldIcon) {
  const iconMap = {
    'fa-wallet': 'credit-card',
    'fa-money-bill': 'banknote',
    'fa-piggy-bank': 'piggy-bank',
    'fa-mobile': 'smartphone',
  }
  return iconMap[oldIcon] || 'credit-card'
}

// Map Kategori Lama -> Lucide Icon Baru (Category)
function mapCategoryIcon(catName) {
  const iconMap = {
    Salary: 'briefcase',
    Freelance: 'laptop',
    Bonus: 'gift',
    Food: 'utensils',
    Transport: 'bus',
    Shopping: 'shopping-bag',
    Groceries: 'shopping-cart',
    Utilities: 'zap',
    Internet: 'wifi',
    Health: 'heart-pulse',
    Subscription: 'repeat',
    Entertainment: 'film',
    Education: 'book-open',
    'Self-Care': 'smile',
    Gift: 'package',
    Investment: 'trending-up',
    Other: 'more-horizontal',
  }
  return iconMap[catName] || 'more-horizontal'
}

export const exportDataToJSON = () => {
  const settings = storage.getSettings() || {}
  const oldWallets = settings.wallets || []
  const oldCategories = settings.categories || []
  const oldTransactions = storage.getTransactions() || []

  const defaultIsoDate = new Date('2026-09-01T00:00:00.000Z').toISOString()

  // ---------------------------------------------------------------------------
  // 1. MAPPING ACCOUNTS
  // ---------------------------------------------------------------------------
  const accountMap = new Map()

  const accounts = oldWallets.map((wallet) => {
    const newId = generateUUID()
    accountMap.set(String(wallet.id), newId)

    return {
      id: newId,
      name: formatAccountName(wallet.name),
      initial_balance: 0,
      icon: mapWalletIcon(wallet.icon),
      status: 'active',
      created_at: defaultIsoDate,
      updated_at: defaultIsoDate,
    }
  })

  // ---------------------------------------------------------------------------
  // 2. MAPPING CATEGORIES
  // ---------------------------------------------------------------------------
  const categoryMap = new Map()
  const incomeCategoryNames = ['Salary', 'Freelance', 'Bonus']

  const categories = oldCategories.map((catName) => {
    const newId = generateUUID()
    categoryMap.set(catName, newId)

    const isIncome = incomeCategoryNames.includes(catName)

    return {
      id: newId,
      name: catName,
      type: isIncome ? 'income' : 'expense',
      icon: mapCategoryIcon(catName),
      is_default: true,
      created_at: defaultIsoDate,
      updated_at: defaultIsoDate,
    }
  })

  // ---------------------------------------------------------------------------
  // 3. MAPPING TRANSACTIONS
  // ---------------------------------------------------------------------------
  const transactions = oldTransactions.map((t) => {
    const newTxId = generateUUID()
    const accountId = accountMap.get(String(t.walletId)) || null
    const toAccountId = t.walletIdDest ? accountMap.get(String(t.walletIdDest)) || null : null
    const categoryId = t.type === 'transfer' ? null : (categoryMap.get(t.category) || null)

    const txCreatedAt = t.createdAt ? new Date(t.createdAt).toISOString() : defaultIsoDate

    return {
      id: newTxId,
      type: t.type,
      amount: Number(t.amount) || 0,
      account_id: accountId,
      to_account_id: toAccountId,
      category_id: categoryId,
      fee: 0,
      transaction_date: t.date,
      description: t.notes || '',
      created_at: txCreatedAt,
      updated_at: txCreatedAt,
    }
  })

  // ---------------------------------------------------------------------------
  // 4. COMBINE & PRINT TO CONSOLE ONLY
  // ---------------------------------------------------------------------------
  const finalExportData = {
    accounts,
    categories,
    transactions,
  }


  const jsonString = JSON.stringify(finalExportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `import.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
}
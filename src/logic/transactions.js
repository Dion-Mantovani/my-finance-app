import { storage } from '../utils/storage.js'

export const transactionForm = () => ({
  // ----------------------- LOCAL STATE -----------------------
  type: '',
  amount: '',
  date: '',
  notes: '',
  category: '',

  // Wallet State (Kita pisahin ID dan Name)
  walletSourceId: '',
  walletSource: '',
  walletDestId: '',
  walletDest: '',

  // UI Helpers (Togglers)
  openWallet: false,
  openDest: false,
  openCategory: false,
  activeIndex: -1,
  showWalletModal: false,
  modalStep: 'source',

  // Data Store (Local Cache)
  wallets: [],
  categories: [],

  // Meta State
  isEditMode: false,
  editId: null,

  // ----------------------- INITIALIZATION -----------------------

  init() {
    // 1. Load Master Data (Pake standar baru kita)
    const settings = storage.getSettings()
    this.wallets = settings.wallets
    this.categories = settings.categories

    // 2. Parse URL Context
    const urlParams = new URLSearchParams(window.location.search)
    const id = urlParams.get('edit')
    const typeFromUrl = urlParams.get('type')

    // 3. Set Global Default (Hari ini)
    // Tips: Karena ini cuma butuh YYYY-MM-DD, kita ringkas ya
    this.date = new Date().toISOString().split('T')[0]

    // 4. Branching: EDIT vs ADD
    if (id) {
      this._initEditMode(id)
    } else {
      this._initAddMode(typeFromUrl)
    }
  },

  // ----------------------- INTERNAL HELPERS -----------------------

  _initEditMode(id) {
    const data = storage.getTransactions().find((t) => t.id == id)
    if (!data) return (window.location.href = '/expense')

    this.isEditMode = true
    this.editId = id

    // Mapping data mentah
    this.type = data.type
    this.amount = data.amount.toString()
    this.notes = data.notes
    this.category = data.category
    this.date = data.date
    this.walletSourceId = data.walletId
    this.walletDestId = data.walletIdDest

    // Cari nama wallet secara otomatis dari ID
    const source = this.wallets.find((w) => w.id === data.walletId)
    this.walletSource = source ? source.name : ''

    if (data.type === 'transfer' && data.walletIdDest) {
      const dest = this.wallets.find((w) => w.id === data.walletIdDest)
      this.walletDest = dest ? dest.name : ''
    }
  },

  _initAddMode(typeFromUrl) {
    this.isEditMode = false
    this.showWalletModal = true

    // Validasi tipe dari URL
    const validTypes = ['expense', 'income', 'transfer']
    this.type = validTypes.includes(typeFromUrl) ? typeFromUrl : 'expense'
  },

  _closeWalletModal() {
    this.showWalletModal = false
    this.modalStep = 'source' // Reset step biar pas dibuka lagi balik ke awal
    this.$nextTick(() => this.$refs.amountInput?.focus())
  },
  // ----------------------- UI HELPERS / COMPUTED LOGIC -----------------------

  handleKey(e, list, mode) {
    if (!list.length) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.activeIndex = (this.activeIndex + 1) % list.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.activeIndex = (this.activeIndex - 1 + list.length) % list.length
    } else if (e.key === 'Enter' && this.activeIndex !== -1) {
      e.preventDefault()
      this.selectValue(list[this.activeIndex], mode)
    }
  },

  selectValue(val, mode) {
    const name = typeof val === 'object' ? val.name : val
    const id = typeof val === 'object' ? val.id : null
    if (!name) return

    // 1. Logika Pemilihan berdasarkan Mode
    if (mode === 'source') {
      this.walletSource = name
      this.walletSourceId = id
      this.openWallet = false

      this.$nextTick(() => {
        if (this.type === 'transfer') this.$refs.destBtn?.focus()
        else this.$refs.amountInput?.focus()
      })
    } else if (mode === 'dest' || mode === 'cat') {
      // Guard khusus Transfer
      if (mode === 'dest' && name === this.walletSource) {
        return alert('Rekening tujuan gak boleh sama!')
      }

      if (mode === 'dest') {
        this.walletDest = name
        this.walletDestId = id
        this.openDest = false
      } else {
        this.category = name
        this.openCategory = false
      }

      this.$nextTick(() => this.$refs.noteInput?.focus())
    }
  },

  predictCategory() {
    const inputNotes = this.notes?.trim().toLowerCase()
    if (!inputNotes || inputNotes.length < 3) return

    const history = storage.getTransactions()
    const match = history.find(
      (t) =>
        t.notes && t.notes.toLowerCase().includes(this.notes.toLowerCase()),
    )
    if (match && match.category) {
      this.category = match.category
    }
  },

  selectWalletInitial(wallet) {
    if (this.modalStep === 'source') {
      this.walletSourceId = wallet.id
      this.walletSource = wallet.name

      if (this.type === 'transfer') {
        this.modalStep = 'dest'
      } else {
        this._closeWalletModal()
      }
    } else {
      this.walletDestId = wallet.id
      this.walletDest = wallet.name
      this._closeWalletModal()
    }
  },

  // ----------------------- USER ACTION  -----------------------

  async confirmDelete() {
    if (!confirm('Yakin mau hapus transaksi ini, Bro?')) return

    // 1. Ambil data terbaru
    const history = storage.getTransactions()

    // 2. Filter data (Buang yang ID-nya cocok)
    // Kita tetep pake != buat jaga-jaga tipe data string/number
    const newData = history.filter((t) => t.id != this.editId)

    // 3. Simpan balik via Storage Utility
    storage.setTransactions(newData)

    // 4. Kick balik ke halaman utama
    window.location.href = '/expense'
  },

  async saveRecord() {
    // 1. Guard Clauses (Validasi Berlapis)
    if (!this.amount || this.amount === '0') alert('Nominal harus diisi!')
    if (!this.walletSourceId) alert('Pilih rekening dulu!')

    if (this.type === 'transfer' && !this.walletDestId) {
      return alert('Pilih rekening tujuan!')
    }

    if (this.type !== 'transfer' && !this.category) {
      return alert('Pilih kategori dulu!')
    }

    // 2. Data Preparation
    // Pastikan amount jadi Number dan notes punya fallback
    const finalAmount = Number(this.amount) || 0
    const finalNotes =
      this.type === 'transfer' && !this.notes?.trim() ? 'Transfer' : this.notes

    const data = {
      id: this.isEditMode ? this.editId : Date.now().toString(),
      type: this.type,
      amount: finalAmount,
      date: this.date,
      walletId: this.walletSourceId, // DATABASE PAKE ID
      walletIdDest: this.type === 'transfer' ? this.walletDestId : null,
      category: this.type === 'transfer' ? 'Transfer' : this.category,
      notes: finalNotes,
      createdAt: new Date().toISOString(),
    }

    // 3. Database Operation (Tarik -> Update -> Simpan)
    const history = storage.getTransactions()

    if (this.isEditMode) {
      const index = history.findIndex((t) => t.id == this.editId)
      if (index !== -1) history[index] = data
    } else {
      history.unshift(data)
    }

    storage.setTransactions(history)

    // 4. Cleanup & Redirect
    window.location.href = '/expense'
  },
})

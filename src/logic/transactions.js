import { storage } from '../utils/storage.js'

export const transactionForm = () => ({
  type: '',
  amount: '',
  date: '',
  walletSource: '',
  walletDest: '',
  category: '',
  notes: '',
  openWallet: false,
  openDest: false,
  openCategory: false,
  activeIndex: -1,
  wallets: [],
  categories: [],
  showWalletModal: false,
  modalStep: 'source',
  isEditMode: false,
  editId: null,
  walletSourceId: '',
  walletDestId: '',

  init() {
    const settings = storage.getSettings()
    this.wallets = settings.wallets
    this.categories = settings.categories

    const urlParams = new URLSearchParams(window.location.search)
    const id = urlParams.get('edit')
    const typeFromUrl = urlParams.get('type')

    // 1. Set default date (Hari ini)
    this.date = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
    }).format(new Date())

    // 2. Cek Mode Edit
    if (id) {
      // --- MODE EDIT ---
      const history = storage.getTransactions()
      // Gunakan == untuk antisipasi perbedaan tipe data ID
      const data = history.find((t) => t.id == id)

      if (data) {
        this.isEditMode = true
        this.editId = id
        this.type = data.type
        this.amount = data.amount.toString()
        this.notes = data.notes
        this.category = data.category
        this.date = data.date

        // 1. Set ID-nya dulu
        this.walletSourceId = data.walletId
        this.walletDestId = data.walletIdDest

        // 2. CARI NAMANYA buat ditampilin di UI Dropdown
        // Kita cari dari array wallets yang udah lo load di init
        const sourceWallet = this.wallets.find((w) => w.id === data.walletId)
        if (sourceWallet) this.walletSource = sourceWallet.name

        // 3. Kalau tipenya transfer, cari juga nama wallet tujuannya
        if (data.type === 'transfer' && data.walletIdDest) {
          const destWallet = this.wallets.find(
            (w) => w.id === data.walletIdDest,
          )
          if (destWallet) this.walletDest = destWallet.name
        }

        this.showWalletModal = false
      }
    } else {
      // --- MODE ADD ---
      this.isEditMode = false
      this.showWalletModal = true

      // Set tanggal hari ini hanya untuk transaksi baru [cite: 96]
      this.date = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta',
      }).format(new Date())

      // Prioritas tipe dari FAB, kalau gak ada default ke expense [cite: 101]
      this.type =
        typeFromUrl && ['expense', 'income', 'transfer'].includes(typeFromUrl)
          ? typeFromUrl
          : 'expense'
      window.Alpine.nextTick(() => {
        this.$refs.amountInput?.focus()
      })
    }
  },

  handleKey(e, list, mode) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.activeIndex = (this.activeIndex + 1) % list.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.activeIndex = (this.activeIndex - 1 + list.length) % list.length
    } else if (e.key === 'Enter' && this.activeIndex !== -1) {
      e.preventDefault()
      // Cukup kirim val dan mode [cite: 43]
      this.selectValue(list[this.activeIndex], mode)
    }
  },

  selectValue(val, mode) {
    const name = typeof val === 'object' ? val.name : val
    if (!name) return

    // Gunakan casting '' untuk akses properti internal Alpine
    const self = this

    if (mode === 'source') {
      this.walletSource = name
      this.openWallet = false
      self.$nextTick(() => {
        // Pastikan x-ref="destBtn" dan x-ref="amountInput" ada di elemen HTML
        if (this.type === 'transfer') self.$refs.destBtn?.focus()
        else self.$refs.amountInput?.focus()
      })
    } else if (mode === 'dest' || mode === 'cat') {
      if (mode === 'dest' && name === this.walletSource) {
        return alert('Rekening tujuan gak boleh sama!')
      }

      if (mode === 'dest') {
        this.walletDest = name
        this.openDest = false
      } else {
        this.category = name
        this.openCategory = false
      }

      // Pastikan x-ref="noteInput" ada di elemen input Notes
      self.$nextTick(() => self.$refs.noteInput?.focus())
    }
  },

  predictCategory() {
    if (this.notes.length < 3) return
    const history = storage.getTransactions()
    // Cari deskripsi yang mirip
    const match = history.find((t) =>
      t.notes.toLowerCase().includes(this.notes.toLowerCase()),
    )
    if (match) {
      this.category = match.category
    }
  },

  selectWalletInitial(wallet) {
    const self = this
    if (this.modalStep === 'source') {
      this.walletSourceId = wallet.id
      this.walletSource = wallet.name

      if (this.type === 'transfer') {
        this.modalStep = 'dest'
      } else {
        this.showWalletModal = false
        self.$nextTick(() => self.$refs.amountInput?.focus())
      }
    } else {
      this.walletDestId = wallet.id
      this.walletDest = wallet.name
      this.showWalletModal = false
      this.modalStep = 'source'
      self.$nextTick(() => self.$refs.amountInput?.focus())
    }
  },

  async confirmDelete() {
    if (confirm('Yakin mau hapus transaksi ini, Bro?')) {
      const history = storage.getTransactions()
      // Gunakan != (loose inequality) agar aman jika ID bertipe string vs number
      const newData = history.filter((t) => t.id != this.editId)

      localStorage.setItem('DION_TRANSACTIONS', JSON.stringify(newData))
      window.location.href = '/expense'
    }
  },

  async saveRecord() {
    // Guard untuk Nominal
    if (!this.amount || this.amount === '0')
      return alert('Nominal harus diisi!')

    // Guard untuk Wallet
    if (!this.walletSourceId) return alert('Pilih rekening dulu!')
    // if (!this.walletSource) return alert('Pilih rekening dulu!')

    // Guard untuk Transfer
    if (this.type === 'transfer' && !this.walletDest)
      return alert('Pilih rekening tujuan!')

    // Guard untuk Kategori (Non-Transfer)
    if (this.type !== 'transfer' && !this.category)
      return alert('Pilih kategori dulu!')

    let finalNotes = this.notes
    if (this.type === 'transfer' && (!this.notes || this.notes.trim() === '')) {
      finalNotes = 'Transfer'
    }

    const data = {
      id: this.isEditMode ? this.editId : Date.now().toString(),
      type: this.type,
      amount: this.amount,
      date: this.date,
      walletId: this.walletSourceId, // DATABASE PAKE ID
      walletIdDest: this.type === 'transfer' ? this.walletDestId : null,
      category: this.type !== 'transfer' ? this.category : 'Transfer',
      notes: finalNotes,
      createdAt: new Date().toISOString(),
    }

    const history = storage.getTransactions()

    if (this.isEditMode) {
      const index = history.findIndex((t) => t.id == this.editId)
      if (index !== -1) history[index] = data
    } else {
      // Tambah baru ke urutan PALING ATAS
      history.unshift(data)
    }

    storage.setTransactions(history)

    // Langsung pindah halaman, jangan panggil  lagi di sini
    window.location.href = '/expense'
  },
})

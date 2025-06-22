import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, where, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBS1mtdu6GkLG4X7yIv8e5BxmR7_rlMNLQ",
    authDomain: "project-kp-web-inventaris.firebaseapp.com",
    projectId: "project-kp-web-inventaris",
    storageBucket: "project-kp-web-inventaris.appspot.com",
    messagingSenderId: "180534737303",
    appId: "1:180534737303:web:4da196e5f791e2e1dcacd2",
    measurementId: "G-MZZ0K2PDCZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentPage = 'dashboard';
let currentCollectionName = 'dashboard';
let user = null;
const itemForm = document.getElementById('itemForm');
const itemModal = new bootstrap.Modal(document.getElementById('itemModal'));
const confirmActionModal = new bootstrap.Modal(document.getElementById('confirmActionModal'));
const { jsPDF } = window.jspdf;

// Variable untuk menyimpan info aksi yang akan dikonfirmasi
let currentActionInfo = { action: null, docId: null, collection: null };

onAuthStateChanged(auth, (currentUser) => {
    if (currentUser) {
        user = currentUser;
        document.getElementById('app-loader').classList.add('d-none');
        document.getElementById('main-app').classList.remove('d-none');
        initializeAppLogic();
    } else {
        window.location.href = 'login.html';
    }
});

function initializeAppLogic() {
    const userDisplayName = user.displayName || user.email.split('@')[0];
    const userInitial = userDisplayName.charAt(0).toUpperCase();
    document.getElementById('sidebar-user-name').textContent = userDisplayName;
    document.getElementById('sidebar-user-email').textContent = user.email;
    document.getElementById('header-user-name').textContent = userDisplayName;
    const avatarUrl = `https://placehold.co/40x40/0d6efd/white?text=${userInitial}`;
    document.getElementById('sidebar-user-avatar').src = avatarUrl;
    document.getElementById('header-user-avatar').src = avatarUrl.replace('40x40', '32x32');

    document.getElementById('main-nav').addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link) {
            e.preventDefault();
            const page = link.dataset.page;
            navigate(page);
        }
    });

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.body.classList.toggle('sidebar-minimized');
    });

    const notificationModalHtml = `
        <div class="modal fade" id="dueNotificationModal" tabindex="-1" aria-labelledby="dueNotificationModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="dueNotificationModalLabel">Pengingat Pengembalian Barang</h5>
                    </div>
                    <div class="modal-body" id="dueNotificationBody">
                        <!-- Item list will be populated here -->
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" id="viewDueItemsBtn">Lihat Barang Keluar</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', notificationModalHtml);
    const dueNotificationModal = new bootstrap.Modal(document.getElementById('dueNotificationModal'));

    const checkDueAndOverdue = async () => {
        const today = new Date().toISOString().split('T')[0];
        const q = query(
            collection(db, 'users', user.uid, 'keluar'),
            where('tanggal_kembali', '<=', today)
        );
        try {
            const snapshot = await getDocs(q);
            if (snapshot.docs.length > 0) {
                const items = snapshot.docs.map(doc => {
                    const data = doc.data();
                    const status = data.tanggal_kembali === today ? 'jatuh tempo hari ini' : 'telah lewat jatuh tempo';
                    return `<li>${sanitizeText(data.nama_barang || '-')} (${sanitizeText(data.jenis || '-')}, Merk: ${sanitizeText(data.merk || '-')}, Jumlah: ${data.jumlah || 0}) - ${status}</li>`;
                }).join('');
                document.getElementById('dueNotificationBody').innerHTML = `<p>Barang berikut harus dikembalikan:</p><ul>${items}</ul>`;
                dueNotificationModal.show();
            }
        } catch (error) {
            console.error('Gagal memeriksa barang yang harus dikembalikan:', error.message);
        }
    };

    checkDueAndOverdue();
    const notificationInterval = setInterval(checkDueAndOverdue, 60 * 1000);

    document.getElementById('viewDueItemsBtn').addEventListener('click', () => {
        dueNotificationModal.hide();
        navigate('barang-keluar-temporary');
    });

    document.body.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-tambah, .btn-edit, .btn-delete, .btn-kembalikan, .btn-logout, .clear-log-btn, #download-report-btn, .dashboard-card');
        if (!target) return;

        if (target.matches('.btn-tambah')) {
            if (currentCollectionName === 'transaksi') {
                document.getElementById('itemModalLabel').textContent = 'Pilih Stock Barang';
                buildForm({}, 'transaksi', 'select');
            } else {
                const title = currentCollectionName === 'material' ? 'Stock Material' : 'Stock Komponen';
                document.getElementById('itemModalLabel').textContent = `Tambah ${title}`;
                buildForm({}, currentCollectionName);
            }
            itemModal.show();
        } else if (target.matches('.btn-edit')) {
            const docId = target.dataset.id;
            const collectionName = target.dataset.collection || currentCollectionName;
            try {
                const docRef = doc(db, 'users', user.uid, collectionName, docId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    buildForm({ id: docId, ...docSnap.data() }, collectionName);
                    itemModal.show();
                } else {
                    alert('Dokumen tidak ditemukan.');
                }
            } catch (error) {
                console.error('Gagal memuat data untuk edit:', error.message);
                alert('Gagal memuat data: ' + error.message);
            }
        } else if (target.matches('.btn-delete')) {
            const docId = target.dataset.id;
            const collectionName = target.dataset.collection || currentCollectionName;
            currentActionInfo = { action: 'delete', docId, collection: collectionName };
            document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Hapus';
            document.getElementById('confirmActionBody').textContent = 'Yakin ingin menghapus data ini?';
            confirmActionModal.show();
        } else if (target.matches('.btn-kembalikan')) {
            const { id, jenis, nama, merk, spesifikasi, jumlah } = target.dataset;
            try {
                const stockCollection = collection(db, 'users', user.uid, jenis);
                const q = query(stockCollection,
                    where(jenis === 'material' ? 'nama' : 'nama_barang', '==', nama),
                    where('merk', '==', merk),
                    where('spesifikasi', '==', spesifikasi));
                const stockSnapshot = await getDocs(q);

                if (stockSnapshot.docs.length === 0) {
                    throw new Error('Stok tidak ditemukan.');
                }

                const stockDoc = stockSnapshot.docs[0];
                const stockId = stockDoc.id;
                const stockData = stockDoc.data();
                const newJumlah = (stockData.jumlah || 0) + parseInt(jumlah);

                await updateDoc(doc(db, 'users', user.uid, jenis, stockId), { jumlah: newJumlah });
                const keluarDocRef = doc(db, 'users', user.uid, 'keluar', id);
                const keluarDoc = await getDoc(keluarDocRef);
                await deleteDoc(keluarDocRef);

                const returnData = {
                    jenis,
                    nama_barang: nama,
                    merk,
                    spesifikasi,
                    jumlah: parseInt(jumlah),
                    keterangan: 'pengembalian',
                    tanggal_keluar: keluarDoc.data().tanggal_keluar,
                    tanggal_kembali: keluarDoc.data().tanggal_kembali,
                    tanggal_dikembalikan: new Date().toISOString(),
                    user: user.email,
                    timestamp: serverTimestamp()
                };
                await writeLog('pengembalian', 'keluar', returnData);

                loadBarangKeluarTemporaryPage();
            } catch (error) {
                console.error('Gagal mengembalikan barang:', error.message);
                alert('Gagal mengembalikan barang: ' + error.message);
            }
        } else if (target.matches('.btn-logout')) {
            currentActionInfo = { action: 'logout' };
            document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Logout';
            document.getElementById('confirmActionBody').textContent = 'Yakin ingin keluar?';
            confirmActionModal.show();
        } else if (target.matches('.clear-log-btn')) {
            currentActionInfo = { action: 'clear_logs', collection: target.dataset.collection || currentCollectionName };
            document.getElementById('confirmActionTitle').textContent = 'Hapus Riwayat';
            document.getElementById('confirmActionBody').textContent = 'Yakin ingin menghapus semua riwayat aktivitas?';
            confirmActionModal.show();
        } else if (target.matches('#download-report-btn')) {
            e.preventDefault(); // Prevent multiple triggers
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;
            const includeStock = document.getElementById('report-stock').checked;
            if (startDate && endDate) {
                await generateReport(startDate, endDate, includeStock);
            } else {
                alert('Silakan pilih rentang tanggal.');
            }
        } else if (target.matches('.dashboard-card')) {
            const page = target.dataset.page;
            if (page) {
                navigate(page);
            }
        }
    });

    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = itemForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        const itemId = document.getElementById('itemId')?.value || '';
        const collectionName = currentCollectionName;
        let itemData = {};

        try {
            if (collectionName === 'transaksi') {
                const jenis = document.getElementById('jenis').value;
                const nama_barang = document.getElementById('nama_barang').value;
                const merk = document.getElementById('merk').value;
                const spesifikasi = document.getElementById('spesifikasi').value;
                const jumlah = parseInt(document.getElementById('jumlah').value);
                const transaksi = document.getElementById('transaksi').value;
                const keterangan = document.getElementById('keterangan').value;
                const tanggal_keluar = new Date().toISOString().split('T')[0];
                const tanggal_kembali = document.getElementById('tanggal_kembali')?.value || '';

                itemData = {
                    jenis,
                    nama_barang,
                    merk,
                    spesifikasi,
                    jumlah,
                    transaksi,
                    keterangan,
                    tanggal_keluar,
                    tanggal_kembali: keterangan === 'temporary' ? tanggal_kembali : null,
                    user: user.email,
                    timestamp: serverTimestamp()
                };

                const collectionData = collection(db, 'users', user.uid, jenis);
                const q = query(collectionData,
                    where(jenis === 'material' ? 'nama' : 'nama_barang', '==', nama_barang),
                    where('merk', '==', merk),
                    where('spesifikasi', '==', spesifikasi));
                const snapshotData = await getDocs(q);

                if (snapshotData.docs.length === 0) {
                    throw new Error('Data stok tidak ditemukan.');
                }

                const docData = snapshotData.docs[0];
                const stockId = docData.id;
                const stockData = docData.data();
                let newJumlah = stockData.jumlah || 0;

                if (transaksi === 'masuk') {
                    newJumlah += jumlah;
                } else if (transaksi === 'keluar') {
                    if (jumlah > newJumlah) {
                         throw new Error('Jumlah keluar melebihi stok yang tersedia.');
                    }
                    newJumlah -= jumlah;
                }

                await updateDoc(doc(db, 'users', user.uid, jenis, stockId), { jumlah: newJumlah });
                await addDoc(collection(db, 'users', user.uid, 'transaksi'), itemData);

                if (keterangan === 'temporary') {
                    await addDoc(collection(db, 'users', user.uid, 'keluar'), itemData);
                }

                await writeLog('tambah', 'transaksi', itemData);
                itemModal.hide();
                loadKeluarMasukPage();
            } else {
                if (collectionName === 'komponen') {
                    itemData = {
                        nama_barang: document.getElementById('nama_barang').value,
                        merk: document.getElementById('merk').value,
                        spesifikasi: document.getElementById('spesifikasi').value,
                        jumlah: parseInt(document.getElementById('jumlah').value),
                        keterangan: document.getElementById('keterangan').value
                    };
                } else if (collectionName === 'material') {
                    itemData = {
                        nama: document.getElementById('nama').value,
                        merk: document.getElementById('merk').value,
                        spesifikasi: document.getElementById('spesifikasi').value,
                        jumlah: parseInt(document.getElementById('jumlah').value),
                        keterangan: document.getElementById('keterangan').value
                    };
                }

                if (itemId) {
                    await updateDoc(doc(db, 'users', user.uid, collectionName, itemId), itemData);
                    await writeLog('edit', collectionName, itemData);
                } else {
                    await addDoc(collection(db, 'users', user.uid, collectionName), itemData);
                    await writeLog('tambah', collectionName, itemData);
                }

                itemModal.hide();
                loadDataTablePage();
            }
        } catch (error) {
            console.error('Gagal menyimpan data:', error.message);
            alert('Gagal menyimpan data: ' + error.message);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    document.getElementById('confirmActionBtn').addEventListener('click', async () => {
        const { action, docId, collection: collectionName } = currentActionInfo;
        try {
            if (action === 'logout') {
                await signOut(auth);
            } else if (action === 'delete') {
                const docRef = doc(db, 'users', user.uid, collectionName, docId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    await deleteDoc(docRef);
                    await writeLog('hapus', collectionName, data);
                }
                confirmActionModal.hide();
                if (collectionName === 'transaksi') {
                    loadKeluarMasukPage();
                } else if (collectionName === 'keluar') {
                    loadBarangKeluarTemporaryPage();
                } else {
                    loadDataTablePage();
                }
            } else if (action === 'clear_logs') {
                const logsSnapshot = await getDocs(query(
                    collection(db, 'users', user.uid, 'logs'),
                    where('collection', '==', collectionName)
                ));
                const batch = writeBatch(db);
                logsSnapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                confirmActionModal.hide();

                if (collectionName === 'material' || collectionName === 'komponen') {
                    loadDataTablePage();
                } else if (collectionName === 'transaksi') {
                    loadKeluarMasukPage();
                } else if (collectionName === 'keluar') {
                    loadBarangKeluarTemporaryPage();
                }
            }
        } catch (error) {
            console.error('Gagal melakukan aksi:', error.message);
            alert('Gagal: ' + error.message);
        }
    });

    navigate(currentPage);

    return () => clearInterval(notificationInterval);
}

function navigate(page) {
    currentPage = page;
    document.querySelectorAll('#main-nav .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === page) {
            link.classList.add('active');
        }
    });
    if (page === 'dashboard') {
        loadDashboardPage();
    } else if (page === 'material' || page === 'komponen') {
        currentCollectionName = page;
        loadDataTablePage();
    } else if (page === 'keluar-masuk') {
        currentCollectionName = 'transaksi';
        loadKeluarMasukPage();
    } else if (page === 'barang-keluar-temporary') {
        currentCollectionName = 'keluar';
        loadBarangKeluarTemporaryPage();
    } else if (page === 'buat-report') {
        loadBuatReportPage();
    } else if (page === 'logout') {
        document.querySelector('.btn-logout').click();
    }
}

async function loadDashboardPage() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="#">Home</a></li>
                <li class="breadcrumb-item active">Dashboard</li>
            </ol>
        </nav>
        <h4 class="mb-3">Dashboard</h4>
        <div class="row">
            <div class="col-md-4">
                <div class="card mb-4 dashboard-card" data-page="material" style="cursor: pointer;">
                    <div class="card-body">
                        <h5 class="card-title">Total Stok Material</h5>
                        <p class="card-text fs-3" id="totalMaterial">Memuat...</p>
                        <p class="card-text text-muted" id="totalMaterialJenis">Memuat...</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card mb-4 dashboard-card" data-page="komponen" style="cursor: pointer;">
                    <div class="card-body">
                        <h5 class="card-title">Total Stok Komponen</h5>
                        <p class="card-text fs-3" id="totalKomponen">Memuat...</p>
                        <p class="card-text text-muted" id="totalKomponenJenis">Memuat...</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card mb-4 dashboard-card" data-page="keluar-masuk" style="cursor: pointer;">
                    <div class="card-body">
                        <h5 class="card-title">Transaksi Terbaru</h5>
                        <p class="card-text fs-3" id="recentTransaksi">Memuat...</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card mb-4 dashboard-card" data-page="barang-keluar-temporary" style="cursor: pointer;">
                    <div class="card-body">
                        <h5 class="card-title">Barang Keluar Temporary</h5>
                        <p class="card-text fs-3" id="temporaryKeluar">Memuat...</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card mb-4 dashboard-card" data-page="keluar-masuk" style="cursor: pointer;">
                    <div class="card-body">
                        <h5 class="card-title">Total Barang Masuk</h5>
                        <p class="card-text fs-3" id="totalMasuk">Memuat...</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card mb-4 dashboard-card" data-page="keluar-masuk" style="cursor: pointer;">
                    <div class="card-body">
                        <h5 class="card-title">Total Barang Keluar</h5>
                        <p class="card-text fs-3" id="totalKeluar">Memuat...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    try {
        const materialSnapshot = await getDocs(query(collection(db, 'users', user.uid, 'material')));
        const totalMaterial = materialSnapshot.docs.reduce((sum, doc) => sum + (doc.data().jumlah || 0), 0);
        const totalMaterialJenis = materialSnapshot.docs.length;
        const totalMaterialEl = document.getElementById('totalMaterial');
        const totalMaterialJenisEl = document.getElementById('totalMaterialJenis');
        if (totalMaterialEl && totalMaterialJenisEl) {
            totalMaterialEl.textContent = `${totalMaterial} unit`;
            totalMaterialJenisEl.textContent = `${totalMaterialJenis} jenis barang`;
        }

        const komponenSnapshot = await getDocs(query(collection(db, 'users', user.uid, 'komponen')));
        const totalKomponen = komponenSnapshot.docs.reduce((sum, doc) => sum + (doc.data().jumlah || 0), 0);
        const totalKomponenJenis = komponenSnapshot.docs.length;
        const totalKomponenEl = document.getElementById('totalKomponen');
        const totalKomponenJenisEl = document.getElementById('totalKomponenJenis');
        if (totalKomponenEl && totalKomponenJenisEl) {
            totalKomponenEl.textContent = `${totalKomponen} unit`;
            totalKomponenJenisEl.textContent = `${totalKomponenJenis} jenis barang`;
        }

        const transaksiSnapshot = await getDocs(query(
            collection(db, 'users', user.uid, 'transaksi'),
            orderBy('timestamp', 'desc'),
            limit(1)
        ));
        const recentTransaksi = transaksiSnapshot.docs.length === 0
            ? 'Tidak ada transaksi'
            : `${transaksiSnapshot.docs[0].data().nama_barang} (${transaksiSnapshot.docs[0].data().transaksi}, ${transaksiSnapshot.docs[0].data().jumlah} unit)`;
        const recentTransaksiEl = document.getElementById('recentTransaksi');
        if (recentTransaksiEl) recentTransaksiEl.textContent = recentTransaksi;

        const keluarSnapshot = await getDocs(query(collection(db, 'users', user.uid, 'keluar')));
        const totalKeluarTemporary = keluarSnapshot.docs.reduce((sum, doc) => sum + (doc.data().jumlah || 0), 0);
        const temporaryKeluarEl = document.getElementById('temporaryKeluar');
        if (temporaryKeluarEl) temporaryKeluarEl.textContent = `${totalKeluarTemporary} unit`;

        const masukSnapshot = await getDocs(query(
            collection(db, 'users', user.uid, 'transaksi'),
            where('transaksi', '==', 'masuk')
        ));
        const totalMasuk = masukSnapshot.docs.reduce((sum, doc) => sum + (doc.data().jumlah || 0), 0);
        const totalMasukEl = document.getElementById('totalMasuk');
        if (totalMasukEl) totalMasukEl.textContent = `${totalMasuk} unit`;

        const keluarTransaksiSnapshot = await getDocs(query(
            collection(db, 'users', user.uid, 'transaksi'),
            where('transaksi', '==', 'keluar')
        ));
        const totalKeluar = keluarTransaksiSnapshot.docs.reduce((sum, doc) => sum + (doc.data().jumlah || 0), 0);
        const totalKeluarEl = document.getElementById('totalKeluar');
        if (totalKeluarEl) totalKeluarEl.textContent = `${totalKeluar} unit`;
    } catch (error) {
        console.error('Gagal memuat dashboard:', error.message);
        const elements = [
            'totalMaterial', 'totalMaterialJenis', 'totalKomponen', 'totalKomponenJenis',
            'recentTransaksi', 'temporaryKeluar', 'totalMasuk', 'totalKeluar'
        ];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = 'Error';
        });
    }
}

async function loadDataTablePage() {
    const config = {
        material: { title: 'Data Material', headers: ['Nama Material', 'Merk', 'Spesifikasi', 'Jumlah', 'Keterangan'], keys: ['nama', 'merk', 'spesifikasi', 'jumlah', 'keterangan'] },
        komponen: { title: 'Data Komponen', headers: ['Nama Komponen', 'Merk', 'Spesifikasi', 'Jumlah', 'Keterangan'], keys: ['nama_barang', 'merk', 'spesifikasi', 'jumlah', 'keterangan'] }
    };
    const pageConfig = config[currentCollectionName];
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="#">Home</a></li>
                <li class="breadcrumb-item active">${pageConfig.title}</li>
            </ol>
        </nav>
        <div class="card mb-4">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h5>Daftar ${pageConfig.title}</h5>
                <div>
                    <button class="btn btn-primary btn-tambah"><i class="bi bi-plus-circle me-2"></i>Tambah ${pageConfig.title}</button>
                    <input type="text" class="form-control d-inline-block w-auto ms-2" id="search-input" placeholder="Cari...">
                </div>
            </div>
            <div class="card-body">
                <div class="table-responsive scrollable-container">
                    <table class="table table-striped table-hover table-bordered">
                        <thead class="table-dark">
                            <tr><th>NO</th>${pageConfig.headers.map(h => `<th>${h}</th>`).join('')}<th>OPSI</th></tr>
                        </thead>
                        <tbody id="table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5>Riwayat Aktivitas ${pageConfig.title}</h5>
                <div>
                    <button class="btn btn-outline-secondary btn-sm clear-log-btn ms-2" data-collection="${currentCollectionName}"><i class="bi bi-trash me-1"></i>Bersihkan</button>
                    <input type="text" class="form-control d-inline-block log-search ms-2" id="log-search" placeholder="Cari...">
                </div>
            </div>
            <div class="card-body p-0 scrollable-container" id="log-container">
                <ul class="list-group list-group-flush"></ul>
            </div>
        </div>
    `;

    const tableBody = document.getElementById('table-body');
    const searchInput = document.getElementById('search-input');
    const logSearchInput = document.getElementById('log-search');
    let tableData = [];
    let logData = [];

    const q = query(collection(db, 'users', user.uid, currentCollectionName));
    const unsubscribeTable = onSnapshot(q, (snapshot) => {
        tableData = snapshot.docs.map((doc, index) => ({
            id: doc.id,
            data: doc.data(),
            index: index + 1
        }));

        renderTable(tableData);

        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const filteredData = tableData.filter(item => {
                const data = item.data;
                return (
                    (data.nama || data.nama_barang || '').toLowerCase().includes(searchTerm) ||
                    (data.merk || '').toLowerCase().includes(searchTerm) ||
                    (data.spesifikasi || '').toLowerCase().includes(searchTerm)
                );
            });
            renderTable(filteredData);
        });
    }, (error) => {
        console.error('Failed to load table data:', error.message);
        tableBody.innerHTML = `<tr><td colspan="${pageConfig.headers.length + 2}" class="text-center">Failed to load data: ${error.message}</td></tr>`;
    });

    function renderTable(data) {
        tableBody.innerHTML = data.length === 0
            ? `<tr><td colspan="${pageConfig.headers.length + 2}" class="text-center">Tidak ada data.</td></tr>`
            : data.map(item => {
                const data = item.data;
                return `
                    <tr>
                        <td>${item.index}</td>
                        ${pageConfig.keys.map(key => `<td>${sanitizeText(data[key] || '-')}</td>`).join('')}
                        <td>
                            <button class="btn btn-warning btn-sm btn-edit" data-id="${item.id}"><i class="bi bi-pencil-square"></i></button>
                            <button class="btn btn-danger btn-sm btn-delete" data-id="${item.id}"><i class="bi bi-trash"></i></button>
                        </td>
                    </tr>`;
            }).join('');
    }

    const logQuery = query(collection(db, 'users', user.uid, 'logs'), where('collection', '==', currentCollectionName), orderBy('timestamp', 'desc'));
    const unsubscribeLogs = onSnapshot(logQuery, (snapshot) => {
        logData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        renderLogs(logData);

        logSearchInput.addEventListener('input', () => {
            const searchTerm = logSearchInput.value.toLowerCase();
            const filteredLogs = logData.filter(log => {
                const details = log.data.details || {};
                return (
                    (details.nama || details.nama_barang || '').toLowerCase().includes(searchTerm) ||
                    (details.merk || '').toLowerCase().includes(searchTerm) ||
                    (details.spesifikasi || '').toLowerCase().includes(searchTerm) ||
                    (log.data.action || '').toLowerCase().includes(searchTerm)
                );
            });
            renderLogs(filteredLogs);
        });
    }, (error) => {
        console.error('Failed to load logs:', error.message);
        document.querySelector('#log-container ul').innerHTML = `<li class="list-group-item text-center text-danger">Failed to load logs: ${error.message}</li>`;
    });

    function renderLogs(data) {
        const logContainer = document.querySelector('#log-container ul');
        const actionMap = {
            'tambah': 'ditambahkan',
            'edit': 'diubah',
            'hapus': 'dihapus'
        };
        logContainer.innerHTML = data.length === 0
            ? '<li class="list-group-item text-muted text-center">Belum ada aktivitas.</li>'
            : data.map(doc => {
                const log = doc.data;
                const details = log.details || {};
                const docName = sanitizeText(details.nama || details.nama_barang || 'Item');
                const itemDetails = ` (Merk: ${sanitizeText(details.merk || '-')}, Spek: ${sanitizeText(details.spesifikasi || '-')}, Jml: ${details.jumlah || 0}, Ket: ${sanitizeText(details.keterangan || '-')})`;
                const date = log.timestamp?.toDate()?.toLocaleString('id-ID', { timeStyle: 'short', dateStyle: 'medium' }) || 'Baru saja';
                const actionText = actionMap[log.action] || log.action;
                return `<li class="list-group-item">[${sanitizeText(date)}] Item <strong>${docName}</strong> telah <strong>${actionText}</strong>.${itemDetails}</li>`;
            }).join('');
    }

    return () => {
        unsubscribeTable();
        unsubscribeLogs();
    };
}

async function loadKeluarMasukPage() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="#">Home</a></li>
                <li class="breadcrumb-item active">Keluar Masuk</li>
            </ol>
        </nav>
        
        <button class="btn btn-primary btn-lg btn-tambah mt-2 mb-4"><i class="bi bi-plus-circle me-2"></i>Tambah Keluar Masuk</button>
        
        <div class="card">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h5>Riwayat Aktivitas Keluar Masuk</h5>
                <div>
                    <button class="btn btn-outline-secondary btn-sm clear-log-btn ms-2" data-collection="transaksi"><i class="bi bi-trash me-1"></i>Bersihkan</button>
                    <input type="text" class="form-control d-inline-block log-search ms-2" id="search-transaksi" placeholder="Cari...">
                </div>
            </div>
            <div class="card-body">
                <div class="table scrollable-container-lg">
                    <table class="table table-striped table-hover table-bordered">
                        <thead class="table-dark">
                            <tr>
                                <th>NO</th>
                                <th>Jenis</th>
                                <th>Nama Barang</th>
                                <th>Keluar/Masuk</th>
                                <th>Keterangan</th>
                                <th>Merk</th>
                                <th>Spesifikasi</th>
                                <th>Jumlah</th>
                                <th>Waktu</th>
                                <th>Tanggal Kembali</th>
                            </tr>
                        </thead>
                        <tbody id="table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const tableBody = document.getElementById('table-body');
    const searchInput = document.getElementById('search-transaksi');
    let tableData = [];

    const q = query(collection(db, 'users', user.uid, 'transaksi'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        tableData = snapshot.docs
            .filter(doc => doc.data().keterangan !== 'pengembalian')
            .map((doc, index) => ({
                id: doc.id,
                data: doc.data(),
                index: index + 1
            }));

        renderTable(tableData);

        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const filteredData = tableData.filter(item => {
                const data = item.data;
                return (
                    (data.jenis || '').toLowerCase().includes(searchTerm) ||
                    (data.nama_barang || '').toLowerCase().includes(searchTerm) ||
                    (data.merk || '').toLowerCase().includes(searchTerm) ||
                    (data.spesifikasi || '').toLowerCase().includes(searchTerm)
                );
            });
            renderTable(filteredData);
        });
    }, (error) => {
        console.error('Failed to load transaction data:', error.message);
        tableBody.innerHTML = `<tr><td colspan="10" class="text-center">Failed to load data: ${error.message}</td></tr>`;
    });

    function renderTable(data) {
        tableBody.innerHTML = data.length === 0
            ? `<tr><td colspan="10" class="text-center">Tidak ada data.</td></tr>`
            : data.map(item => {
                const data = item.data;
                const waktu = data.timestamp?.toDate()?.toLocaleString('id-ID', { timeStyle: 'short', dateStyle: 'medium' }) || '-';
                return `
                    <tr>
                        <td>${item.index}</td>
                        <td>${sanitizeText(data.jenis || '-')}</td>
                        <td>${sanitizeText(data.nama_barang || '-')}</td>
                        <td>${sanitizeText(data.transaksi || '-')}</td>
                        <td>${sanitizeText(data.keterangan || '-')}</td>
                        <td>${sanitizeText(data.merk || '-')}</td>
                        <td>${sanitizeText(data.spesifikasi || '-')}</td>
                        <td>${data.jumlah || 0}</td>
                        <td>${waktu}</td>
                        <td>${sanitizeText(data.tanggal_kembali || '-')}</td>
                    </tr>`;
            }).join('');
    }

    return unsubscribe;
}

async function loadBarangKeluarTemporaryPage() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="#">Home</a></li>
                <li class="breadcrumb-item active">Barang Keluar (Temporary)</li>
            </ol>
        </nav>
        <div class="card mb-4">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h5>Data Barang Keluar (Temporary)</h5>
                <input type="text" class="form-control log-search" id="search-keluar" placeholder="Cari...">
            </div>
            <div class="card-body">
                <div class="table-responsive scrollable-container">
                    <table class="table table-striped table-hover table-bordered">
                        <thead class="table-dark">
                            <tr>
                                <th>NO</th>
                                <th>Jenis Barang</th>
                                <th>Nama</th>
                                <th>Merk</th>
                                <th>Spesifikasi</th>
                                <th>Jumlah</th>
                                <th>Keterangan</th>
                                <th>Tanggal Pinjam</th>
                                <th>Tanggal Kembali</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h5>Riwayat Aktivitas Barang Temporary</h5>
                <div>
                    <button class="btn btn-outline-secondary btn-sm clear-log-btn ms-2" data-collection="keluar"><i class="bi bi-trash me-1"></i>Bersihkan</button>
                    <input type="text" class="form-control d-inline-block log-search ms-2" id="log-search" placeholder="Cari...">
                </div>
            </div>
            <div class="card-body p-3">
                <div class="table-responsive scrollable-container">
                    <table class="table table-striped table-hover table-bordered" style="min-width: 1000px;">
                        <thead class="table-dark">
                            <tr>
                                <th>Jenis</th>
                                <th>Nama Barang</th>
                                <th>Merk</th>
                                <th>Spesifikasi</th>
                                <th>Jumlah</th>
                                <th>Tanggal Pinjam</th>
                                <th>Tanggal Kembali</th>
                                <th>Tanggal Dikembalikan</th>
                            </tr>
                        </thead>
                        <tbody id="log-table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const tableBody = document.getElementById('table-body');
    const logTableBody = document.getElementById('log-table-body');
    const searchInput = document.getElementById('search-keluar');
    const logSearchInput = document.getElementById('log-search');
    let tableData = [];
    let logData = [];

    const q = query(collection(db, 'users', user.uid, 'keluar'), orderBy('timestamp', 'desc'));
    const unsubscribeTable = onSnapshot(q, (snapshot) => {
        const today = new Date().toISOString().split('T')[0];
        tableData = snapshot.docs.map((doc, index) => {
            const data = doc.data();
            const isDue = data.tanggal_kembali && data.tanggal_kembali <= today;
            return {
                id: doc.id,
                data,
                index: index + 1,
                isDue 
            };
        });

        renderTable(tableData);

        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const filteredData = tableData.filter(item => {
                const data = item.data;
                return (
                    (data.nama_barang || '').toLowerCase().includes(searchTerm) ||
                    (data.merk || '').toLowerCase().includes(searchTerm) ||
                    (data.spesifikasi || '').toLowerCase().includes(searchTerm) ||
                    (data.jenis || '').toLowerCase().includes(searchTerm)
                );
            });
            renderTable(filteredData);
        });
    }, (error) => {
        console.error('Failed to load barang keluar data:', error.message);
        tableBody.innerHTML = `<tr><td colspan="10" class="text-center">Failed to load data: ${error.message}</td></tr>`;
    });

    function renderTable(data) {
        tableBody.innerHTML = data.length === 0
            ? `<tr><td colspan="10" class="text-center">Tidak ada data.</td></tr>`
            : data.map(item => {
                const data = item.data;
                const safeNama = sanitizeAttribute(data.nama_barang || '');
                const safeMerk = sanitizeAttribute(data.merk || '');
                const safeSpesifikasi = sanitizeAttribute(data.spesifikasi || '');
                const rowClass = item.isDue ? 'class="item-due"' : '';
                
                return `
                    <tr ${rowClass}>
                        <td>${item.index}</td>
                        <td>${sanitizeText(data.jenis || '-')}</td>
                        <td>${sanitizeText(data.nama_barang || '-')}</td>
                        <td>${sanitizeText(data.merk || '-')}</td>
                        <td>${sanitizeText(data.spesifikasi || '-')}</td>
                        <td>${data.jumlah || 0}</td>
                        <td>${sanitizeText(data.keterangan || '-')}</td>
                        <td>${sanitizeText(data.tanggal_keluar || '-')}</td>
                        <td>${sanitizeText(data.tanggal_kembali || '-')}</td>
                        <td>
                            <button class="btn btn-success btn-sm btn-kembalikan"
                                    data-id="${item.id}"
                                    data-jenis="${sanitizeAttribute(data.jenis || '')}"
                                    data-nama="${safeNama}"
                                    data-merk="${safeMerk}"
                                    data-spesifikasi="${safeSpesifikasi}"
                                    data-jumlah="${data.jumlah || 0}">Kembalikan</button>
                        </td>
                    </tr>`;
            }).join('');
    }

    const logQuery = query(
        collection(db, 'users', user.uid, 'logs'),
        where('action', '==', 'pengembalian'),
        where('collection', '==', 'keluar'),
        orderBy('timestamp', 'desc')
    );
    const unsubscribeLogs = onSnapshot(logQuery, (snapshot) => {
        logData = snapshot.docs.map(doc => {
            // PERBAIKAN: Mengganti doc.data menjadi doc.data() untuk membaca data dengan benar.
            // Ini adalah penyebab utama kenapa tabel riwayat kosong dan highlight merah tidak berfungsi.
            const data = doc.data(); 
            const details = data.details || {};
            const tanggalKembaliStr = details.tanggal_kembali;
            const tanggalDikembalikanISO = details.tanggal_dikembalikan;
            
            let isLate = false;
            if (tanggalKembaliStr && tanggalDikembalikanISO) {
                const dikembalikanDateStr = tanggalDikembalikanISO.split('T')[0];
                isLate = dikembalikanDateStr > tanggalKembaliStr;
            }
            return { id: doc.id, data, isLate };
        });
        renderLogs(logData);

        logSearchInput.addEventListener('input', () => {
            const searchTerm = logSearchInput.value.toLowerCase();
            const filteredLogs = logData.filter(log => {
                const details = log.data.details || {};
                return (
                    (details.nama_barang || '').toLowerCase().includes(searchTerm) ||
                    (details.jenis || '').toLowerCase().includes(searchTerm) ||
                    (details.merk || '').toLowerCase().includes(searchTerm) ||
                    (details.spesifikasi || '').toLowerCase().includes(searchTerm)
                );
            });
            renderLogs(filteredLogs);
        });
    }, (error) => {
        console.error('Failed to load return logs:', error.message);
        logTableBody.innerHTML = `<tr><td colspan="8" class="text-center">Failed to load history: ${error.message}</td></tr>`;
    });

    function renderLogs(data) {
        logTableBody.innerHTML = data.length === 0
            ? '<tr><td colspan="8" class="text-center">Belum ada aktivitas.</td></tr>'
            : data.map(doc => {
                const log = doc.data;
                const details = log.details || {};
                const datePinjam = sanitizeText(details.tanggal_keluar || '-');
                const dateKembali = sanitizeText(details.tanggal_kembali || '-');
                const dateDikembalikan = details.tanggal_dikembalikan
                    ? new Date(details.tanggal_dikembalikan).toLocaleString('id-ID', { timeStyle: 'short', dateStyle: 'medium' })
                    : '-';
                const rowClass = doc.isLate ? 'class="late-return"' : '';
                return `
                    <tr ${rowClass}>
                        <td>${sanitizeText(details.jenis || '-')}</td>
                        <td>${sanitizeText(details.nama_barang || '-')}</td>
                        <td>${sanitizeText(details.merk || '-')}</td>
                        <td>${sanitizeText(details.spesifikasi || '-')}</td>
                        <td>${details.jumlah || 0}</td>
                        <td>${datePinjam}</td>
                        <td>${dateKembali}</td>
                        <td>${sanitizeText(dateDikembalikan)}</td>
                    </tr>`;
            }).join('');
    }

    return () => {
        unsubscribeTable();
        unsubscribeLogs();
    };
}

async function loadBuatReportPage() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="#">Home</a></li>
                <li class="breadcrumb-item active">Buat Report</li>
            </ol>
        </nav>
        <div class="card">
            <div class="card-header bg-white">
                <h5>Konfigurasi Report</h5>
            </div>
            <div class="card-body">
                <form id="reportForm">
                    <div class="mb-3">
                        <label class="form-label">Pilih Data untuk Report</label>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="report-stock">
                            <label class="form-check-label" for="report-stock">Tampilkan Stock Terbaru</label>
                        </div>
                    </div>
                    <div class="mb-3 date-picker-container">
                        <label class="form-label">Tanggal</label>
                        <div class="input-group">
                            <input type="date" class="form-control" id="start-date" required>
                            <span class="input-group-text">s/d</span>
                            <input type="date" class="form-control" id="end-date" required>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary" id="download-report-btn" disabled><i class="bi bi-download me-2"></i>Download Report</button>
                </form>
            </div>
        </div>
    `;

    const reportForm = document.getElementById('reportForm');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const downloadBtn = document.getElementById('download-report-btn');

    const updateButtonState = () => {
        downloadBtn.disabled = !startDateInput.value || !endDateInput.value;
    };

    startDateInput.addEventListener('input', updateButtonState);
    endDateInput.addEventListener('input', updateButtonState);

    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const includeStock = document.getElementById('report-stock').checked;
        if (startDate && endDate) {
            await generateReport(startDate, endDate, includeStock);
        } else {
            alert('Silakan pilih rentang tanggal.');
        }
    });
}

async function generateReport(startDate, endDate, includeLatestStock) {
    const doc = new jsPDF();
    let yPos = 20;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Laporan Inventaris PT MULIAMAKMUR ELEKTRIKATAMA', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode Laporan: ${startDate} s/d ${endDate}`, 105, yPos, { align: 'center' });
    yPos += 5;
    doc.text(`Dibuat oleh: ${user.displayName || user.email}`, 105, yPos, { align: 'center' });
    yPos += 10; 


    let materialTableData = [];
    let komponenTableData = [];
    let returnLogs = [];

    try {
        const logSnapshot = await getDocs(query(
            collection(db, 'users', user.uid, 'logs'),
            where('action', '==', 'pengembalian'),
            where('collection', '==', 'keluar'),
            orderBy('timestamp', 'desc')
        ));
        returnLogs = logSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                nama_barang: data.details?.nama_barang || '-',
                tanggal_dikembalikan: data.details?.tanggal_dikembalikan
                    ? new Date(data.details.tanggal_dikembalikan).toLocaleString('id-ID', { dateStyle: 'medium' })
                    : '-'
            };
        });
    } catch (error) {
        console.error('Gagal memuat log pengembalian:', error.message);
    }

    try {
        const transaksiSnapshot = await getDocs(collection(db, 'users', user.uid, 'transaksi'));
        const allTransactions = transaksiSnapshot.docs
            .map(doc => doc.data())
            .filter(data => {
                const tanggal = data.tanggal_keluar;
                return (!startDate || tanggal >= startDate) && (!endDate || tanggal <= endDate) && data.keterangan !== 'pengembalian';
            });

        materialTableData = allTransactions
            .filter(data => data.jenis === 'material')
            .map(data => {
                const returnLog = returnLogs.find(log => log.nama_barang === data.nama_barang);
                return [
                    sanitizeText(data.nama_barang || '-'),
                    sanitizeText(data.transaksi || '-'),
                    sanitizeText(data.keterangan || '-'),
                    sanitizeText(data.merk || '-'),
                    sanitizeText(data.spesifikasi || '-'),
                    data.jumlah || 0,
                    sanitizeText(data.tanggal_keluar || '-'),
                    sanitizeText(data.tanggal_kembali || '-'),
                    sanitizeText(returnLog?.tanggal_dikembalikan || '-')
                ];
            });

        komponenTableData = allTransactions
            .filter(data => data.jenis === 'komponen')
            .map(data => {
                const returnLog = returnLogs.find(log => log.nama_barang === data.nama_barang);
                return [
                    sanitizeText(data.nama_barang || '-'),
                    sanitizeText(data.transaksi || '-'),
                    sanitizeText(data.keterangan || '-'),
                    sanitizeText(data.merk || '-'),
                    sanitizeText(data.spesifikasi || '-'),
                    data.jumlah || 0,
                    sanitizeText(data.tanggal_keluar || '-'),
                    sanitizeText(data.tanggal_kembali || '-'),
                    sanitizeText(returnLog?.tanggal_dikembalikan || '-')
                ];
            });
    } catch (error) {
        console.error('Gagal memuat transaksi:', error.message);
        alert('Gagal memuat transaksi: ' + error.message);
        return;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaksi Material', 14, yPos);
    yPos += 5; 
    doc.autoTable({
        head: [['Nama Barang', 'Keluar/Masuk', 'Keterangan', 'Merk', 'Spesifikasi', 'Jumlah', 'Tanggal', 'Tgl Kembali', 'Tgl Dikembalikan']],
        body: materialTableData,
        startY: yPos,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        columnStyles: { 8: { cellWidth: 25 } }
    });

    yPos = doc.lastAutoTable.finalY;
    
    yPos += 10; 
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaksi Komponen', 14, yPos);
    yPos += 5;
    doc.autoTable({
        head: [['Nama Barang', 'Keluar/Masuk', 'Keterangan', 'Merk', 'Spesifikasi', 'Jumlah', 'Tanggal', 'Tgl Kembali', 'Tgl Dikembalikan']],
        body: komponenTableData,
        startY: yPos,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        columnStyles: { 8: { cellWidth: 25 } }
    });

    if (includeLatestStock) {
        yPos = doc.lastAutoTable.finalY;
        
        yPos += 10;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Stok Material Terbaru', 14, yPos);
        yPos += 5;

        let materialData = [];
        try {
            const materialSnapshot = await getDocs(collection(db, 'users', user.uid, 'material'));
            materialData = materialSnapshot.docs.map(doc => {
                const data = doc.data();
                return [
                    sanitizeText(data.nama || '-'),
                    sanitizeText(data.merk || '-'),
                    sanitizeText(data.spesifikasi || '-'),
                    data.jumlah || 0,
                    sanitizeText(data.keterangan || '-')
                ];
            });
        } catch (error) {
            console.error('Gagal memuat material:', error.message);
        }

        doc.autoTable({
            head: [['Nama', 'Merk', 'Spesifikasi', 'Jumlah', 'Keterangan']],
            body: materialData,
            startY: yPos,
            theme: 'grid',
            headStyles: { fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 8 }
        });

        yPos = doc.lastAutoTable.finalY;

        yPos += 10;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Stok Komponen Terbaru', 14, yPos);
        yPos += 5;

        let komponenData = [];
        try {
            const komponenSnapshot = await getDocs(collection(db, 'users', user.uid, 'komponen'));
            komponenData = komponenSnapshot.docs.map(doc => {
                const data = doc.data();
                return [
                    sanitizeText(data.nama_barang || '-'),
                    sanitizeText(data.merk || '-'),
                    sanitizeText(data.spesifikasi || '-'),
                    data.jumlah || 0,
                    sanitizeText(data.keterangan || '-')
                ];
            });
        } catch (error) {
            console.error('Gagal memuat komponen:', error.message);
        }

        doc.autoTable({
            head: [['Nama Barang', 'Merk', 'Spesifikasi', 'Jumlah', 'Keterangan']],
            body: komponenData,
            startY: yPos,
            theme: 'grid',
            headStyles: { fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 8 }
        });
    }

    doc.save(`Laporan_Stok_${startDate}_${endDate}.pdf`);
}

async function buildForm(data = {}, coll = currentCollectionName, stage = undefined) {
    const isEdit = !!data.id;
    let formHtml = `<input type="hidden" id="itemId" value="${sanitizeAttribute(data.id || '')}">`;

    if (coll === 'komponen') {
        formHtml += `
            <div class="mb-3">
                <label class="form-label">Nama Komponen</label>
                <input type="text" class="form-control" id="nama_barang" value="${sanitizeText(data.nama_barang || '')}" required>
            </div>
            <div class="mb-3">
                <label class="form-label">Merk</label>
                <input type="text" class="form-control" id="merk" value="${sanitizeText(data.merk || '')}" required>
            </div>
            <div class="mb-3">
                <label class="form-label">Spesifikasi</label>
                <textarea class="form-control" id="spesifikasi">${sanitizeText(data.spesifikasi || '')}</textarea>
            </div>
            <div class="mb-3">
                <label class="form-label">Jumlah</label>
                <input type="number" class="form-control" id="jumlah" value="${data.jumlah || ''}" required min="0">
            </div>
            <div class="mb-3">
                <label class="form-label">Keterangan</label>
                <input type="text" class="form-control" id="keterangan" value="${sanitizeText(data.keterangan || '')}" required>
            </div>`;
        document.getElementById('itemModalLabel').textContent = isEdit ? 'Edit Stock Komponen' : 'Tambah Stock Komponen';
        itemForm.innerHTML = formHtml;
    } else if (coll === 'material') {
        formHtml += `
            <div class="mb-3">
                <label class="form-label">Nama Material</label>
                <input type="text" class="form-control" id="nama" value="${sanitizeText(data.nama || '')}" required>
            </div>
            <div class="mb-3">
                <label class="form-label">Merk</label>
                <input type="text" class="form-control" id="merk" value="${sanitizeText(data.merk || '')}" required>
            </div>
            <div class="mb-3">
                <label class="form-label">Spesifikasi</label>
                <textarea class="form-control" id="spesifikasi">${sanitizeText(data.spesifikasi || '')}</textarea>
            </div>
            <div class="mb-3">
                <label class="form-label">Jumlah</label>
                <input type="number" class="form-control" id="jumlah" value="${data.jumlah || ''}" required min="0">
            </div>
            <div class="mb-3">
                <label class="form-label">Keterangan</label>
                <input type="text" class="form-control" id="keterangan" value="${sanitizeText(data.keterangan || '')}" required>
            </div>`;
        document.getElementById('itemModalLabel').textContent = isEdit ? 'Edit Stock Material' : 'Tambah Stock Material';
        itemForm.innerHTML = formHtml;
    } else if (coll === 'transaksi') {
        if (stage === 'select') {
            let materialStock = [];
            let komponenStock = [];

            try {
                const materialSnapshot = await getDocs(collection(db, 'users', user.uid, 'material'));
                materialStock = materialSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const komponenSnapshot = await getDocs(collection(db, 'users', user.uid, 'komponen'));
                komponenStock = komponenSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (error) {
                console.error('Gagal memuat stok:', error.message);
                itemForm.innerHTML = `<p class="text-danger">Gagal memuat stok: ${error.message}</p>`;
                return;
            }

            formHtml = `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">Stok Material</h6>
                    <input type="text" class="form-control w-auto" id="search-material-stock" placeholder="Cari material...">
                </div>
                <div class="table mb-4" style="max-height: 200px; overflow-y: auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead class="table-dark sticky-top">
                            <tr>
                                <th>Nama Material</th>
                                <th>Merk</th>
                                <th>Spesifikasi</th>
                                <th>Jumlah</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="material-stock-body"></tbody>
                    </table>
                </div>

                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">Stok Komponen</h6>
                    <input type="text" class="form-control w-auto" id="search-komponen-stock" placeholder="Cari komponen...">
                </div>
                <div class="table" style="max-height: 200px; overflow-y: auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead class="table-dark sticky-top">
                            <tr>
                                <th>Nama Komponen</th>
                                <th>Merk</th>
                                <th>Spesifikasi</th>
                                <th>Jumlah</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="komponen-stock-body"></tbody>
                    </table>
                </div>`;

            document.getElementById('itemModalLabel').textContent = 'Pilih Stock Barang';
            itemForm.innerHTML = formHtml;

            const materialTbody = document.getElementById('material-stock-body');
            const komponenTbody = document.getElementById('komponen-stock-body');

            function renderMaterialStock(data) {
                materialTbody.innerHTML = data.length === 0 
                ? '<tr><td colspan="5" class="text-center">Tidak ada data.</td></tr>'
                : data.map(item => {
                    const safeNama = sanitizeAttribute(item.nama || '');
                    const safeMerk = sanitizeAttribute(item.merk || '');
                    const safeSpesifikasi = sanitizeAttribute(item.spesifikasi || '');
                    return `
                        <tr>
                            <td>${sanitizeText(item.nama || '-')}</td>
                            <td>${sanitizeText(item.merk || '-')}</td>
                            <td>${sanitizeText(item.spesifikasi || '-')}</td>
                            <td>${item.jumlah || 0}</td>
                            <td>
                                <button class="btn btn-primary btn-sm btn-pilih"
                                        data-collection="material"
                                        data-nama="${safeNama}"
                                        data-merk="${safeMerk}"
                                        data-spesifikasi="${safeSpesifikasi}">Pilih</button>
                            </td>
                        </tr>`;
                }).join('');
            }

            function renderKomponenStock(data) {
                 komponenTbody.innerHTML = data.length === 0 
                ? '<tr><td colspan="5" class="text-center">Tidak ada data.</td></tr>'
                : data.map(item => {
                    const safeNama = sanitizeAttribute(item.nama_barang || '');
                    const safeMerk = sanitizeAttribute(item.merk || '');
                    const safeSpesifikasi = sanitizeAttribute(item.spesifikasi || '');
                    return `
                        <tr>
                            <td>${sanitizeText(item.nama_barang || '-')}</td>
                            <td>${sanitizeText(item.merk || '-')}</td>
                            <td>${sanitizeText(item.spesifikasi || '-')}</td>
                            <td>${item.jumlah || 0}</td>
                            <td>
                                <button class="btn btn-primary btn-sm btn-pilih"
                                        data-collection="komponen"
                                        data-nama="${safeNama}"
                                        data-merk="${safeMerk}"
                                        data-spesifikasi="${safeSpesifikasi}">Pilih</button>
                            </td>
                        </tr>`;
                }).join('');
            }

            renderMaterialStock(materialStock);
            renderKomponenStock(komponenStock);
            
            document.getElementById('search-material-stock').addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filtered = materialStock.filter(item => 
                    (item.nama || '').toLowerCase().includes(searchTerm) ||
                    (item.merk || '').toLowerCase().includes(searchTerm) ||
                    (item.spesifikasi || '').toLowerCase().includes(searchTerm)
                );
                renderMaterialStock(filtered);
            });
            
            document.getElementById('search-komponen-stock').addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filtered = komponenStock.filter(item => 
                    (item.nama_barang || '').toLowerCase().includes(searchTerm) ||
                    (item.merk || '').toLowerCase().includes(searchTerm) ||
                    (item.spesifikasi || '').toLowerCase().includes(searchTerm)
                );
                renderKomponenStock(filtered);
            });


            const modalDialog = document.querySelector('#itemModal .modal-dialog');
            const modalFooter = document.querySelector('#itemModal .modal-footer');
            modalDialog.classList.add('modal-lg');
            modalFooter.style.display = 'none';

            itemModal._element.addEventListener('hidden.bs.modal', () => {
                 modalDialog.classList.remove('modal-lg');
                 modalFooter.style.display = '';
            }, { once: true });


            document.querySelector('#itemModal .modal-body').addEventListener('click', function handlePilihClick(e) {
                const button = e.target.closest('.btn-pilih');
                if (button) {
                    const selectedData = {
                        jenis: button.dataset.collection,
                        nama_barang: button.dataset.nama,
                        merk: button.dataset.merk,
                        spesifikasi: button.dataset.spesifikasi
                    };
                    buildForm(selectedData, 'transaksi', 'details');
                    modalDialog.classList.remove('modal-lg');
                    modalFooter.style.display = '';
                }
            });
        } else if (stage === 'details') {
            formHtml += `
                <div class="mb-3">
                    <label class="form-label">Jenis</label>
                    <input type="text" class="form-control" id="jenis" value="${sanitizeText(data.jenis || '')}" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label">Nama Barang</label>
                    <input type="text" class="form-control" id="nama_barang" value="${sanitizeText(data.nama_barang || '')}" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label">Merk</label>
                    <input type="text" class="form-control" id="merk" value="${sanitizeText(data.merk || '')}" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label">Spesifikasi</label>
                    <textarea class="form-control" id="spesifikasi" readonly>${sanitizeText(data.spesifikasi || '')}</textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label">Jumlah</label>
                    <input type="number" class="form-control" id="jumlah" value="${data.jumlah || ''}" required min="1">
                </div>
                <div class="mb-3">
                    <label class="form-label">Keluar/Masuk</label>
                    <select class="form-select" id="transaksi" required>
                        <option disabled ${!isEdit && 'selected'} value="">Pilih...</option>
                        <option value="masuk">Masuk</option>
                        <option value="keluar">Keluar</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Keterangan</label>
                    <select class="form-select" id="keterangan" required>
                        <option disabled ${!isEdit && 'selected'} value="">Pilih...</option>
                        <option value="permanen">Permanen</option>
                        <option value="temporary" class="keterangan-temporary d-none">Temporary</option>
                    </select>
                </div>
                <div class="mb-3 d-none" id="tanggal-kembali-group">
                    <label class="form-label">Tanggal Kembali</label>
                    <input type="date" class="form-control" id="tanggal_kembali" value="${sanitizeText(data.tanggal_kembali || '')}">
                </div>`;
            document.getElementById('itemModalLabel').textContent = 'Tambah Transaksi Keluar Masuk';
            itemForm.innerHTML = formHtml;

            const transaksiSelect = document.getElementById('transaksi');
            const keteranganSelect = document.getElementById('keterangan');
            const temporaryOption = keteranganSelect.querySelector('.keterangan-temporary');
            const tanggalKembaliGroup = document.getElementById('tanggal-kembali-group');

            transaksiSelect.addEventListener('change', () => {
                if (transaksiSelect.value === 'keluar') {
                    temporaryOption.classList.remove('d-none');
                } else {
                    temporaryOption.classList.add('d-none');
                    if (keteranganSelect.value === 'temporary') {
                        keteranganSelect.value = '';
                    }
                    tanggalKembaliGroup.classList.add('d-none');
                    document.getElementById('tanggal_kembali').required = false;
                }
            });

            keteranganSelect.addEventListener('change', () => {
                if (keteranganSelect.value === 'temporary') {
                    tanggalKembaliGroup.classList.remove('d-none');
                    document.getElementById('tanggal_kembali').required = true;
                } else {
                    tanggalKembaliGroup.classList.add('d-none');
                    document.getElementById('tanggal_kembali').required = false;
                }
            });
        }
    }
}

async function writeLog(action, collectionName, data) {
    try {
        await addDoc(collection(db, 'users', user.uid, 'logs'), {
            action,
            collection: collectionName,
            details: data,
            user: user.email,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error('Gagal menulis log:', error.message);
    }
}

function sanitizeAttribute(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function sanitizeText(value) {
    if (value == null) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
}
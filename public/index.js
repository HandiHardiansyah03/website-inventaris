import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

onAuthStateChanged(auth, user => {
    if (user) {
        document.getElementById('app-loader').classList.add('d-none');
        document.getElementById('main-app').classList.remove('d-none');
        initializeAppLogic(user);
    } else {
        window.location.href = new URL('login.html', window.location.href).href;
    }
});

function initializeAppLogic(user) {
    const contentArea = document.getElementById('content-area');
    const itemModal = new bootstrap.Modal(document.getElementById('itemModal'));
    const itemForm = document.getElementById('itemForm');
    const confirmActionModal = new bootstrap.Modal(document.getElementById('confirmActionModal'));
    let currentActionInfo = { action: null, docId: null, collection: null };
    let currentCollectionName = 'dashboard';

    // --- Perbarui Info User di UI ---
    const userDisplayName = user.displayName || user.email.split('@')[0];
    const userInitial = userDisplayName.charAt(0).toUpperCase();
    document.getElementById('sidebar-user-name').textContent = userDisplayName;
    document.getElementById('sidebar-user-email').textContent = user.email;
    document.getElementById('header-user-name').textContent = `${userDisplayName}`;
    const avatarUrl = `https://placehold.co/40x40/0d6efd/white?text=${userInitial}`;
    document.getElementById('sidebar-user-avatar').src = avatarUrl;
    document.getElementById('header-user-avatar').src = avatarUrl.replace('40x40', '32x32');

    // --- Fungsi Helper untuk Datalog ---
    async function writeLog(action, collectionName, itemData) {
        const logData = { action, collection: collectionName, details: itemData, user: user.email, timestamp: serverTimestamp() };
        try {
            await addDoc(collection(db, 'users', user.uid, 'logs'), logData);
        } catch (error) { console.error("Gagal menulis log:", error); }
    }

    // --- Event Listener Global ---
    document.body.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-logout, .btn-tambah, .btn-edit, .btn-delete, #clear-log-btn, #download-report-btn, .btn-return');
        if (!target) return;

        if (target.matches('.btn-logout')) {
            currentActionInfo = { action: 'logout' };
            document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Logout';
            document.getElementById('confirmActionBody').textContent = 'Apakah Anda yakin ingin keluar?';
            confirmActionModal.show();
        } else if (target.matches('.btn-tambah')) {
            const title = currentCollectionName === 'material' ? 'Stock Material' : 
            currentCollectionName === 'komponen' ? 'Stock Komponen' : 'Pilih Stock Barang';
            document.getElementById('itemModalLabel').textContent = title;
            buildForm({}, currentCollectionName, currentCollectionName === 'transaksi' ? 'select' : undefined);
            itemModal.show();
        } else if (target.matches('.btn-edit')) {
            const docId = target.dataset.id;
            const coll = target.dataset.collection || currentCollectionName;
            const docSnap = await getDoc(doc(db, 'users', user.uid, coll, docId));
            if (docSnap.exists()) {
                const title = coll === 'material' ? 'Stock Material' : coll === 'komponen' ? 'Stock Komponen' : 'Transaksi Keluar Masuk';
                document.getElementById('itemModalLabel').textContent = `Edit ${title}`;
                buildForm({ id: docId, ...docSnap.data() }, coll);
                itemModal.show();
            }
        } else if (target.matches('.btn-delete')) {
            currentActionInfo = { action: 'delete', docId: target.dataset.id, collection: target.dataset.collection || currentCollectionName };
            document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Hapus';
            document.getElementById('confirmActionBody').textContent = 'Apakah Anda yakin ingin menghapus data ini secara permanen?';
            confirmActionModal.show();
        } else if (target.matches('#clear-log-btn')) {
            currentActionInfo = { action: 'clear_logs' };
            document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Hapus Riwayat';
            document.getElementById('confirmActionBody').textContent = 'Apakah Anda yakin ingin menghapus semua riwayat aktivitas?';
            confirmActionModal.show();
        } else if (target.matches('#download-report-btn')) {
            generateReport();
        } else if (target.matches('.btn-return')) {
            const docId = target.dataset.id;
            const docSnap = await getDoc(doc(db, 'users', user.uid, 'keluar', docId));
            if (docSnap.exists()) {
                const data = docSnap.data();
                const returnDate = new Date().toISOString().split('T')[0];
                await updateDoc(doc(db, 'users', user.uid, 'keluar', docId), { returned: true, tanggal_kembali_actual: returnDate });
                const stockRef = doc(db, 'users', user.uid, data.jenis.toLowerCase(), data.nama_barang);
                const stockSnap = await getDoc(stockRef);
                let newStock = stockSnap.exists() ? stockSnap.data().jumlah || 0 : 0;
                newStock += data.jumlah;
                await updateDoc(stockRef, { jumlah: newStock });
                writeLog('Dikembalikan', 'keluar', { ...data, tanggal_kembali_actual: returnDate });
                renderTemporaryKeluarTable();
            }
        }
    });

    document.getElementById('sidebar-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-minimized'));
    document.getElementById('main-nav').addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link && link.dataset.page) { e.preventDefault(); navigate(link.dataset.page); }
    });

    // --- Logika Tombol Konfirmasi Modal ---
    document.getElementById('confirmActionBtn').addEventListener('click', async () => {
        const { action, docId, collection } = currentActionInfo;
        if (action === 'logout') {
            signOut(auth);
        } else if (action === 'delete' && docId) {
            const docRef = doc(db, 'users', user.uid, collection, docId);
            const docSnap = await getDoc(docRef);
            await deleteDoc(docRef);
            writeLog('Dihapus', collection, docSnap.data());
        } else if (action === 'clear_logs') {
            const logsCollectionRef = collection(db, 'users', user.uid, 'logs');
            const logsSnapshot = await getDocs(logsCollectionRef);
            const batch = writeBatch(db);
            logsSnapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        confirmActionModal.hide();
        currentActionInfo = { action: null, docId: null, collection: null };
    });

    // --- Router Halaman ---
    function navigate(page) {
        currentCollectionName = page.split('-').pop();
        document.querySelectorAll('#main-nav .nav-link').forEach(link => link.classList.remove('active'));
        document.querySelector(`#main-nav .nav-link[data-page="${page}"]`).classList.add('active');
        if (page === 'dashboard') loadDashboardPage();
        else if (page === 'keluar-masuk') loadKeluarMasukPage();
        else if (page === 'buat-report') loadReportPage();
        else loadDataTablePage();
    }

    // --- Template & Form Builders ---
    async function loadDashboardPage() {
        contentArea.innerHTML = `
            <div class="row g-4">
                <div class="col-md-6 col-lg-3"><div class="card text-white bg-primary"><div class="card-body d-flex justify-content-between align-items-center"><div><h5 class="card-title fs-2" id="total-material">...</h5><span>Total Material</span></div><i class="bi bi-box-seam" style="font-size: 3rem; opacity: 0.5;"></i></div></div></div>
                <div class="col-md-6 col-lg-3"><div class="card text-white bg-success"><div class="card-body d-flex justify-content-between align-items-center"><div><h5 class="card-title fs-2" id="total-komponen">...</h5><span>Total Komponen</span></div><i class="bi bi-tools" style="font-size: 3rem; opacity: 0.5;"></i></div></div></div>
                <div class="col-md-6 col-lg-3"><div class="card text-white bg-warning"><div class="card-body d-flex justify-content-between align-items-center"><div><h5 class="card-title fs-2" id="total-keluar">...</h5><span>Barang Keluar</span></div><i class="bi bi-box-arrow-up-right" style="font-size: 3rem; opacity: 0.5;"></i></div></div></div>
                <div class="col-md-6 col-lg-3"><div class="card text-white bg-info"><div class="card-body d-flex justify-content-between align-items-center"><div><h5 class="card-title fs-2" id="total-masuk">...</h5><span>Barang Masuk</span></div><i class="bi bi-box-arrow-in-right" style="font-size: 3rem; opacity: 0.5;"></i></div></div></div>
            </div>`;
        
        // Update stats
        ['material', 'komponen', 'keluar', 'transaksi'].forEach(async (coll) => {
            const snapshot = await getDocs(collection(db, 'users', user.uid, coll));
            const elementId = coll === 'keluar' ? 'total-keluar' : coll === 'transaksi' ? 'total-masuk' : `total-${coll}`;
            if(document.getElementById(elementId)) document.getElementById(elementId).textContent = snapshot.size;
        });
    }
    
    function loadDataTablePage() {
        const config = {
            'material': { title: 'Stock Material', headers: ['NAMA MATERIAL', 'MERK', 'SPESIFIKASI', 'JUMLAH', 'KETERANGAN']},
            'komponen': { title: 'Stock Komponen', headers: ['NAMA KOMPONEN', 'MERK', 'SPESIFIKASI', 'JUMLAH', 'KETERANGAN']},
            'keluar': { title: 'Barang Keluar (Temporary)', headers: ['JENIS', 'NAMA BARANG', 'MERK', 'SPESIFIKASI', 'JUMLAH', 'TANGGAL KELUAR', 'KETERANGAN']}
        };
        const pageConfig = config[currentCollectionName];
        contentArea.innerHTML = `
            <nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="#">Home</a></li><li class="breadcrumb-item active">${pageConfig.title}</li></ol></nav>
            <div class="card mb-4"><div class="card-header bg-white d-flex justify-content-between align-items-center"><h5>Daftar ${pageConfig.title}</h5>${
                currentCollectionName !== 'keluar' ? '<button class="btn btn-primary btn-tambah"><i class="bi bi-plus-circle me-2"></i>Tambah ' + pageConfig.title + '</button>' : ''
            }</div><div class="card-body"><div class="table-responsive scrollable-container"><table class="table table-striped table-hover table-bordered"><thead class="table-dark"><tr><th>NO</th>${pageConfig.headers.map(h => `<th>${h}</th>`).join('')}${currentCollectionName !== 'keluar' ? '<th>OPSI</th>' : ''}</tr></thead><tbody id="table-body"></tbody></table></div></div></div>${
                currentCollectionName !== 'keluar' ? '<div class="card"><div class="card-header d-flex justify-content-between align-items-center">Riwayat Aktivitas ' + pageConfig.title + '<button class="btn btn-outline-secondary btn-sm" id="clear-log-btn"><i class="bi bi-trash me-1"></i>Bersihkan</button></div><div class="card-body p-0 scrollable-container" id="log-container"><ul class="list-group list-group-flush"></ul></div></div>' : ''
            }`;
        if (currentCollectionName === 'keluar') renderTemporaryKeluarTable();
        else renderTableData(pageConfig.headers);
        if (currentCollectionName !== 'keluar') renderLogs();
    }

    function loadKeluarMasukPage() {
        contentArea.innerHTML = `
        <nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="#">Home</a></li><li class="breadcrumb-item active">Keluar Masuk</li></ol></nav>
        <div class="card mb-4"><div class="card-header bg-white d-flex justify-content-between align-items-center"><h5>Keluar Masuk</h5><button class="btn btn-primary btn-tambah"><i class="bi bi-plus-circle me-2"></i>Tambah Keluar Masuk</button></div><div class="card-body"></div></div>
        <div class="card"><div class="card-header d-flex justify-content-between align-items-center">Riwayat Aktivitas Keluar Masuk<button class="btn btn-outline-secondary btn-sm" id="clear-log-btn"><i class="bi bi-trash me-1"></i>Bersihkan</button></div><div class="card-body p-0 scrollable-container" id="log-container"><ul class="list-group list-group-flush"></ul></div></div>`;
        renderLogs();
    }

    function loadReportPage() {
        contentArea.innerHTML = `
            <nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="#">Home</a></li><li class="breadcrumb-item active">Buat Report</li></ol></nav>
            <div class="card mb-4">
                <div class="card-header bg-white"><h5>Konfigurasi Report</h5></div>
                <div class="card-body">
                    <div class="mb-3">
                        <label class="form-label">Pilih Data untuk Report</label>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="report-stock" value="stock">
                            <label class="form-check-label" for="report-stock">Tampilkan Stock Terbaru</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="report-keluar" value="keluar">
                            <label class="form-check-label" for="report-keluar">Barang Keluar</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="report-masuk" value="transaksi">
                            <label class="form-check-label" for="report-masuk">Barang Masuk</label>
                        </div>
                    </div>
                    <div class="mb-3 date-picker-container">
                        <label class="form-label">Rentang Tanggal</label>
                        <div class="input-group">
                            <input type="date" class="form-control" id="start-date">
                            <span class="input-group-text">s/d</span>
                            <input type="date" class="form-control" id="end-date">
                        </div>
                    </div>
                    <button class="btn btn-primary" id="download-report-btn" disabled><i class="bi bi-download me-2"></i>Download Report</button>
                </div>
            </div>`;
        
        // Enable/disable download button based on date inputs
        const startDateInput = document.getElementById('start-date');
        const endDateInput = document.getElementById('end-date');
        const downloadBtn = document.getElementById('download-report-btn');
        function checkDateInputs() {
            downloadBtn.disabled = !(startDateInput.value && endDateInput.value);
        }
        startDateInput.addEventListener('change', checkDateInputs);
        endDateInput.addEventListener('change', checkDateInputs);
    }

    async function buildForm(data = {}, coll = currentCollectionName, stage = 'select') {
    const isEdit = !!data.id;
    let formHtml = `<input type="hidden" id="itemId" value="${data.id || ''}">`;

    if (coll === 'komponen') {
        // Keep existing komponen form logic (unchanged)
        formHtml += `
            <div class="mb-3"><label class="form-label">Nama Komponen</label><select class="form-select" id="nama_barang" required><option disabled ${!isEdit && 'selected'} value="">Pilih...</option>
                <option>MCB</option>
                <option>MCCB</option>
                <option>Relay</option>
                <option>Kontaktor</option>
                <option>Thermal</option>
                <option>Timer</option>
                <option>Push Button</option>
                <option>Pilot Lamp</option>
                </select>
            </div>
            <div class="mb-3"><label class="form-label">Merk</label><select class="form-select" id="merk" required><option disabled ${!isEdit && 'selected'} value="">Pilih...</option>
                <option>Autonics</option>
                <option>Omron</option>
                <option>Fuji Elektrik</option>
                <option>GAE</option>
                <option>ABB</option>
                <option>LS</option>
                <option>Schneider</option>
                <option>Terasaki</option>
                <option>Mitsubishi</option>
                <option>IDEC</option>
                </select>
            </div>
            <div class="mb-3"><label class="form-label">Spesifikasi</label><textarea class="form-control" id="spesifikasi">${data.spesifikasi || ''}</textarea></div>
            <div class="mb-3"><label class="form-label">Jumlah</label><input type="number" class="form-control" id="jumlah" value="${data.jumlah || ''}" required></div>
            <div class="mb-3"><label class="form-label">Keterangan</label><select class="form-select" id="keterangan" required><option disabled ${!isEdit && 'selected'} value="">Pilih...</option>
                <option>Stock MME JKT</option>
                <option>Stock MME SBY</option>
                <option>MME JKT</option>
                <option>MME SBY</option>
                </select>
            </div>`;
    } else if (coll === 'material') {
        // Keep existing material form logic (unchanged)
        formHtml += `
            <div class="mb-3"><label class="form-label">Nama Material</label><input type="text" class="form-control" id="nama" value="${data.nama || ''}" required></div>
            <div class="mb-3"><label class="form-label">Merk</label><input type="text" class="form-control" id="merk" value="${data.merk || ''}" required></div>
            <div class="mb-3"><label class="form-label">Spesifikasi</label><textarea class="form-control" id="spesifikasi">${data.spesifikasi || ''}</textarea></div>
            <div class="mb-3"><label class="form-label">Jumlah</label><input type="number" class="form-control" id="jumlah" value="${data.jumlah || ''}" required></div>
            <div class="mb-3"><label class="form-label">Keterangan</label><input type="text" class="form-control" id="keterangan" value="${data.keterangan || ''}" required></div>`;
    // --- GANTI bagian transaksi di dalam fungsi buildForm ---
} else if (coll === 'transaksi') {
    if (stage === 'select') {
        // First Pop-Up: Stock Selection
        let materialOptions = '';
        let komponenOptions = '';
        try {
            const materialNames = await getDocs(collection(db, 'users', user.uid, 'material'));
            materialOptions = materialNames.docs.map(doc => {
                const data = doc.data();
                return `<tr class="stock-item" data-collection="material" data-nama="${data.nama || ''}" data-merk="${data.merk || ''}" data-spesifikasi="${data.spesifikasi || ''}">
                    <td>${data.nama || '-'}</td><td>${data.merk || '-'}</td><td>${data.spesifikasi || '-'}</td><td>${data.jumlah || 0}</td>
                </tr>`;
            }).join('');

            const komponenNames = await getDocs(collection(db, 'users', user.uid, 'komponen'));
            komponenOptions = komponenNames.docs.map(doc => {
                const data = doc.data();
                return `<tr class="stock-item" data-collection="komponen" data-nama="${data.nama_barang || ''}" data-merk="${data.merk || ''}" data-spesifikasi="${data.spesifikasi || ''}">
                    <td>${data.nama_barang || '-'}</td><td>${data.merk || '-'}</td><td>${data.spesifikasi || '-'}</td><td>${data.jumlah || 0}</td>
                </tr>`;
            }).join('');
        } catch (error) {
            console.error('Gagal mengambil data stok:', error);
            formHtml = `<p class="text-danger">Gagal memuat daftar stok. Silakan coba lagi.</p>`;
            itemForm.innerHTML = formHtml;
            return;
        }

        if (!materialOptions && !komponenOptions) {
            formHtml = `<p class="text-muted">Tidak ada stok material atau komponen tersedia.</p>`;
        } else {
            formHtml = `
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead class="table-dark"><tr><th>Nama Barang</th><th>Merk</th><th>Spesifikasi</th><th>Jumlah</th></tr></thead>
                        <tbody id="stock-list">${materialOptions}${komponenOptions}</tbody>
                    </table>
                </div>`;
        }
        document.getElementById('itemModalLabel').textContent = 'Pilih Stock Barang';
        itemForm.innerHTML = formHtml;

        // Add click handler for stock selection
        document.querySelectorAll('.stock-item').forEach(item => {
            item.addEventListener('click', () => {
                const selectedData = {
                    jenis: item.dataset.collection,
                    nama_barang: item.dataset.nama,
                    merk: item.dataset.merk,
                    spesifikasi: item.dataset.spesifikasi
                };
                buildForm(selectedData, 'transaksi', 'details');
            });
        });
    } else if (stage === 'details') {
        // Second Pop-Up: Transaction Details
        formHtml += `
            <div class="mb-3"><label class="form-label">Jenis</label><input type="text" class="form-control" id="jenis" value="${data.jenis || ''}" readonly></div>
            <div class="mb-3"><label class="form-label">Nama Barang</label><input type="text" class="form-control" id="nama_barang" value="${data.nama_barang || ''}" readonly></div>
            <div class="mb-3"><label class="form-label">Merk</label><input type="text" class="form-control" id="merk" value="${data.merk || ''}" readonly></div>
            <div class="mb-3"><label class="form-label">Spesifikasi</label><textarea class="form-control" id="spesifikasi" readonly>${data.spesifikasi || ''}</textarea></div>
            <div class="mb-3"><label class="form-label">Jumlah</label><input type="number" class="form-control" id="jumlah" value="${data.jumlah || ''}" required min="1"></div>
            <div class="mb-3"><label class="form-label">Keluar/Masuk</label><select class="form-select" id="transaksi" required>
                <option disabled ${!isEdit && 'selected'} value="">Pilih...</option>
                <option value="masuk">Masuk</option>
                <option value="keluar">Keluar</option>
            </select></div>
            <div class="mb-3"><label class="form-label">Keterangan</label><select class="form-select" id="keterangan" required>
                <option disabled ${!isEdit && 'selected'} value="">Pilih...</option>
                <option value="permanen">Permanen</option>
                <option value="temporary">Temporary</option>
            </select></div>
            <div class="mb-3 d-none" id="tanggal-kembali-group"><label class="form-label">Tanggal Kembali</label><input type="date" class="form-control" id="tanggal_kembali" value="${data.tanggal_kembali || ''}"></div>`;
        document.getElementById('itemModalLabel').textContent = 'Tambah Transaksi Keluar Masuk';
        itemForm.innerHTML = formHtml;

        // Show/hide Tanggal Kembali based on Keterangan
        const keteranganSelect = document.getElementById('keterangan');
        const tanggalKembaliGroup = document.getElementById('tanggal-kembali-group');
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
    itemForm.innerHTML = formHtml;
}

    function renderTableData(headers) {
        const tableBody = document.getElementById('table-body');
        const dataKeys = {
            'material': ['nama', 'merk', 'spesifikasi', 'jumlah', 'keterangan'],
            'komponen': ['nama_barang', 'merk', 'spesifikasi', 'jumlah', 'keterangan']
        }[currentCollectionName];

        const q = query(collection(db, 'users', user.uid, currentCollectionName));
        onSnapshot(q, (snapshot) => {
            tableBody.innerHTML = '';
            if (snapshot.empty) { tableBody.innerHTML = `<tr><td colspan="${headers.length + 2}" class="text-center">Tidak ada data.</td></tr>`; return; }
            let index = 1;
            snapshot.forEach(doc => {
                const data = doc.data();
                let rowHtml = `<td>${index++}</td>`;
                dataKeys.forEach(key => rowHtml += `<td>${data[key] || ''}</td>`);
                rowHtml += `<td><button class="btn btn-warning btn-sm btn-edit" data-id="${doc.id}"><i class="bi bi-pencil-square"></i></button> <button class="btn btn-danger btn-sm btn-delete" data-id="${doc.id}"><i class="bi bi-trash"></i></button></td>`;
                tableBody.innerHTML += `<tr>${rowHtml}</tr>`;
            });
        });
    }

    function renderTemporaryKeluarTable() {
        const tableBody = document.getElementById('table-body');
        const q = query(collection(db, 'users', user.uid, 'keluar'), orderBy('tanggal_keluar', 'desc'));
        onSnapshot(q, (snapshot) => {
            tableBody.innerHTML = '';
            if (snapshot.empty) { tableBody.innerHTML = `<tr><td colspan="7" class="text-center">Tidak ada data.</td></tr>`; return; }
            let index = 1;
            snapshot.forEach(doc => {
                const data = doc.data();
                const returnStatus = data.returned ? `Sudah Dikembalikan: ${data.tanggal_kembali_actual || '-'}` : `<button class="btn btn-success btn-sm btn-return" data-id="${doc.id}"><i class="bi bi-check-circle"></i> Kembalikan</button>`;
                const rowHtml = `
                    <td>${index++}</td>
                    <td>${data.jenis || ''}</td>
                    <td>${data.nama_barang || ''}</td>
                    <td>${data.merk || ''}</td>
                    <td>${data.spesifikasi || ''}</td>
                    <td>${data.jumlah || 0}</td>
                    <td>${data.tanggal_keluar || ''}</td>
                    <td>${returnStatus}</td>`;
                tableBody.innerHTML += `<tr>${rowHtml}</tr>`;
            });
        });
    }

    function renderKeluarMasukTable() {
        const tableBody = document.getElementById('table-body');
        const q = query(collection(db, 'users', user.uid, 'transaksi'), orderBy('tanggal_keluar', 'desc'));
        onSnapshot(q, (snapshot) => {
            tableBody.innerHTML = '';
            if (snapshot.empty) { tableBody.innerHTML = `<tr><td colspan="9" class="text-center">Tidak ada data.</td></tr>`; return; }
            let index = 1;
            snapshot.forEach(doc => {
                const data = doc.data();
                const rowHtml = `
                    <td>${index++}</td>
                    <td>${data.jenis || ''}</td>
                    <td>${data.nama_barang || ''}</td>
                    <td>${data.merk || ''}</td>
                    <td>${data.spesifikasi || ''}</td>
                    <td>${data.jumlah || 0}</td>
                    <td>${data.tanggal_keluar || ''}</td>
                    <td>${data.transaksi || ''}</td>
                    <td>${data.keterangan || ''}</td>
                    <td><button class="btn btn-warning btn-sm btn-edit" data-id="${doc.id}" data-collection="transaksi"><i class="bi bi-pencil-square"></i></button> <button class="btn btn-danger btn-sm btn-delete" data-id="${doc.id}" data-collection="transaksi"><i class="bi bi-trash"></i></button></td>`;
                tableBody.innerHTML += `<tr>${rowHtml}</tr>`;
            });
        });
    }

    function renderLogs() {
        const logContainer = document.querySelector('#log-container ul');
        if (!logContainer) return;
        const q = query(collection(db, 'users', user.uid, 'logs'), orderBy('timestamp', 'desc'));
        onSnapshot(q, (snapshot) => {
            const filteredLogs = snapshot.docs.filter(doc => doc.data().collection === currentCollectionName);
            if (filteredLogs.length === 0) { logContainer.innerHTML = '<li class="list-group-item text-muted text-center">Belum ada aktivitas untuk kategori ini.</li>'; return; }
            let logHtml = '';
            filteredLogs.forEach(doc => {
                const log = doc.data();
                const details = log.details || {};
                const docName = details.nama || details.nama_barang || "Item";
                const itemDetails = ` (Merk: ${details.merk || '-'}, Spek: ${details.spesifikasi || '-'}, Jml: ${details.jumlah || 0}, Ket: ${details.keterangan || '-'})`;
                const date = log.timestamp?.toDate().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) || 'Baru saja';
                logHtml += `<li class="list-group-item">[${date}] Item <strong>${docName}</strong> telah <strong>${log.action}</strong>.${itemDetails}</li>`;
            });
            logContainer.innerHTML = logHtml;
        });
    }

    async function generateReport() {
        const collections = [];
        if (document.getElementById('report-stock').checked) collections.push('material', 'komponen');
        if (document.getElementById('report-keluar').checked) collections.push('keluar');
        if (document.getElementById('report-masuk').checked) collections.push('transaksi');

        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;

        const docDefinition = {
            pageSize: 'A4',
            content: [
                { text: 'Laporan Inventaris', style: 'header' },
                { text: `Tanggal: ${startDate ? new Date(startDate).toLocaleDateString('id-ID') : 'Semua'} - ${endDate ? new Date(endDate).toLocaleDateString('id-ID') : 'Semua'}`, style: 'subheader' }
            ],
            styles: {
                header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10], font: 'Times' },
                subheader: { fontSize: 12, margin: [0, 0, 0, 20], font: 'Times' },
                tableHeader: { bold: true, fontSize: 12, color: 'black', font: 'Times' },
                tableBody: { fontSize: 12, font: 'Times' }
            },
            defaultStyle: { font: 'Times', fontSize: 12 }
        };

        for (const coll of collections) {
            let q = query(collection(db, 'users', user.uid, coll));
            if (startDate && (coll === 'keluar' || coll === 'transaksi')) q = query(q, where('tanggal_keluar', '>=', startDate));
            if (endDate && (coll === 'keluar' || coll === 'transaksi')) q = query(q, where('tanggal_keluar', '<=', endDate));
            
            const snapshot = await getDocs(q);
            const tableBody = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (coll === 'material') {
                    tableBody.push([data.nama || '-', data.merk || '-', data.spesifikasi || '-', data.jumlah || 0, data.keterangan || '-']);
                } else if (coll === 'komponen') {
                    tableBody.push([data.nama_barang || '-', data.merk || '-', data.spesifikasi || '-', data.jumlah || 0, data.keterangan || '-']);
                } else if (coll === 'keluar') {
                    tableBody.push([data.jenis || '-', data.nama_barang || '-', data.merk || '-', data.spesifikasi || '-', data.jumlah || 0, data.tanggal_keluar || '-', data.returned ? `Sudah Dikembalikan: ${data.tanggal_kembali_actual || '-'}` : 'Belum Dikembalikan']);
                } else if (coll === 'transaksi') {
                    tableBody.push([data.jenis || '-', data.nama_barang || '-', data.merk || '-', data.spesifikasi || '-', data.jumlah || 0, data.tanggal_keluar || '-', data.transaksi || '-', data.keterangan || '-']);
                }
            });

            if (coll === 'material' || coll === 'komponen') {
                if (collections.includes('material') && collections.includes('komponen') && coll === 'material') {
                    docDefinition.content.push(
                        { text: 'Stock Terbaru', style: 'subheader' },
                        {
                            table: {
                                headerRows: 1,
                                widths: ['*', '*', '*', 'auto', '*'],
                                body: [
                                    ['Nama Barang', 'Merk', 'Spesifikasi', 'Jumlah', 'Keterangan'],
                                    ...tableBody
                                ]
                            },
                            layout: 'lightHorizontalLines',
                            style: 'tableBody'
                        }
                    );
                } else if (!collections.includes('material') && coll === 'komponen') {
                    docDefinition.content.push(
                        { text: 'Stock Terbaru', style: 'subheader' },
                        {
                            table: {
                                headerRows: 1,
                                widths: ['*', '*', '*', 'auto', '*'],
                                body: [
                                    ['Nama Barang', 'Merk', 'Spesifikasi', 'Jumlah', 'Keterangan'],
                                    ...tableBody
                                ]
                            },
                            layout: 'lightHorizontalLines',
                            style: 'tableBody'
                        }
                    );
                }
            } else {
                docDefinition.content.push(
                    { text: coll === 'keluar' ? 'Barang Keluar' : 'Barang Masuk', style: 'subheader' },
                    {
                        table: {
                            headerRows: 1,
                            widths: coll === 'keluar' ? ['auto', '*', '*', '*', 'auto', 'auto', '*'] : ['auto', '*', '*', '*', 'auto', 'auto', 'auto', '*'],
                            body: [
                                coll === 'keluar'
                                    ? ['Jenis', 'Nama Barang', 'Merk', 'Spesifikasi', 'Jumlah', 'Tanggal Keluar', 'Keterangan']
                                    : ['Jenis', 'Nama Barang', 'Merk', 'Spesifikasi', 'Jumlah', 'Tanggal Keluar', 'Transaksi', 'Keterangan'],
                                ...tableBody
                            ]
                        },
                        layout: 'lightHorizontalLines',
                        style: 'tableBody'
                    },
                    { text: '', margin: [0, 20, 0, 0] }
                );
            }
        }

        if (collections.includes('komponen') && collections.includes('material')) {
            const komponenSnapshot = await getDocs(collection(db, 'users', user.uid, 'komponen'));
            const additionalBody = [];
            komponenSnapshot.forEach(doc => {
                const data = doc.data();
                additionalBody.push([data.nama_barang || '-', data.merk || '-', data.spesifikasi || '-', data.jumlah || 0, data.keterangan || '-']);
            });
            if (docDefinition.content.some(item => item.text === 'Stock Terbaru')) {
                docDefinition.content.find(item => typeof item === 'object' && item.table && item.table.body[0][0] === 'Nama Barang').table.body.push(...additionalBody);
            }
        }

        pdfMake.createPdf(docDefinition).download('Laporan_Inventaris.pdf');
    }

    itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const docId = document.getElementById('itemId').value;
    let data = {};
    itemForm.querySelectorAll('input, select, textarea').forEach(el => { if(el.id) data[el.id] = (el.type === 'number') ? Number(el.value) : el.value; });
    delete data.itemId;

    if (currentCollectionName === 'transaksi') {
        const coll = data.jenis.toLowerCase();
        const stockRef = doc(db, 'users', user.uid, coll, data.nama_barang);
        const stockSnap = await getDoc(stockRef);
        let newStock = stockSnap.exists() ? stockSnap.data().jumlah || 0 : 0;

        // Update stock immediately
        if (data.transaksi === 'masuk') {
            newStock += data.jumlah;
        } else if (data.transaksi === 'keluar') {
            newStock = Math.max(0, newStock - data.jumlah);
        }

        // Update or create stock document
        if (stockSnap.exists()) {
            await updateDoc(stockRef, { jumlah: newStock });
        } else {
            await addDoc(collection(db, 'users', user.uid, coll), {
                nama: coll === 'material' ? data.nama_barang : undefined,
                nama_barang: coll === 'komponen' ? data.nama_barang : undefined,
                merk: data.merk,
                spesifikasi: data.spesifikasi,
                jumlah: newStock,
                keterangan: data.keterangan
            });
        }

        // Handle temporary transactions
        if (data.keterangan === 'temporary') {
            await addDoc(collection(db, 'users', user.uid, 'keluar'), {
                jenis: data.jenis,
                nama_barang: data.nama_barang,
                merk: data.merk,
                spesifikasi: data.spesifikasi,
                jumlah: data.jumlah,
                tanggal_keluar: new Date().toISOString().split('T')[0],
                tanggal_kembali: data.tanggal_kembali || null,
                returned: false
            });
        }

        // Save transaction
        data.tanggal_keluar = new Date().toISOString().split('T')[0];
        if (docId) {
            await updateDoc(doc(db, 'users', user.uid, 'transaksi', docId), data);
            writeLog('Diperbarui', 'transaksi', data);
        } else {
            await addDoc(collection(db, 'users', user.uid, 'transaksi'), data);
            writeLog('Ditambahkan', 'transaksi', data);
        }
    } else {
        // Keep existing logic for material and komponen
        if (docId) {
            await updateDoc(doc(db, 'users', user.uid, currentCollectionName, docId), data);
            writeLog('Diperbarui', currentCollectionName, data);
        } else {
            await addDoc(collection(db, 'users', user.uid, currentCollectionName), data);
            writeLog('Ditambahkan', currentCollectionName, data);
        }
    }
    itemModal.hide();
});

    // Halaman awal saat dimuat
    navigate('dashboard');
}
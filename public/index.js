import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
    import { getFirestore, collection, query, orderBy, limit, onSnapshot, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
        let currentActionInfo = { action: null, docId: null };
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
            const target = e.target.closest('.btn-logout, .btn-tambah, .btn-edit, .btn-delete, #clear-log-btn');
            if (!target) return;

            if (target.matches('.btn-logout')) {
                currentActionInfo = { action: 'logout' };
                document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Logout';
                document.getElementById('confirmActionBody').textContent = 'Apakah Anda yakin ingin keluar?';
                confirmActionModal.show();
            } else if (target.matches('.btn-tambah')) {
                const title = currentCollectionName.charAt(0).toUpperCase() + currentCollectionName.slice(1);
                document.getElementById('itemModalLabel').textContent = `Tambah ${title} Baru`;
                buildForm();
                itemModal.show();
            } else if (target.matches('.btn-edit')) {
                const docId = target.dataset.id;
                const docSnap = await getDoc(doc(db, 'users', user.uid, currentCollectionName, docId));
                if (docSnap.exists()) {
                    const title = currentCollectionName.charAt(0).toUpperCase() + currentCollectionName.slice(1);
                    document.getElementById('itemModalLabel').textContent = `Edit ${title}`;
                    buildForm({ id: docId, ...docSnap.data() });
                    itemModal.show();
                }
            } else if (target.matches('.btn-delete')) {
                currentActionInfo = { action: 'delete', docId: target.dataset.id };
                document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Hapus';
                document.getElementById('confirmActionBody').textContent = 'Apakah Anda yakin ingin menghapus data ini secara permanen?';
                confirmActionModal.show();
            } else if (target.matches('#clear-log-btn')) {
                currentActionInfo = { action: 'clear_logs' };
                document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Hapus Riwayat';
                document.getElementById('confirmActionBody').textContent = 'Apakah Anda yakin ingin menghapus semua riwayat aktivitas?';
                confirmActionModal.show();
            }
        });

        document.getElementById('sidebar-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-minimized'));
        document.getElementById('main-nav').addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (link && link.dataset.page) { e.preventDefault(); navigate(link.dataset.page); }
        });

        // --- Logika Tombol Konfirmasi Modal ---
        document.getElementById('confirmActionBtn').addEventListener('click', async () => {
            const { action, docId } = currentActionInfo;
            if (action === 'logout') {
                signOut(auth);
            } else if (action === 'delete' && docId) {
                const docRef = doc(db, 'users', user.uid, currentCollectionName, docId);
                const docSnap = await getDoc(docRef);
                await deleteDoc(docRef);
                writeLog('Dihapus', currentCollectionName, docSnap.data());
            } else if (action === 'clear_logs') {
                const logsCollectionRef = collection(db, 'users', user.uid, 'logs');
                const logsSnapshot = await getDocs(logsCollectionRef);
                const batch = writeBatch(db);
                logsSnapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
            confirmActionModal.hide();
            currentActionInfo = { action: null, docId: null };
        });

        // --- Router Halaman ---
        function navigate(page) {
            currentCollectionName = page.split('-').pop();
            document.querySelectorAll('#main-nav .nav-link').forEach(link => link.classList.remove('active'));
            document.querySelector(`#main-nav .nav-link[data-page="${page}"]`).classList.add('active');
            if (page === 'dashboard') loadDashboardPage();
            else loadDataTablePage();
        }

        // --- Template & Form Builders ---
        async function loadDashboardPage() {
            contentArea.innerHTML = `
                <div class="row g-4">
                    <div class="col-md-6 col-lg-3"><div class="card text-white bg-primary"><div class="card-body d-flex justify-content-between align-items-center"><div><h5 class="card-title fs-2" id="total-material">...</h5><span>Total Material</span></div><i class="bi bi-box-seam" style="font-size: 3rem; opacity: 0.5;"></i></div></div></div>
                    <div class="col-md-6 col-lg-3"><div class="card text-white bg-success"><div class="card-body d-flex justify-content-between align-items-center"><div><h5 class="card-title fs-2" id="total-komponen">...</h5><span>Total Komponen</span></div><i class="bi bi-tools" style="font-size: 3rem; opacity: 0.5;"></i></div></div></div>
                    <div class="col-md-6 col-lg-3"><div class="card text-white bg-warning"><div class="card-body d-flex justify-content-between align-items-center"><div><h5 class="card-title fs-2" id="total-keluar">...</h5><span>Barang Keluar</span></div><i class="bi bi-box-arrow-up-right" style="font-size: 3rem; opacity: 0.5;"></i></div></div></div>
                    <div class="col-md-6 col-lg-3"><div class="card text-white bg-danger"><div class="card-body d-flex justify-content-between align-items-center"><div><h5 class="card-title fs-2">0</h5><span>Peringatan Stok</span></div><i class="bi bi-exclamation-triangle" style="font-size: 3rem; opacity: 0.5;"></i></div></div></div>
                </div></div></div>`;
            
            // Update stats
            ['material', 'komponen', 'keluar'].forEach(async (coll) => {
                const snapshot = await getDocs(collection(db, 'users', user.uid, coll));
                const elementId = coll === 'keluar' ? 'total-keluar' : `total-${coll}`;
                if(document.getElementById(elementId)) document.getElementById(elementId).textContent = snapshot.size;
            });
            
            // Render logs in real-time
            const logContainer = document.querySelector('#log-container ul');
            const q = query(collection(db, 'users', user.uid, 'logs'), orderBy('timestamp', 'desc'), limit(50));
            onSnapshot(q, (snapshot) => {
                if (snapshot.empty) { logContainer.innerHTML = '<li class="list-group-item text-muted text-center">Belum ada aktivitas.</li>'; return; }
                let logHtml = '';
                snapshot.forEach(doc => {
                    const log = doc.data();
                    const details = log.details || {};
                    const docName = details.nama || details.nama_barang || "Item";
                    const itemDetails = ` (Merk: ${details.merk || '-'}, Spek: ${details.spesifikasi || '-'}, Jml: ${details.jumlah || 0}, Ket: ${details.keterangan || '-'})`;
                    const date = log.timestamp?.toDate().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) || 'Baru saja';
                    logHtml += `<li class="list-group-item">[${date}] Item <strong>${docName}</strong> telah <strong>${log.action}</strong>.${itemDetails}</li>`;
                });
                logContainer.innerHTML = logHtml;
            });

            // Event listener untuk tombol clear log
            document.getElementById('clear-log-btn').addEventListener('click', () => {
                currentAction = 'clear_logs';
                document.getElementById('confirmActionTitle').textContent = 'Konfirmasi Hapus Riwayat';
                document.getElementById('confirmActionBody').textContent = 'Apakah Anda yakin ingin menghapus semua riwayat aktivitas?';
                confirmActionModal.show();
            });
        }
        
        function loadDataTablePage() {
            const config = {
                'material': { title: 'Material', headers: ['NAMA MATERIAL', 'MERK', 'SPESIFIKASI', 'JUMLAH', 'KETERANGAN']},
                'komponen': { title: 'Komponen', headers: ['NAMA KOMPONEN', 'MERK', 'SPESIFIKASI', 'JUMLAH', 'KETERANGAN']},
                'keluar':   { title: 'Barang Keluar', headers: ['NAMA KOMPONEN', 'MERK', 'SPESIFIKASI', 'JUMLAH', 'KETERANGAN']}
            };
            const pageConfig = config[currentCollectionName];
            contentArea.innerHTML = `
                <nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="#">Home</a></li><li class="breadcrumb-item active">${pageConfig.title}</li></ol></nav>
                <div class="card mb-4"><div class="card-header bg-white d-flex justify-content-between align-items-center"><h5>Daftar ${pageConfig.title}</h5><button class="btn btn-primary btn-tambah"><i class="bi bi-plus-circle me-2"></i>Tambah ${pageConfig.title}</button></div><div class="card-body"><div class="table-responsive scrollable-container"><table class="table table-striped table-hover table-bordered"><thead class="table-dark"><tr><th>NO</th>${pageConfig.headers.map(h => `<th>${h}</th>`).join('')}<th>OPSI</th></tr></thead><tbody id="table-body"></tbody></table></div></div></div>
                <div class="card"><div class="card-header d-flex justify-content-between align-items-center">Riwayat Aktivitas ${pageConfig.title}<button class="btn btn-outline-secondary btn-sm" id="clear-log-btn"><i class="bi bi-trash me-1"></i> Bersihkan</button></div><div class="card-body p-0 scrollable-container" id="log-container"><ul class="list-group list-group-flush"></ul></div></div>`;
            renderTableData(pageConfig.headers);
            renderLogs();
        }

        function buildForm(data = {}) {
            const isEdit = !!data.id;
            let formHtml = `<input type="hidden" id="itemId" value="${data.id || ''}">`;
            if (currentCollectionName === 'komponen' || currentCollectionName === 'keluar') {
                formHtml += `
                    <div class="mb-3"><label class="form-label">Nama Barang</label><select class="form-select" id="nama_barang" required><option disabled ${!isEdit && 'selected'} value="">Pilih...</option>
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
                    </select></div>`;
            } else if (currentCollectionName === 'material') {
                formHtml += `
                    <div class="mb-3"><label class="form-label">Nama Material</label><input type="text" class="form-control" id="nama" value="${data.nama || ''}" required></div>
                    <div class="mb-3"><label class="form-label">Merk</label><input type="text" class="form-control" id="merk" value="${data.merk || ''}" required></div>
                    <div class="mb-3"><label class="form-label">Spesifikasi</label><textarea class="form-control" id="spesifikasi">${data.spesifikasi || ''}</textarea></div>
                    <div class="mb-3"><label class="form-label">Jumlah</label><input type="number" class="form-control" id="jumlah" value="${data.jumlah || ''}" required></div>
                    <div class="mb-3"><label class="form-label">Keterangan</label><input type="text" class="form-control" id="keterangan" value="${data.keterangan || ''}" required></div>`;
            }
            itemForm.innerHTML = formHtml;
            if(isEdit) for(const key in data) if(document.getElementById(key)) document.getElementById(key).value = data[key];
        }
        
        function renderTableData(headers) {
            const tableBody = document.getElementById('table-body');
            const dataKeys = {
                'material': ['nama', 'merk', 'spesifikasi', 'jumlah', 'keterangan'],
                'komponen': ['nama_barang', 'merk', 'spesifikasi', 'jumlah', 'keterangan'],
                'keluar': ['nama_barang', 'merk', 'spesifikasi', 'jumlah', 'keterangan']
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

        function renderLogs() {
            const logContainer = document.querySelector('#log-container ul');
            if(!logContainer) return;
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

        itemForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const docId = document.getElementById('itemId').value;
            let data = {};
            itemForm.querySelectorAll('input, select, textarea').forEach(el => { if(el.id) data[el.id] = (el.type === 'number') ? Number(el.value) : el.value; });
            delete data.itemId;
            
            if (docId) { 
                await updateDoc(doc(db, 'users', user.uid, currentCollectionName, docId), data); 
                writeLog('Diperbarui', currentCollectionName, data);
            } else { 
                await addDoc(collection(db, 'users', user.uid, currentCollectionName), data); 
                writeLog('Ditambahkan', currentCollectionName, data);
            }
            itemModal.hide();
        });

        // Halaman awal saat dimuat
        navigate('dashboard');
    }
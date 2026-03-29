// =============================================
//  Firebase Konfigürasyonu
//  firebase.google.com adresinden projenizi
//  oluşturup aşağıdaki bilgileri doldurun.
// =============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc,
  addDoc, updateDoc, deleteDoc, getDoc, setDoc,
  getDocs, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDI36vpaI9NzUYpeORDEEGc3fLAq3xhPcw",
  authDomain: "invisalign-finans-7c031.firebaseapp.com",
  projectId: "invisalign-finans-7c031",
  storageBucket: "invisalign-finans-7c031.firebasestorage.app",
  messagingSenderId: "909515315316",
  appId: "1:909515315316:web:fed1413fbacd798e225921",
  measurementId: "G-D3YEN10BJX"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// =============================================
//  GLOBAL STATE
// =============================================
let allPatients = [];
let allPackages = [];
let allDevices  = [];
let deleteTargetId = null;
let autoFilledDate1 = false;
let autoFilledDate2 = false;
let currentRole = '';
let listenersStarted = false;

// =============================================
//  ROLE / LOGIN
// =============================================
window.selectRole = function(role) {
  currentRole = role;
  document.getElementById('login-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';
  app.classList.remove('role-klinik', 'role-asistan');
  app.classList.add('role-' + role);
  document.getElementById('role-label').textContent =
    role === 'klinik' ? '🔑 Klinik Girişi' : '👩‍💼 Asistan Girişi';
  if (!listenersStarted) {
    listenersStarted = true;
    startListeners();
  }
  showPage(role === 'asistan' ? 'patients' : 'dashboard');
};

window.logout = function() {
  currentRole = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
};

// =============================================
//  NAVIGATION
// =============================================
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  const navItem = document.querySelector(`[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  if (pageId === 'dashboard')   renderDashboard();
  if (pageId === 'patients')    renderPatients();
  if (pageId === 'overdue')     renderOverdue();
  if (pageId === 'reports')     setupReportSelectors();
  if (pageId === 'packages')    renderPackages();
  if (pageId === 'devices')     renderDevices();
  if (pageId === 'inception')   loadInceptionBalance();
  if (pageId === 'add-patient') {
    resetForm();
    populatePackageSelect();
  }
}

window.showPage = showPage;

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    showPage(item.dataset.page);
  });
});

// =============================================
//  UTILITIES
// =============================================
function formatCurrency(n) {
  if (!n && n !== 0) return '—';
  return '₺' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}.${m}.${y}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((now - d) / 86400000);
}

// Tarih boşsa createdAt'i fallback olarak kullan
function getInstallmentMonthYear(dateStr, fallbackDateStr) {
  const d = dateStr || fallbackDateStr || '';
  return getMonthYear(d ? d.substring(0, 10) : '');
}

function getMonthYear(dateStr) {
  if (!dateStr) return null;
  const [y, m] = dateStr.split('-');
  return `${y}-${m}`;
}

function getPatientStatus(patient) {
  const inv = Number(patient.invoiceAmount) || 0;
  const paid = (Number(patient.installment1Amount) || 0) + (Number(patient.installment2Amount) || 0);
  if (paid >= inv && inv > 0) return 'paid';
  if (!patient.dueDate) return 'pending';
  if (daysBetween(patient.dueDate) > 0 && paid < inv) return 'overdue';
  if (paid > 0) return 'partial';
  return 'pending';
}

function statusBadge(status) {
  const labels = { paid: 'Ödendi', partial: 'Kısmi', pending: 'Bekliyor', overdue: 'Vadesi Geçmiş' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3200);
}

// =============================================
//  FIREBASE — REALTIME LISTENERS
// =============================================
function startListeners() {
  // Packages
  onSnapshot(query(collection(db, 'packages'), orderBy('name')), snap => {
    allPackages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPackages();
    populatePackageSelect();
  });

  // Devices
  onSnapshot(query(collection(db, 'devices'), orderBy('createdAt', 'desc')), snap => {
    allDevices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDevices();
  });

  // Patients
  onSnapshot(query(collection(db, 'patients'), orderBy('createdAt', 'desc')), snap => {
    allPatients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDashboard();
    renderPatients();
    renderOverdue();
    if (document.getElementById('page-reports').classList.contains('active')) {
      window.generateReport();
    }
  });
}

// =============================================
//  DASHBOARD
// =============================================
function renderDashboard() {
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('tr-TR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const now = today();
  const [cy, cm] = now.split('-');
  const monthKey = `${cy}-${cm}`;

  let collectedMonth = 0;
  let approvedMonth = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  let totalOverpay = 0;

  allPatients.forEach(p => {
    const inv = Number(p.invoiceAmount) || 0;
    const i1  = Number(p.installment1Amount) || 0;
    const i2  = Number(p.installment2Amount) || 0;
    const paid = i1 + i2;
    const diff = inv - paid;
    const remaining = diff > 0 ? diff : 0;
    const overpay   = diff < 0 ? Math.abs(diff) : 0;

    // Bu ay tahsilat (ödeme tarihine göre, tarih yoksa createdAt baz alınır)
    const fallback = p.createdAt ? p.createdAt.substring(0, 10) : '';
    if ((Number(p.installment1Amount) || 0) > 0 && getInstallmentMonthYear(p.installment1Date, fallback) === monthKey) collectedMonth += i1;
    if ((Number(p.installment2Amount) || 0) > 0 && getInstallmentMonthYear(p.installment2Date, fallback) === monthKey) collectedMonth += i2;

    // Bu ay onaylanan vakalar
    if (p.clincheckDate && getMonthYear(p.clincheckDate) === monthKey) approvedMonth++;

    // Kalan tahsilat
    totalPending += remaining;

    // Fazla ödeme
    totalOverpay += overpay;

    // Vadesi geçmiş
    const status = getPatientStatus(p);
    if (status === 'overdue') totalOverdue += remaining;
  });

  document.getElementById('stat-collected-month').textContent = formatCurrency(collectedMonth);
  document.getElementById('stat-approved-month').textContent = approvedMonth + ' Vaka';
  document.getElementById('stat-pending').textContent = formatCurrency(totalPending);
  document.getElementById('stat-overdue').textContent = formatCurrency(totalOverdue);
  document.getElementById('stat-overpay').textContent = formatCurrency(totalOverpay);

  // Recent patients (last 8)
  const tbody = document.getElementById('recent-patients-body');
  if (!allPatients.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Henüz hasta eklenmemiş.</td></tr>';
    return;
  }
  tbody.innerHTML = allPatients.slice(0, 8).map(p => {
    const status = getPatientStatus(p);
    return `<tr>
      <td>${escHtml(p.patientNumber)}</td>
      <td>${escHtml(p.name)}</td>
      <td>${escHtml(p.packageName || '—')}</td>
      <td class="amount">${formatCurrency(p.invoiceAmount)}</td>
      <td>${formatDate(p.dueDate)}</td>
      <td>${statusBadge(status)}</td>
    </tr>`;
  }).join('');
}

// =============================================
//  PATIENTS LIST
// =============================================
function renderPatients(patients = allPatients) {
  applyPatientsFilter();
}

function applyPatientsFilter() {
  const search = (document.getElementById('patient-search')?.value || '').toLowerCase();
  const statusF = document.getElementById('filter-status')?.value || '';

  let filtered = allPatients.filter(p => {
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search) ||
      p.patientNumber?.toLowerCase().includes(search);
    const matchStatus = !statusF || getPatientStatus(p) === statusF;
    return matchSearch && matchStatus;
  });

  const tbody = document.getElementById('patients-body');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">Kayıt bulunamadı.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const status = getPatientStatus(p);
    const inv  = Number(p.invoiceAmount) || 0;
    const i1   = Number(p.installment1Amount) || 0;
    const i2   = Number(p.installment2Amount) || 0;
    const diff = inv - i1 - i2;
    const remaining = diff > 0 ? diff : 0;
    const overpay   = diff < 0 ? Math.abs(diff) : 0;
    const isOverdue = status === 'overdue';

    return `<tr>
      <td>${escHtml(p.patientNumber)}</td>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td>${escHtml(p.packageName || '—')}</td>
      <td class="hide-asistan amount">${formatCurrency(inv)}</td>
      <td>${formatDate(p.clincheckDate)}</td>
      <td class="${isOverdue ? 'amount-overdue' : ''}">${formatDate(p.dueDate)}</td>
      <td class="hide-asistan">
        ${i1 ? `<span class="amount-paid">${formatCurrency(i1)}</span>` : '—'}
        ${p.installment1Date ? `<br><small style="color:var(--gray-400)">${formatDate(p.installment1Date)}</small>` : ''}
      </td>
      <td class="hide-asistan">
        ${i2 ? `<span class="amount-paid">${formatCurrency(i2)}</span>` : '—'}
        ${p.installment2Date ? `<br><small style="color:var(--gray-400)">${formatDate(p.installment2Date)}</small>` : ''}
      </td>
      <td class="hide-asistan ${remaining > 0 ? (isOverdue ? 'amount-overdue' : 'amount-remaining') : 'amount-paid'}">
        ${remaining > 0 ? formatCurrency(remaining) : '✓ Tamamlandı'}
      </td>
      <td class="hide-asistan amount-paid">${overpay > 0 ? formatCurrency(overpay) : '—'}</td>
      <td class="hide-asistan">${statusBadge(status)}</td>
      <td>
        <button class="btn-icon" title="Detay" onclick="showPatientDetail('${p.id}')">👁️</button>
        <button class="btn-icon" title="Düzenle" onclick="editPatient('${p.id}')">✏️</button>
        <button class="btn-icon delete-btn" title="Sil" onclick="confirmDeletePatient('${p.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('patient-search')?.addEventListener('input', applyPatientsFilter);
document.getElementById('filter-status')?.addEventListener('change', applyPatientsFilter);

// =============================================
//  PATIENT DETAIL MODAL
// =============================================
window.showPatientDetail = function(id) {
  const p = allPatients.find(x => x.id === id);
  if (!p) return;
  const inv  = Number(p.invoiceAmount) || 0;
  const i1   = Number(p.installment1Amount) || 0;
  const i2   = Number(p.installment2Amount) || 0;
  const remaining = Math.max(0, inv - i1 - i2);
  const status = getPatientStatus(p);

  document.getElementById('modal-patient-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Hasta Bilgileri</div>
      <div class="detail-grid">
        <div class="detail-item"><label>Ad Soyad</label><div class="detail-value">${escHtml(p.name)}</div></div>
        <div class="detail-item"><label>Hasta No</label><div class="detail-value">${escHtml(p.patientNumber)}</div></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Tedavi Bilgileri</div>
      <div class="detail-grid">
        <div class="detail-item"><label>Paket</label><div class="detail-value">${escHtml(p.packageName || '—')}</div></div>
        <div class="detail-item financial-detail"><label>Fatura Tutarı</label><div class="detail-value">${formatCurrency(inv)}</div></div>
        <div class="detail-item"><label>Clincheck Onay Tarihi</label><div class="detail-value">${formatDate(p.clincheckDate)}</div></div>
        <div class="detail-item"><label>Vade Tarihi</label><div class="detail-value">${formatDate(p.dueDate)}</div></div>
        <div class="detail-item"><label>Durum</label><div class="detail-value">${statusBadge(status)}</div></div>
      </div>
    </div>
    <div class="detail-section financial-detail">
      <div class="detail-section-title">Ödeme Bilgileri</div>
      <div class="detail-grid">
        <div class="detail-item"><label>1. Taksit Tutarı</label><div class="detail-value" style="color:var(--success)">${i1 ? formatCurrency(i1) : '—'}</div></div>
        <div class="detail-item"><label>1. Taksit Tarihi</label><div class="detail-value">${formatDate(p.installment1Date)}</div></div>
        <div class="detail-item"><label>2. Taksit Tutarı</label><div class="detail-value" style="color:var(--success)">${i2 ? formatCurrency(i2) : '—'}</div></div>
        <div class="detail-item"><label>2. Taksit Tarihi</label><div class="detail-value">${formatDate(p.installment2Date)}</div></div>
        <div class="detail-item"><label>Toplam Ödenen</label><div class="detail-value" style="color:var(--success);font-weight:700">${formatCurrency(i1 + i2)}</div></div>
        <div class="detail-item"><label>Kalan Tutar</label><div class="detail-value" style="color:${remaining > 0 ? 'var(--warning)' : 'var(--success)'};font-weight:700">${remaining > 0 ? formatCurrency(remaining) : '✓ Tamamlandı'}</div></div>
      </div>
    </div>
  `;
  openModal('modal-patient');
};

// =============================================
//  ADD / EDIT PATIENT FORM
// =============================================
function resetForm() {
  document.getElementById('patient-form').reset();
  document.getElementById('edit-patient-id').value = '';
  document.getElementById('form-title').textContent = 'Yeni Hasta Ekle';
  document.getElementById('form-submit-btn').textContent = 'Hasta Kaydet';
  document.getElementById('f-remaining').value = '';
  autoFilledDate1 = false;
  autoFilledDate2 = false;
}

function cancelForm() {
  showPage('patients');
}
window.cancelForm = cancelForm;

function populatePackageSelect() {
  const sel = document.getElementById('f-package');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Paket Seçin</option>';
  allPackages.forEach(pkg => {
    const opt = document.createElement('option');
    opt.value = pkg.id;
    opt.dataset.price = pkg.price;
    opt.textContent = `${pkg.name} — ${formatCurrency(pkg.price)}`;
    if (pkg.id === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

window.updatePackagePrice = function() {
  const sel = document.getElementById('f-package');
  const opt = sel.options[sel.selectedIndex];
  const price = opt?.dataset.price || '';
  document.getElementById('f-invoice-amount').value = price || '';
  updateRemaining();
};

window.updateDueDate = function() {
  const clincheck = document.getElementById('f-clincheck-date').value;
  const checked = document.querySelector('input[name="due-days"]:checked');
  const days = checked ? parseInt(checked.value) : 0;
  if (clincheck && days > 0) {
    const d = new Date(clincheck);
    d.setDate(d.getDate() + days);
    document.getElementById('f-due-date').value = d.toISOString().split('T')[0];
  }
};

window.updateRemaining = function() {
  const inv  = Number(document.getElementById('f-invoice-amount').value) || 0;
  const i1   = Number(document.getElementById('f-installment1-amount').value) || 0;
  const i2   = Number(document.getElementById('f-installment2-amount').value) || 0;
  const paid = i1 + i2;
  const remaining = inv - paid;

  document.getElementById('f-remaining').value = remaining > 0 ? remaining : 0;
  document.getElementById('f-overpay').value   = remaining < 0 ? Math.abs(remaining) : 0;
};

// 1. taksit girilince tarihi bugüne set et (sadece boşsa)
window.onInstallment1Input = function() {
  updateRemaining();
  const dateField = document.getElementById('f-installment1-date');
  if (!dateField.value && document.getElementById('f-installment1-amount').value > 0) {
    dateField.value = today();
    autoFilledDate1 = true;
  }
  // NOT: 2. taksit tarihi buradan otomatik doldurulmaz; kullanıcı 2. tutarı girince doldurulur
};

// 1. taksit tarihi kullanıcı tarafından değiştirilince
window.onInstallment1DateChange = function() {
  autoFilledDate1 = false; // kullanıcı manuel girdi, otomatik sayma
};

// 2. taksit tarihi kullanıcı tarafından değiştirilince
window.onInstallment2DateChange = function() {
  autoFilledDate2 = false; // kullanıcı manuel girdi
};

// 2. taksit girilince tarihi önceki taksit tarihine set et (boşsa)
window.onInstallment2Input = function() {
  updateRemaining();
  const date2Field = document.getElementById('f-installment2-date');
  if (!date2Field.value && document.getElementById('f-installment2-amount').value > 0) {
    const date1 = document.getElementById('f-installment1-date').value;
    date2Field.value = date1 || today();
    autoFilledDate2 = true;
  }
};

document.getElementById('patient-form').addEventListener('submit', async e => {
  e.preventDefault();

  const i1 = Number(document.getElementById('f-installment1-amount').value) || 0;
  const i2 = Number(document.getElementById('f-installment2-amount').value) || 0;
  let date1 = document.getElementById('f-installment1-date').value;
  let date2 = document.getElementById('f-installment2-date').value;

  // Taksit tutarı girilmiş ama tarih boşsa uyar (her durumda — otomatik ya da manuel)
  const missingDate1 = i1 > 0 && !date1;
  const missingDate2 = i2 > 0 && !date2;
  if (missingDate1 || missingDate2) {
    if (!confirm('Taksit ödemesi için tarih girmediniz. Bugünün tarihi otomatik olarak girilsin mi?')) {
      return; // sayfada kal, tarihler zaten boş
    }
    // Onaylandı — boş olanları bugünle doldur
    const todayStr = today();
    if (missingDate1) { date1 = todayStr; document.getElementById('f-installment1-date').value = todayStr; }
    if (missingDate2) { date2 = todayStr; document.getElementById('f-installment2-date').value = todayStr; }
  }

  const sel = document.getElementById('f-package');
  const selOpt = sel.options[sel.selectedIndex];
  const packageId = sel.value;
  const packageName = selOpt ? selOpt.text.split(' —')[0] : '';

  const inv = Number(document.getElementById('f-invoice-amount').value) || 0;

  const data = {
    name:                 document.getElementById('f-name').value.trim(),
    patientNumber:        document.getElementById('f-number').value.trim(),
    packageId,
    packageName,
    invoiceAmount:        inv,
    clincheckDate:        document.getElementById('f-clincheck-date').value,
    dueDays:              Number(document.querySelector('input[name="due-days"]:checked')?.value) || 0,
    dueDate:              document.getElementById('f-due-date').value,
    installment1Amount:   i1,
    installment1Date:     date1,
    installment2Amount:   i2,
    installment2Date:     date2,
    remaining:            Math.max(0, inv - i1 - i2),
    updatedAt:            new Date().toISOString()
  };

  const editId = document.getElementById('edit-patient-id').value;

  try {
    if (editId) {
      await updateDoc(doc(db, 'patients', editId), data);
      showToast('Hasta güncellendi.', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, 'patients'), data);
      showToast('Hasta başarıyla eklendi.', 'success');
    }
    showPage('patients');
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
});

window.editPatient = function(id) {
  const p = allPatients.find(x => x.id === id);
  if (!p) return;

  // Önce sayfayı aç (resetForm içinde çalışır), sonra verileri doldur
  showPage('add-patient');

  document.getElementById('edit-patient-id').value       = id;
  document.getElementById('f-name').value                = p.name || '';
  document.getElementById('f-number').value              = p.patientNumber || '';
  document.getElementById('f-clincheck-date').value      = p.clincheckDate || '';
  document.getElementById('f-due-date').value            = p.dueDate || '';
  document.getElementById('f-installment1-amount').value = p.installment1Amount || '';
  // Tarih yoksa bugün (otomatik atama — flag set et)
  const edit_i1date = p.installment1Date || (p.installment1Amount ? today() : '');
  document.getElementById('f-installment1-date').value   = edit_i1date;
  autoFilledDate1 = !p.installment1Date && !!p.installment1Amount;

  document.getElementById('f-installment2-amount').value = p.installment2Amount || '';
  // 2. taksit tarihi yoksa 1. taksit tarihi, o da yoksa bugün (otomatik atama — flag set et)
  const edit_i2date = p.installment2Date || (p.installment2Amount ? (edit_i1date || today()) : '');
  document.getElementById('f-installment2-date').value   = edit_i2date;
  autoFilledDate2 = !p.installment2Date && !!p.installment2Amount;

  // Paket seç ve fatura tutarını doldur
  const sel = document.getElementById('f-package');
  sel.value = p.packageId || '';
  document.getElementById('f-invoice-amount').value = p.invoiceAmount || '';

  // Vade günü radyo butonunu seç
  document.querySelectorAll('input[name="due-days"]').forEach(r => {
    r.checked = Number(r.value) === Number(p.dueDays);
  });

  updateRemaining();

  document.getElementById('form-title').textContent = 'Hasta Düzenle';
  document.getElementById('form-submit-btn').textContent = 'Güncelle';
};

// =============================================
//  DELETE PATIENT
// =============================================
window.confirmDeletePatient = function(id) {
  deleteTargetId = id;
  openModal('modal-delete');
};

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
  if (!deleteTargetId) return;
  try {
    await deleteDoc(doc(db, 'patients', deleteTargetId));
    showToast('Hasta silindi.', 'success');
    closeModal();
    deleteTargetId = null;
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
});

// =============================================
//  OVERDUE PAGE
// =============================================
function renderOverdue(dateFilter = null) {
  const overdue = allPatients.filter(p => {
    if (getPatientStatus(p) !== 'overdue') return false;
    if (dateFilter) return p.dueDate <= dateFilter;
    return true;
  });

  let totalAmt = 0;
  overdue.forEach(p => {
    const inv  = Number(p.invoiceAmount) || 0;
    const paid = (Number(p.installment1Amount) || 0) + (Number(p.installment2Amount) || 0);
    totalAmt += Math.max(0, inv - paid);
  });

  document.getElementById('overdue-total').textContent = formatCurrency(totalAmt);
  document.getElementById('overdue-count').textContent = overdue.length;

  const tbody = document.getElementById('overdue-body');
  if (!overdue.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Vadesi geçmiş fatura bulunamadı. 🎉</td></tr>';
    return;
  }

  tbody.innerHTML = overdue.map(p => {
    const inv     = Number(p.invoiceAmount) || 0;
    const paid    = (Number(p.installment1Amount) || 0) + (Number(p.installment2Amount) || 0);
    const remaining = Math.max(0, inv - paid);
    const days    = daysBetween(p.dueDate);
    return `<tr>
      <td>${escHtml(p.patientNumber)}</td>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td>${escHtml(p.packageName || '—')}</td>
      <td class="amount">${formatCurrency(inv)}</td>
      <td class="amount-overdue">${formatDate(p.dueDate)}</td>
      <td><span style="background:var(--danger-light);color:var(--danger);padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600">${days} gün</span></td>
      <td class="amount-overdue">${formatCurrency(remaining)}</td>
      <td>
        <button class="btn-icon" title="Düzenle" onclick="editPatient('${p.id}')">✏️</button>
      </td>
    </tr>`;
  }).join('');
}

window.filterOverdue = function() {
  const df = document.getElementById('overdue-date-filter').value;
  renderOverdue(df || null);
};

window.resetOverdue = function() {
  document.getElementById('overdue-date-filter').value = '';
  renderOverdue();
};

// =============================================
//  REPORTS PAGE
// =============================================
function setupReportSelectors() {
  const monthSel = document.getElementById('report-month');
  const yearSel  = document.getElementById('report-year');
  if (monthSel.options.length > 1) {
    generateReport();
    return;
  }

  const months = [
    ['01','Ocak'],['02','Şubat'],['03','Mart'],['04','Nisan'],
    ['05','Mayıs'],['06','Haziran'],['07','Temmuz'],['08','Ağustos'],
    ['09','Eylül'],['10','Ekim'],['11','Kasım'],['12','Aralık']
  ];
  months.forEach(([val, label]) => {
    const o = document.createElement('option');
    o.value = val; o.textContent = label;
    monthSel.appendChild(o);
  });

  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 1; y >= currentYear - 5; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === currentYear) o.selected = true;
    yearSel.appendChild(o);
  }

  // Default to current month then generate
  monthSel.value = String(new Date().getMonth() + 1).padStart(2, '0');
  generateReport();
}

window.generateReport = function() {
  const m = document.getElementById('report-month').value;
  const y = document.getElementById('report-year').value;
  if (!m || !y) { showToast('Ay ve yıl seçin.', 'error'); return; }

  const monthKey = `${y}-${m}`;
  const monthName = document.getElementById('report-month').options[document.getElementById('report-month').selectedIndex].text;

  // Vakalar: Clincheck tarihi bu aya ait olanlar
  const casesApproved = allPatients.filter(p => p.clincheckDate && getMonthYear(p.clincheckDate) === monthKey);

  // O ay tahsilat: taksit tarihi bu aya ait ödemeler (tarih yoksa createdAt baz alınır)
  let collectedThisMonth = 0;
  allPatients.forEach(p => {
    const fallback = p.createdAt ? p.createdAt.substring(0, 10) : '';
    if ((Number(p.installment1Amount) || 0) > 0 && getInstallmentMonthYear(p.installment1Date, fallback) === monthKey)
      collectedThisMonth += Number(p.installment1Amount) || 0;
    if ((Number(p.installment2Amount) || 0) > 0 && getInstallmentMonthYear(p.installment2Date, fallback) === monthKey)
      collectedThisMonth += Number(p.installment2Amount) || 0;
  });

  // O ay onaylanan vakalar için toplam fatura ve kalan
  let invoiceTotal = 0;
  let remainingTotal = 0;
  let overpayTotal = 0;
  casesApproved.forEach(p => {
    const inv  = Number(p.invoiceAmount) || 0;
    const paid = (Number(p.installment1Amount) || 0) + (Number(p.installment2Amount) || 0);
    const diff = inv - paid;
    invoiceTotal   += inv;
    remainingTotal += diff > 0 ? diff : 0;
    overpayTotal   += diff < 0 ? Math.abs(diff) : 0;
  });

  document.getElementById('rep-approved-cases').textContent  = casesApproved.length + ' Vaka';
  document.getElementById('rep-invoice-total').textContent   = formatCurrency(invoiceTotal);
  document.getElementById('rep-collected').textContent       = formatCurrency(collectedThisMonth);
  document.getElementById('rep-remaining').textContent       = formatCurrency(remainingTotal);
  document.getElementById('rep-overpay').textContent         = formatCurrency(overpayTotal);
  document.getElementById('report-table-title').textContent  = `${monthName} ${y} — Onaylanan Vakalar`;

  const tbody = document.getElementById('report-body');
  if (!casesApproved.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-row">${monthName} ${y} tarihinde onaylanan vaka bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = casesApproved.map(p => {
    const inv  = Number(p.invoiceAmount) || 0;
    const i1   = Number(p.installment1Amount) || 0;
    const i2   = Number(p.installment2Amount) || 0;
    const rem  = Math.max(0, inv - i1 - i2);
    const status = getPatientStatus(p);
    return `<tr>
      <td>${escHtml(p.patientNumber)}</td>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td>${escHtml(p.packageName || '—')}</td>
      <td class="amount">${formatCurrency(inv)}</td>
      <td>${formatDate(p.clincheckDate)}</td>
      <td>${i1 ? `<span class="amount-paid">${formatCurrency(i1)}</span>${p.installment1Date ? ' (' + formatDate(p.installment1Date) + ')' : ''}` : '—'}</td>
      <td>${i2 ? `<span class="amount-paid">${formatCurrency(i2)}</span>${p.installment2Date ? ' (' + formatDate(p.installment2Date) + ')' : ''}` : '—'}</td>
      <td class="${rem > 0 ? 'amount-remaining' : 'amount-paid'}">${rem > 0 ? formatCurrency(rem) : '✓'}</td>
      <td>${statusBadge(status)}</td>
    </tr>`;
  }).join('');
};

// =============================================
//  EXCEL EXPORT
// =============================================
window.exportReportExcel = function() {
  const m = document.getElementById('report-month').value;
  const y = document.getElementById('report-year').value;
  if (!m || !y) { showToast('Önce ay ve yıl seçin.', 'error'); return; }

  const monthKey  = `${y}-${m}`;
  const monthName = document.getElementById('report-month').options[document.getElementById('report-month').selectedIndex].text;

  const casesApproved = allPatients.filter(p => p.clincheckDate && getMonthYear(p.clincheckDate) === monthKey);
  if (!casesApproved.length) { showToast('Aktarılacak veri yok.', 'error'); return; }

  // Başlık satırı
  const rows = [
    ['Hasta No', 'Ad Soyad', 'Paket', 'Fatura Tutarı (₺)', 'Clincheck Tarihi', 'Vade Tarihi',
     '1. Taksit (₺)', '1. Taksit Tarihi', '2. Taksit (₺)', '2. Taksit Tarihi',
     'Kalan (₺)', 'Artan (₺)', 'Durum']
  ];

  casesApproved.forEach(p => {
    const inv  = Number(p.invoiceAmount) || 0;
    const i1   = Number(p.installment1Amount) || 0;
    const i2   = Number(p.installment2Amount) || 0;
    const diff = inv - i1 - i2;
    const statusLabels = { paid: 'Ödendi', partial: 'Kısmi', pending: 'Bekliyor', overdue: 'Vadesi Geçmiş' };
    rows.push([
      p.patientNumber || '',
      p.name || '',
      p.packageName || '',
      inv,
      formatDate(p.clincheckDate),
      formatDate(p.dueDate),
      i1 || 0,
      formatDate(p.installment1Date),
      i2 || 0,
      formatDate(p.installment2Date),
      diff > 0 ? diff : 0,
      diff < 0 ? Math.abs(diff) : 0,
      statusLabels[getPatientStatus(p)] || ''
    ]);
  });

  // SheetJS ile Excel oluştur
  const XLSX = window.XLSX;
  if (!XLSX) { showToast('Excel kütüphanesi yüklenmedi, sayfayı yenileyin.', 'error'); return; }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Sütun genişlikleri
  ws['!cols'] = [
    {wch:12},{wch:24},{wch:20},{wch:16},{wch:16},{wch:16},
    {wch:14},{wch:16},{wch:14},{wch:16},{wch:12},{wch:12},{wch:16}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${y}`);
  XLSX.writeFile(wb, `Invisalign_Rapor_${monthName}_${y}.xlsx`);
  showToast('Excel dosyası indirildi.', 'success');
};

// =============================================
//  PACKAGES PAGE
// =============================================
function renderPackages() {
  const tbody = document.getElementById('packages-body');
  if (!allPackages.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Henüz paket tanımlanmamış.</td></tr>';
    return;
  }
  tbody.innerHTML = allPackages.map(pkg => `<tr>
    <td><strong>${escHtml(pkg.name)}</strong></td>
    <td class="amount">${formatCurrency(pkg.price)}</td>
    <td>${escHtml(pkg.description || '—')}</td>
    <td>
      <button class="btn-icon" onclick="editPackage('${pkg.id}')">✏️</button>
      <button class="btn-icon" onclick="deletePackage('${pkg.id}')">🗑️</button>
    </td>
  </tr>`).join('');
}

window.showAddPackageModal = function() {
  document.getElementById('pkg-edit-id').value = '';
  document.getElementById('pkg-name').value    = '';
  document.getElementById('pkg-price').value   = '';
  document.getElementById('pkg-desc').value    = '';
  document.getElementById('modal-package-title').textContent = 'Yeni Paket Ekle';
  openModal('modal-package');
};

window.editPackage = function(id) {
  const pkg = allPackages.find(x => x.id === id);
  if (!pkg) return;
  document.getElementById('pkg-edit-id').value = id;
  document.getElementById('pkg-name').value    = pkg.name || '';
  document.getElementById('pkg-price').value   = pkg.price || '';
  document.getElementById('pkg-desc').value    = pkg.description || '';
  document.getElementById('modal-package-title').textContent = 'Paketi Düzenle';
  openModal('modal-package');
};

window.savePackage = async function() {
  const name  = document.getElementById('pkg-name').value.trim();
  const price = Number(document.getElementById('pkg-price').value);
  const desc  = document.getElementById('pkg-desc').value.trim();
  if (!name || !price) { showToast('Paket adı ve fiyat zorunlu.', 'error'); return; }

  const editId = document.getElementById('pkg-edit-id').value;
  try {
    if (editId) {
      await updateDoc(doc(db, 'packages', editId), { name, price, description: desc });
      showToast('Paket güncellendi.', 'success');
    } else {
      await addDoc(collection(db, 'packages'), { name, price, description: desc });
      showToast('Paket eklendi.', 'success');
    }
    closeModal();
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
};

window.deletePackage = async function(id) {
  if (!confirm('Bu paketi silmek istediğinize emin misiniz?')) return;
  try {
    await deleteDoc(doc(db, 'packages', id));
    showToast('Paket silindi.', 'success');
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
};

// =============================================
//  DEVICES
// =============================================
function renderDevices() {
  const tbody = document.getElementById('devices-body');
  if (!tbody) return;

  let totalDebt = 0, totalPaid = 0;
  allDevices.forEach(d => {
    totalDebt += Number(d.totalAmount) || 0;
    totalPaid += Number(d.paidAmount) || 0;
  });
  const totalRemaining = totalDebt - totalPaid;

  const statTotal = document.getElementById('device-stat-total-debt');
  const statRem   = document.getElementById('device-stat-remaining');
  const statPaid  = document.getElementById('device-stat-paid');
  if (statTotal) statTotal.textContent = formatCurrency(totalDebt);
  if (statRem)   statRem.textContent   = formatCurrency(Math.max(0, totalRemaining));
  if (statPaid)  statPaid.textContent  = formatCurrency(totalPaid);

  if (!allDevices.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-row">Henüz cihaz eklenmemiş.</td></tr>';
    return;
  }

  tbody.innerHTML = allDevices.map(d => {
    const total     = Number(d.totalAmount) || 0;
    const paid      = Number(d.paidAmount)  || 0;
    const remaining = Math.max(0, total - paid);
    const rowClass  = remaining > 0 ? 'amount-overdue' : 'amount-paid';
    const instHtml  = (d.installments || []).length
      ? (d.installments || []).map((inst, i) =>
          `<small>${i+1}. ${formatCurrency(inst.amount)}${inst.date ? ' — ' + formatDate(inst.date) : ''}</small>`
        ).join('<br>')
      : '—';
    return `<tr>
      <td><strong>${escHtml(d.name)}</strong></td>
      <td>${escHtml(d.company || '—')}</td>
      <td class="amount">${formatCurrency(total)}</td>
      <td>${formatDate(d.invoiceDate)}</td>
      <td class="amount-paid">${formatCurrency(paid)}</td>
      <td class="${rowClass}">${remaining > 0 ? formatCurrency(remaining) : '✓ Ödendi'}</td>
      <td>${instHtml}</td>
      <td>${formatDate(d.date)}</td>
      <td>${escHtml(d.notes || '—')}</td>
      <td>
        <button class="btn-icon" title="Düzenle" onclick="editDevice('${d.id}')">&#9999;️</button>
        <button class="btn-icon" title="Sil" onclick="deleteDevice('${d.id}')">&#128465;️</button>
      </td>
    </tr>`;
  }).join('');
}

window.updateDeviceRemaining = function() {
  const total = Number(document.getElementById('dev-total').value) || 0;
  const rows  = document.querySelectorAll('.dev-inst-amount');
  let paid = 0;
  rows.forEach(r => { paid += Number(r.value) || 0; });
  document.getElementById('dev-paid-display').value = formatCurrency(paid);
  document.getElementById('dev-remaining').value    = formatCurrency(Math.max(0, total - paid));
};

window.addDeviceInstallment = function(amount = '', date = '') {
  const list = document.getElementById('dev-installments-list');
  const idx  = list.children.length + 1;
  const row  = document.createElement('div');
  row.className = 'form-row dev-inst-row';
  row.style.alignItems = 'center';
  row.innerHTML = `
    <div class="form-group">
      <label>${idx}. Taksit Tutarı (₺)</label>
      <input type="number" class="dev-inst-amount" min="0" placeholder="0" value="${escHtml(String(amount))}" oninput="updateDeviceRemaining()" />
    </div>
    <div class="form-group">
      <label>${idx}. Taksit Tarihi</label>
      <input type="date" class="dev-inst-date" value="${escHtml(date)}" />
    </div>
    <button type="button" class="btn-icon" style="margin-top:20px;flex-shrink:0" title="Kaldır" onclick="this.closest('.dev-inst-row').remove(); updateDeviceRemaining(); renumberDeviceInstallments();">✕</button>
  `;
  list.appendChild(row);
  updateDeviceRemaining();
};

window.renumberDeviceInstallments = function() {
  document.querySelectorAll('.dev-inst-row').forEach((row, i) => {
    const labels = row.querySelectorAll('label');
    if (labels[0]) labels[0].textContent = `${i + 1}. Taksit Tutarı (₺)`;
    if (labels[1]) labels[1].textContent = `${i + 1}. Taksit Tarihi`;
  });
};

window.showAddDeviceModal = function() {
  document.getElementById('dev-edit-id').value        = '';
  document.getElementById('dev-name').value           = '';
  document.getElementById('dev-company').value        = '';
  document.getElementById('dev-total').value          = '';
  document.getElementById('dev-invoice-date').value   = '';
  document.getElementById('dev-date').value           = '';
  document.getElementById('dev-notes').value          = '';
  document.getElementById('dev-paid-display').value   = '';
  document.getElementById('dev-remaining').value      = '';
  document.getElementById('dev-installments-list').innerHTML = '';
  document.getElementById('modal-device-title').textContent  = 'Yeni Cihaz Ekle';
  openModal('modal-device');
};

window.editDevice = function(id) {
  const d = allDevices.find(x => x.id === id);
  if (!d) return;
  document.getElementById('dev-edit-id').value        = id;
  document.getElementById('dev-name').value           = d.name || '';
  document.getElementById('dev-company').value        = d.company || '';
  document.getElementById('dev-total').value          = d.totalAmount || '';
  document.getElementById('dev-invoice-date').value   = d.invoiceDate || '';
  document.getElementById('dev-date').value           = d.date || '';
  document.getElementById('dev-notes').value          = d.notes || '';
  // Taksitleri doldur
  document.getElementById('dev-installments-list').innerHTML = '';
  (d.installments || []).forEach(inst => addDeviceInstallment(inst.amount, inst.date));
  window.updateDeviceRemaining();
  document.getElementById('modal-device-title').textContent = 'Cihazı Düzenle';
  openModal('modal-device');
};

window.saveDevice = async function() {
  const name  = document.getElementById('dev-name').value.trim();
  const total = Number(document.getElementById('dev-total').value);
  if (!name || !total) { showToast('Cihaz adı ve toplam tutar zorunlu.', 'error'); return; }

  // Taksitleri topla
  const installments = [];
  let paidTotal = 0;
  document.querySelectorAll('.dev-inst-row').forEach(row => {
    const amount = Number(row.querySelector('.dev-inst-amount').value) || 0;
    const date   = row.querySelector('.dev-inst-date').value;
    installments.push({ amount, date });
    paidTotal += amount;
  });

  const data = {
    name,
    company:     document.getElementById('dev-company').value.trim(),
    totalAmount: total,
    paidAmount:  paidTotal,
    invoiceDate: document.getElementById('dev-invoice-date').value,
    date:        document.getElementById('dev-date').value,
    notes:       document.getElementById('dev-notes').value.trim(),
    installments,
    updatedAt:   new Date().toISOString()
  };

  const editId = document.getElementById('dev-edit-id').value;
  try {
    if (editId) {
      await updateDoc(doc(db, 'devices', editId), data);
      showToast('Cihaz güncellendi.', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, 'devices'), data);
      showToast('Cihaz eklendi.', 'success');
    }
    closeModal();
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
};

window.deleteDevice = async function(id) {
  if (!confirm('Bu cihazı silmek istediğinize emin misiniz?')) return;
  try {
    await deleteDoc(doc(db, 'devices', id));
    showToast('Cihaz silindi.', 'success');
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
};

// =============================================
//  INCEPTION BALANCE (Hesap Milad Bilançosu)
// =============================================
let inceptionData = {};

async function loadInceptionBalance() {
  try {
    const ref  = doc(db, 'settings', 'inception_balance');
    const snap = await getDoc(ref);
    inceptionData = snap.exists() ? snap.data() : {};
  } catch (err) {
    inceptionData = {};
  }
  fillInceptionForm();
  updateInceptionSummary();
}

function fillInceptionForm() {
  document.getElementById('inc-start-date').value     = inceptionData.startDate      || '';
  document.getElementById('inc-notes').value          = inceptionData.notes          || '';
  document.getElementById('inc-total-invoice').value  = inceptionData.totalInvoice   || '';
  document.getElementById('inc-total-collected').value= inceptionData.totalCollected || '';
  document.getElementById('inc-device-debt').value    = inceptionData.deviceDebt     || '';
  document.getElementById('inc-device-paid').value    = inceptionData.devicePaid     || '';
}

window.updateInceptionSummary = function() {
  // Önceki dönem değerleri
  const prevInvoice   = Number(document.getElementById('inc-total-invoice')?.value)   || 0;
  const prevCollected = Number(document.getElementById('inc-total-collected')?.value) || 0;
  const prevDevDebt   = Number(document.getElementById('inc-device-debt')?.value)     || 0;
  const prevDevPaid   = Number(document.getElementById('inc-device-paid')?.value)     || 0;

  // Mevcut sistem verileri
  let curInvoice = 0, curCollected = 0;
  allPatients.forEach(p => {
    curInvoice   += Number(p.invoiceAmount)    || 0;
    curCollected += (Number(p.installment1Amount) || 0) + (Number(p.installment2Amount) || 0);
  });
  let curDevDebt = 0, curDevPaid = 0;
  allDevices.forEach(d => {
    curDevDebt += Number(d.totalAmount) || 0;
    curDevPaid += Number(d.paidAmount)  || 0;
  });

  const totalInvoice      = prevInvoice + curInvoice;
  const totalCollected    = prevCollected + curCollected;
  const totalRemaining    = totalInvoice - totalCollected;
  const totalDevInvoice   = prevDevDebt + curDevDebt;
  const totalDevPaid      = prevDevPaid + curDevPaid;
  const totalDevDebt      = totalDevInvoice - totalDevPaid;
  const grandTotalInvoice = totalInvoice + totalDevInvoice;
  const grandTotalPaid    = totalCollected + totalDevPaid;
  const grandBalance      = grandTotalInvoice - grandTotalPaid;

  const el = (id) => document.getElementById(id);
  if (el('inc-sum-invoice'))          el('inc-sum-invoice').textContent          = formatCurrency(totalInvoice);
  if (el('inc-sum-collected'))        el('inc-sum-collected').textContent        = formatCurrency(totalCollected);
  if (el('inc-sum-remaining'))        el('inc-sum-remaining').textContent        = formatCurrency(Math.max(0, totalRemaining));
  if (el('inc-sum-device-invoice'))   el('inc-sum-device-invoice').textContent   = formatCurrency(totalDevInvoice);
  if (el('inc-sum-device-paid'))      el('inc-sum-device-paid').textContent      = formatCurrency(totalDevPaid);
  if (el('inc-sum-grand-invoice'))    el('inc-sum-grand-invoice').textContent    = formatCurrency(grandTotalInvoice);
  if (el('inc-sub-patient-invoice'))  el('inc-sub-patient-invoice').textContent  = formatCurrency(totalInvoice);
  if (el('inc-sub-device-invoice'))   el('inc-sub-device-invoice').textContent   = formatCurrency(totalDevInvoice);
  if (el('inc-sum-grand-paid'))       el('inc-sum-grand-paid').textContent       = formatCurrency(grandTotalPaid);
  if (el('inc-sub-patient-paid'))     el('inc-sub-patient-paid').textContent     = formatCurrency(totalCollected);
  if (el('inc-sub-device-paid'))      el('inc-sub-device-paid').textContent      = formatCurrency(totalDevPaid);
  if (el('inc-sum-grand-balance')) {
    const balEl   = el('inc-sum-grand-balance');
    const cardEl  = el('inc-card-grand-balance');
    const iconEl  = el('inc-icon-grand-balance');
    if (grandBalance > 0) {
      balEl.textContent  = '+' + formatCurrency(grandBalance);
      balEl.style.color  = 'var(--danger)';
      if (cardEl) cardEl.style.borderLeftColor = 'var(--danger)';
      if (iconEl) iconEl.textContent = '🟥';
    } else if (grandBalance < 0) {
      balEl.textContent  = '−' + formatCurrency(Math.abs(grandBalance));
      balEl.style.color  = 'var(--success)';
      if (cardEl) cardEl.style.borderLeftColor = 'var(--success)';
      if (iconEl) iconEl.textContent = '🟩';
    } else {
      balEl.textContent  = formatCurrency(0);
      balEl.style.color  = '';
      if (cardEl) cardEl.style.borderLeftColor = 'var(--gray-300)';
      if (iconEl) iconEl.textContent = '⚖️';
    }
  }
};

window.saveInceptionBalance = async function() {
  const data = {
    startDate:      document.getElementById('inc-start-date').value,
    notes:          document.getElementById('inc-notes').value.trim(),
    totalInvoice:   Number(document.getElementById('inc-total-invoice').value)   || 0,
    totalCollected: Number(document.getElementById('inc-total-collected').value) || 0,
    deviceDebt:     Number(document.getElementById('inc-device-debt').value)     || 0,
    devicePaid:     Number(document.getElementById('inc-device-paid').value)     || 0,
    updatedAt:      new Date().toISOString()
  };
  try {
    await setDoc(doc(db, 'settings', 'inception_balance'), data);
    inceptionData = data;
    showToast('Milad bilançosu kaydedildi.', 'success');
    updateInceptionSummary();
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  }
};

// =============================================
//  MODAL HELPERS
// =============================================
function openModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

window.closeModal = closeModal;

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// =============================================
//  SECURITY: XSS Prevention
// =============================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =============================================
//  INIT
// =============================================
// Uygulama giriş ekranından başlar; startListeners() selectRole() içinden çağrılır.

// =============================================
//  Firebase Konfigürasyonu
//  firebase.google.com adresinden projenizi
//  oluşturup aşağıdaki bilgileri doldurun.
// =============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc,
  addDoc, updateDoc, deleteDoc,
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
let deleteTargetId = null;

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

  // Patients
  onSnapshot(query(collection(db, 'patients'), orderBy('createdAt', 'desc')), snap => {
    allPatients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDashboard();
    renderPatients();
    renderOverdue();
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

    // Bu ay tahsilat (ödeme tarihine göre)
    if (p.installment1Date && getMonthYear(p.installment1Date) === monthKey) collectedMonth += i1;
    if (p.installment2Date && getMonthYear(p.installment2Date) === monthKey) collectedMonth += i2;

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
      <td class="amount">${formatCurrency(inv)}</td>
      <td>${formatDate(p.clincheckDate)}</td>
      <td class="${isOverdue ? 'amount-overdue' : ''}">${formatDate(p.dueDate)}</td>
      <td>
        ${i1 ? `<span class="amount-paid">${formatCurrency(i1)}</span>` : '—'}
        ${p.installment1Date ? `<br><small style="color:var(--gray-400)">${formatDate(p.installment1Date)}</small>` : ''}
      </td>
      <td>
        ${i2 ? `<span class="amount-paid">${formatCurrency(i2)}</span>` : '—'}
        ${p.installment2Date ? `<br><small style="color:var(--gray-400)">${formatDate(p.installment2Date)}</small>` : ''}
      </td>
      <td class="${remaining > 0 ? (isOverdue ? 'amount-overdue' : 'amount-remaining') : 'amount-paid'}">
        ${remaining > 0 ? formatCurrency(remaining) : '✓ Tamamlandı'}
      </td>
      <td class="amount-paid">${overpay > 0 ? formatCurrency(overpay) : '—'}</td>
      <td>${statusBadge(status)}</td>
      <td>
        <button class="btn-icon" title="Detay" onclick="showPatientDetail('${p.id}')">👁️</button>
        <button class="btn-icon" title="Düzenle" onclick="editPatient('${p.id}')">✏️</button>
        <button class="btn-icon" title="Sil" onclick="confirmDeletePatient('${p.id}')">🗑️</button>
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
        <div class="detail-item"><label>Fatura Tutarı</label><div class="detail-value">${formatCurrency(inv)}</div></div>
        <div class="detail-item"><label>Clincheck Onay Tarihi</label><div class="detail-value">${formatDate(p.clincheckDate)}</div></div>
        <div class="detail-item"><label>Vade Tarihi</label><div class="detail-value">${formatDate(p.dueDate)}</div></div>
        <div class="detail-item"><label>Durum</label><div class="detail-value">${statusBadge(status)}</div></div>
      </div>
    </div>
    <div class="detail-section">
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

document.getElementById('patient-form').addEventListener('submit', async e => {
  e.preventDefault();

  const sel = document.getElementById('f-package');
  const selOpt = sel.options[sel.selectedIndex];
  const packageId = sel.value;
  const packageName = selOpt ? selOpt.text.split(' —')[0] : '';

  const inv  = Number(document.getElementById('f-invoice-amount').value) || 0;
  const i1   = Number(document.getElementById('f-installment1-amount').value) || 0;
  const i2   = Number(document.getElementById('f-installment2-amount').value) || 0;

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
    installment1Date:     document.getElementById('f-installment1-date').value,
    installment2Amount:   i2,
    installment2Date:     document.getElementById('f-installment2-date').value,
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
  document.getElementById('f-installment1-date').value   = p.installment1Date || '';
  document.getElementById('f-installment2-amount').value = p.installment2Amount || '';
  document.getElementById('f-installment2-date').value   = p.installment2Date || '';

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

  // O ay tahsilat: taksit tarihi bu aya ait ödemeler (tüm hastalardan)
  let collectedThisMonth = 0;
  allPatients.forEach(p => {
    if (p.installment1Date && getMonthYear(p.installment1Date) === monthKey)
      collectedThisMonth += Number(p.installment1Amount) || 0;
    if (p.installment2Date && getMonthYear(p.installment2Date) === monthKey)
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
startListeners();
showPage('dashboard');

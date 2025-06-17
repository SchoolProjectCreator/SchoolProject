document.getElementById('clientForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const nameInput = document.getElementById('name');
  const loanInput = document.getElementById('loan');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const name = nameInput.value;
  const loan = Number(loanInput.value); // Convert to number
  const email = emailInput.value;
  const phone = phoneInput.value;

  // Send data to server and wait for response
  try {
    const response = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, loan, email, phone })
    });

    if (response.ok) {
      // Clear form fields
      nameInput.value = '';
      loanInput.value = '';
      emailInput.value = '';
      phoneInput.value = '';
      // Update client list and info
      loadClients();
    } else {
      const error = await response.json();
      alert('Failed to add client: ' + (error.error || 'Unknown error'));
      // Show error on page
      showError('Failed to add client: ' + (error.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Network or server error: ' + err.message);
    showError('Network or server error: ' + err.message);
  }
});

function showError(msg) {
  let errDiv = document.getElementById('errorMsg');
  if (!errDiv) {
    errDiv = document.createElement('div');
    errDiv.id = 'errorMsg';
    errDiv.style.color = 'red';
    errDiv.style.margin = '1em 0';
    document.querySelector('.add-client-section').appendChild(errDiv);
  }
  errDiv.textContent = msg;
  setTimeout(() => { errDiv.textContent = ''; }, 5000);
}

async function loadClients() {
  try {
    const res = await fetch('/api/clients');
    if (!res.ok) {
      throw new Error('Server returned status ' + res.status);
    }
    const text = await res.text();
    if (!text) {
      showError('No data received from server.');
      return;
    }
    let clients;
    try {
      clients = JSON.parse(text);
    } catch (e) {
      showError('Server returned invalid JSON.');
      return;
    }
    const tableBody = document.getElementById('clientTableBody');
    const search = document.getElementById('search').value.toLowerCase();
    tableBody.innerHTML = '';
    let total = 0;
    let totalOutstanding = 0;
    let filteredClients = clients.filter(c => c.name.toLowerCase().includes(search));
    filteredClients.forEach(c => {
      total += Number(c.loan);
      totalOutstanding += Number(c.loan) - (Number(c.repaid) || 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name}</td>
        <td>$${c.loan}</td>
        <td>$${c.repaid || 0}</td>
        <td>$${c.loan - (c.repaid || 0)}</td>
        <td>${c.email || ''}</td>
        <td>${c.phone || ''}</td>
        <td>${c.created_at}</td>
        <td class="actions"></td>
      `;
      // Floating bubble
      const bubble = document.createElement('div');
      bubble.className = 'floating-bubble';
      bubble.textContent = `Client: ${c.name}\nLoan: $${c.loan}\nRepaid: $${c.repaid || 0}\nOutstanding: $${c.loan - (c.repaid || 0)}\nEmail: ${c.email || ''}\nPhone: ${c.phone || ''}\nCreated: ${c.created_at}`;
      tr.appendChild(bubble);
      tr.onmousemove = e => {
        bubble.style.left = (e.clientX + 15) + 'px';
        bubble.style.top = (e.clientY - 10) + 'px';
      };
      tr.onmouseenter = () => { bubble.style.display = 'block'; };
      tr.onmouseleave = () => { bubble.style.display = 'none'; };
      const actionsTd = tr.querySelector('.actions');
      // Delete button
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        await fetch(`/api/clients/${c.id}`, { method: 'DELETE' });
        loadClients();
      };
      actionsTd.appendChild(delBtn);
      // Edit button
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit Loan';
      editBtn.onclick = async () => {
        const newLoan = prompt('Enter new loan amount:', c.loan);
        if (newLoan !== null) {
          await fetch(`/api/clients/${c.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: c.name, loan: newLoan, email: c.email, phone: c.phone })
          });
          loadClients();
        }
      };
      actionsTd.appendChild(editBtn);
      // Repay button
      const repayBtn = document.createElement('button');
      repayBtn.textContent = 'Repay';
      repayBtn.onclick = async () => {
        const amount = prompt('Enter repayment amount:', 0);
        if (amount !== null && !isNaN(Number(amount))) {
          await fetch(`/api/clients/${c.id}/repaid`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repaid: Number(amount) })
          });
          loadClients();
        }
      };
      actionsTd.appendChild(repayBtn);
      tableBody.appendChild(tr);
    });
    document.getElementById('clientCount').textContent = `Clients: ${filteredClients.length}`;
    document.getElementById('totalLoan').textContent = `Total Loan: $${total}`;
    document.getElementById('totalOutstanding').textContent = `Total Outstanding: $${totalOutstanding}`;
  } catch (err) {
    showError('Network or server error: ' + err.message);
  }
}

document.getElementById('search').addEventListener('input', loadClients);
window.onload = () => {
  loadClients();
  setInterval(loadClients, 5000); // Auto-update every 5 seconds
};

// Admin backup/restore UI logic
const backupBtn = document.getElementById('backupBtn');
const downloadBackupBtn = document.getElementById('downloadBackupBtn');
const restoreBtn = document.getElementById('restoreBtn');
const restoreFileInput = document.getElementById('restoreFileInput');
const restoreFileBtn = document.getElementById('restoreFileBtn');
const adminMsg = document.getElementById('adminMsg');

if (backupBtn && restoreBtn && adminMsg && downloadBackupBtn && restoreFileInput && restoreFileBtn) {
  backupBtn.onclick = async () => {
    adminMsg.textContent = 'Backing up...';
    try {
      const res = await fetch('/api/backup');
      const data = await res.json();
      if (data.success) {
        adminMsg.textContent = `Backup successful! ${data.count} clients exported.`;
        downloadBackupBtn.style.display = 'inline-block';
      } else {
        adminMsg.textContent = 'Backup failed: ' + (data.error || 'Unknown error');
      }
    } catch (e) {
      adminMsg.textContent = 'Backup failed: ' + e.message;
    }
  };
  downloadBackupBtn.onclick = () => {
    // Just let the browser handle the download
    downloadBackupBtn.style.display = 'none';
  };
  restoreBtn.onclick = async () => {
    if (!confirm('Are you sure you want to restore clients from backup? This may create duplicates.')) return;
    adminMsg.textContent = 'Restoring...';
    try {
      const res = await fetch('/api/restore', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        adminMsg.textContent = `Restore complete! Inserted: ${data.inserted}, Failed: ${data.failed}, Skipped: ${data.skipped}`;
        loadClients();
      } else {
        adminMsg.textContent = 'Restore failed: ' + (data.error || 'Unknown error');
      }
    } catch (e) {
      adminMsg.textContent = 'Restore failed: ' + e.message;
    }
  };
  restoreFileBtn.onclick = async () => {
    const file = restoreFileInput.files[0];
    if (!file) {
      adminMsg.textContent = 'Please select a JSON file to restore.';
      return;
    }
    adminMsg.textContent = 'Uploading and restoring...';
    const formData = new FormData();
    formData.append('backup', file);
    try {
      const res = await fetch('/api/restore/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        adminMsg.textContent = `Restore from file complete! Inserted: ${data.inserted}, Failed: ${data.failed}, Skipped: ${data.skipped}`;
        loadClients();
      } else {
        adminMsg.textContent = 'Restore from file failed: ' + (data.error || 'Unknown error');
      }
    } catch (e) {
      adminMsg.textContent = 'Restore from file failed: ' + e.message;
    }
  };
}

// Add client-side validation for add-client form
const clientForm = document.getElementById('clientForm');
if (clientForm) {
  clientForm.addEventListener('submit', function(e) {
    const name = document.getElementById('name').value.trim();
    const loan = Number(document.getElementById('loan').value);
    if (!name) {
      e.preventDefault();
      showError('Client name is required.');
      return false;
    }
    if (!loan || loan <= 0) {
      e.preventDefault();
      showError('Loan amount must be a positive number.');
      return false;
    }
  }, true);
}
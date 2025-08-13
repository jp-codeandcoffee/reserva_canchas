// Proteger ruta
if (!sessionStorage.getItem('admin')) {
  location.href = '/admin/login.html';
}

// Cargar reservas
function loadAdmin() {
  fetch('/api/admin/reservations', {
    headers: { Authorization: 'Bearer admin123' }
  })
    .then(r => {
      if (!r.ok) throw new Error('Error ' + r.status);
      return r.json();
    })
    .then(list => {
      const tbody = document.querySelector('#adminTable tbody');
      tbody.innerHTML = '';
      list.forEach(r => {
        tbody.innerHTML += `
          <tr>
            <td>${r.full_name}</td>
            <td>${r.field_name}</td>
            <td>${r.date}</td>
            <td>${r.start_time}</td>
            <td>${r.status}</td>
          </tr>`;
      });
    })
    .catch(err => {
      console.error(err);
      alert('No se pudo cargar el panel: ' + err.message);
    });
}

document.addEventListener('DOMContentLoaded', loadAdmin);

// Ejecutar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', loadAdmin);

// Salir
function logoutAdmin() {
  sessionStorage.removeItem('admin');
  location.href = '/admin/login.html';
}
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = document.getElementById('adminUser').value;
  const pass = document.getElementById('adminPass').value;

  // Credenciales simples (cámbialas después)
  if (user === 'admin' && pass === 'admin123') {
    sessionStorage.setItem('admin', true);
    location.href = '/admin/admin.html';
  } else {
    alert('Credenciales inválidas');
  }
});
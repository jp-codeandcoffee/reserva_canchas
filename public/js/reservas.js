const user = JSON.parse(localStorage.getItem('user'));
if (!user) location.href = '/login.html';
// Mostrar nombre del usuario
document.getElementById('userName').textContent = user.full_name;

// Cargar canchas
fetch('/api/fields')
  .then(r => r.json())
  .then(fields => {
    const select = document.getElementById('field_id');
    fields.forEach(f => select.innerHTML += `<option value="${f.id}">${f.name}</option>`);
  });

// Cargar reservas
function loadReservas() {
  fetch(`/api/reservations/${user.id}`)
    .then(r => r.json())
    .then(list => {
      const tbody = document.getElementById('reservasTable');
      tbody.innerHTML = '';

      const btn = document.getElementById('btnLimpiarHistorial');
      btn.classList.toggle('d-none', list.length === 0);

      list.forEach(async r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.field_name}</td>
          <td>${r.date}</td>
          <td>${r.start_time}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="cancelar(${r.id})">Cancelar</button>
          </td>`;
        tbody.appendChild(tr);

        // 🔹 Verificar si el pago está pendiente
        const pagoRes = await fetch(`/api/payments/by-reserva/${r.id}`);
        if (pagoRes.ok) {
          const pago = await pagoRes.json();
          if (pago && pago.estado === "pendiente") {
            // Mostrar botón de pago
            const btnPagar = document.getElementById("pagarNequiBtn");
            btnPagar.style.display = "inline-block";
            btnPagar.onclick = () => iniciarPagoExistente(pago.id);
          }
        }
      });
    });
}
 loadReservas();
// Reservar
// Reservar
document.getElementById('reservaForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const body = {
    user_id: user.id,
    field_id: document.getElementById('field_id').value,
    date: document.getElementById('date').value,
    start_time: document.getElementById('start_time').value,
    end_time: document.getElementById('start_time').value.replace(':', ':') + 1
  };

  const res = await fetch('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.status === 409) {
    const { error } = await res.json();
    alert(error);
    return;
  }

  if (!res.ok) {
    alert('Error al reservar');
    return;
  }

  // Obtener datos de la reserva creada
  const reserva = await res.json();

  // Iniciar flujo de pago simulado (monto fijo 20000 COP por ejemplo)
  iniciarPago(reserva.id, 20000);

  loadReservas();
});


// Cancelar reserva
function cancelar(id) {
  if (!confirm('¿Estás seguro de cancelar esta reserva?')) return;

  fetch(`/api/reservations/${id}`, { method: 'DELETE' })
    .then(res => {
      if (!res.ok) throw new Error('Error al cancelar');
      return res.json();
    })
    .then(() => {
      const aviso = document.getElementById('aviso-cancelacion');
      aviso.classList.remove('d-none');
      setTimeout(() => aviso.classList.add('d-none'), 3000);
      loadReservas();
    })
    .catch(() => alert('No se pudo cancelar la reserva.'));
}

// Limpiar historial
document.getElementById('btnLimpiarHistorial')?.addEventListener('click', async () => {
  const confirmar = confirm('¿Estás seguro de borrar todo tu historial de reservas? Esta acción no se puede deshacer.');
  if (!confirmar) return;

  const res = await fetch(`/api/history/${user.id}`, { method: 'DELETE' });
  if (res.ok) {
    alert('Historial borrado correctamente');
    loadReservas();
  } else {
    alert('Error al borrar historial');
  }
});

function logout() {
  localStorage.removeItem('user');
  location.href = '/login.html';
}

// ----------------------
// Función para pago simulado Nequi
// ----------------------
async function iniciarPago(reservaId, monto) {
  const res = await fetch("/api/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reserva_id: reservaId, monto: monto })
  });
  const data = await res.json();
  if (data.payment_id) {
      const btn = document.getElementById("pagarNequiBtn");
      btn.style.display = "inline-block";
      btn.onclick = async () => {
          const confirmRes = await fetch(`/api/payments/confirm/${data.payment_id}`, {
              method: "POST"
          });
          const confirmData = await confirmRes.json();
          alert("✅ Pago confirmado con Nequi (Simulado)");
          btn.style.display = "none";
      };
  }
}
async function iniciarPagoExistente(paymentId) {
  const confirmRes = await fetch(`/api/payments/confirm/${paymentId}`, {
      method: "POST"
  });
  const confirmData = await confirmRes.json();
  alert("✅ Pago confirmado con Nequi (Simulado)");
  document.getElementById("pagarNequiBtn").style.display = "none";
  loadReservas();
}

self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification('Reserva recordada', {
    body: data.message,
    icon: '/icon.png'
  });
});
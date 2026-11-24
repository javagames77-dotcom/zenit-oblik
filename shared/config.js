// Настройки фронта «Зеніт-Авто.облік»
// MOCK: true  — данные в браузере (заглушки), кроме того, что перечислено в LIVE.
// MOCK: false — все вызовы уходят на вебхуки n8n по адресу API_BASE.
window.ZA_CONFIG = {
  MOCK: true,
  // Что уже подключено к n8n (остальное пока на заглушках):
  LIVE: ['time', 'admin.login', 'admin.me', 'admin.logout', 'admin.password'],
  ADMIN_URL: '../admin/index.html',   // ссылка «вам в адмінку» с телефона
  API_BASE: 'https://primary-production-4b93e.up.railway.app/webhook/zenit-oblik',
  QR_TTL_SEC: 45,          // порог «живого» кода, сек
  QR_REFRESH_SEC: 10,      // как часто PWA сотрудника перерисовывает QR
  DUP_WINDOW_SEC: 60,      // повторный скан того же сотрудника на том же сканере игнорируется
  RESULT_SHOW_SEC: 3,      // сколько секунд сканер показывает результат
  PING_SEC: 300,           // сигнал «я на связи» от сканера
  DEFAULT_LANG: 'uk'
};

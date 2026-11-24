// Настройки фронта «Зеніт-Авто.облік»
// MOCK: true  — все данные живут в браузере (localStorage), сервер не нужен.
// MOCK: false — все вызовы уходят на вебхуки n8n по адресу API_BASE.
window.ZA_CONFIG = {
  MOCK: true,
  API_BASE: 'https://n8n.example.com/webhook/oblik',  // заменить на свой адрес n8n
  QR_TTL_SEC: 45,          // порог «живого» кода, сек
  QR_REFRESH_SEC: 10,      // как часто PWA сотрудника перерисовывает QR
  DUP_WINDOW_SEC: 60,      // повторный скан того же сотрудника на том же сканере игнорируется
  RESULT_SHOW_SEC: 3,      // сколько секунд сканер показывает результат
  PING_SEC: 300,           // сигнал «я на связи» от сканера
  DEFAULT_LANG: 'uk'
};

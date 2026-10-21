/**
 * Initial translations for navigation and common UI only. Every locale is
 * flagged `needsReview`: these must be reviewed by a native speaker before
 * release. Billing, legal and policy text is intentionally NOT translated here
 * (falls back to English) until professionally reviewed.
 */
type Partial = {
  needsReview: true;
  common: Record<string, string>;
  nav: Record<string, string | Record<string, string>>;
};

const p = (
  common: [save: string, cancel: string, del: string, edit: string, add: string, close: string, retry: string, loading: string, offline: string, saved: string, language: string, active: string, inactive: string],
  nav: [overview: string, locations: string, rules: string, zones: string, simulator: string, checkout: string, logs: string, billing: string, settings: string, help: string, live: string, notLive: string],
): Partial => ({
  needsReview: true,
  common: {
    save: common[0],
    saveChanges: common[0],
    cancel: common[1],
    delete: common[2],
    edit: common[3],
    add: common[4],
    close: common[5],
    retry: common[6],
    loading: common[7],
    offline: common[8],
    saved: common[9],
    language: common[10],
    active: common[11],
    inactive: common[12],
  },
  nav: {
    overview: nav[0],
    locations: nav[1],
    rules: nav[2],
    zones: nav[3],
    simulator: nav[4],
    checkout: nav[5],
    logs: nav[6],
    billing: nav[7],
    settings: nav[8],
    help: nav[9],
    status: { live: nav[10], paused: nav[11] },
  },
});

export const partialLocales: Record<string, Partial> = {
  es: p(
    ['Guardar', 'Cancelar', 'Eliminar', 'Editar', 'Añadir', 'Cerrar', 'Reintentar', 'Cargando…', 'Sin conexión. Guardar no está disponible hasta que vuelva la conexión.', 'Guardado', 'Idioma', 'Activo', 'Inactivo'],
    ['Resumen', 'Ubicaciones', 'Reglas de precio', 'Zonas de entrega', 'Simulador de tarifas', 'Integración con el checkout', 'Cálculos y registros', 'Facturación', 'Configuración', 'Ayuda', 'Activo en el checkout', 'No activo'],
  ),
  pt: p(
    ['Salvar', 'Cancelar', 'Excluir', 'Editar', 'Adicionar', 'Fechar', 'Tentar novamente', 'Carregando…', 'Você está offline. Salvar fica indisponível até a conexão voltar.', 'Salvo', 'Idioma', 'Ativo', 'Inativo'],
    ['Visão geral', 'Locais', 'Regras de preço', 'Zonas de entrega', 'Simulador de frete', 'Integração com o checkout', 'Cálculos e registros', 'Cobrança', 'Configurações', 'Ajuda', 'Ativo no checkout', 'Inativo'],
  ),
  fr: p(
    ['Enregistrer', 'Annuler', 'Supprimer', 'Modifier', 'Ajouter', 'Fermer', 'Réessayer', 'Chargement…', 'Vous êtes hors ligne. L’enregistrement est indisponible jusqu’au retour de la connexion.', 'Enregistré', 'Langue', 'Actif', 'Inactif'],
    ['Vue d’ensemble', 'Adresses d’expédition', 'Règles de tarification', 'Zones de livraison', 'Simulateur de tarifs', 'Intégration au paiement', 'Calculs et journaux', 'Facturation', 'Paramètres', 'Aide', 'Actif au paiement', 'Inactif'],
  ),
  de: p(
    ['Speichern', 'Abbrechen', 'Löschen', 'Bearbeiten', 'Hinzufügen', 'Schließen', 'Erneut versuchen', 'Wird geladen…', 'Du bist offline. Speichern ist erst wieder möglich, wenn die Verbindung zurück ist.', 'Gespeichert', 'Sprache', 'Aktiv', 'Inaktiv'],
    ['Übersicht', 'Standorte', 'Preisregeln', 'Liefergebiete', 'Tarifsimulator', 'Checkout-Integration', 'Berechnungen & Protokolle', 'Abrechnung', 'Einstellungen', 'Hilfe', 'Im Checkout aktiv', 'Nicht aktiv'],
  ),
  it: p(
    ['Salva', 'Annulla', 'Elimina', 'Modifica', 'Aggiungi', 'Chiudi', 'Riprova', 'Caricamento…', 'Sei offline. Il salvataggio non è disponibile finché la connessione non torna.', 'Salvato', 'Lingua', 'Attivo', 'Inattivo'],
    ['Panoramica', 'Sedi', 'Regole di prezzo', 'Zone di consegna', 'Simulatore tariffe', 'Integrazione checkout', 'Calcoli e log', 'Fatturazione', 'Impostazioni', 'Aiuto', 'Attivo al checkout', 'Non attivo'],
  ),
  nl: p(
    ['Opslaan', 'Annuleren', 'Verwijderen', 'Bewerken', 'Toevoegen', 'Sluiten', 'Opnieuw proberen', 'Laden…', 'Je bent offline. Opslaan is niet mogelijk tot de verbinding terug is.', 'Opgeslagen', 'Taal', 'Actief', 'Inactief'],
    ['Overzicht', 'Locaties', 'Prijsregels', 'Bezorgzones', 'Tariefsimulator', 'Checkout-integratie', 'Berekeningen en logs', 'Facturering', 'Instellingen', 'Help', 'Actief bij checkout', 'Niet actief'],
  ),
  pl: p(
    ['Zapisz', 'Anuluj', 'Usuń', 'Edytuj', 'Dodaj', 'Zamknij', 'Spróbuj ponownie', 'Ładowanie…', 'Jesteś offline. Zapisywanie będzie możliwe po przywróceniu połączenia.', 'Zapisano', 'Język', 'Aktywna', 'Nieaktywna'],
    ['Przegląd', 'Lokalizacje', 'Reguły cenowe', 'Strefy dostaw', 'Symulator stawek', 'Integracja z kasą', 'Obliczenia i logi', 'Płatności', 'Ustawienia', 'Pomoc', 'Aktywne w kasie', 'Nieaktywne'],
  ),
  tr: p(
    ['Kaydet', 'İptal', 'Sil', 'Düzenle', 'Ekle', 'Kapat', 'Tekrar dene', 'Yükleniyor…', 'Çevrimdışısınız. Bağlantı geri gelene kadar kaydetme kullanılamaz.', 'Kaydedildi', 'Dil', 'Etkin', 'Devre dışı'],
    ['Genel bakış', 'Konumlar', 'Fiyat kuralları', 'Teslimat bölgeleri', 'Ücret simülatörü', 'Ödeme entegrasyonu', 'Hesaplamalar ve kayıtlar', 'Faturalandırma', 'Ayarlar', 'Yardım', 'Ödemede etkin', 'Etkin değil'],
  ),
  ru: p(
    ['Сохранить', 'Отмена', 'Удалить', 'Изменить', 'Добавить', 'Закрыть', 'Повторить', 'Загрузка…', 'Нет подключения. Сохранение недоступно до восстановления связи.', 'Сохранено', 'Язык', 'Активно', 'Неактивно'],
    ['Обзор', 'Точки отправки', 'Правила цен', 'Зоны доставки', 'Симулятор тарифов', 'Интеграция с оформлением заказа', 'Расчёты и журнал', 'Оплата', 'Настройки', 'Справка', 'Активно при оформлении', 'Не активно'],
  ),
  uk: p(
    ['Зберегти', 'Скасувати', 'Видалити', 'Редагувати', 'Додати', 'Закрити', 'Спробувати ще раз', 'Завантаження…', 'Немає з’єднання. Збереження недоступне, доки зв’язок не відновиться.', 'Збережено', 'Мова', 'Активне', 'Неактивне'],
    ['Огляд', 'Точки відправлення', 'Правила цін', 'Зони доставки', 'Симулятор тарифів', 'Інтеграція з оформленням', 'Розрахунки та журнал', 'Оплата', 'Налаштування', 'Довідка', 'Активно при оформленні', 'Не активно'],
  ),
  ar: p(
    ['حفظ', 'إلغاء', 'حذف', 'تعديل', 'إضافة', 'إغلاق', 'إعادة المحاولة', 'جارٍ التحميل…', 'أنت غير متصل. الحفظ غير متاح حتى يعود الاتصال.', 'تم الحفظ', 'اللغة', 'نشط', 'غير نشط'],
    ['نظرة عامة', 'المواقع', 'قواعد التسعير', 'مناطق التوصيل', 'محاكي الأسعار', 'التكامل مع الدفع', 'الحسابات والسجلات', 'الفوترة', 'الإعدادات', 'المساعدة', 'مفعّل عند الدفع', 'غير مفعّل'],
  ),
  he: p(
    ['שמירה', 'ביטול', 'מחיקה', 'עריכה', 'הוספה', 'סגירה', 'ניסיון חוזר', 'טוען…', 'אין חיבור. השמירה לא זמינה עד שהחיבור יחזור.', 'נשמר', 'שפה', 'פעיל', 'לא פעיל'],
    ['סקירה כללית', 'מיקומים', 'כללי תמחור', 'אזורי משלוח', 'סימולטור תעריפים', 'שילוב בקופה', 'חישובים ויומנים', 'חיוב', 'הגדרות', 'עזרה', 'פעיל בקופה', 'לא פעיל'],
  ),
  ja: p(
    ['保存', 'キャンセル', '削除', '編集', '追加', '閉じる', '再試行', '読み込み中…', 'オフラインです。接続が戻るまで保存できません。', '保存しました', '言語', '有効', '無効'],
    ['概要', '出荷拠点', '料金ルール', '配達エリア', '料金シミュレーター', 'チェックアウト連携', '計算とログ', '請求', '設定', 'ヘルプ', 'チェックアウトで有効', '無効'],
  ),
  ko: p(
    ['저장', '취소', '삭제', '편집', '추가', '닫기', '다시 시도', '로드 중…', '오프라인 상태입니다. 연결이 복구될 때까지 저장할 수 없습니다.', '저장됨', '언어', '활성', '비활성'],
    ['개요', '출고지', '요금 규칙', '배송 구역', '요금 시뮬레이터', '결제 연동', '계산 및 로그', '결제', '설정', '도움말', '결제 시 활성', '비활성'],
  ),
  'zh-CN': p(
    ['保存', '取消', '删除', '编辑', '添加', '关闭', '重试', '加载中…', '您已离线。恢复连接前无法保存。', '已保存', '语言', '已启用', '未启用'],
    ['概览', '发货地点', '定价规则', '配送区域', '运费模拟器', '结账集成', '计算与日志', '账单', '设置', '帮助', '结账时已启用', '未启用'],
  ),
  'zh-TW': p(
    ['儲存', '取消', '刪除', '編輯', '新增', '關閉', '重試', '載入中…', '您已離線。恢復連線前無法儲存。', '已儲存', '語言', '已啟用', '未啟用'],
    ['總覽', '出貨地點', '定價規則', '配送區域', '運費模擬器', '結帳整合', '計算與記錄', '帳單', '設定', '說明', '結帳時已啟用', '未啟用'],
  ),
  hi: p(
    ['सहेजें', 'रद्द करें', 'हटाएँ', 'संपादित करें', 'जोड़ें', 'बंद करें', 'फिर से कोशिश करें', 'लोड हो रहा है…', 'आप ऑफ़लाइन हैं। कनेक्शन लौटने तक सहेजना उपलब्ध नहीं है।', 'सहेजा गया', 'भाषा', 'सक्रिय', 'निष्क्रिय'],
    ['अवलोकन', 'स्थान', 'मूल्य नियम', 'डिलीवरी ज़ोन', 'दर सिम्युलेटर', 'चेकआउट इंटीग्रेशन', 'गणनाएँ और लॉग', 'बिलिंग', 'सेटिंग्स', 'सहायता', 'चेकआउट पर सक्रिय', 'सक्रिय नहीं'],
  ),
  id: p(
    ['Simpan', 'Batal', 'Hapus', 'Edit', 'Tambah', 'Tutup', 'Coba lagi', 'Memuat…', 'Anda sedang offline. Penyimpanan tidak tersedia sampai koneksi kembali.', 'Tersimpan', 'Bahasa', 'Aktif', 'Nonaktif'],
    ['Ringkasan', 'Lokasi', 'Aturan harga', 'Zona pengiriman', 'Simulator tarif', 'Integrasi checkout', 'Perhitungan & log', 'Penagihan', 'Pengaturan', 'Bantuan', 'Aktif di checkout', 'Tidak aktif'],
  ),
  sv: p(
    ['Spara', 'Avbryt', 'Ta bort', 'Redigera', 'Lägg till', 'Stäng', 'Försök igen', 'Laddar…', 'Du är offline. Det går inte att spara förrän anslutningen är tillbaka.', 'Sparat', 'Språk', 'Aktiv', 'Inaktiv'],
    ['Översikt', 'Platser', 'Prisregler', 'Leveranszoner', 'Fraktsimulator', 'Kassaintegration', 'Beräkningar och loggar', 'Fakturering', 'Inställningar', 'Hjälp', 'Aktiv i kassan', 'Inte aktiv'],
  ),
};

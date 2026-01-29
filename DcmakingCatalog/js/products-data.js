/**
 * Product catalog data - EN / RU / HE
 * Used by product.html and products listing.
 */
const PRODUCTS_DATA = {
  en: [
    {
      id: 'door-controller',
      name: 'Door Controller',
      category: 'controllers',
      price: '₪1000',
      shortDesc: 'Optimized solution for two-door gateways, suited for changing rooms, material gates (MAL), and personnel gates (PAL).',
      description: 'Doors Controller is an optimized solution for two-door gateways, perfectly suited for changing rooms, material gates (MAL), and personnel gates (PAL), where doors are often left open.\n\nKey Features:\n1. Door Management: Supports manual swing and sliding doors, as well as pass-through gates with constant ventilation.\n2. Compatibility: Can manage any fail-safe electric locks operating on 24 V DC.\n3. Ease of Installation: Plug-and-play system ensures easy integration into two-door gateways.\n4. Intelligent Logic: The microcontroller automatically activates room logic, blocking one door when the other is open. The controller offers four built-in logic modes that can be quickly configured using DIP switches on the board.\n5. Anomaly Management: Includes alarms for an open door left ajar, forced opening, and simultaneous opening.\n6. User Controls: The door unlock button is located on the door indicator panel. Additionally, a status indicator light for the door is situated on the indicator panel. This solution ensures safety and convenience in commercial and public settings.',
      specs: ['Power: 24Vdc by 220-230 Vac, 50 Hz fed external power pack', 'Case: 115x90x40 mm plastic case', 'Connections: Power 2.1 jack, Door connection RJ-45', 'Doors managed: 2 doors'],
      docs: [
        { label: 'Door controller instructions.pdf', url: 'https://files.cdn-files-a.com/uploads/6906330/normal_65439a7c70f85.pdf' },
        { label: 'Pinout diagram.pdf', url: 'https://files.cdn-files-a.com/uploads/6906330/normal_6708fd787f7af.pdf' }
      ],
      image: '../img/door-controller.jpg'
    },
    {
      id: 'electric-bolt',
      name: 'Electric bolt',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'Solenoid lock for internal installation in the door frame, with built-in door status sensor.',
      description: 'The solenoid lock is used to lock the door. The rod extends when voltage is applied to the solenoid. The solenoid lock is designed for internal installation in the door frame. It consists of two parts: a solenoid lock with a built-in door status sensor and a strike plate with a magnet. The door status sensor is normally open (NO), i.e. when the strike plate with a magnet approaches it, the sensor closes; in the normal position, the door status sensor is open.',
      specs: [],
      docs: [],
      image: '../img/electric-bolt.jpg'
    },
    {
      id: 'the-membrane-traffic-light-narrow',
      name: 'The membrane traffic light (narrow)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'Designed for mounting on the door frame profile by gluing. Flat membrane cable, 5-PIN connector, RJ-45 to controller.',
      description: 'The membrane traffic light (narrow) is designed for mounting on the door frame profile. Mounting is done by gluing the membrane with the sticky side to the door frame. The flat membrane cable is connected to the adapter board using a 5-PIN connector, which has an RJ-45 connector for connecting to the controller.',
      specs: [],
      docs: [],
      image: '../img/the-membrane-traffic-light-narrow.jpg'
    },
    {
      id: 'the-traffic-light-narrow',
      name: 'The traffic light (narrow)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'For door frame profile mounting. Two screws, cable with RJ-45 to controller.',
      description: 'The traffic light (narrow) is designed for mounting on the door frame profile. Mounting is done by screwing two screws to the door frame in a prepared niche in the profile. The traffic light is connected to the controller using a cable with an RJ-45 connector.',
      specs: [],
      docs: [],
      image: '../img/the-traffic-light-narrow.jpg'
    },
    {
      id: 'the-traffic-light-membrane-wide',
      name: 'The traffic light membrane (wide)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'Wall mounting. Gluing, flat cable, 5-PIN connector, RJ-45 to controller.',
      description: 'The traffic light membrane (wide) is designed for wall mounting. Installation is performed by gluing the membrane to the wall with the adhesive side. The membrane\'s flat cable is connected to the adapter board using a 5-PIN connector, which has an RJ-45 connector for connecting to the controller.',
      specs: [],
      docs: [],
      image: '../img/the-traffic-light-membrane-wide.jpg'
    },
    {
      id: 'expansion-board-for-sliding-doors',
      name: 'Expansion board for sliding doors',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'Controls sliding or roller doors (e.g. Dortec or Tadiran). Connected to controller by cable with RJ-45.',
      description: 'The expansion board is used to control sliding or roller doors. For example, Dortec or Tadiran. The board is connected to the controller by a cable with RJ-45 connectors.',
      specs: [],
      docs: [],
      image: '../img/expansion-board-for-sliding-doors.jpg'
    },
    {
      id: 'expansion-board-for-electromagnet',
      name: 'Expansion board for electromagnet',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'Controls doors with electromagnet. Connected to controller via cable with RJ-45 connectors.',
      description: 'The expansion board is used to control doors with an electromagnet. The board is connected to the controller via a cable with RJ-45 connectors.',
      specs: [],
      docs: [],
      image: '../img/expansion-board-for-electromagnet.jpg'
    }
  ],
  ru: [
    {
      id: 'door-controller',
      name: 'Контроллер дверей',
      category: 'controllers',
      price: '₪1000',
      shortDesc: 'Оптимизированное решение для двухдверных проходов: раздевалки, материальные (MAL) и персонал (PAL) шлюзы.',
      description: 'Контроллер дверей — оптимизированное решение для двухдверных проходов: раздевалки, материальные (MAL) и персонал (PAL) шлюзы, где двери часто остаются открытыми.\n\nОсновные возможности:\n1. Управление дверями: распашные и раздвижные двери, проходы с постоянной вентиляцией.\n2. Совместимость: любые fail-safe электрозамки на 24 В постоянного тока.\n3. Установка: plug-and-play, простая интеграция.\n4. Логика: микроконтроллер блокирует одну дверь при открытой другой, четыре режима, настройка DIP-переключателями.\n5. Аномалии: сигналы при приоткрытой двери, принудительном и одновременном открытии.\n6. Управление: кнопка разблокировки и индикатор на панели. Безопасность и удобство в коммерческих и общественных помещениях.',
      specs: ['Питание: 24 В пост. от внешнего БП 220–230 В, 50 Гц', 'Корпус: пластик 115×90×40 мм', 'Подключение: питание 2.1 jack, двери RJ-45', 'Управление: 2 двери'],
      docs: [
        { label: 'Инструкция контроллера дверей.pdf', url: 'https://files.cdn-files-a.com/uploads/6906330/normal_65439a7c70f85.pdf' },
        { label: 'Схема выводов.pdf', url: 'https://files.cdn-files-a.com/uploads/6906330/normal_6708fd787f7af.pdf' }
      ],
      image: '../img/door-controller.jpg'
    },
    {
      id: 'electric-bolt',
      name: 'Электрозащёлка',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'Соленоидный замок для установки в дверную коробку, со встроенным датчиком состояния двери.',
      description: 'Соленоидный замок запирает дверь; шток выдвигается при подаче напряжения. Предназначен для внутренней установки в коробку. Две части: замок со встроенным датчиком состояния двери и ответная планка с магнитом. Датчик нормально разомкнут (NO): замыкается при приближении планки с магнитом.',
      specs: [],
      docs: [],
      image: '../img/electric-bolt.jpg'
    },
    {
      id: 'the-membrane-traffic-light-narrow',
      name: 'Мембранный светофор (узкий)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'Установка на профиль коробки наклейкой. Плоский кабель, разъём 5-PIN, RJ-45 к контроллеру.',
      description: 'Мембранный светофор (узкий) для крепления на профиль дверной коробки. Монтаж — наклейкой. Плоский кабель подключается к адаптеру разъёмом 5-PIN с RJ-45 для связи с контроллером.',
      specs: [],
      docs: [],
      image: '../img/the-membrane-traffic-light-narrow.jpg'
    },
    {
      id: 'the-traffic-light-narrow',
      name: 'Светофор (узкий)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'Крепление на профиль коробки двумя винтами. Кабель с RJ-45 к контроллеру.',
      description: 'Светофор (узкий) для монтажа на профиль дверной коробки в подготовленную нишу. Крепление двумя винтами. Подключение к контроллеру кабелем с RJ-45.',
      specs: [],
      docs: [],
      image: '../img/the-traffic-light-narrow.jpg'
    },
    {
      id: 'the-traffic-light-membrane-wide',
      name: 'Мембранный светофор (широкий)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'Настенный монтаж наклейкой. Плоский кабель, 5-PIN, RJ-45 к контроллеру.',
      description: 'Мембранный светофор (широкий) для настенного монтажа. Установка наклейкой. Плоский кабель подключается к адаптеру разъёмом 5-PIN с RJ-45 к контроллеру.',
      specs: [],
      docs: [],
      image: '../img/the-traffic-light-membrane-wide.jpg'
    },
    {
      id: 'expansion-board-for-sliding-doors',
      name: 'Плата расширения для раздвижных дверей',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'Управление раздвижными и роллетными дверями (например Dortec, Tadiran). Подключение к контроллеру кабелем RJ-45.',
      description: 'Плата расширения для управления раздвижными и роллетными дверями (Dortec, Tadiran и др.). Подключение к контроллеру кабелем с разъёмами RJ-45.',
      specs: [],
      docs: [],
      image: '../img/expansion-board-for-sliding-doors.jpg'
    },
    {
      id: 'expansion-board-for-electromagnet',
      name: 'Плата расширения для электромагнита',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'Управление дверями с электромагнитом. Подключение к контроллеру кабелем RJ-45.',
      description: 'Плата расширения для управления дверями с электромагнитом. Подключение к контроллеру кабелем с разъёмами RJ-45.',
      specs: [],
      docs: [],
      image: '../img/expansion-board-for-electromagnet.jpg'
    }
  ],
  he: [
    {
      id: 'door-controller',
      name: 'בקר דלתות',
      category: 'controllers',
      price: '₪1000',
      shortDesc: 'פתרון מותאם למעברי זוג דלתות: חדרי החלפה, שערי חומר (MAL) ואנשי (PAL).',
      description: 'בקר הדלתות הוא פתרון מותאם למעברי זוג דלתות: חדרי החלפה, שערי חומר (MAL) ואנשי (PAL), כאשר הדלתות לעיתים נשארות פתוחות.\n\nתכונות עיקריות:\n1. ניהול דלתות: דלתות נדנדה והחלקה, מעברים עם אוורור קבוע.\n2. תאימות: מנעולים חשמליים fail-safe 24V DC.\n3. התקנה: plug-and-play.\n4. לוגיקה: חסימת דלת אחת כשהשנייה פתוחה, ארבע מצבים, DIP על הלוח.\n5. חריגות: התראות לדלת פתוחה, פתיחה כפויה simultan.\n6. שליטה: כפתור פתיחה ומנורת סטטוס בלוח. בטיחות ונוחות בסביבה מסחרית וציבורית.',
      specs: ['חשמל: 24Vdc ממקור חיצוני 220-230 Vac 50 Hz', 'מארז: פלסטיק 115x90x40 mm', 'חיבורים: חשמל 2.1 jack, דלת RJ-45', 'דלתות מנוהלות: 2'],
      docs: [
        { label: 'הוראות בקר דלתות.pdf', url: 'https://files.cdn-files-a.com/uploads/6906330/normal_65439a7c70f85.pdf' },
        { label: 'תרשים פינים.pdf', url: 'https://files.cdn-files-a.com/uploads/6906330/normal_6708fd787f7af.pdf' }
      ],
      image: '../img/door-controller.jpg'
    },
    {
      id: 'electric-bolt',
      name: 'בריח חשמלי',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'מנעול סולנואיד להתקנה בתוך מסגרת הדלת, עם חיישן סטטוס דלת מובנה.',
      description: 'מנעול הסולנואיד משמש לנעילת הדלת. הבריח נכנס כשמופעל מתח. מותאם להתקנה פנימית במסגרת. שני חלקים: מנעול עם חיישן סטטוס דלת ותושבת עם מגנט. החיישן NO – נסגר כשהתושבת מתקרבת.',
      specs: [],
      docs: [],
      image: '../img/electric-bolt.jpg'
    },
    {
      id: 'the-membrane-traffic-light-narrow',
      name: 'רמזור ממברנה (צר)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'התקנה על פרופיל המסגרת בהדבקה. כבל שטוח, 5-PIN, RJ-45 לבקר.',
      description: 'רמזור הממברנה (צר) לפרופיל מסגרת הדלת. התקנה בהדבקה. כבל השטוח מתחבר ללוח אדפטור ב-5-PIN עם RJ-45 לבקר.',
      specs: [],
      docs: [],
      image: '../img/the-membrane-traffic-light-narrow.jpg'
    },
    {
      id: 'the-traffic-light-narrow',
      name: 'רמזור (צר)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'התקנה על פרופיל בשני ברגים. כבל RJ-45 לבקר.',
      description: 'רמזור (צר) לפרופיל מסגרת הדלת. התקנה בשני ברגים בנישה. חיבור לבקר בכבל RJ-45.',
      specs: [],
      docs: [],
      image: '../img/the-traffic-light-narrow.jpg'
    },
    {
      id: 'the-traffic-light-membrane-wide',
      name: 'רמזור ממברנה (רחב)',
      category: 'accessories',
      price: '₪200',
      shortDesc: 'התקנה על הקיר בהדבקה. כבל שטוח, 5-PIN, RJ-45 לבקר.',
      description: 'רמזור ממברנה (רחב) להתקנה על הקיר. התקנה בהדבקה. כבל שטוח מתחבר ללוח אדפטור ב-5-PIN עם RJ-45 לבקר.',
      specs: [],
      docs: [],
      image: '../img/the-traffic-light-membrane-wide.jpg'
    },
    {
      id: 'expansion-board-for-sliding-doors',
      name: 'לוח הרחבה לדלתות הזזה',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'שליטה בדלתות הזזה/גלילה (למשל Dortec, Tadiran). חיבור לבקר בכבל RJ-45.',
      description: 'לוח ההרחבה לשליטה בדלתות הזזה וגלילה (Dortec, Tadiran). מתחבר לבקר בכבל RJ-45.',
      specs: [],
      docs: [],
      image: '../img/expansion-board-for-sliding-doors.jpg'
    },
    {
      id: 'expansion-board-for-electromagnet',
      name: 'לוח הרחבה לאלקטרומגנט',
      category: 'accessories',
      price: '₪300',
      shortDesc: 'שליטה בדלתות עם אלקטרומגנט. חיבור לבקר בכבל RJ-45.',
      description: 'לוח ההרחבה לשליטה בדלתות עם אלקטרומגנט. מתחבר לבקר בכבל RJ-45.',
      specs: [],
      docs: [],
      image: '../img/expansion-board-for-electromagnet.jpg'
    }
  ]
};

/** UI labels per language */
const UI_LABELS = {
  en: {
    navHome: 'Home',
    navProducts: 'Products',
    navAbout: 'About Us',
    navContact: 'Contact',
    heroTitle: 'DCM – Doors Control Making',
    heroSub: 'Development and production of electronic locking systems for clean rooms.',
    requestProduct: 'Request this product',
    allProducts: 'All products',
    categoryControllers: 'Controllers',
    categoryAccessories: 'Accessories',
    aboutTitle: 'About Us',
    contactTitle: 'Contact',
    contactFindUs: 'Find us',
    address: 'Haifa, Israel',
    email: 'Email',
    phone: 'Phone',
    sendRequest: 'Send request',
    cancel: 'Cancel',
    formName: 'Your name',
    formEmail: 'Email',
    formPhone: 'Phone',
    formMessage: 'Message',
    formProduct: 'Product',
    breadcrumbHome: 'Home',
    breadcrumbProducts: 'Products',
    breadcrumbProduct: 'Product',
    noProduct: 'Product not found.',
    backToProducts: 'Back to products'
  },
  ru: {
    navHome: 'Главная',
    navProducts: 'Товары',
    navAbout: 'О нас',
    navContact: 'Контакты',
    heroTitle: 'DCM – Системы контроля доступа',
    heroSub: 'Разработка и производство электронных систем запирания для чистых помещений.',
    requestProduct: 'Запросить этот товар',
    allProducts: 'Все товары',
    categoryControllers: 'Контроллеры',
    categoryAccessories: 'Аксессуары',
    aboutTitle: 'О нас',
    contactTitle: 'Контакты',
    contactFindUs: 'Как нас найти',
    address: 'Хайфа, Израиль',
    email: 'Email',
    phone: 'Телефон',
    sendRequest: 'Отправить запрос',
    cancel: 'Отмена',
    formName: 'Ваше имя',
    formEmail: 'Email',
    formPhone: 'Телефон',
    formMessage: 'Сообщение',
    formProduct: 'Товар',
    breadcrumbHome: 'Главная',
    breadcrumbProducts: 'Товары',
    breadcrumbProduct: 'Товар',
    noProduct: 'Товар не найден.',
    backToProducts: 'К списку товаров'
  },
  he: {
    navHome: 'בית',
    navProducts: 'מוצרים',
    navAbout: 'אודות',
    navContact: 'צור קשר',
    heroTitle: 'DCM – Doors Control Making',
    heroSub: 'פיתוח וייצור מערכות נעילה אלקטרוניות לחדרים נקיים.',
    requestProduct: 'לבקש מוצר זה',
    allProducts: 'כל המוצרים',
    categoryControllers: 'בקרים',
    categoryAccessories: 'אביזרים',
    aboutTitle: 'אודותינו',
    contactTitle: 'צור קשר',
    contactFindUs: 'איך למצוא אותנו',
    address: 'חיפה, ישראל',
    email: 'אימייל',
    phone: 'טלפון',
    sendRequest: 'שליחת בקשה',
    cancel: 'ביטול',
    formName: 'שמך',
    formEmail: 'אימייל',
    formPhone: 'טלפון',
    formMessage: 'הודעה',
    formProduct: 'מוצר',
    breadcrumbHome: 'בית',
    breadcrumbProducts: 'מוצרים',
    breadcrumbProduct: 'מוצר',
    noProduct: 'המוצר לא נמצא.',
    backToProducts: 'חזרה למוצרים'
  }
};

function getLang() {
  var pathname = window.location.pathname || '';
  var m = pathname.match(/\/(en|ru|he)(?:\/|$)/);
  return m ? m[1] : 'en';
}

function getProducts(lang) {
  return PRODUCTS_DATA[lang] || PRODUCTS_DATA.en;
}

function getProductById(lang, id) {
  return getProducts(lang).find(function (p) { return p.id === id; });
}

function getLabels(lang) {
  return UI_LABELS[lang] || UI_LABELS.en;
}

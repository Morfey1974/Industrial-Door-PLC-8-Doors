/**
 * О нас — бренд DCM (Doors Control Making) и контактная информация
 * Оформление в стиле проекта: центрирование, симметрия, цветовая схема DCM
 */

import { useLanguage } from '../../context/LanguageContext';
import './About.css';

const About = () => {
  const { t } = useLanguage();
  return (
    <div className="settings-about">
      <div className="about-hero">
        <h1 className="about-title">Doors Control Making</h1>
        <p className="about-subtitle">(DCM)</p>
      </div>

      <section className="about-company">
        <p>
          <strong>Doors Control Making</strong> — молодая и динамично развивающаяся компания, специализирующаяся на разработке и производстве электронных систем блокировки дверей для чистых помещений в фармацевтической, химической, пищевой и микроэлектронной отраслях.
        </p>
        <p>
          Изначальная идея создания наших электронных устройств — надёжность и простота установки. В процессе разработки было изучено множество аналогичных продуктов и устранены различные проблемы их эксплуатации. Один из главных принципов компании — безупречная репутация на рынке, достигаемая абсолютной открытостью и честностью в работе с партнёрами.
        </p>
        <p>
          Компания постоянно ищет способы улучшения продукции и развивает новые направления в разработке устройств управления дверями. Немаловажное значение имеет и ценовая политика: цены на продукцию существенно отличаются от рыночных за счёт грамотного подхода к разработке и применению современных производственных технологий.
        </p>
        <p>
          Мы готовы к долгосрочному сотрудничеству и предоставлению качественного сервиса. Будем рады обсудить с вами новые перспективы совместного развития.
        </p>
      </section>

      <section className="about-contact">
        <h2 className="about-contact-title">{t('pages.about.contactTitle')}</h2>
        <div className="about-contact-grid">
          <div className="about-contact-item">
            <span className="about-contact-label">Адрес</span>
            <span className="about-contact-value">Хайфа, Израиль</span>
          </div>
          <div className="about-contact-item">
            <span className="about-contact-label">Телефон</span>
            <a href="tel:+9720504950495" className="about-contact-value about-contact-link">
              +972-050-495-0-495
            </a>
          </div>
          <div className="about-contact-item">
            <span className="about-contact-label">WhatsApp</span>
            <a
              href="https://wa.me/9720504950495"
              target="_blank"
              rel="noopener noreferrer"
              className="about-contact-value about-contact-link"
            >
              +972-050-495-0-495
            </a>
          </div>
          <div className="about-contact-item">
            <span className="about-contact-label">Email</span>
            <a href="mailto:info@dcmaking.co.il" className="about-contact-value about-contact-link">
              info@dcmaking.co.il
            </a>
          </div>
          <div className="about-contact-item">
            <span className="about-contact-label">Сайт</span>
            <a
              href="https://www.dcmaking.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="about-contact-value about-contact-link"
            >
              www.dcmaking.co.il
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;

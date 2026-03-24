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
        <p className="about-subtitle">{t('pages.about.heroSubtitle')}</p>
      </div>

      <section className="about-company">
        <p>{t('pages.about.companyP1')}</p>
        <p>{t('pages.about.companyP2')}</p>
        <p>{t('pages.about.companyP3')}</p>
        <p>{t('pages.about.companyP4')}</p>
      </section>

      <section className="about-contact">
        <h2 className="about-contact-title">{t('pages.about.contactTitle')}</h2>
        <div className="about-contact-grid">
          <div className="about-contact-item">
            <span className="about-contact-label">{t('pages.about.address')}</span>
            <span className="about-contact-value">{t('pages.about.addressValue')}</span>
          </div>
          <div className="about-contact-item">
            <span className="about-contact-label">{t('pages.about.phone')}</span>
            <a href="tel:+9720504950495" className="about-contact-value about-contact-link">
              +972-050-495-0-495
            </a>
          </div>
          <div className="about-contact-item">
            <span className="about-contact-label">{t('pages.about.whatsapp')}</span>
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
            <span className="about-contact-label">{t('pages.about.email')}</span>
            <a href="mailto:info@dcmaking.co.il" className="about-contact-value about-contact-link">
              info@dcmaking.co.il
            </a>
          </div>
          <div className="about-contact-item">
            <span className="about-contact-label">{t('pages.about.website')}</span>
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

/**
 * SplashScreen компонент - заставка с анимацией при запуске
 */

import { useState, useEffect } from 'react';
import './SplashScreen.css';

let logoImage;
try {
  logoImage = new URL('../../assets/logo/Logo.png', import.meta.url).href;
} catch (error) {
  console.warn('Не удалось загрузить логотип:', error);
  logoImage = null;
}

const SplashScreen = ({ onComplete }) => {
  const [stage, setStage] = useState('whirlwind'); // whirlwind -> logo-appear -> logo-hold -> logo-fade -> complete

  useEffect(() => {
    const timers = [];

    // Этап 1: Вихрь закручивается (2 секунды)
    timers.push(setTimeout(() => {
      setStage('logo-appear');
    }, 2000));

    // Этап 2: Логотип появляется, вихрь улетает (1.5 секунды)
    timers.push(setTimeout(() => {
      setStage('logo-hold');
    }, 3500));

    // Этап 3: Логотип стоит (2 секунды)
    timers.push(setTimeout(() => {
      setStage('logo-fade');
    }, 5500));

    // Этап 4: Логотип тает и уплывает вдаль (2 секунды)
    timers.push(setTimeout(() => {
      setStage('complete');
      if (onComplete) {
        onComplete();
      }
    }, 7500));

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [onComplete]);

  return (
    <div className={`splash-screen ${stage}`}>
      <div className="splash-whirlwind">
        {/* Вихрь из двух цветов - несколько слоев для эффекта глубины */}
        <div className="whirlwind-ring whirlwind-ring-1"></div>
        <div className="whirlwind-ring whirlwind-ring-2"></div>
        <div className="whirlwind-ring whirlwind-ring-3"></div>
        <div className="whirlwind-ring whirlwind-ring-4"></div>
        {/* Дополнительные частицы для эффекта вихря */}
        <div className="whirlwind-particles">
          <div className="particle particle-1"></div>
          <div className="particle particle-2"></div>
          <div className="particle particle-3"></div>
          <div className="particle particle-4"></div>
          <div className="particle particle-5"></div>
          <div className="particle particle-6"></div>
        </div>
      </div>
      
      <div className="splash-logo-container">
        {logoImage && (
          <img 
            src={logoImage} 
            alt="DCM Logo" 
            className="splash-logo" 
            onError={(e) => {
              console.error('Ошибка загрузки изображения логотипа');
              e.target.style.display = 'none';
            }} 
          />
        )}
        {/* Требование ТЗ: крупная надпись появляется и исчезает вместе с заставкой (стадии logo-appear … logo-fade). */}
        <div className="splash-plc-title" aria-hidden="true">
          PLC 8 DOORS
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;

import { ArrowRight, Shield, Zap, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import heroBg from "@/assets/hero-bg.jpg";

const Hero = () => {
  const { t } = useLanguage();

  const features = [
    { titleKey: "hero.reliable", descKey: "hero.reliableDesc", icon: Shield },
    { titleKey: "hero.plugPlay", descKey: "hero.plugPlayDesc", icon: Zap },
    { titleKey: "hero.smartLogic", descKey: "hero.smartLogicDesc", icon: Settings },
  ];

  return (
    <section id="home" className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroBg}
          alt="Cleanroom facility"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/70 via-primary/50 to-primary/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary/60" />
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 lg:px-8 pt-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 mb-6 animate-fade-in">
            <Shield className="w-4 h-4 text-primary-foreground" />
            <span className="text-sm font-medium text-primary-foreground">
              {t("hero.badge")}
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-primary-foreground mb-6 leading-tight animate-slide-up">
            {t("hero.title")}{" "}
            <span className="text-accent">{t("hero.titleAccent")}</span>
          </h1>

          <p className="text-lg sm:text-xl text-primary-foreground/80 mb-8 max-w-2xl leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
            {t("hero.description")}
          </p>

          <div className="flex flex-wrap gap-4 mb-12 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Button variant="hero" size="xl" asChild>
              <a href="#products" className="flex items-center gap-2">
                {t("hero.viewProducts")}
                <ArrowRight className="w-5 h-5" />
              </a>
            </Button>
            <Button variant="heroOutline" size="xl" asChild>
              <a href="#contact">{t("hero.contactUs")}</a>
            </Button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            {features.map((feature) => (
              <div
                key={feature.titleKey}
                className="flex items-center gap-3 p-4 rounded-xl bg-primary-foreground/5 backdrop-blur-sm border border-primary-foreground/10"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
                  <feature.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-primary-foreground">{t(feature.titleKey)}</p>
                  <p className="text-sm text-primary-foreground/70">{t(feature.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce hidden lg:block">
        <div className="w-6 h-10 rounded-full border-2 border-primary-foreground/30 flex items-start justify-center p-2">
          <div className="w-1 h-3 rounded-full bg-primary-foreground/50 animate-pulse" />
        </div>
      </div>
    </section>
  );
};

export default Hero;

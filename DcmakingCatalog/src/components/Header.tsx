import { useState } from "react";
import { Menu, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lang } from "@/data/translations";

const Header = () => {
  const { lang, setLang, t } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { nameKey: "header.home", href: "#home" },
    { nameKey: "header.products", href: "#products" },
    { nameKey: "header.aboutUs", href: "#about" },
    { nameKey: "header.contact", href: "#contact" },
  ];

  const languages: { code: Lang; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "ru", label: "RU" },
    { code: "he", label: "HE" },
  ];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-background/95 backdrop-blur-md shadow-sm border-b border-border"
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <a href="#home" className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-gradient-hero flex items-center justify-center">
                <span className="font-colonna text-primary-foreground font-bold text-lg lg:text-xl">
                  DCM
                </span>
              </div>
            </div>
            <div className="hidden sm:block">
              <p className="font-semibold text-foreground text-sm lg:text-base">
                Doors Control Making
              </p>
              <p className="text-xs text-muted-foreground">{t("header.tagline")}</p>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {/* Language switcher */}
            <div className="flex items-center gap-0.5 mr-2">
              {languages.map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    lang === code
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                  aria-label={`Language: ${label}`}
                  aria-current={lang === code ? "true" : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            {navLinks.map((link) => (
              <a
                key={link.nameKey}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
              >
                {t(link.nameKey)}
              </a>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <a href="tel:+972-050-495-0-495" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span>+972-050-495-0-495</span>
              </a>
            </Button>
            <Button size="sm" asChild>
              <a href="#contact">{t("header.getQuote")}</a>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-secondary transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6 text-foreground" />
            ) : (
              <Menu className="w-6 h-6 text-foreground" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border animate-fade-in">
            <div className="flex items-center gap-2 px-4 pb-3 mb-3 border-b border-border">
              <span className="text-sm text-muted-foreground">Язык / Language:</span>
              {languages.map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLang(code);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                    lang === code
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.nameKey}
                  href={link.href}
                  className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {t(link.nameKey)}
                </a>
              ))}
              <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2">
                <Button variant="outline" asChild className="w-full justify-start">
                  <a href="tel:+972-050-495-0-495" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <span>+972-050-495-0-495</span>
                  </a>
                </Button>
                <Button asChild className="w-full">
                  <a href="#contact">{t("header.getQuote")}</a>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;

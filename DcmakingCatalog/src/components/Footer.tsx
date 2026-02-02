import { Phone, Mail, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const footerLinks = [
  { nameKey: "header.home", href: "#home" },
  { nameKey: "header.products", href: "#products" },
  { nameKey: "header.aboutUs", href: "#about" },
  { nameKey: "header.contact", href: "#contact" },
];

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-foreground text-background py-12 lg:py-16">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <span className="font-colonna text-accent-foreground font-bold text-lg">DCM</span>
              </div>
              <div>
                <p className="font-semibold text-background">{t("footer.companyName")}</p>
                <p className="text-sm text-background/70">{t("footer.tagline")}</p>
              </div>
            </div>
            <p className="text-background/70 text-sm max-w-md">
              {t("footer.description")}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-background mb-4">{t("footer.quickLinks")}</h4>
            <ul className="space-y-2">
              {footerLinks.map((link) => (
                <li key={link.nameKey}>
                  <a
                    href={link.href}
                    className="text-sm text-background/70 hover:text-accent transition-colors"
                  >
                    {t(link.nameKey)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-background mb-4">{t("footer.contact")}</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-sm text-background/70">
                <MapPin className="w-4 h-4 text-accent" />
                Haifa, Israel
              </li>
              <li>
                <a
                  href="tel:+972-050-495-0-495"
                  className="flex items-center gap-2 text-sm text-background/70 hover:text-accent transition-colors"
                >
                  <Phone className="w-4 h-4 text-accent" />
                  +972-050-495-0-495
                </a>
              </li>
              <li>
                <a
                  href="mailto:info@dcmaking.co.il"
                  className="flex items-center gap-2 text-sm text-background/70 hover:text-accent transition-colors"
                >
                  <Mail className="w-4 h-4 text-accent" />
                  info@dcmaking.co.il
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-background/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-background/50">
            © {new Date().getFullYear()} DCM - Doors Control Making. {t("footer.rights")}
          </p>
          <p className="text-sm text-background/50">
            {t("footer.madeIn")} 🇮🇱
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

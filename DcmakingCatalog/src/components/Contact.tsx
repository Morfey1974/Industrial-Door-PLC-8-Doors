import { useState } from "react";
import { Phone, Mail, MapPin, Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

const contactInfo = [
  { labelKey: "contact.location", value: "Haifa, Israel", href: null },
  { labelKey: "contact.phone", value: "+972-050-495-0-495", href: "tel:+972-050-495-0-495" },
  { labelKey: "contact.whatsapp", value: "+972-050-495-0-495", href: "https://wa.me/9720504950495" },
  { labelKey: "contact.email", value: "info@dcmaking.co.il", href: "mailto:info@dcmaking.co.il" },
];

const Contact = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: t("contact.toastTitle"),
      description: t("contact.toastDesc"),
    });
    setFormData({ name: "", email: "", phone: "", message: "" });
  };

  return (
    <section id="contact" className="py-20 lg:py-32 bg-gradient-subtle">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 mb-4">
            <span className="text-sm font-medium text-primary">{t("contact.badge")}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {t("contact.title")}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t("contact.subtitle")}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-6">
              {t("contact.contactInfo")}
            </h3>

            <div className="space-y-4 mb-8">
              {contactInfo.map((info) => (
                <div
                  key={info.labelKey}
                  className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-sm transition-shadow"
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {info.labelKey === "contact.location" && <MapPin className="w-5 h-5 text-primary" />}
                    {info.labelKey === "contact.phone" && <Phone className="w-5 h-5 text-primary" />}
                    {info.labelKey === "contact.whatsapp" && <MessageCircle className="w-5 h-5 text-primary" />}
                    {info.labelKey === "contact.email" && <Mail className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t(info.labelKey)}</p>
                    {info.href ? (
                      <a
                        href={info.href}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                        target={info.href.startsWith("http") ? "_blank" : undefined}
                        rel={info.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      >
                        {info.value}
                      </a>
                    ) : (
                      <p className="font-medium text-foreground">{info.value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="default" size="lg">
                <a
                  href="https://wa.me/9720504950495"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="tel:+972-050-495-0-495" className="flex items-center gap-2">
                  <Phone className="w-5 h-5" />
                  {t("contact.callNow")}
                </a>
              </Button>
            </div>
          </div>

          <div className="bg-card p-6 lg:p-8 rounded-2xl border border-border shadow-sm">
            <h3 className="text-xl font-semibold text-foreground mb-6">
              {t("contact.sendMessage")}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t("contact.yourName")}
                  </label>
                  <Input
                    placeholder={t("contact.namePlaceholder")}
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t("contact.emailAddress")}
                  </label>
                  <Input
                    type="email"
                    placeholder={t("contact.emailPlaceholder")}
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("contact.phoneNumber")}
                </label>
                <Input
                  type="tel"
                  placeholder={t("contact.phonePlaceholder")}
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("contact.yourMessage")}
                </label>
                <Textarea
                  placeholder={t("contact.messagePlaceholder")}
                  rows={4}
                  value={formData.message}
                  onChange={(e) =>
                    setFormData({ ...formData, message: e.target.value })
                  }
                  required
                />
              </div>

              <Button type="submit" size="lg" className="w-full">
                <Send className="w-5 h-5 mr-2" />
                {t("contact.submit")}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;

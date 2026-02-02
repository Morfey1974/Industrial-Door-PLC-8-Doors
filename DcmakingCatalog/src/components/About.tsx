import { CheckCircle2, Award, Users, Cpu } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const statsKeys = [
  { value: "100%", labelKey: "about.madeInIsrael", icon: Cpu },
  { value: "24/7", labelKey: "about.qualityControl", icon: Award },
  { value: "50+", labelKey: "about.industryPartners", icon: Users },
];

const About = () => {
  const { t } = useLanguage();
  const featureKeys = [
    "about.feature0",
    "about.feature1",
    "about.feature2",
    "about.feature3",
    "about.feature4",
    "about.feature5",
  ];

  return (
    <section id="about" className="py-20 lg:py-32 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 mb-4">
              <span className="text-sm font-medium text-primary">{t("about.badge")}</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              {t("about.title")}
            </h2>

            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
              <strong className="text-foreground">Doors Control Making</strong>{" "}
              {t("about.intro")}
            </p>

            <p className="text-muted-foreground mb-8 leading-relaxed">
              {t("about.philosophy")}
            </p>

            <div className="grid sm:grid-cols-2 gap-3 mb-8">
              {featureKeys.map((key) => (
                <div key={key} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{t(key)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-primary/5 to-accent/5 rounded-3xl" />

            <div className="relative grid gap-4">
              {statsKeys.map((stat) => (
                <div
                  key={stat.labelKey}
                  className="flex items-center gap-4 p-6 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="w-14 h-14 rounded-xl bg-gradient-hero flex items-center justify-center shrink-0">
                    <stat.icon className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{t(stat.labelKey)}</p>
                  </div>
                </div>
              ))}

              <div className="p-6 bg-primary rounded-2xl text-primary-foreground">
                <p className="font-semibold mb-2">{t("about.industriesTitle")}</p>
                <p className="text-sm text-primary-foreground/80">
                  {t("about.industries")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;

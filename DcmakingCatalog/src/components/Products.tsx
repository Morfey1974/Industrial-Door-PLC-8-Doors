import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { getProducts } from "@/data/products";

const Products = () => {
  const { lang, t } = useLanguage();
  const products = getProducts(lang);

  const categoryLabel = (category: string) =>
    category === "Controllers" ? t("products.categoryControllers") : t("products.categoryAccessories");

  return (
    <section id="products" className="py-20 lg:py-32 bg-gradient-subtle">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 mb-4">
            <span className="text-sm font-medium text-primary">{t("products.badge")}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {t("products.title")}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t("products.subtitle")}
          </p>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {products.slice(0, 6).map((product, index) => (
            <Card
              key={product.id}
              className="group bg-card border-border overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="relative h-64 overflow-hidden bg-secondary">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1 text-xs font-medium bg-background/90 backdrop-blur-sm rounded-full text-foreground">
                    {categoryLabel(product.category)}
                  </span>
                </div>
              </div>

              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                  <span className="text-lg font-bold text-primary">
                    {product.price}
                  </span>
                </div>

                <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                  {product.shortDescription}
                </p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {product.specifications.slice(0, 3).map((spec) => (
                    <span
                      key={spec.label}
                      className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded"
                    >
                      {spec.value}
                    </span>
                  ))}
                </div>

                <Button variant="outline" className="w-full group/btn" asChild>
                  <Link to={`/products/${product.id}`}>
                    {t("products.learnMore")}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {products.length > 6 && (
          <div className="text-center mt-12">
            <Button size="lg" asChild>
              <a href="#contact" className="flex items-center gap-2">
                {t("products.viewAll")}
                <ArrowRight className="w-5 h-5" />
              </a>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default Products;

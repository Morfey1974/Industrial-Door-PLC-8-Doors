import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, Phone, MessageCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { getProductById, getRelatedProducts } from "@/data/products";

const ProductPage = () => {
  const { productId } = useParams<{ productId: string }>();
  const { lang, t } = useLanguage();
  const product = getProductById(productId || "", lang);
  const relatedProducts = getRelatedProducts(productId || "", 3, lang);

  const categoryLabel =
    product?.category === "Controllers"
      ? t("products.categoryControllers")
      : t("products.categoryAccessories");

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              {t("productPage.notFound")}
            </h1>
            <p className="text-muted-foreground mb-8">
              {t("productPage.notFoundDesc")}
            </p>
            <Button asChild>
              <Link to="/#products">{t("productPage.backToProducts")}</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4 lg:px-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
            <Link to="/" className="hover:text-foreground transition-colors">
              {t("productPage.home")}
            </Link>
            <span>/</span>
            <Link to="/#products" className="hover:text-foreground transition-colors">
              {t("productPage.products")}
            </Link>
            <span>/</span>
            <span className="text-foreground">{product.name}</span>
          </nav>

          <Link
            to="/#products"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("productPage.backToProducts")}
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 mb-16">
            <div className="relative">
              <div className="aspect-square rounded-xl overflow-hidden bg-secondary">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <Badge className="absolute top-4 left-4">{categoryLabel}</Badge>
            </div>

            <div className="flex flex-col">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
                {product.name}
              </h1>

              <div className="text-3xl font-bold text-primary mb-6">
                {product.price}
              </div>

              <p className="text-lg text-muted-foreground mb-8 whitespace-pre-line">
                {product.fullDescription}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Button size="lg" asChild className="flex-1">
                  <a href="#contact" className="flex items-center justify-center gap-2">
                    <Phone className="w-5 h-5" />
                    {t("productPage.requestQuote")}
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild className="flex-1">
                  <a
                    href="https://wa.me/9720504950495"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-5 h-5" />
                    WhatsApp
                  </a>
                </Button>
              </div>

              <Separator className="my-6" />

              <div>
                <h3 className="text-xl font-semibold text-foreground mb-4">
                  {t("productPage.specifications")}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {product.specifications.map((spec) => (
                    <div key={spec.label} className="flex flex-col">
                      <span className="text-sm text-muted-foreground">
                        {spec.label}
                      </span>
                      <span className="font-medium text-foreground">
                        {spec.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <section className="mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
              {t("productPage.keyFeatures")}
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {product.features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-3 p-4 rounded-lg bg-secondary/50"
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </section>

          {relatedProducts.length > 0 && (
            <section>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
                {t("productPage.relatedProducts")}
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {relatedProducts.map((relatedProduct) => (
                  <Link key={relatedProduct.id} to={`/products/${relatedProduct.id}`}>
                    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                      <div className="relative h-48 overflow-hidden bg-secondary">
                        <img
                          src={relatedProduct.image}
                          alt={relatedProduct.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {relatedProduct.name}
                          </h3>
                          <span className="text-primary font-bold">
                            {relatedProduct.price}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {relatedProduct.shortDescription}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ProductPage;

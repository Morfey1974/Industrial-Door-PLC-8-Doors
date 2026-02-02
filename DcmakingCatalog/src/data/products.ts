import doorControllerImg from "@/assets/products/door-controller.jpg";
import electricBoltImg from "@/assets/products/electric-bolt.jpg";
import membraneTrafficLightNarrowImg from "@/assets/products/membrane-traffic-light-narrow.jpg";
import trafficLightNarrowImg from "@/assets/products/traffic-light-narrow.jpg";
import trafficLightMembraneWideImg from "@/assets/products/traffic-light-membrane-wide.jpg";
import expansionBoardSlidingImg from "@/assets/products/expansion-board-sliding.jpg";
import expansionBoardElectromagnetImg from "@/assets/products/expansion-board-electromagnet.jpg";
import type { Lang } from "./translations";
import { productTranslations } from "./productTranslations";

export interface Product {
  id: string;
  name: string;
  category: "Controllers" | "Accessories";
  price: string;
  image: string;
  shortDescription: string;
  fullDescription: string;
  features: string[];
  specifications: { label: string; value: string }[];
}

export const products: Product[] = [
  {
    id: "door-controller",
    name: "Door Controller",
    category: "Controllers",
    price: "₪1,000",
    image: doorControllerImg,
    shortDescription:
      "Optimized solution for two-door gateways. Supports manual swing and sliding doors with intelligent interlock logic.",
    fullDescription: `Doors Controller is an optimized solution for two-door gateways, perfectly suited for changing rooms, material gates (MAL), and personnel gates (PAL), where doors are often left open.

This solution ensures safety and convenience in various commercial and public settings, providing reliable door management for clean room environments in pharmaceutical, chemical, food, and microelectronic industries.`,
    features: [
      "Door Management: Supports manual swing and sliding doors, as well as pass-through gates with constant ventilation",
      "Compatibility: Can manage any fail-safe electric locks operating on 24V DC",
      "Ease of Installation: Plug-and-play system ensures easy integration into two-door gateways",
      "Intelligent Logic: The microcontroller automatically activates room logic, blocking one door when the other is open. Four built-in logic modes configured via DIP switches",
      "Anomaly Management: Includes alarms for door left ajar, forced opening, and simultaneous opening",
      "User Controls: Door unlock button and status indicator light located on the door indicator panel",
    ],
    specifications: [
      { label: "Operating Voltage", value: "24V DC" },
      { label: "Logic Modes", value: "4 Built-in Modes" },
      { label: "Configuration", value: "DIP Switches" },
      { label: "Connection", value: "RJ-45" },
      { label: "Installation", value: "Plug & Play" },
      { label: "Brand", value: "DCM" },
    ],
  },
  {
    id: "electric-bolt",
    name: "Electric Bolt",
    category: "Accessories",
    price: "₪300",
    image: electricBoltImg,
    shortDescription:
      "Solenoid lock for internal door frame installation. Includes built-in door status sensor.",
    fullDescription: `The solenoid lock is used to lock the door. The rod extends when voltage is applied to the solenoid. The solenoid lock is designed for internal installation in the door frame.

It consists of two parts: a solenoid lock with a built-in door status sensor and a strike plate with a magnet. The door status sensor is normally open (NO), i.e. when the strike plate with a magnet approaches it, the sensor closes; in the normal position, the door status sensor is open.`,
    features: [
      "Built-in door status sensor",
      "Rod extends when voltage is applied",
      "Internal door frame installation",
      "Strike plate with magnet included",
      "Normally open (NO) sensor configuration",
      "Fail-safe design",
    ],
    specifications: [
      { label: "Operating Voltage", value: "24V DC" },
      { label: "Sensor Type", value: "Normally Open (NO)" },
      { label: "Installation", value: "Internal Door Frame" },
      { label: "Components", value: "Solenoid + Strike Plate" },
      { label: "Design", value: "Fail-Safe" },
      { label: "Brand", value: "DCM" },
    ],
  },
  {
    id: "membrane-traffic-light-narrow",
    name: "Membrane Traffic Light (Narrow)",
    category: "Accessories",
    price: "₪200",
    image: membraneTrafficLightNarrowImg,
    shortDescription:
      "LED indicator panel with red and green status lights. Designed for door frame profile mounting.",
    fullDescription: `The membrane traffic light (narrow) is designed for mounting on the door frame profile. Mounting is done by gluing the membrane with the sticky side to the door frame.

The flat membrane cable is connected to the adapter board using a 5-PIN connector, which has an RJ-45 connector for connecting to the controller.`,
    features: [
      "Red and green LED status indicators",
      "Adhesive mounting on door frame",
      "Flat membrane cable",
      "5-PIN connector to adapter board",
      "RJ-45 connection to controller",
      "Narrow profile design",
    ],
    specifications: [
      { label: "LED Colors", value: "Red & Green" },
      { label: "Mounting", value: "Adhesive" },
      { label: "Connector", value: "5-PIN to RJ-45" },
      { label: "Profile", value: "Narrow" },
      { label: "Cable Type", value: "Flat Membrane" },
      { label: "Brand", value: "DCM" },
    ],
  },
  {
    id: "traffic-light-narrow",
    name: "Traffic Light (Narrow)",
    category: "Accessories",
    price: "₪200",
    image: trafficLightNarrowImg,
    shortDescription:
      "LED indicator panel with red and green status lights. Metal enclosure for screw mounting.",
    fullDescription: `The traffic light (narrow) is designed for mounting on the door frame profile. Mounting is done by screwing two screws to the door frame in a prepared niche in the profile.

The traffic light is connected to the controller using a cable with an RJ-45 connector.`,
    features: [
      "Red and green LED status indicators",
      "Metal enclosure",
      "Screw mounting on door frame",
      "Prepared niche installation",
      "Direct RJ-45 connection",
      "Narrow profile design",
    ],
    specifications: [
      { label: "LED Colors", value: "Red & Green" },
      { label: "Mounting", value: "Screw (2 screws)" },
      { label: "Connector", value: "RJ-45" },
      { label: "Profile", value: "Narrow" },
      { label: "Enclosure", value: "Metal" },
      { label: "Brand", value: "DCM" },
    ],
  },
  {
    id: "traffic-light-membrane-wide",
    name: "Traffic Light Membrane (Wide)",
    category: "Accessories",
    price: "₪200",
    image: trafficLightMembraneWideImg,
    shortDescription:
      "Wide LED indicator panel designed for wall mounting. Easy adhesive installation.",
    fullDescription: `The traffic light membrane (wide) is designed for wall mounting. Installation is performed by gluing the membrane to the wall with the adhesive side.

The membrane's flat cable is connected to the adapter board using a 5-PIN connector, which has an RJ-45 connector for connecting to the controller.`,
    features: [
      "Red and green LED status indicators",
      "Wide profile design",
      "Wall mounting with adhesive",
      "Flat membrane cable",
      "5-PIN connector to adapter board",
      "RJ-45 connection to controller",
    ],
    specifications: [
      { label: "LED Colors", value: "Red & Green" },
      { label: "Mounting", value: "Wall Adhesive" },
      { label: "Connector", value: "5-PIN to RJ-45" },
      { label: "Profile", value: "Wide" },
      { label: "Cable Type", value: "Flat Membrane" },
      { label: "Brand", value: "DCM" },
    ],
  },
  {
    id: "expansion-board-sliding",
    name: "Expansion Board for Sliding Doors",
    category: "Accessories",
    price: "₪300",
    image: expansionBoardSlidingImg,
    shortDescription:
      "Expansion board for controlling sliding or roller doors. Compatible with Dortec and Tadiran systems.",
    fullDescription: `The expansion board is used to control sliding or roller doors. For example, Dortec or Tadiran.

The board is connected to the controller by a cable with RJ-45 connectors, providing seamless integration with the Door Controller system.`,
    features: [
      "Sliding door control",
      "Roller door support",
      "Dortec compatibility",
      "Tadiran compatibility",
      "RJ-45 connection",
      "Easy controller integration",
    ],
    specifications: [
      { label: "Door Types", value: "Sliding & Roller" },
      { label: "Compatible Systems", value: "Dortec, Tadiran" },
      { label: "Connector", value: "RJ-45" },
      { label: "Integration", value: "Plug & Play" },
      { label: "Power", value: "Via Controller" },
      { label: "Brand", value: "DCM" },
    ],
  },
  {
    id: "expansion-board-electromagnet",
    name: "Expansion Board for Electromagnet",
    category: "Accessories",
    price: "₪300",
    image: expansionBoardElectromagnetImg,
    shortDescription:
      "Expansion board for controlling doors with electromagnet locks.",
    fullDescription: `The expansion board is used to control doors with an electromagnet.

The board is connected to the controller via a cable with RJ-45 connectors, allowing easy integration with the Door Controller system for electromagnet-based locking mechanisms.`,
    features: [
      "Electromagnet door control",
      "High holding force support",
      "RJ-45 connection",
      "Easy controller integration",
      "Fail-safe operation",
      "Power management",
    ],
    specifications: [
      { label: "Lock Type", value: "Electromagnet" },
      { label: "Connector", value: "RJ-45" },
      { label: "Integration", value: "Plug & Play" },
      { label: "Operation", value: "Fail-Safe" },
      { label: "Power", value: "Via Controller" },
      { label: "Brand", value: "DCM" },
    ],
  },
];

function applyProductTranslation<T extends Product>(
  product: T,
  lang: Lang
): T {
  const tr = productTranslations[lang]?.[product.id];
  if (!tr) return product;
  return { ...product, name: tr.name, shortDescription: tr.shortDescription };
}

export const getProductById = (
  id: string,
  lang?: Lang
): Product | undefined => {
  const product = products.find((p) => p.id === id);
  if (!product) return undefined;
  if (lang) return applyProductTranslation(product, lang);
  return product;
};

export const getProducts = (lang?: Lang): Product[] => {
  if (!lang) return products;
  return products.map((p) => applyProductTranslation(p, lang));
};

export const getProductsByCategory = (category: Product["category"]): Product[] => {
  return products.filter((product) => product.category === category);
};

export const getRelatedProducts = (
  currentId: string,
  limit = 3,
  lang?: Lang
): Product[] => {
  const currentProduct = getProductById(currentId);
  if (!currentProduct) return getProducts(lang).slice(0, limit);
  const list = getProducts(lang).filter(
    (p) => p.id !== currentId && p.category === currentProduct.category
  );
  return list.slice(0, limit);
};

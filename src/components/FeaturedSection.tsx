import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Star,
  ShoppingCart,
  Calendar,
  User,
  Mail,
  Phone,
  Clock,
  MapPin,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { featuredProductService } from "../services/productService";
import { FeaturedProduct } from "../types/index";

const FeaturedSection: React.FC = () => {
  const { user } = useAuth();
  const shopId = user?.shop_id || "";

  const [appointmentData, setAppointmentData] = useState({
    name: "",
    email: "",
    phone: "",
    date: "",
    service: "General Maintenance",
  });

  const [featuredProducts, setFeaturedProducts] = useState<FeaturedProduct[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  // Fetch featured products from database
  useEffect(() => {
    if (shopId) {
      fetchFeaturedProducts();
    }
  }, [shopId]);

  const fetchFeaturedProducts = async () => {
    setLoading(true);
    try {
      const data = await featuredProductService.getFeaturedProducts(shopId);
      setFeaturedProducts(data);
    } catch (err) {
      console.error("Error fetching featured products:", err);
    } finally {
      setLoading(false);
    }
  };

  // Default products for when not logged in or no featured products
  const defaultProducts: FeaturedProduct[] = [
    {
      id: "1",
      shop_id: "",
      product_id: "1",
      display_order: 1,
      is_active: true,
      product: {
        id: "1",
        shop_id: "",
        name: "Premium Exhaust System",
        unit_price: 19500,
        rating: 4.8,
        image_url:
          "https://images.unsplash.com/photo-1599950945-b8a2c6c3b5b0?w=500&h=500&fit=crop&q=80",
        category: "Exhaust",
        sku: "EXH-001",
        quantity_in_stock: 0,
        created_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "2",
      shop_id: "",
      product_id: "2",
      display_order: 2,
      is_active: true,
      product: {
        id: "2",
        shop_id: "",
        name: "High-Performance Air Filter",
        unit_price: 7200,
        rating: 4.9,
        image_url:
          "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop&q=80",
        category: "Filters",
        sku: "FLT-001",
        quantity_in_stock: 0,
        created_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "3",
      shop_id: "",
      product_id: "3",
      display_order: 3,
      is_active: true,
      product: {
        id: "3",
        shop_id: "",
        name: "Racing Brake Pads",
        unit_price: 11200,
        rating: 4.7,
        image_url:
          "https://images.unsplash.com/photo-1587919904554-e3aa350908e8?w=500&h=500&fit=crop&q=80",
        category: "Brakes",
        sku: "BRK-001",
        quantity_in_stock: 0,
        created_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const products =
    featuredProducts.length > 0 ? featuredProducts : defaultProducts;

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setAppointmentData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Please use the Book Appointment button to schedule through our system.");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-moto-dark relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 right-0 w-96 h-96 bg-moto-accent-orange/5 rounded-full blur-2xl sm:blur-3xl opacity-50 sm:opacity-100" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-moto-accent/5 rounded-full blur-2xl sm:blur-3xl opacity-50 sm:opacity-100" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4 text-white">
            Featured{" "}
            <span className="bg-gradient-accent bg-clip-text text-transparent">
              Parts & Services
            </span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Premium motorcycle parts at affordable Filipino prices para sa lahat
            ng uri ng riders
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20">
          {/* Featured Products - Left Column (3 cards) */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {loading ? (
              <div className="col-span-3 text-center text-gray-400 py-8">
                Loading featured products...
              </div>
            ) : products.length > 0 ? (
              products.map((fp) => {
                const product = fp.product;
                return (
                  <motion.div
                    key={fp.id}
                    variants={itemVariants}
                    className="group relative bg-moto-darker border border-moto-gray-light/20 rounded-xl overflow-hidden hover:border-moto-accent-orange/50 transition-all duration-300"
                    whileHover={{
                      y: -8,
                      boxShadow: "0 20px 40px rgba(230, 57, 70, 0.2)",
                    }}
                  >
                    {/* Product Image */}
                    <div className="relative h-64 overflow-hidden bg-moto-gray">
                      <motion.img
                        src={
                          product?.image_url ||
                          "https://via.placeholder.com/500"
                        }
                        alt={product?.name}
                        className="w-full h-full object-cover"
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.4 }}
                      />
                      <div className="absolute inset-0 bg-gradient-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      {/* Category Badge */}
                      <div className="absolute top-3 right-3 px-3 py-1 bg-moto-accent-orange text-white text-xs font-bold rounded-full">
                        {product?.category}
                      </div>
                    </div>

                    {/* Product Info */}
                    <div className="p-4">
                      <h3 className="font-bold text-white mb-2 line-clamp-2 group-hover:text-moto-accent-orange transition-colors">
                        {product?.name}
                      </h3>

                      {/* Rating */}
                      <div className="flex items-center gap-1 mb-3">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={16}
                            className={
                              i < Math.floor(product?.rating || 0)
                                ? "text-moto-accent-orange fill-current"
                                : "text-gray-600"
                            }
                          />
                        ))}
                        <span className="text-xs text-gray-400 ml-2">
                          ({product?.rating})
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-2xl font-bold text-moto-accent-orange">
                          ₱{product?.unit_price.toLocaleString("en-PH")}
                        </span>
                        <motion.button
                          className="p-2 rounded-lg bg-moto-accent-orange text-white hover:bg-moto-accent transition-colors"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <ShoppingCart size={20} />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-3 text-center text-gray-400 py-8">
                No featured products available
              </div>
            )}
          </motion.div>

          {/* Quick Book Appointment - Right Column */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-1"
          >
            <div className="sticky top-32 bg-gradient-to-br from-moto-darker via-moto-darker to-moto-gray border border-moto-gray-light/30 rounded-2xl p-6 backdrop-blur-md sm:backdrop-blur-xl shadow-xl sm:shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <Calendar className="text-moto-accent-orange" size={24} />
                <h3 className="font-display text-2xl font-bold text-white">
                  Book Now
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Full Name
                  </label>
                  <div className="relative">
                    <User
                      size={18}
                      className="absolute left-3 top-3.5 text-gray-500"
                    />
                    <input
                      type="text"
                      name="name"
                      value={appointmentData.name}
                      onChange={handleInputChange}
                      required
                      placeholder="Your name"
                      className="w-full pl-10 pr-4 py-2.5 bg-moto-gray border border-moto-gray-light/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-moto-accent-orange transition-colors text-sm"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={18}
                      className="absolute left-3 top-3.5 text-gray-500"
                    />
                    <input
                      type="email"
                      name="email"
                      value={appointmentData.email}
                      onChange={handleInputChange}
                      required
                      placeholder="your@email.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-moto-gray border border-moto-gray-light/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-moto-accent-orange transition-colors text-sm"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Phone
                  </label>
                  <div className="relative">
                    <Phone
                      size={18}
                      className="absolute left-3 top-3.5 text-gray-500"
                    />
                    <input
                      type="tel"
                      name="phone"
                      value={appointmentData.phone}
                      onChange={handleInputChange}
                      required
                      placeholder="+1 (555) 000-0000"
                      className="w-full pl-10 pr-4 py-2.5 bg-moto-gray border border-moto-gray-light/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-moto-accent-orange transition-colors text-sm"
                    />
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Preferred Date
                  </label>
                  <div className="relative">
                    <Clock
                      size={18}
                      className="absolute left-3 top-3.5 text-gray-500"
                    />
                    <input
                      type="date"
                      name="date"
                      value={appointmentData.date}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-moto-gray border border-moto-gray-light/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-moto-accent-orange transition-colors text-sm"
                    />
                  </div>
                </div>

                {/* Service Type */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Service
                  </label>
                  <select
                    name="service"
                    value={appointmentData.service}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 bg-moto-gray border border-moto-gray-light/30 rounded-lg text-white focus:outline-none focus:border-moto-accent-orange transition-colors text-sm"
                  >
                    <option>General Maintenance</option>
                    <option>Oil Change</option>
                    <option>Tire Service</option>
                    <option>Brake Service</option>
                    <option>Custom Work</option>
                  </select>
                </div>

                {/* Submit Button */}
                <motion.button
                  type="submit"
                  className="w-full mt-6 px-6 py-3 bg-gradient-accent rounded-lg font-bold text-white uppercase tracking-wide hover:shadow-2xl hover:shadow-moto-accent/50 transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Confirm Appointment
                </motion.button>
              </form>

              {/* Info Footer */}
              <div className="mt-6 pt-6 border-t border-moto-gray-light/30 flex items-center gap-2 text-xs text-gray-400">
                <MapPin size={16} />
                <span>Response within 24 hours</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default FeaturedSection;

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import slide1 from "../pictures/hero-slide-images/hero-slide-image-1.png";
import slide2 from "../pictures/hero-slide-images/hero-slide-image-2-BiN1PW1l.jpg";
import slide3 from "../pictures/hero-slide-images/hero-slide-image-3-yNLhzYOl.jpg";
import slide4 from "../pictures/hero-slide-images/hero-slide-image-4-CebYJDWf.jpg";

interface Slide {
  id: number;
  image: string;
  title: string;
  subtitle: string;
}

interface HeroSlideshowProps {
  onBookNow?: () => void;
  onShopNow?: () => void;
}

const HeroSlideshow: React.FC<HeroSlideshowProps> = ({
}) => {
  const [current, setCurrent] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);

  const slides: Slide[] = [
    {
      id: 1,
      image: slide1,
      title: "Gear Up. Ride Hard.",
      subtitle:
        "Premium Parts • Expert Service • Para sa Mga Rider ng Pilipinas",
    },
    {
      id: 2,
      image: slide2,
      title: "Service Fast.",
      subtitle: "Premium Motorcycle Parts & Expert Maintenance sa PH",
    },
    {
      id: 3,
      image: slide3,
      title: "Powered By Performance",
      subtitle: "Top-Tier Components Para sa Yamaha, Honda, Suzuki",
    },
    {
      id: 4,
      image: slide4,
      title: "Built To Last",
      subtitle: "Quality Parts From Local & International Brands",
    },
  ];

  const nextSlide = () => {
    setCurrent((prev) => (prev + 1) % slides.length);
    setIsAutoPlay(false);
  };

  const prevSlide = () => {
    setCurrent((prev) => (prev - 1 + slides.length) % slides.length);
    setIsAutoPlay(false);
  };

  useEffect(() => {
    if (!isAutoPlay) return;

    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlay]);

  return (
    <div className="relative w-full h-[90vh] overflow-hidden group bg-black">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {/* Background Image */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${slides[current].image})`,
              backgroundPosition: "center",
            }}
          />

          {/* Gradient Overlay*/}
          <div className="absolute inset-0 bg-gradient-overlay" />

          {/* Content */}
          <div className="relative h-full flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="max-w-4xl"
            >
              <h1 className="font-display text-6xl sm:text-7xl lg:text-8xl font-black tracking-wider mb-4 text-white drop-shadow-2xl leading-none">
                {slides[current].title}
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-gray-100 font-medium tracking-wide drop-shadow-lg mb-8 max-w-2xl mx-auto">
                {slides[current].subtitle}
              </p>


            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        onMouseEnter={() => setIsAutoPlay(false)}
        className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-slate-900/80 sm:bg-slate-900/60 hover:bg-slate-700 text-white transition-all duration-300 opacity-0 group-hover:opacity-100 backdrop-blur-none sm:backdrop-blur-sm"
      >
        <ChevronLeft size={28} />
      </button>

      <button
        onClick={nextSlide}
        onMouseEnter={() => setIsAutoPlay(false)}
        className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-slate-900/80 sm:bg-slate-900/60 hover:bg-slate-700 text-white transition-all duration-300 opacity-0 group-hover:opacity-100 backdrop-blur-none sm:backdrop-blur-sm"
      >
        <ChevronRight size={28} />
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 flex gap-3">
        {slides.map((_, idx) => (
          <motion.button
            key={idx}
            onClick={() => {
              setCurrent(idx);
              setIsAutoPlay(false);
            }}
            className={`h-3 rounded-full transition-all duration-300 ${
              idx === current
                ? "w-12 bg-slate-900"
                : "w-3 bg-white/40 hover:bg-white/60"
            }`}
            whileHover={{ scale: 1.2 }}
          />
        ))}
      </div>

      {/* Auto-play indicator */}
      <div className="absolute top-24 right-8 z-40 text-sm text-gray-400 flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${isAutoPlay ? "bg-slate-400 animate-pulse" : "bg-slate-600"}`}
        />
      </div>
      
    </div>
  );
};

export default HeroSlideshow;

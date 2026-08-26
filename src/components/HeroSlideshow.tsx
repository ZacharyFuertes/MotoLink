import React from "react";
import slide1 from "../pictures/hero-slide-images/hero-slide-image-1.png";

interface HeroSlideshowProps {
  children?: React.ReactNode;
}

const HeroSlideshow: React.FC<HeroSlideshowProps> = ({ children }) => {
  return (
    <div className="relative w-full min-h-screen py-24 sm:py-28 lg:py-0 lg:h-[100vh] overflow-hidden bg-black flex items-center justify-center">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${slide1})`,
          backgroundPosition: "center",
        }}
      />

      {/* Gradient Overlays — dark navy wash + bottom fade for readability */}
      <div className="absolute inset-0 bg-gradient-overlay" />
      <div className="absolute inset-0 bg-moto-dark/70" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-moto-dark to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center px-4 text-center sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
};

export default HeroSlideshow;
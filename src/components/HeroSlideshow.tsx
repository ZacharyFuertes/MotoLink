import React from "react";
import slide1 from "../pictures/hero-slide-images/hero-slide-image-1.png";

interface HeroSlideshowProps {
  children?: React.ReactNode;
}

const HeroSlideshow: React.FC<HeroSlideshowProps> = ({ children }) => {
  return (
    <div className="keep-dark relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-black pb-10 pt-24 sm:pb-12 sm:pt-28 lg:min-h-screen">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${slide1})`,
          backgroundPosition: "center",
        }}
      />

      {/* Restrained gray scrim keeps the photo visible while preserving contrast. */}
      <div className="hero-photo-scrim absolute inset-0 bg-gray-900/35" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-moto-dark/85 via-moto-dark/35 to-transparent" />

      {/* Content */}
      <div className="hero-content relative z-10 flex w-full flex-col items-center justify-center px-4 text-center sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
};

export default HeroSlideshow;
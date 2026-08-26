import React, { useState } from 'react';

type Photo = {
  url: string;
  caption?: string;
  category?: string;
};

interface GalleryProps {
  photos: Photo[];
}

const categories = ['All', 'Shop', 'Services', 'Location'];

export const Gallery: React.FC<GalleryProps> = ({ photos }) => {
  const [activeCat, setActiveCat] = useState<string>('All');

  const filtered = activeCat === 'All' ? photos : photos.filter((p) => p.category === activeCat);

  const featured = filtered[0];
  const thumbnails = filtered.slice(1, 5);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      {/* Filter pills */}
      <div className="flex gap-2 mb-4">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`px-3 py-1 rounded-full text-sm transition-colors 
              ${activeCat === cat ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Featured image */}
      {featured && (
        <div className="relative rounded-lg overflow-hidden mb-4">
          <img src={featured.url} alt={featured.caption || 'Featured'} className="w-full h-64 object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
            <p className="text-white text-sm line-clamp-2">{featured.caption}</p>
          </div>
        </div>
      )}

      {/* Thumbnails grid */}
      <div className="grid grid-cols-4 gap-2">
        {thumbnails.map((photo, idx) => (
          <div key={idx} className="relative rounded-md overflow-hidden h-24">
            <img src={photo.url} alt={photo.caption || `Thumb ${idx}`} className="w-full h-full object-cover" />
            {photo.caption && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs opacity-0 hover:opacity-100 transition-opacity">
                {photo.caption}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

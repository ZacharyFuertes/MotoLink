import { ShopSearchResult } from "../types/shop";
import ShopCard from "./ShopCard";

interface ShopGalleryProps {
  shops: ShopSearchResult[];
  onSelect: (shop: ShopSearchResult) => void;
  onConnect: (shop: ShopSearchResult) => void;
  onViewShop?: (shop: ShopSearchResult) => void;
}

const ShopGallery = ({ shops, onSelect, onConnect, onViewShop }: ShopGalleryProps) => {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {shops.map((shop) => (
        <ShopCard
          key={shop.id}
          shop={shop}
          onSelect={onSelect}
          onConnect={onConnect}
          onViewShop={onViewShop}
        />
      ))}
    </div>
  );
};

export default ShopGallery;

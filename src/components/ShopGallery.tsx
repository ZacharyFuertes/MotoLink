import { ShopSearchResult } from "../types/shop";
import ShopCard from "./ShopCard";

interface ShopGalleryProps {
  shops: ShopSearchResult[];
  onSelect: (shop: ShopSearchResult) => void;
  onConnect: (shop: ShopSearchResult) => void;
}

const ShopGallery = ({ shops, onSelect, onConnect }: ShopGalleryProps) => (
  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    {shops.map((shop) => <ShopCard key={shop.id} shop={shop} onSelect={onSelect} onConnect={onConnect} />)}
  </div>
);

export default ShopGallery;

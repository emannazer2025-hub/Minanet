import React from 'react';
import {
  BookOpen,
  Droplets,
  Gem,
  Glasses,
  Pill,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Store,
  Truck,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import type { MinaIndustryId } from '../themes.ts';

export const IndustryIcon: React.FC<{ industryId: MinaIndustryId; className?: string }> = ({
  industryId,
  className = 'w-5 h-5',
}) => {
  switch (industryId) {
    case 'fashion-apparel':
      return <Shirt className={className} />;
    case 'pharmacy-medical':
      return <Pill className={className} />;
    case 'supermarket-grocery':
      return <ShoppingBasket className={className} />;
    case 'mobile-electronics':
      return <Smartphone className={className} />;
    case 'perfumes-cosmetics':
      return <Droplets className={className} />;
    case 'restaurant-cafe':
      return <UtensilsCrossed className={className} />;
    case 'autoparts-hardware':
      return <Wrench className={className} />;
    case 'jewelry-watches':
      return <Gem className={className} />;
    case 'stationery-library':
      return <BookOpen className={className} />;
    case 'optics-eyewear':
      return <Glasses className={className} />;
    case 'wholesale-distribution':
      return <Truck className={className} />;
    default:
      return <Store className={className} />;
  }
};

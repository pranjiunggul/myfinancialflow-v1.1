import React from 'react';
import {
  Utensils,
  ShoppingCart,
  Car,
  Zap,
  ShoppingBag,
  HeartPulse,
  Film,
  GraduationCap,
  Briefcase,
  Laptop,
  TrendingUp,
  TrendingDown,
  Gift,
  Home,
  Plane,
  Coffee,
  Dumbbell,
  Music,
  Book,
  Smartphone,
  Receipt,
  Wallet,
  Landmark,
  CreditCard,
  Banknote,
  Coins,
  PiggyBank,
  DollarSign,
  Building,
  ArrowLeftRight,
  HandCoins,
  CircleDot,
  Folder,
} from 'lucide-react';

const ICON_MAP: Record<string, React.FC<{ className?: string; size?: number }>> = {
  Utensils,
  ShoppingCart,
  Car,
  Zap,
  ShoppingBag,
  HeartPulse,
  Film,
  GraduationCap,
  Briefcase,
  Laptop,
  TrendingUp,
  TrendingDown,
  Gift,
  Home,
  Plane,
  Coffee,
  Dumbbell,
  Music,
  Book,
  Smartphone,
  Receipt,
  Wallet,
  Landmark,
  CreditCard,
  Banknote,
  Coins,
  PiggyBank,
  DollarSign,
  Building,
  ArrowLeftRight,
  HandCoins,
  CircleDot,
  Folder,
};

interface IconRendererProps {
  name: string;
  className?: string;
  size?: number;
}

export const IconRenderer: React.FC<IconRendererProps> = ({ name, className = 'w-5 h-5', size }) => {
  const Component = ICON_MAP[name] || CircleDot;
  return <Component className={className} size={size} />;
};

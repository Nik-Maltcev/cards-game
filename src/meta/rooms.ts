export interface ArtSpec {
  shape:
    | 'wall'
    | 'floor'
    | 'sofa'
    | 'table'
    | 'lamp'
    | 'plant'
    | 'rug'
    | 'painting'
    | 'bed'
    | 'counter'
    | 'shelf'
    | 'chair'
    | 'tree';
  colors: string[];
}

export interface ItemVariant {
  id: string;
  name: string;
  price: number;
  premium?: boolean;
  art: ArtSpec;
}

export interface ItemSlot {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  variants: ItemVariant[];
}

export interface Room {
  id: string;
  name: string;
  unlockCost: number;
  slots: ItemSlot[];
}

function v(id: string, name: string, price: number, shape: ArtSpec['shape'], colors: string[], premium = false): ItemVariant {
  return premium ? { id, name, price, premium, art: { shape, colors } } : { id, name, price, art: { shape, colors } };
}

function slot(id: string, name: string, x: number, y: number, w: number, h: number, layer: number, variants: ItemVariant[]): ItemSlot {
  return { id, name, x, y, w, h, layer, variants };
}

export const ROOMS: Room[] = [
  {
    id: 'living',
    name: 'Living Room',
    unlockCost: 0,
    slots: [
      slot('wall', 'Walls', 0, 0, 1, 0.62, 0, [
        v('wall-a', 'Sage', 0, 'wall', ['#a8bfa5', '#93ab90']),
        v('wall-b', 'Cream', 250, 'wall', ['#e8dcc4', '#d9cbb0']),
        v('wall-c', 'Dusk Blue', 400, 'wall', ['#9fb4c7', '#8aa0b4']),
      ]),
      slot('floor', 'Floor', 0, 0.62, 1, 0.38, 0, [
        v('floor-a', 'Oak', 0, 'floor', ['#b98d5f', '#a67c50']),
        v('floor-b', 'Walnut', 300, 'floor', ['#8a6242', '#77533a']),
        v('floor-c', 'Ash', 450, 'floor', ['#cbb391', '#b8a181']),
      ]),
      slot('rug', 'Rug', 0.28, 0.74, 0.44, 0.2, 1, [
        v('rug-a', 'Plain Jute', 0, 'rug', ['#c9b18c', '#b89f79']),
        v('rug-b', 'Striped', 180, 'rug', ['#c96f4a', '#e8dcc4']),
        v('rug-c', 'Velvet Rose', 900, 'rug', ['#b0566b', '#8e4256'], true),
      ]),
      slot('sofa', 'Sofa', 0.14, 0.5, 0.34, 0.26, 2, [
        v('sofa-a', 'Basic Loveseat', 0, 'sofa', ['#7d9b76', '#66825f']),
        v('sofa-b', 'Linen Three-seat', 320, 'sofa', ['#d9cbb0', '#c2b394']),
        v('sofa-c', 'Emerald Velvet', 1400, 'sofa', ['#2f7d6d', '#256457'], true),
      ]),
      slot('table', 'Coffee Table', 0.52, 0.62, 0.2, 0.14, 3, [
        v('table-a', 'Pine Stool', 0, 'table', ['#b98d5f', '#a67c50']),
        v('table-b', 'Round Oak', 220, 'table', ['#c8a06b', '#b08a55']),
        v('table-c', 'Marble Top', 1100, 'table', ['#e9e6df', '#b98d5f'], true),
      ]),
      slot('lamp', 'Floor Lamp', 0.82, 0.42, 0.12, 0.3, 2, [
        v('lamp-a', 'Paper Lantern', 0, 'lamp', ['#f0e3c0', '#8a6242']),
        v('lamp-b', 'Brass Arc', 260, 'lamp', ['#e8c877', '#a8842f']),
      ]),
      slot('plant', 'Plant', 0.05, 0.5, 0.1, 0.22, 2, [
        v('plant-a', 'Fern', 0, 'plant', ['#5f8f57', '#a8763f']),
        v('plant-b', 'Monstera', 200, 'plant', ['#3f7d4f', '#c96f4a']),
        v('plant-c', 'Olive Tree', 850, 'plant', ['#7d9b76', '#d9cbb0'], true),
      ]),
      slot('painting', 'Wall Art', 0.6, 0.16, 0.16, 0.2, 1, [
        v('paint-a', 'Empty Frame', 0, 'painting', ['#8a6242', '#e8dcc4']),
        v('paint-b', 'Hills', 150, 'painting', ['#8a6242', '#7d9b76']),
        v('paint-c', 'Golden Sun', 800, 'painting', ['#a8842f', '#e8c877'], true),
      ]),
    ],
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    unlockCost: 1500,
    slots: [
      slot('wall', 'Walls', 0, 0, 1, 0.62, 0, [
        v('wall-a', 'Tile White', 0, 'wall', ['#e6e2d6', '#d4cfc0']),
        v('wall-b', 'Mint', 250, 'wall', ['#bcd8c6', '#a6c4b0']),
        v('wall-c', 'Terracotta', 400, 'wall', ['#d08b6a', '#b8755a']),
      ]),
      slot('floor', 'Floor', 0, 0.62, 1, 0.38, 0, [
        v('floor-a', 'Checker', 0, 'floor', ['#d9d4c5', '#8f8a7c']),
        v('floor-b', 'Oak', 300, 'floor', ['#b98d5f', '#a67c50']),
      ]),
      slot('counter', 'Counter', 0.08, 0.46, 0.4, 0.24, 2, [
        v('counter-a', 'Pine Counter', 0, 'counter', ['#b98d5f', '#8f8a7c']),
        v('counter-b', 'Butcher Block', 340, 'counter', ['#c8a06b', '#5c5648']),
        v('counter-c', 'Stone & Brass', 1500, 'counter', ['#e9e6df', '#a8842f'], true),
      ]),
      slot('stove', 'Stove', 0.54, 0.44, 0.16, 0.26, 2, [
        v('stove-a', 'Old Range', 0, 'counter', ['#6e6a60', '#4c4840']),
        v('stove-b', 'Retro Red', 420, 'counter', ['#c0504a', '#8e3a35']),
      ]),
      slot('table', 'Dining Table', 0.62, 0.66, 0.28, 0.2, 3, [
        v('table-a', 'Folding Table', 0, 'table', ['#b98d5f', '#a67c50']),
        v('table-b', 'Farmhouse', 380, 'table', ['#c8a06b', '#8a6242']),
      ]),
      slot('chair', 'Chairs', 0.56, 0.62, 0.1, 0.16, 2, [
        v('chair-a', 'Stool', 0, 'chair', ['#8a6242', '#77533a']),
        v('chair-b', 'Windsor', 190, 'chair', ['#5f8f57', '#4a7344']),
      ]),
      slot('shelf', 'Shelf', 0.16, 0.16, 0.24, 0.14, 1, [
        v('shelf-a', 'Bare Board', 0, 'shelf', ['#8a6242', '#b98d5f']),
        v('shelf-b', 'Herb Row', 160, 'shelf', ['#8a6242', '#5f8f57']),
        v('shelf-c', 'Copper Pots', 900, 'shelf', ['#8a6242', '#c07a4a'], true),
      ]),
      slot('plant', 'Window Plant', 0.86, 0.4, 0.09, 0.2, 2, [
        v('plant-a', 'Basil', 0, 'plant', ['#5f8f57', '#c96f4a']),
        v('plant-b', 'Lemon Tree', 800, 'plant', ['#3f7d4f', '#e8c877'], true),
      ]),
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    unlockCost: 3000,
    slots: [
      slot('wall', 'Walls', 0, 0, 1, 0.62, 0, [
        v('wall-a', 'Lavender', 0, 'wall', ['#b7aec6', '#a298b2']),
        v('wall-b', 'Blush', 250, 'wall', ['#e0c1bb', '#cba9a2']),
        v('wall-c', 'Night Blue', 400, 'wall', ['#7d8ba6', '#687690']),
      ]),
      slot('floor', 'Floor', 0, 0.62, 1, 0.38, 0, [
        v('floor-a', 'Oak', 0, 'floor', ['#b98d5f', '#a67c50']),
        v('floor-b', 'Carpet Sand', 350, 'floor', ['#d9cbb0', '#c2b394']),
      ]),
      slot('bed', 'Bed', 0.16, 0.44, 0.4, 0.3, 2, [
        v('bed-a', 'Cot', 0, 'bed', ['#8f8a7c', '#d9d4c5']),
        v('bed-b', 'Queen Linen', 420, 'bed', ['#d9cbb0', '#e8dcc4']),
        v('bed-c', 'Canopy Plum', 1800, 'bed', ['#7d5a76', '#e8dcc4'], true),
      ]),
      slot('rug', 'Rug', 0.6, 0.76, 0.32, 0.16, 1, [
        v('rug-a', 'Wool Round', 0, 'rug', ['#d9cbb0', '#c2b394']),
        v('rug-b', 'Braided Rose', 900, 'rug', ['#b0566b', '#e8dcc4'], true),
      ]),
      slot('wardrobe', 'Wardrobe', 0.78, 0.34, 0.16, 0.34, 2, [
        v('ward-a', 'Curtain Rail', 0, 'shelf', ['#8a6242', '#d9cbb0']),
        v('ward-b', 'Oak Wardrobe', 460, 'shelf', ['#8a6242', '#77533a']),
      ]),
      slot('lamp', 'Night Lamp', 0.62, 0.46, 0.09, 0.16, 3, [
        v('lamp-a', 'Candle', 0, 'lamp', ['#f0e3c0', '#8a6242']),
        v('lamp-b', 'Ceramic Dome', 210, 'lamp', ['#c96f4a', '#f0e3c0']),
      ]),
      slot('painting', 'Wall Art', 0.3, 0.14, 0.14, 0.18, 1, [
        v('paint-a', 'Empty Frame', 0, 'painting', ['#8a6242', '#e8dcc4']),
        v('paint-b', 'Moon', 170, 'painting', ['#8a6242', '#b7aec6']),
      ]),
      slot('plant', 'Plant', 0.05, 0.5, 0.09, 0.2, 2, [
        v('plant-a', 'Ivy', 0, 'plant', ['#5f8f57', '#a8763f']),
        v('plant-b', 'Orchid', 750, 'plant', ['#b0566b', '#e8dcc4'], true),
      ]),
    ],
  },
  {
    id: 'garden',
    name: 'Garden',
    unlockCost: 5000,
    slots: [
      slot('wall', 'Sky', 0, 0, 1, 0.62, 0, [
        v('wall-a', 'Morning', 0, 'wall', ['#bcd8e0', '#d8e6e2']),
        v('wall-b', 'Sunset', 300, 'wall', ['#e8b48c', '#d8907a']),
        v('wall-c', 'Dusk', 450, 'wall', ['#8d93b8', '#6f7599']),
      ]),
      slot('floor', 'Lawn', 0, 0.62, 1, 0.38, 0, [
        v('floor-a', 'Grass', 0, 'floor', ['#7d9b76', '#66825f']),
        v('floor-b', 'Stone Path', 320, 'floor', ['#b8b2a4', '#9a9486']),
      ]),
      slot('bench', 'Bench', 0.16, 0.52, 0.26, 0.18, 2, [
        v('bench-a', 'Log Bench', 0, 'sofa', ['#8a6242', '#77533a']),
        v('bench-b', 'Iron Bench', 380, 'sofa', ['#4c4840', '#7d9b76']),
      ]),
      slot('table', 'Tea Table', 0.5, 0.6, 0.16, 0.14, 3, [
        v('table-a', 'Crate Table', 0, 'table', ['#b98d5f', '#a67c50']),
        v('table-b', 'Bistro Set', 340, 'table', ['#e8dcc4', '#4c4840']),
      ]),
      slot('flowers', 'Flower Bed', 0.72, 0.66, 0.24, 0.16, 2, [
        v('flowers-a', 'Wild Grass', 0, 'plant', ['#5f8f57', '#7d9b76']),
        v('flowers-b', 'Tulips', 260, 'plant', ['#c0504a', '#e8c877']),
        v('flowers-c', 'Rose Arch', 1200, 'plant', ['#b0566b', '#5f8f57'], true),
      ]),
      slot('tree', 'Tree', 0.06, 0.24, 0.16, 0.4, 1, [
        v('tree-a', 'Young Birch', 0, 'tree', ['#5f8f57', '#d9d4c5']),
        v('tree-b', 'Apple Tree', 420, 'tree', ['#3f7d4f', '#c0504a']),
        v('tree-c', 'Old Oak', 1600, 'tree', ['#2f5d3f', '#8a6242'], true),
      ]),
      slot('lamp', 'Garden Light', 0.44, 0.5, 0.07, 0.18, 3, [
        v('lamp-a', 'Stake Light', 0, 'lamp', ['#f0e3c0', '#4c4840']),
        v('lamp-b', 'Lantern Post', 240, 'lamp', ['#e8c877', '#4c4840']),
      ]),
      slot('rug', 'Patio Mat', 0.46, 0.78, 0.26, 0.12, 1, [
        v('rug-a', 'Straw Mat', 0, 'rug', ['#c9b18c', '#b89f79']),
        v('rug-b', 'Tile Patio', 280, 'rug', ['#d08b6a', '#e8dcc4']),
      ]),
    ],
  },
  {
    id: 'office',
    name: 'Study',
    unlockCost: 8000,
    slots: [
      slot('wall', 'Walls', 0, 0, 1, 0.62, 0, [
        v('wall-a', 'Library Green', 0, 'wall', ['#5c6b57', '#4a5846']),
        v('wall-b', 'Oxblood', 300, 'wall', ['#7d4a44', '#663a35']),
        v('wall-c', 'Slate', 450, 'wall', ['#6e7478', '#5a6064']),
      ]),
      slot('floor', 'Floor', 0, 0.62, 1, 0.38, 0, [
        v('floor-a', 'Dark Oak', 0, 'floor', ['#8a6242', '#77533a']),
        v('floor-b', 'Parquet', 380, 'floor', ['#b98d5f', '#8a6242']),
      ]),
      slot('desk', 'Desk', 0.2, 0.5, 0.34, 0.22, 2, [
        v('desk-a', 'Plank Desk', 0, 'counter', ['#b98d5f', '#77533a']),
        v('desk-b', 'Writing Desk', 440, 'counter', ['#77533a', '#a8842f']),
        v('desk-c', 'Mahogany Executive', 2000, 'counter', ['#5c3a28', '#e8c877'], true),
      ]),
      slot('chair', 'Chair', 0.34, 0.58, 0.12, 0.18, 3, [
        v('chair-a', 'Stool', 0, 'chair', ['#8a6242', '#77533a']),
        v('chair-b', 'Leather Arm', 420, 'chair', ['#7d4a44', '#5c3a28']),
      ]),
      slot('bookcase', 'Bookcase', 0.72, 0.28, 0.2, 0.42, 2, [
        v('book-a', 'Two Shelves', 0, 'shelf', ['#77533a', '#d9cbb0']),
        v('book-b', 'Full Case', 460, 'shelf', ['#77533a', '#c0504a']),
        v('book-c', 'Glass Cabinet', 1700, 'shelf', ['#5c3a28', '#bcd8e0'], true),
      ]),
      slot('rug', 'Rug', 0.24, 0.78, 0.4, 0.16, 1, [
        v('rug-a', 'Flatweave', 0, 'rug', ['#8f8a7c', '#7a7568']),
        v('rug-b', 'Persian', 950, 'rug', ['#7d4a44', '#e8c877'], true),
      ]),
      slot('lamp', 'Desk Lamp', 0.26, 0.44, 0.08, 0.14, 3, [
        v('lamp-a', 'Candle', 0, 'lamp', ['#f0e3c0', '#8a6242']),
        v('lamp-b', 'Banker Lamp', 260, 'lamp', ['#2f7d6d', '#e8c877']),
      ]),
      slot('painting', 'Wall Art', 0.44, 0.14, 0.14, 0.18, 1, [
        v('paint-a', 'Empty Frame', 0, 'painting', ['#a8842f', '#e8dcc4']),
        v('paint-b', 'Old Map', 190, 'painting', ['#a8842f', '#c9b18c']),
      ]),
    ],
  },
];

export function roomById(id: string): Room {
  return ROOMS.find((r) => r.id === id)!;
}

export function roomIndex(id: string): number {
  return ROOMS.findIndex((r) => r.id === id);
}

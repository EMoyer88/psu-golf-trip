// Saturday lunch pre-order: menu data, deadline, and ready time in one place
// so prices/choices/modifiers can be tweaked without touching the order-form
// or admin-view rendering logic in app/page.tsx.

export type LunchChoiceGroup = {
  label: string; // e.g. "Sauce" — required, single-select
  options: string[];
};

export type LunchItem = {
  id: string;
  name: string;
  price: number; // dollars
  choice?: LunchChoiceGroup;
};

export type LunchCategory = {
  id: string;
  label: string;
  items: LunchItem[];
  modifiersAllowed?: boolean; // Handhelds only — sub fries / make it a wrap
};

export const LUNCH_MENU: LunchCategory[] = [
  {
    id: 'salads', label: 'Market Salads', items: [
      { id: 'chicken-caesar-salad', name: 'Chicken Caesar Salad', price: 13 },
      { id: 'cobb-salad', name: 'Classic Cobb Salad', price: 15 },
    ],
  },
  {
    id: 'shareables', label: 'Shareables', items: [
      { id: 'waffle-fries', name: 'Waffle Fries', price: 4 },
      { id: 'pub-chips-dip', name: 'Pub Chips & French Onion Dip', price: 8 },
      { id: 'fried-pickle-chips', name: 'Fried Pickle Chips', price: 9 },
      { id: 'cheese-curds', name: 'Wisconsin Cheese Curds', price: 10 },
      { id: 'quesadilla', name: 'Clubhouse Quesadilla', price: 11 },
      { id: 'wings', name: 'Crispy Chicken Wings', price: 14, choice: { label: 'Sauce', options: ['BBQ', 'Buffalo', 'Wing Dust'] } },
    ],
  },
  {
    id: 'specials', label: 'Featured Specials', items: [
      { id: 'hot-dog', name: 'Turn Hot Dog', price: 3 },
      { id: 'bacon-ranch-wrap', name: 'Chicken Bacon Ranch Wrap', price: 13 },
      { id: 'caesar-wrap', name: 'Chicken Caesar Wrap', price: 13 },
    ],
  },
  {
    id: 'handhelds', label: 'Handhelds', modifiersAllowed: true, items: [
      { id: 'patty-melt', name: 'Patty Melt', price: 14 },
      { id: 'crispy-chicken-sandwich', name: 'Crispy Chicken Sandwich', price: 14 },
      { id: 'grilled-chicken-sandwich', name: 'Grilled Chicken Sandwich', price: 14 },
      { id: 'cheesesteak', name: 'Clubhouse Cheesesteak', price: 16, choice: { label: 'Protein', options: ['Shaved steak', 'Grilled chicken'] } },
      { id: 'smokehouse-burger', name: 'Smokehouse Burger', price: 16 },
    ],
  },
];

// Handhelds-only modifiers, applied per order line (i.e. to the whole
// quantity of that item on one player's order, not per individual unit).
export const LUNCH_MODIFIERS: { id: 'subFries' | 'wrap'; label: string; price: number }[] = [
  { id: 'subFries', label: 'Substitute chips for fries', price: 4 },
  { id: 'wrap', label: 'Make it a wrap', price: 1 },
];

// Friday 5:00 PM cutoff — tied to this trip's actual dates (the day before
// ROUNDS_META/autoRoundId's Saturday-round cutoff in lib/tripData.ts).
export const LUNCH_ORDER_DEADLINE = new Date(2026, 6, 24, 17, 0, 0);

export const LUNCH_READY_TIME_LABEL = '12:30 PM Saturday';

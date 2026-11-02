import type { FoodItem } from '../types';

/**
 * Seed food database — Indian / Maharashtrian staples.
 * Values are approximate per standard serving (kcal, protein g, carbs g, fat g).
 * Users can add their own items from the Food screen.
 */
const f = (
  id: string,
  name: string,
  category: string,
  servingLabel: string,
  servingGrams: number,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  vegetarian = true,
  nameLocal?: string,
): FoodItem => ({
  id,
  name,
  nameLocal,
  category,
  servingLabel,
  servingGrams,
  kcal,
  proteinG,
  carbsG,
  fatG,
  vegetarian,
  custom: false,
});

export const SEED_FOODS: FoodItem[] = [
  // Breads & grains
  f('jowar_bhakri', 'Jowar bhakri', 'Breads', '1 bhakri (medium)', 60, 150, 4.5, 31, 1.2, true, 'ज्वारीची भाकरी'),
  f('bajra_bhakri', 'Bajra bhakri', 'Breads', '1 bhakri (medium)', 60, 165, 5, 30, 2.5, true, 'बाजरीची भाकरी'),
  f('chapati', 'Chapati / phulka', 'Breads', '1 chapati (6 inch)', 40, 105, 3.2, 20, 1.5, true, 'पोळी'),
  f('chapati_ghee', 'Chapati with ghee', 'Breads', '1 chapati + ½ tsp ghee', 43, 125, 3.2, 20, 3.8, true),
  f('paratha_plain', 'Paratha (plain)', 'Breads', '1 paratha', 70, 210, 4.5, 30, 8, true),
  f('rice_cooked', 'Steamed rice', 'Rice', '1 katori (150 g)', 150, 195, 4, 43, 0.4, true, 'भात'),
  f('brown_rice', 'Brown rice', 'Rice', '1 katori (150 g)', 150, 165, 3.8, 34, 1.3, true),
  f('varan_bhaat', 'Varan bhaat', 'Rice', '1 plate (rice + dal)', 250, 300, 10, 55, 3.5, true, 'वरण भात'),
  f('poha', 'Kanda poha', 'Breakfast', '1 plate (150 g)', 150, 250, 4.5, 42, 7, true, 'कांदे पोहे'),
  f('upma', 'Upma', 'Breakfast', '1 plate (150 g)', 150, 230, 5, 38, 6, true),
  f('sabudana_khichdi', 'Sabudana khichdi', 'Breakfast', '1 plate (150 g)', 150, 330, 3, 55, 11, true),
  f('idli', 'Idli', 'Breakfast', '1 idli', 40, 60, 2, 12, 0.3, true),
  f('dosa_plain', 'Plain dosa', 'Breakfast', '1 dosa', 80, 130, 3, 22, 3.5, true),
  f('thalipeeth', 'Thalipeeth', 'Breakfast', '1 piece', 80, 200, 6, 30, 6, true, 'थालीपीठ'),
  f('misal_pav', 'Misal pav', 'Breakfast', '1 plate + 2 pav', 300, 480, 15, 65, 17, true),
  f('oats_porridge', 'Oats porridge (milk)', 'Breakfast', '1 bowl (200 g)', 200, 190, 7, 28, 5, true),

  // Dals & legumes
  f('dal_tadka', 'Dal tadka', 'Dal', '1 katori (150 g)', 150, 170, 9, 22, 5, true, 'डाळ'),
  f('varan', 'Varan (plain toor dal)', 'Dal', '1 katori (150 g)', 150, 130, 8, 20, 2, true, 'वरण'),
  f('amti', 'Amti', 'Dal', '1 katori (150 g)', 150, 150, 8, 21, 4, true, 'आमटी'),
  f('usal_matki', 'Matki usal', 'Dal', '1 katori (150 g)', 150, 180, 10, 26, 4, true, 'मटकीची उसळ'),
  f('chana_masala', 'Chana masala', 'Dal', '1 katori (150 g)', 150, 210, 10, 30, 6, true),
  f('rajma', 'Rajma', 'Dal', '1 katori (150 g)', 150, 200, 11, 30, 4, true),
  f('pithla', 'Pithla (besan curry)', 'Dal', '1 katori (150 g)', 150, 170, 8, 18, 7, true, 'पिठलं'),

  // Vegetables / sabzi
  f('sabzi_mixed', 'Mixed vegetable sabzi', 'Sabzi', '1 katori (120 g)', 120, 110, 3, 12, 6, true, 'भाजी'),
  f('bhindi', 'Bhindi fry', 'Sabzi', '1 katori (120 g)', 120, 130, 2.5, 10, 9, true),
  f('aloo_sabzi', 'Batata bhaji', 'Sabzi', '1 katori (120 g)', 120, 150, 2.5, 22, 6, true, 'बटाटा भाजी'),
  f('palak_paneer', 'Palak paneer', 'Sabzi', '1 katori (150 g)', 150, 240, 12, 10, 17, true),
  f('paneer_bhurji', 'Paneer bhurji', 'Sabzi', '1 katori (120 g)', 120, 260, 15, 7, 19, true),
  f('methi_sabzi', 'Methi sabzi', 'Sabzi', '1 katori (120 g)', 120, 100, 4, 9, 5, true),
  f('bharli_vangi', 'Bharli vangi (stuffed brinjal)', 'Sabzi', '1 katori (120 g)', 120, 170, 3.5, 14, 11, true, 'भरली वांगी'),
  f('zunka', 'Zunka', 'Sabzi', '1 katori (120 g)', 120, 190, 8, 20, 8, true, 'झुणका'),
  f('koshimbir', 'Koshimbir (salad)', 'Sabzi', '1 small bowl (100 g)', 100, 60, 2, 8, 2, true, 'कोशिंबीर'),

  // Non-veg & eggs
  f('chicken_curry', 'Chicken curry', 'Non-veg', '1 katori (150 g, 3 pcs)', 150, 240, 22, 7, 14, false),
  f('chicken_grilled', 'Grilled chicken breast', 'Non-veg', '100 g', 100, 165, 31, 0, 3.6, false),
  f('egg_boiled', 'Boiled egg', 'Eggs', '1 egg', 50, 78, 6.3, 0.6, 5.3, false),
  f('egg_omelette', 'Omelette (2 eggs)', 'Eggs', '2 eggs + oil', 120, 220, 14, 2, 17, false),
  f('egg_bhurji', 'Egg bhurji (2 eggs)', 'Eggs', '1 plate', 140, 240, 14, 5, 18, false),
  f('fish_curry', 'Fish curry', 'Non-veg', '1 katori (150 g)', 150, 200, 20, 6, 11, false),
  f('mutton_curry', 'Mutton curry', 'Non-veg', '1 katori (150 g)', 150, 310, 22, 6, 22, false),

  // Dairy & snacks
  f('curd', 'Curd (dahi)', 'Dairy', '1 katori (150 g)', 150, 90, 5, 7, 4.5, true, 'दही'),
  f('buttermilk', 'Buttermilk (taak)', 'Dairy', '1 glass (250 ml)', 250, 45, 2.5, 4, 1.5, true, 'ताक'),
  f('milk', 'Milk (toned)', 'Dairy', '1 glass (250 ml)', 250, 150, 8, 12, 7.5, true),
  f('paneer', 'Paneer (raw)', 'Dairy', '50 g', 50, 145, 9, 2, 11, true),
  f('peanuts', 'Roasted peanuts', 'Snacks', '1 handful (30 g)', 30, 170, 7.5, 5, 14, true, 'शेंगदाणे'),
  f('banana', 'Banana', 'Fruit', '1 medium', 120, 105, 1.3, 27, 0.4, true),
  f('apple', 'Apple', 'Fruit', '1 medium', 180, 95, 0.5, 25, 0.3, true),
  f('papaya', 'Papaya', 'Fruit', '1 bowl (150 g)', 150, 65, 0.7, 16, 0.4, true),
  f('chikki', 'Peanut chikki', 'Snacks', '1 piece (25 g)', 25, 120, 3, 15, 5.5, true),
  f('vada_pav', 'Vada pav', 'Snacks', '1 piece', 130, 290, 6, 40, 12, true),
  f('samosa', 'Samosa', 'Snacks', '1 piece', 90, 260, 4.5, 28, 14, true),
  f('protein_whey', 'Whey protein', 'Supplements', '1 scoop (30 g)', 30, 120, 24, 3, 1.5, true),

  // Drinks
  f('tea_sugar', 'Tea with milk & sugar', 'Drinks', '1 cup (150 ml)', 150, 75, 2, 11, 2.5, true, 'चहा'),
  f('tea_nosugar', 'Tea with milk, no sugar', 'Drinks', '1 cup (150 ml)', 150, 35, 2, 3, 2, true),
  f('coffee_milk_sugar', 'Coffee with milk & sugar', 'Drinks', '1 cup (150 ml)', 150, 80, 2.5, 11, 2.8, true),
  f('coffee_black', 'Black coffee', 'Drinks', '1 cup (150 ml)', 150, 3, 0.2, 0, 0, true),
  f('green_tea', 'Green tea', 'Drinks', '1 cup', 150, 2, 0, 0, 0, true),
  f('fruit_juice', 'Fresh fruit juice', 'Drinks', '1 glass (250 ml)', 250, 115, 1, 27, 0.3, true),
  f('coconut_water', 'Coconut water', 'Drinks', '1 glass (250 ml)', 250, 45, 1.5, 9, 0.5, true),
];

export const FOOD_CATEGORIES = [...new Set(SEED_FOODS.map((x) => x.category))];

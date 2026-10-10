// Curated destinations. Facts here (coordinates, airport, season) are our own editorial
// list; descriptions and images are added from Wikipedia/Wikimedia by destinations.ts.
// Daily costs are per person per day (stay, food, local transport, activities), our own
// estimates by travel style, and are labelled as estimates in the app.

export type Style = 'shoestring' | 'moderate' | 'comfort' | 'luxury';
export interface DestinationSeed {
  slug: string;
  name: string;
  wiki: string; // English Wikipedia page title
  photoWiki?: string; // a different page to take the photo from (when the main one only has flags/maps)
  country: string;
  region: string;
  isDomestic: boolean;
  lat: number;
  lon: number;
  airportIata: string;
  bestTime: string;
  idealDays: number;
  tags: string[];
  personaTags: string[]; // adventure family budget luxury solo spiritual foodie honeymoon culture nature beach shopping
  cost: Record<Style, number>;
  featured?: boolean;
}

const IN = { country: 'India', isDomestic: true } as const;
const INDIA_COST = { shoestring: 1800, moderate: 4500, comfort: 10000, luxury: 28000 };
const INDIA_HILL = { shoestring: 1600, moderate: 4000, comfort: 9000, luxury: 22000 };
const SE_ASIA = { shoestring: 2800, moderate: 6500, comfort: 13000, luxury: 32000 };
const PREMIUM = { shoestring: 6000, moderate: 14000, comfort: 26000, luxury: 65000 };
const GULF = { shoestring: 5000, moderate: 12000, comfort: 24000, luxury: 60000 };

export const DESTINATIONS: DestinationSeed[] = [
  // India: North
  { slug: 'delhi', name: 'Delhi', wiki: 'Delhi', ...IN, region: 'India · North', lat: 28.6139, lon: 77.209, airportIata: 'DEL', bestTime: 'Oct–Mar', idealDays: 3, tags: ['city', 'history', 'food'], personaTags: ['culture', 'foodie', 'shopping', 'family'], cost: INDIA_COST, featured: true },
  { slug: 'agra', name: 'Agra', wiki: 'Agra', ...IN, region: 'India · North', lat: 27.1767, lon: 78.0081, airportIata: 'AGR', bestTime: 'Oct–Mar', idealDays: 2, tags: ['heritage', 'monuments'], personaTags: ['culture', 'family', 'honeymoon'], cost: INDIA_COST },
  { slug: 'jaipur', name: 'Jaipur', wiki: 'Jaipur', ...IN, region: 'India · Rajasthan', lat: 26.9124, lon: 75.7873, airportIata: 'JAI', bestTime: 'Oct–Mar', idealDays: 3, tags: ['heritage', 'forts', 'bazaars'], personaTags: ['culture', 'shopping', 'family', 'foodie'], cost: INDIA_COST, featured: true },
  { slug: 'udaipur', name: 'Udaipur', wiki: 'Udaipur', ...IN, region: 'India · Rajasthan', lat: 24.5854, lon: 73.7125, airportIata: 'UDR', bestTime: 'Sep–Mar', idealDays: 3, tags: ['lakes', 'palaces'], personaTags: ['honeymoon', 'luxury', 'culture'], cost: INDIA_COST, featured: true },
  { slug: 'jodhpur', name: 'Jodhpur', wiki: 'Jodhpur', ...IN, region: 'India · Rajasthan', lat: 26.2389, lon: 73.0243, airportIata: 'JDH', bestTime: 'Oct–Mar', idealDays: 2, tags: ['forts', 'blue city'], personaTags: ['culture', 'budget', 'solo'], cost: INDIA_COST },
  { slug: 'jaisalmer', name: 'Jaisalmer', wiki: 'Jaisalmer', ...IN, region: 'India · Rajasthan', lat: 26.9157, lon: 70.9083, airportIata: 'JSA', bestTime: 'Nov–Feb', idealDays: 3, tags: ['desert', 'camping'], personaTags: ['adventure', 'culture', 'solo'], cost: INDIA_COST },
  { slug: 'varanasi', name: 'Varanasi', wiki: 'Varanasi', ...IN, region: 'India · North', lat: 25.3176, lon: 82.9739, airportIata: 'VNS', bestTime: 'Oct–Mar', idealDays: 3, tags: ['ghats', 'temples'], personaTags: ['spiritual', 'culture', 'budget', 'solo'], cost: INDIA_COST, featured: true },
  { slug: 'rishikesh', name: 'Rishikesh', wiki: 'Rishikesh', ...IN, region: 'India · Himalaya', lat: 30.0869, lon: 78.2676, airportIata: 'DED', bestTime: 'Sep–Nov, Feb–May', idealDays: 3, tags: ['yoga', 'rafting'], personaTags: ['spiritual', 'adventure', 'budget', 'solo'], cost: INDIA_HILL },
  { slug: 'amritsar', name: 'Amritsar', wiki: 'Amritsar', ...IN, region: 'India · North', lat: 31.634, lon: 74.8723, airportIata: 'ATQ', bestTime: 'Oct–Mar', idealDays: 2, tags: ['golden temple', 'food'], personaTags: ['spiritual', 'foodie', 'family'], cost: INDIA_COST },
  { slug: 'shimla', name: 'Shimla', wiki: 'Shimla', ...IN, region: 'India · Himalaya', lat: 31.1048, lon: 77.1734, airportIata: 'SLV', bestTime: 'Mar–Jun, Dec–Jan', idealDays: 3, tags: ['hills', 'colonial'], personaTags: ['family', 'honeymoon', 'nature'], cost: INDIA_HILL },
  { slug: 'manali', name: 'Manali', wiki: 'Manali, Himachal Pradesh', ...IN, region: 'India · Himalaya', lat: 32.2432, lon: 77.1892, airportIata: 'KUU', bestTime: 'Mar–Jun, Oct–Feb', idealDays: 4, tags: ['mountains', 'snow'], personaTags: ['adventure', 'honeymoon', 'nature', 'family'], cost: INDIA_HILL, featured: true },
  { slug: 'leh', name: 'Leh', wiki: 'Leh', ...IN, region: 'India · Himalaya', lat: 34.1526, lon: 77.5771, airportIata: 'IXL', bestTime: 'Jun–Sep', idealDays: 6, tags: ['high desert', 'monasteries'], personaTags: ['adventure', 'spiritual', 'solo', 'nature'], cost: INDIA_HILL, featured: true },
  { slug: 'srinagar', name: 'Srinagar', wiki: 'Srinagar', ...IN, region: 'India · Himalaya', lat: 34.0837, lon: 74.7973, airportIata: 'SXR', bestTime: 'Apr–Oct', idealDays: 4, tags: ['lakes', 'houseboats'], personaTags: ['honeymoon', 'nature', 'family'], cost: INDIA_HILL },
  // India: West
  { slug: 'mumbai', name: 'Mumbai', wiki: 'Mumbai', ...IN, region: 'India · West', lat: 19.076, lon: 72.8777, airportIata: 'BOM', bestTime: 'Nov–Feb', idealDays: 3, tags: ['city', 'food', 'sea'], personaTags: ['foodie', 'shopping', 'culture'], cost: INDIA_COST },
  { slug: 'goa', name: 'Goa', wiki: 'Goa', ...IN, region: 'India · West', lat: 15.4909, lon: 73.8278, airportIata: 'GOI', bestTime: 'Nov–Feb', idealDays: 4, tags: ['beaches', 'nightlife'], personaTags: ['beach', 'budget', 'foodie', 'honeymoon', 'solo'], cost: INDIA_COST, featured: true },
  { slug: 'pune', name: 'Pune', wiki: 'Pune', ...IN, region: 'India · West', lat: 18.5204, lon: 73.8567, airportIata: 'PNQ', bestTime: 'Oct–Feb', idealDays: 2, tags: ['city', 'forts'], personaTags: ['culture', 'foodie'], cost: INDIA_COST },
  { slug: 'ahmedabad', name: 'Ahmedabad', wiki: 'Ahmedabad', ...IN, region: 'India · West', lat: 23.0225, lon: 72.5714, airportIata: 'AMD', bestTime: 'Nov–Feb', idealDays: 2, tags: ['heritage', 'food'], personaTags: ['culture', 'foodie', 'budget'], cost: INDIA_COST },
  // India: South
  { slug: 'bengaluru', name: 'Bengaluru', wiki: 'Bangalore', ...IN, region: 'India · South', lat: 12.9716, lon: 77.5946, airportIata: 'BLR', bestTime: 'Oct–Feb', idealDays: 2, tags: ['city', 'gardens', 'cafes'], personaTags: ['foodie', 'shopping'], cost: INDIA_COST },
  { slug: 'mysuru', name: 'Mysuru', wiki: 'Mysore', ...IN, region: 'India · South', lat: 12.2958, lon: 76.6394, airportIata: 'MYQ', bestTime: 'Oct–Feb', idealDays: 2, tags: ['palaces', 'heritage'], personaTags: ['culture', 'family'], cost: INDIA_COST },
  { slug: 'hampi', name: 'Hampi', wiki: 'Hampi', ...IN, region: 'India · South', lat: 15.335, lon: 76.46, airportIata: 'VDY', bestTime: 'Oct–Feb', idealDays: 3, tags: ['ruins', 'boulders'], personaTags: ['culture', 'budget', 'adventure', 'solo'], cost: INDIA_COST },
  { slug: 'kochi', name: 'Kochi', wiki: 'Kochi', ...IN, region: 'India · Kerala', lat: 9.9312, lon: 76.2673, airportIata: 'COK', bestTime: 'Oct–Mar', idealDays: 2, tags: ['port', 'heritage', 'seafood'], personaTags: ['culture', 'foodie', 'family'], cost: INDIA_COST, featured: true },
  { slug: 'munnar', name: 'Munnar', wiki: 'Munnar', ...IN, region: 'India · Kerala', lat: 10.0889, lon: 77.0595, airportIata: 'COK', bestTime: 'Sep–May', idealDays: 3, tags: ['tea gardens', 'hills'], personaTags: ['nature', 'honeymoon', 'family'], cost: INDIA_HILL },
  { slug: 'alleppey', name: 'Alleppey', wiki: 'Alappuzha', ...IN, region: 'India · Kerala', lat: 9.4981, lon: 76.3388, airportIata: 'COK', bestTime: 'Nov–Feb', idealDays: 2, tags: ['backwaters', 'houseboats'], personaTags: ['honeymoon', 'nature', 'family'], cost: INDIA_COST },
  { slug: 'chennai', name: 'Chennai', wiki: 'Chennai', ...IN, region: 'India · South', lat: 13.0827, lon: 80.2707, airportIata: 'MAA', bestTime: 'Nov–Feb', idealDays: 2, tags: ['temples', 'beach', 'food'], personaTags: ['culture', 'foodie', 'spiritual'], cost: INDIA_COST },
  { slug: 'puducherry', name: 'Puducherry', wiki: 'Pondicherry (city)', ...IN, region: 'India · South', lat: 11.9416, lon: 79.8083, airportIata: 'MAA', bestTime: 'Oct–Mar', idealDays: 2, tags: ['french quarter', 'beach'], personaTags: ['culture', 'honeymoon', 'foodie', 'solo'], cost: INDIA_COST },
  { slug: 'ooty', name: 'Ooty', wiki: 'Ooty', ...IN, region: 'India · South', lat: 11.4102, lon: 76.695, airportIata: 'CJB', bestTime: 'Mar–Jun, Sep–Nov', idealDays: 3, tags: ['hills', 'toy train'], personaTags: ['family', 'honeymoon', 'nature'], cost: INDIA_HILL },
  { slug: 'hyderabad', name: 'Hyderabad', wiki: 'Hyderabad', ...IN, region: 'India · South', lat: 17.385, lon: 78.4867, airportIata: 'HYD', bestTime: 'Oct–Feb', idealDays: 2, tags: ['biryani', 'heritage'], personaTags: ['foodie', 'culture', 'shopping'], cost: INDIA_COST },
  // India: East and islands
  { slug: 'kolkata', name: 'Kolkata', wiki: 'Kolkata', ...IN, region: 'India · East', lat: 22.5726, lon: 88.3639, airportIata: 'CCU', bestTime: 'Oct–Feb', idealDays: 3, tags: ['culture', 'food', 'colonial'], personaTags: ['culture', 'foodie', 'budget'], cost: INDIA_COST },
  { slug: 'darjeeling', name: 'Darjeeling', wiki: 'Darjeeling', ...IN, region: 'India · East', lat: 27.041, lon: 88.2663, airportIata: 'IXB', bestTime: 'Mar–May, Oct–Nov', idealDays: 3, tags: ['tea', 'mountains'], personaTags: ['nature', 'honeymoon', 'family'], cost: INDIA_HILL },
  { slug: 'gangtok', name: 'Gangtok', wiki: 'Gangtok', ...IN, region: 'India · East', lat: 27.3389, lon: 88.6065, airportIata: 'PYG', bestTime: 'Mar–May, Oct–Dec', idealDays: 4, tags: ['monasteries', 'mountains'], personaTags: ['adventure', 'spiritual', 'nature'], cost: INDIA_HILL },
  { slug: 'shillong', name: 'Shillong', wiki: 'Shillong', ...IN, region: 'India · East', lat: 25.5788, lon: 91.8933, airportIata: 'SHL', bestTime: 'Oct–May', idealDays: 3, tags: ['waterfalls', 'living root bridges'], personaTags: ['nature', 'adventure', 'solo'], cost: INDIA_HILL },
  { slug: 'andaman', name: 'Andaman Islands', wiki: 'Andaman Islands', ...IN, region: 'India · Islands', lat: 11.6234, lon: 92.7265, airportIata: 'IXZ', bestTime: 'Oct–May', idealDays: 5, tags: ['beaches', 'diving'], personaTags: ['beach', 'honeymoon', 'adventure'], cost: INDIA_COST, featured: true },
  // International
  { slug: 'dubai', name: 'Dubai', wiki: 'Dubai', country: 'United Arab Emirates', region: 'Middle East', isDomestic: false, lat: 25.2048, lon: 55.2708, airportIata: 'DXB', bestTime: 'Nov–Mar', idealDays: 4, tags: ['city', 'desert', 'shopping'], personaTags: ['luxury', 'shopping', 'family'], cost: GULF, featured: true },
  { slug: 'singapore', name: 'Singapore', wiki: 'Singapore', photoWiki: 'Gardens by the Bay', country: 'Singapore', region: 'Southeast Asia', isDomestic: false, lat: 1.3521, lon: 103.8198, airportIata: 'SIN', bestTime: 'Feb–Apr', idealDays: 4, tags: ['city', 'gardens', 'food'], personaTags: ['family', 'foodie', 'shopping'], cost: PREMIUM, featured: true },
  { slug: 'bangkok', name: 'Bangkok', wiki: 'Bangkok', country: 'Thailand', region: 'Southeast Asia', isDomestic: false, lat: 13.7563, lon: 100.5018, airportIata: 'BKK', bestTime: 'Nov–Feb', idealDays: 3, tags: ['temples', 'street food', 'markets'], personaTags: ['foodie', 'budget', 'shopping', 'culture'], cost: SE_ASIA, featured: true },
  { slug: 'phuket', name: 'Phuket', wiki: 'Phuket province', country: 'Thailand', region: 'Southeast Asia', isDomestic: false, lat: 7.8804, lon: 98.3923, airportIata: 'HKT', bestTime: 'Nov–Apr', idealDays: 4, tags: ['beaches', 'islands'], personaTags: ['beach', 'honeymoon', 'adventure'], cost: SE_ASIA },
  { slug: 'bali', name: 'Bali', wiki: 'Bali', country: 'Indonesia', region: 'Southeast Asia', isDomestic: false, lat: -8.3405, lon: 115.092, airportIata: 'DPS', bestTime: 'Apr–Oct', idealDays: 6, tags: ['beaches', 'temples', 'rice terraces'], personaTags: ['honeymoon', 'beach', 'spiritual', 'nature'], cost: SE_ASIA, featured: true },
  { slug: 'kuala-lumpur', name: 'Kuala Lumpur', wiki: 'Kuala Lumpur', country: 'Malaysia', region: 'Southeast Asia', isDomestic: false, lat: 3.139, lon: 101.6869, airportIata: 'KUL', bestTime: 'May–Jul, Dec–Feb', idealDays: 3, tags: ['city', 'food'], personaTags: ['foodie', 'shopping', 'family', 'budget'], cost: SE_ASIA },
  { slug: 'hanoi', name: 'Hanoi', wiki: 'Hanoi', country: 'Vietnam', region: 'Southeast Asia', isDomestic: false, lat: 21.0278, lon: 105.8342, airportIata: 'HAN', bestTime: 'Oct–Apr', idealDays: 3, tags: ['old quarter', 'street food'], personaTags: ['foodie', 'budget', 'culture', 'solo'], cost: SE_ASIA },
  { slug: 'maldives', name: 'Maldives', wiki: 'Maldives', country: 'Maldives', region: 'South Asia', isDomestic: false, lat: 4.1755, lon: 73.5093, airportIata: 'MLE', bestTime: 'Nov–Apr', idealDays: 4, tags: ['atolls', 'overwater villas'], personaTags: ['honeymoon', 'luxury', 'beach'], cost: GULF, featured: true },
  { slug: 'kathmandu', name: 'Kathmandu', wiki: 'Kathmandu', country: 'Nepal', region: 'South Asia', isDomestic: false, lat: 27.7172, lon: 85.324, airportIata: 'KTM', bestTime: 'Oct–Nov, Mar–Apr', idealDays: 4, tags: ['temples', 'trekking'], personaTags: ['spiritual', 'adventure', 'budget', 'culture'], cost: { shoestring: 1800, moderate: 4500, comfort: 9000, luxury: 22000 } },
  { slug: 'colombo', name: 'Colombo', wiki: 'Colombo', country: 'Sri Lanka', region: 'South Asia', isDomestic: false, lat: 6.9271, lon: 79.8612, airportIata: 'CMB', bestTime: 'Dec–Mar', idealDays: 3, tags: ['coast', 'colonial'], personaTags: ['budget', 'beach', 'foodie'], cost: SE_ASIA },
  { slug: 'tokyo', name: 'Tokyo', wiki: 'Tokyo', country: 'Japan', region: 'East Asia', isDomestic: false, lat: 35.6762, lon: 139.6503, airportIata: 'NRT', bestTime: 'Mar–May, Oct–Nov', idealDays: 5, tags: ['city', 'food', 'culture'], personaTags: ['foodie', 'culture', 'shopping', 'solo'], cost: PREMIUM, featured: true },
  { slug: 'kyoto', name: 'Kyoto', wiki: 'Kyoto', country: 'Japan', region: 'East Asia', isDomestic: false, lat: 35.0116, lon: 135.7681, airportIata: 'KIX', bestTime: 'Mar–May, Oct–Nov', idealDays: 4, tags: ['temples', 'gardens', 'tea'], personaTags: ['culture', 'spiritual', 'honeymoon'], cost: PREMIUM, featured: true },
  { slug: 'seoul', name: 'Seoul', wiki: 'Seoul', country: 'South Korea', region: 'East Asia', isDomestic: false, lat: 37.5665, lon: 126.978, airportIata: 'ICN', bestTime: 'Apr–Jun, Sep–Nov', idealDays: 4, tags: ['city', 'palaces', 'food'], personaTags: ['foodie', 'shopping', 'culture'], cost: PREMIUM },
  { slug: 'hong-kong', name: 'Hong Kong', wiki: 'Hong Kong', country: 'Hong Kong', region: 'East Asia', isDomestic: false, lat: 22.3193, lon: 114.1694, airportIata: 'HKG', bestTime: 'Oct–Dec', idealDays: 3, tags: ['skyline', 'food'], personaTags: ['foodie', 'shopping', 'family'], cost: PREMIUM },
  { slug: 'istanbul', name: 'Istanbul', wiki: 'Istanbul', country: 'Türkiye', region: 'Europe', isDomestic: false, lat: 41.0082, lon: 28.9784, airportIata: 'IST', bestTime: 'Apr–May, Sep–Nov', idealDays: 4, tags: ['history', 'bazaars'], personaTags: ['culture', 'foodie', 'shopping'], cost: { shoestring: 4000, moderate: 9000, comfort: 18000, luxury: 45000 } },
  { slug: 'paris', name: 'Paris', wiki: 'Paris', country: 'France', region: 'Europe', isDomestic: false, lat: 48.8566, lon: 2.3522, airportIata: 'CDG', bestTime: 'Apr–Jun, Sep–Oct', idealDays: 4, tags: ['museums', 'cafes'], personaTags: ['honeymoon', 'culture', 'foodie', 'luxury'], cost: PREMIUM, featured: true },
  { slug: 'london', name: 'London', wiki: 'London', country: 'United Kingdom', region: 'Europe', isDomestic: false, lat: 51.5072, lon: -0.1276, airportIata: 'LHR', bestTime: 'May–Sep', idealDays: 4, tags: ['museums', 'theatre'], personaTags: ['culture', 'shopping', 'family'], cost: PREMIUM },
  { slug: 'rome', name: 'Rome', wiki: 'Rome', country: 'Italy', region: 'Europe', isDomestic: false, lat: 41.9028, lon: 12.4964, airportIata: 'FCO', bestTime: 'Apr–Jun, Sep–Oct', idealDays: 4, tags: ['history', 'food'], personaTags: ['culture', 'foodie', 'honeymoon', 'spiritual'], cost: PREMIUM },
  { slug: 'zurich', name: 'Zurich', wiki: 'Zürich', country: 'Switzerland', region: 'Europe', isDomestic: false, lat: 47.3769, lon: 8.5417, airportIata: 'ZRH', bestTime: 'Jun–Sep, Dec–Mar', idealDays: 3, tags: ['lakes', 'alps'], personaTags: ['luxury', 'nature', 'honeymoon'], cost: { shoestring: 9000, moderate: 18000, comfort: 32000, luxury: 75000 } },
  { slug: 'new-york', name: 'New York', wiki: 'New York City', country: 'United States', region: 'Americas', isDomestic: false, lat: 40.7128, lon: -74.006, airportIata: 'JFK', bestTime: 'Apr–Jun, Sep–Nov', idealDays: 5, tags: ['city', 'museums', 'food'], personaTags: ['shopping', 'culture', 'foodie', 'solo'], cost: PREMIUM },
  { slug: 'sydney', name: 'Sydney', wiki: 'Sydney', country: 'Australia', region: 'Oceania', isDomestic: false, lat: -33.8688, lon: 151.2093, airportIata: 'SYD', bestTime: 'Sep–Nov, Mar–May', idealDays: 5, tags: ['harbour', 'beaches'], personaTags: ['beach', 'family', 'adventure'], cost: PREMIUM },
];

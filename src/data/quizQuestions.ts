export interface QuizQuestion {
  id: 'style' | 'interests' | 'pace' | 'budget' | 'food' | 'mix';
  question: string;
  options: { value: string; label: string; emoji: string }[];
}

export const quizQuestions: QuizQuestion[] = [
  {
    id: 'style',
    question: 'How do you like to travel?',
    options: [
      { value: 'planner', label: 'Every hour planned', emoji: '🗂️' },
      { value: 'flexible', label: 'Loose plan, room to wander', emoji: '🧭' },
      { value: 'spontaneous', label: 'Decide on the day', emoji: '🎈' },
    ],
  },
  {
    id: 'interests',
    question: 'What pulls you to a place?',
    options: [
      { value: 'culture', label: 'Temples, museums, history', emoji: '🏯' },
      { value: 'food', label: 'Food and markets', emoji: '🍜' },
      { value: 'nature', label: 'Hills, beaches, gardens', emoji: '🌿' },
      { value: 'shopping', label: 'Shopping and city life', emoji: '🛍️' },
    ],
  },
  {
    id: 'pace',
    question: 'Your ideal day?',
    options: [
      { value: 'slow', label: 'Two things, lots of chai', emoji: '☕' },
      { value: 'balanced', label: 'Busy morning, easy evening', emoji: '🌤️' },
      { value: 'packed', label: 'See it all', emoji: '⚡' },
    ],
  },
  {
    id: 'budget',
    question: 'How do you spend on trips?',
    options: [
      { value: 'saver', label: 'Save where I can', emoji: '🪙' },
      { value: 'mid', label: 'Comfort, not luxury', emoji: '🛏️' },
      { value: 'treat', label: 'Treat myself', emoji: '🥂' },
    ],
  },
  {
    id: 'food',
    question: 'What do you eat?',
    options: [
      { value: 'veg', label: 'Vegetarian', emoji: '🥗' },
      { value: 'jain', label: 'Jain', emoji: '🌱' },
      { value: 'nonveg', label: 'Everything', emoji: '🍗' },
    ],
  },
  {
    id: 'mix',
    question: 'Who usually comes along?',
    options: [
      { value: 'solo', label: 'Just me', emoji: '🎒' },
      { value: 'couple', label: 'Partner', emoji: '💞' },
      { value: 'family', label: 'Family with elders or kids', emoji: '👨‍👩‍👧' },
    ],
  },
];

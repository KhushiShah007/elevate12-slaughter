import type { DisruptionType, RecoveryOption } from '../types';

// SAMPLE recovery options per disruption. What breaks is computed by the cascade engine
// (src/engines/cascade.ts); Goal 4 ranks these options by true cost.
export const recoveryOptions: Record<DisruptionType, RecoveryOption[]> = {
  delay: [
    {
      id: 'o1',
      title: 'Let Air India rebook you on AI 358 tonight',
      trueCost: 2400,
      timeLost: '9 h 25 m',
      why: 'Same ticket, so the airline must move you free. You only pay a late check-in fee and a new Skyliner ticket.',
      recheck: [
        { field: 'Seats on AI 358', before: '9 left', after: '6 left', changed: true },
        { field: 'Fare difference', before: '₹0', after: '₹0', changed: false },
        { field: 'Hotel late check-in', before: '₹1,200', after: '₹1,200', changed: false },
      ],
    },
    {
      id: 'o2',
      title: 'New ticket on JAL JL 740 this evening',
      trueCost: 38600,
      timeLost: '7 h 45 m',
      why: 'Lands 1 h 40 m earlier, but you pay for a new ticket and wait for an Air India refund.',
      recheck: [
        { field: 'Fare (2 adults)', before: '₹36,900', after: '₹38,600', changed: true },
        { field: 'Seats', before: '4 left', after: '2 left', changed: true },
        { field: 'Refund on AI 306', before: 'Pending', after: 'Pending', changed: false },
      ],
    },
    {
      id: 'o3',
      title: 'Overnight in Delhi, AI 306 tomorrow',
      trueCost: 9800,
      timeLost: '24 h',
      why: 'Calmest option with no rushing, but you lose your first Tokyo day and pay for an airport hotel.',
      recheck: [
        { field: 'Aerocity hotel', before: '₹6,400', after: '₹6,900', changed: true },
        { field: 'Seats on AI 306', before: '12 left', after: '12 left', changed: false },
      ],
    },
  ],
  missed: [
    {
      id: 'o1',
      title: 'Go to the Air India transfer desk now',
      trueCost: 3500,
      timeLost: '10 h',
      why: 'If the first flight caused the miss, Air India rebooks you free on the next flight.',
      recheck: [
        { field: 'Seats on AI 358', before: '6 left', after: '5 left', changed: true },
        { field: 'Rebooking fee', before: '₹0', after: '₹0', changed: false },
      ],
    },
    {
      id: 'o2',
      title: 'Buy JAL JL 740 tonight',
      trueCost: 39100,
      timeLost: '8 h',
      why: 'Fastest way to Tokyo, but costs a full new fare.',
      recheck: [{ field: 'Fare (2 adults)', before: '₹38,600', after: '₹39,100', changed: true }],
    },
    {
      id: 'o3',
      title: 'Rest in Delhi, fly tomorrow',
      trueCost: 9800,
      timeLost: '24 h',
      why: 'Least stress, but you lose a day.',
      recheck: [{ field: 'Aerocity hotel', before: '₹6,900', after: '₹6,900', changed: false }],
    },
  ],
  preponed: [
    {
      id: 'o1',
      title: 'Move the cab to 02:40',
      trueCost: 250,
      timeLost: '50 m sleep',
      why: 'Simplest fix. Small night-time surcharge from the cab provider.',
      recheck: [{ field: 'Cab at 02:40', before: '₹1,450', after: '₹1,700', changed: true }],
    },
    {
      id: 'o2',
      title: 'Ask Air India for the original timing on another flight',
      trueCost: 0,
      timeLost: '0',
      why: 'Free change is allowed for schedule changes over 30 min, if seats exist.',
      recheck: [{ field: 'Seats on AI 805 (06:30)', before: '3 left', after: '1 left', changed: true }],
    },
  ],
  connecting: [
    {
      id: 'o1',
      title: 'Follow the Domestic-to-International transfer signs',
      trueCost: 0,
      timeLost: '0',
      why: 'Your bags are checked through to Tokyo. Do not exit to arrivals.',
      recheck: [{ field: 'Transfer desk', before: 'Open', after: 'Open', changed: false }],
    },
    {
      id: 'o2',
      title: 'Ask for priority immigration',
      trueCost: 0,
      timeLost: '0',
      why: 'Show your boarding pass if boarding is under 60 min away.',
      recheck: [{ field: 'Priority lane', before: 'Available', after: 'Available', changed: false }],
    },
  ],
  layover: [
    {
      id: 'o1',
      title: 'Lounge near Gate 11',
      trueCost: 0,
      timeLost: '0',
      why: 'Your credit card covers 2 free visits per quarter.',
      recheck: [{ field: 'Lounge capacity', before: 'Quiet', after: 'Busy', changed: true }],
    },
    {
      id: 'o2',
      title: 'Vegetarian breakfast at the food court',
      trueCost: 650,
      timeLost: '0',
      why: 'Eat before an 8-hour flight. Several places have Jain options.',
      recheck: [{ field: 'Open now', before: 'Yes', after: 'Yes', changed: false }],
    },
  ],
};

export const disruptionLabels: Record<DisruptionType, string> = {
  connecting: 'Connecting flight',
  delay: 'Flight delay',
  preponed: 'Preponed flight',
  layover: 'Layover help',
  missed: 'Missed flight',
};

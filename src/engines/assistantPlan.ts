import type { Intent } from '../../api/_guard';
import type { MessageKey, Params } from '../i18n';
import type { RiskLevel } from '../types';
import { span } from './time';

// Code decides what the assistant does. Whether the intent came from the on-device
// matcher or from AI, this table turns it into a reply and buttons.

export interface AssistantContext {
  tripId: string;
  flightId: string;
  flightNo: string;
  departs: string; // HH:MM
  risk: RiskLevel;
  hasConnection: boolean;
  boardingPassDocId: string | null;
  points: number;
}

export interface AssistantAction {
  label: MessageKey;
  labelParams?: Params;
  to: string;
  /** Record a reported change first (only when the user taps this button). */
  report?: { kind: 'delay' | 'prepone'; flightId: string; minutes: number };
}

export interface AssistantPlan {
  reply: MessageKey;
  replyParams?: Params;
  /** Params that are themselves messages (translated by the screen). */
  replyParamKeys?: Record<string, MessageKey>;
  actions: AssistantAction[];
}

const riskKey: Record<RiskLevel, MessageKey> = { ok: 'risk.ok', warn: 'risk.warn', bad: 'risk.bad' };

export function planReply(intent: Intent, minutes: number | null, ctx: AssistantContext): AssistantPlan | null {
  const trip = `/trips/${ctx.tripId}`;
  const open = (to: string): AssistantAction => ({ label: 'asst.action.open', to });

  switch (intent) {
    case 'delay':
      return minutes
        ? {
            reply: 'asst.reply.delayMinutes',
            replyParams: { flight: ctx.flightNo, time: span(minutes) },
            actions: [
              { label: 'asst.action.reportDelay', labelParams: { time: span(minutes) }, to: `${trip}/disruption/delay`, report: { kind: 'delay', flightId: ctx.flightId, minutes } },
              open(`${trip}/disruption/delay`),
            ],
          }
        : { reply: 'asst.reply.delay', actions: [open(`${trip}/disruption/delay`)] };
    case 'preponed':
      return {
        reply: 'asst.reply.preponed',
        actions: minutes
          ? [{ label: 'asst.action.open', to: `${trip}/disruption/preponed`, report: { kind: 'prepone', flightId: ctx.flightId, minutes } }]
          : [open(`${trip}/disruption/preponed`)],
      };
    case 'missed':
      return { reply: 'asst.reply.missed', actions: [open(`${trip}/disruption/missed`)] };
    case 'connecting':
      return { reply: 'asst.reply.connecting', actions: [open(`${trip}/disruption/${ctx.hasConnection ? 'connecting' : 'delay'}`)] };
    case 'layover':
      return { reply: 'asst.reply.layover', actions: [open(`${trip}/disruption/${ctx.hasConnection ? 'layover' : 'delay'}`)] };
    case 'boardingPass':
      return { reply: 'asst.reply.boardingPass', actions: [open(ctx.boardingPassDocId ? `/wallet/${ctx.boardingPassDocId}` : '/wallet')] };
    case 'documents':
      return { reply: 'asst.reply.documents', actions: [open('/wallet')] };
    case 'nextFlight':
      return {
        reply: 'asst.reply.nextFlight',
        replyParams: { flight: ctx.flightNo, time: ctx.departs },
        replyParamKeys: { risk: riskKey[ctx.risk] },
        actions: [open(`${trip}/flights`)],
      };
    case 'family':
      return { reply: 'asst.reply.family', actions: [open(`/share/${ctx.tripId}`)] };
    case 'budget':
      return { reply: 'asst.reply.budget', actions: [open(`${trip}/budget`)] };
    case 'hotel':
      return { reply: 'asst.reply.hotel', actions: [open(`${trip}/accommodation`)] };
    case 'food':
      return { reply: 'asst.reply.food', actions: [open(`${trip}/restaurants`)] };
    case 'itinerary':
      return { reply: 'asst.reply.itinerary', actions: [open(`${trip}/itinerary`)] };
    case 'points':
      return { reply: 'asst.reply.points', replyParams: { n: ctx.points.toLocaleString('en-IN') }, actions: [] };
    default:
      return null;
  }
}
